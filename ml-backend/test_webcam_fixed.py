"""
WEBCAM TEST - Works with MediaPipe 0.10.35 (Tasks API)
FIXED: No mp.solutions used
Includes support for ALL 15 signs: A, B, C, F, H, I, L, O, Q, R, U, V, W, X, Y
"""

import cv2
import numpy as np
import pickle
import os
import time
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.vision import HandLandmarkerOptions, HandLandmarker
from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode

print("=" * 60)
print("🔬 WEBCAM TEST (Tasks API) - ALL 15 SIGNS")
print("A, B, C, F, H, I, L, O, Q, R, U, V, W, X, Y")
print("=" * 60)

# Load model
try:
    with open('model/svm_model.pickle', 'rb') as f:
        model = pickle.load(f)
    with open('model/scaler.pickle', 'rb') as f:
        scaler = pickle.load(f)
    with open('model/classes.pickle', 'rb') as f:
        classes = pickle.load(f)
    classes = [str(c) for c in classes]
    print(f"✅ Model loaded: {classes}")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    exit(1)

# Check for hand_landmarker.task
if not os.path.exists('hand_landmarker.task'):
    print("❌ hand_landmarker.task not found!")
    print("   Download it first:")
    print("   python -c \"import urllib.request; urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', 'hand_landmarker.task')\"")
    exit(1)

# Initialize MediaPipe Tasks API
try:
    options = HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path='hand_landmarker.task'),
        num_hands=1,
        min_hand_detection_confidence=0.7,
        min_hand_presence_confidence=0.7,
        min_tracking_confidence=0.5,
        running_mode=VisionTaskRunningMode.VIDEO
    )
    landmarker = HandLandmarker.create_from_options(options)
    print("✅ MediaPipe initialized!")
except Exception as e:
    print(f"❌ MediaPipe error: {e}")
    exit(1)

# Open camera
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
if not cap.isOpened():
    cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Camera failed!")
    exit(1)

print("\n📸 Show your hand to the camera")
print("   Press 'q' to quit")
print("   Press 'r' to reset")
print("=" * 60)

prediction = "No hand"
confidence = 0.0
fps = 0
frame_count = 0
start_time = time.time()

# Hand connections for drawing
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),  # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),  # Index
    (0, 9), (9, 10), (10, 11), (11, 12),  # Middle
    (0, 13), (13, 14), (14, 15), (15, 16),  # Ring
    (0, 17), (17, 18), (18, 19), (19, 20),  # Pinky
    (5, 9), (9, 13), (13, 17)  # Palm
]

# All 15 signs
ALL_SIGNS = ['A', 'B', 'C', 'F', 'H', 'I', 'L', 'O', 'Q', 'R', 'U', 'V', 'W', 'X', 'Y']

def draw_landmarks(frame, landmarks, connections):
    """Draw hand landmarks and connections on frame"""
    h, w = frame.shape[:2]
    
    # Draw connections first (lines)
    for connection in connections:
        idx1, idx2 = connection
        if idx1 < len(landmarks) and idx2 < len(landmarks):
            x1 = int(landmarks[idx1].x * w)
            y1 = int(landmarks[idx1].y * h)
            x2 = int(landmarks[idx2].x * w)
            y2 = int(landmarks[idx2].y * h)
            cv2.line(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
    
    # Draw landmarks (points)
    for lm in landmarks:
        x = int(lm.x * w)
        y = int(lm.y * h)
        cv2.circle(frame, (x, y), 5, (255, 0, 0), -1)

while True:
    ret, frame = cap.read()
    if not ret:
        continue
    
    frame = cv2.flip(frame, 1)
    frame_count += 1
    
    # Calculate FPS
    if frame_count % 10 == 0:
        elapsed = time.time() - start_time
        fps = 10 / elapsed if elapsed > 0 else 0
        start_time = time.time()
    
    # Process with MediaPipe
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    
    try:
        timestamp = int(time.time() * 1000)
        detection_result = landmarker.detect_for_video(mp_image, timestamp)
        
        if detection_result.hand_landmarks and len(detection_result.hand_landmarks) > 0:
            # Draw landmarks using custom function
            for hand_landmarks in detection_result.hand_landmarks:
                draw_landmarks(frame, hand_landmarks, HAND_CONNECTIONS)
            
            # Extract landmarks for prediction
            landmarks = []
            for hand_landmarks in detection_result.hand_landmarks:
                for lm in hand_landmarks:
                    landmarks.extend([lm.x, lm.y, lm.z])
            
            if len(landmarks) == 63:
                landmarks_scaled = scaler.transform([landmarks])
                pred = model.predict(landmarks_scaled)[0]
                probs = model.predict_proba(landmarks_scaled)[0]
                confidence = float(max(probs))
                prediction = pred
                
                # Show prediction on frame
                cv2.putText(frame, f"Sign: {prediction}", (10, 40), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
                cv2.putText(frame, f"Confidence: {confidence:.2%}", (10, 80), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                
                # Show top 3 predictions
                sorted_indices = np.argsort(probs)[::-1]
                cv2.putText(frame, "Top predictions:", (10, 120), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
                for i, idx in enumerate(sorted_indices[:3]):
                    y_pos = 145 + i * 25
                    cv2.putText(frame, f"{classes[idx]}: {probs[idx]:.2%}", (10, y_pos), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                
                # Show all available classes in bottom right
                cv2.putText(frame, f"Classes: {len(classes)}", (frame.shape[1] - 180, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
                
                # Check which new signs are in the model
                new_signs = ['F', 'O', 'Q', 'U', 'X']
                for i, sign in enumerate(new_signs):
                    y_pos = 55 + i * 20
                    status = "✅" if sign in classes else "❌"
                    color = (0, 255, 0) if sign in classes else (0, 0, 255)
                    cv2.putText(frame, f"{status} {sign} in model", (frame.shape[1] - 180, y_pos), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
            else:
                cv2.putText(frame, f"Invalid landmarks: {len(landmarks)}", (10, 40), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
        else:
            cv2.putText(frame, "No hand detected - Show your hand", (10, 40), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            prediction = "No hand"
            confidence = 0.0
    
    except Exception as e:
        cv2.putText(frame, f"Error: {str(e)[:30]}", (10, 40), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    
    # FPS counter
    cv2.putText(frame, f"FPS: {fps:.0f}", (frame.shape[1] - 120, 30), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    
    cv2.imshow('Sign Recognition - All 15 Signs', frame)
    
    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        break
    elif key == ord('r'):
        prediction = "No hand"
        confidence = 0.0
        print("🔄 Reset")

cap.release()
cv2.destroyAllWindows()
print("\n✅ Test complete!")