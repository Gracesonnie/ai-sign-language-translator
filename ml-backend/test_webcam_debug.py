"""
DEBUG WEBCAM TEST - Shows raw predictions
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
print("🔬 DEBUG - See what the model is actually predicting")
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

# Initialize MediaPipe
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
print("   The debug output will show what the model predicts")
print("   Press 'q' to quit")
print("=" * 60)

while True:
    ret, frame = cap.read()
    if not ret:
        continue
    
    frame = cv2.flip(frame, 1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    
    try:
        timestamp = int(time.time() * 1000)
        detection_result = landmarker.detect_for_video(mp_image, timestamp)
        
        if detection_result.hand_landmarks and len(detection_result.hand_landmarks) > 0:
            # Draw landmarks
            for hand_landmarks in detection_result.hand_landmarks:
                mp.solutions.drawing_utils.draw_landmarks(
                    frame,
                    hand_landmarks,
                    mp.solutions.hands.HAND_CONNECTIONS
                )
            
            # Extract landmarks
            landmarks = []
            for hand_landmarks in detection_result.hand_landmarks:
                for lm in hand_landmarks:
                    landmarks.extend([lm.x, lm.y, lm.z])
            
            # DEBUG: Show raw landmarks
            print(f"\n🔍 Raw landmarks (first 10): {landmarks[:10]}")
            
            # Scale and predict
            landmarks_scaled = scaler.transform([landmarks])
            pred = model.predict(landmarks_scaled)[0]
            probs = model.predict_proba(landmarks_scaled)[0]
            
            # Show all predictions
            print("📊 Predictions:")
            for i, cls in enumerate(classes):
                print(f"   {cls}: {probs[i]:.4f}")
            
            confidence = float(max(probs))
            print(f"✅ Prediction: {pred} ({confidence:.4f})")
            print("-" * 40)
            
            # Show on frame
            cv2.putText(frame, f"Pred: {pred} ({confidence:.2f})", (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            # Show top 3 predictions on frame
            sorted_indices = np.argsort(probs)[::-1]
            for i, idx in enumerate(sorted_indices[:3]):
                y_pos = 70 + i * 30
                cv2.putText(frame, f"{classes[idx]}: {probs[idx]:.3f}", (10, y_pos), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        else:
            cv2.putText(frame, "No hand detected", (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    
    except Exception as e:
        print(f"❌ Error: {e}")
        cv2.putText(frame, f"Error: {e}", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    
    cv2.imshow('Debug - Model Predictions', frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()