"""
REAL-TIME SIGN RECOGNITION TEST
Stable display version - no flashing.
"""

import cv2
import mediapipe as mp
import pickle
import numpy as np
import time
from collections import Counter

def test_webcam():
    # Load model
    try:
        with open('model/svm_model.pickle', 'rb') as f:
            model = pickle.load(f)
        with open('model/scaler.pickle', 'rb') as f:
            scaler = pickle.load(f)
        with open('model/classes.pickle', 'rb') as f:
            classes = pickle.load(f)
    except FileNotFoundError:
        print("❌ Model files not found! Run train_model.py first.")
        return

    # Initialize MediaPipe
    try:
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision
        from mediapipe.tasks.python.vision import HandLandmarkerOptions, HandLandmarker
        from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode
        
        options = HandLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path='hand_landmarker.task'),
            num_hands=1,
            min_hand_detection_confidence=0.7,
            min_hand_presence_confidence=0.7,
            min_tracking_confidence=0.5,
            running_mode=VisionTaskRunningMode.VIDEO
        )
        landmarker = HandLandmarker.create_from_options(options)
        use_new_api = True
        print("✅ Using MediaPipe new API")
    except Exception as e:
        print(f"❌ Error loading MediaPipe: {e}")
        return

    # Open webcam
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print("❌ Could not open webcam!")
        return

    # Set resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print("=" * 60)
    print("🎥 REAL-TIME SIGN RECOGNITION TEST")
    print("=" * 60)
    print(f"📊 Classes: {classes}")
    print("🎮 Controls:")
    print("  Press 'q' to quit")
    print("  Press 'r' to reset")
    print("=" * 60)

    # Stable display variables
    current_display_text = "👋 Show sign"
    current_confidence = 0
    current_color = (255, 255, 255)
    display_updated = False
    last_update_time = 0
    update_interval = 0.3  # Update display every 0.3 seconds
    
    prediction_history = []
    confidence_history = []
    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            continue
        
        frame = cv2.flip(frame, 1)
        frame_height, frame_width = frame.shape[:2]
        frame_count += 1
        timestamp_ms = int(time.time() * 1000)
        current_time = time.time()

        # Process frame and update display periodically
        if current_time - last_update_time >= update_interval:
            last_update_time = current_time
            
            try:
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                results = landmarker.detect_for_video(mp_image, timestamp_ms)
                
                if results.hand_landmarks and len(results.hand_landmarks) > 0:
                    hand_landmarks = results.hand_landmarks[0]
                    
                    landmarks = []
                    for lm in hand_landmarks:
                        landmarks.extend([lm.x, lm.y, lm.z])
                    
                    landmarks_scaled = scaler.transform([landmarks])
                    prediction = model.predict(landmarks_scaled)[0]
                    probabilities = model.predict_proba(landmarks_scaled)[0]
                    confidence = np.max(probabilities)
                    
                    prediction_history.append(prediction)
                    confidence_history.append(confidence)
                    
                    if len(prediction_history) > 5:
                        prediction_history.pop(0)
                        confidence_history.pop(0)
                    
                    if len(prediction_history) >= 3:
                        most_common = Counter(prediction_history).most_common(1)[0]
                        smoothed_prediction = most_common[0]
                        smoothed_confidence = np.mean(confidence_history)
                    else:
                        smoothed_prediction = prediction
                        smoothed_confidence = confidence
                    
                    # Update stable display
                    current_display_text = f"{smoothed_prediction}"
                    current_confidence = smoothed_confidence
                    display_updated = True
                    
                    if smoothed_confidence > 0.7:
                        current_color = (0, 255, 0)  # Green
                    elif smoothed_confidence > 0.5:
                        current_color = (0, 255, 255)  # Yellow
                    else:
                        current_color = (0, 0, 255)  # Red
                else:
                    current_display_text = "👋 No hand"
                    current_confidence = 0
                    current_color = (255, 255, 255)
                    display_updated = True
                    
            except Exception as e:
                print(f"❌ Error: {e}")

        # --- DRAW STABLE DISPLAY ---
        
        # 1. Large sign name in center
        display_text = current_display_text
        if current_confidence > 0:
            display_text = f"{current_display_text} ({current_confidence:.2f})"
        
        # Put text in center with large font
        text_size = cv2.getTextSize(display_text, cv2.FONT_HERSHEY_SIMPLEX, 2, 4)[0]
        text_x = (frame_width - text_size[0]) // 2
        text_y = (frame_height // 2) + 50
        
        # Draw background for text
        cv2.rectangle(frame, (text_x - 20, text_y - 60), (text_x + text_size[0] + 20, text_y + 20), 
                     (0, 0, 0, 0.5), -1)
        cv2.putText(frame, display_text, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 2, current_color, 4)
        
        # 2. Confidence bar at bottom
        if current_confidence > 0:
            bar_width = int(current_confidence * 300)
            bar_x = (frame_width - 300) // 2
            bar_y = frame_height - 60
            
            # Background bar
            cv2.rectangle(frame, (bar_x, bar_y), (bar_x + 300, bar_y + 30), (50, 50, 50), -1)
            # Confidence bar
            cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_width, bar_y + 30), current_color, -1)
            # Bar label
            cv2.putText(frame, f"Confidence: {int(current_confidence * 100)}%", 
                       (bar_x + 10, bar_y + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # 3. FPS counter
        cv2.putText(frame, f"FPS: {frame_count // int(time.time() - start_time) if 'start_time' in dir() else 0}", 
                   (frame_width - 120, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        
        # 4. Status indicator
        if current_confidence > 0.7:
            status = "✅ CONFIDENT"
            status_color = (0, 255, 0)
        elif current_confidence > 0.5:
            status = "⚠️ UNCERTAIN"
            status_color = (0, 255, 255)
        elif current_display_text == "👋 No hand":
            status = "👋 NO HAND"
            status_color = (255, 255, 255)
        else:
            status = "❌ LOW"
            status_color = (0, 0, 255)
        
        cv2.putText(frame, status, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)
        
        # 5. Available classes at top right
        cv2.putText(frame, f"Classes: {len(classes)}", (frame_width - 150, 60), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

        # Show the frame
        cv2.imshow('Sign Recognition Test', frame)
        
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == 27:
            break
        elif key == ord('r'):
            prediction_history = []
            confidence_history = []
            print("🔄 Confidence history reset")

    cap.release()
    cv2.destroyAllWindows()
    landmarker.close()
    print("\n✅ Test completed!")

if __name__ == "__main__":
    # Initialize start_time for FPS
    start_time = time.time()
    test_webcam()