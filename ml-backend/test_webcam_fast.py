"""
FAST LOCAL WEBCAM TEST
No Angular, no Flask - just your model!
"""

import cv2
import mediapipe as mp
import numpy as np
import pickle
import os
import time

print("=" * 60)
print("🔬 FAST LOCAL MODEL TEST")
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
    print(f"❌ Error: {e}")
    exit(1)

# Initialize MediaPipe
try:
    import mediapipe as mp
    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.5
    )
    print("✅ MediaPipe ready")
except:
    print("❌ MediaPipe not available - using simple detection")
    hands = None

# Open camera
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
if not cap.isOpened():
    cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Camera failed!")
    exit(1)

print("\n📸 Showing your webcam... Press 'q' to quit")
print("=" * 60)

prediction = "No hand"
confidence = 0.0
fps = 0
frame_count = 0
start_time = time.time()

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
    
    # Process every frame for speed
    if hands:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb)
        
        if results.multi_hand_landmarks:
            landmarks = []
            for hand_landmarks in results.multi_hand_landmarks:
                for lm in hand_landmarks.landmark:
                    landmarks.extend([lm.x, lm.y, lm.z])
            
            # Draw landmarks
            mp.solutions.drawing_utils.draw_landmarks(
                frame, 
                results.multi_hand_landmarks[0], 
                mp_hands.HAND_CONNECTIONS
            )
            
            # Predict
            landmarks_scaled = scaler.transform([landmarks])
            pred = model.predict(landmarks_scaled)[0]
            probs = model.predict_proba(landmarks_scaled)[0]
            confidence = float(max(probs))
            prediction = pred
    
    # Display
    color = (0, 255, 0) if confidence > 0.7 else (0, 255, 255) if confidence > 0.5 else (0, 0, 255)
    
    # Big text in center
    text = f"{prediction} ({confidence:.2f})" if confidence > 0 else "Show hand"
    text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 2, 4)[0]
    text_x = (frame.shape[1] - text_size[0]) // 2
    text_y = (frame.shape[0] // 2) + 50
    cv2.putText(frame, text, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 2, color, 4)
    
    # Top left info
    cv2.putText(frame, f"FPS: {fps:.0f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
    cv2.putText(frame, f"Classes: {len(classes)}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 150, 150), 1)
    
    # Confidence bar
    if confidence > 0:
        bar_width = int(confidence * 300)
        cv2.rectangle(frame, (10, frame.shape[0] - 40), (310, frame.shape[0] - 10), (50, 50, 50), -1)
        cv2.rectangle(frame, (10, frame.shape[0] - 40), (10 + bar_width, frame.shape[0] - 10), color, -1)
        cv2.putText(frame, f"{int(confidence * 100)}%", (320, frame.shape[0] - 15), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    
    cv2.imshow('Sign Recognition - Fast Test', frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("\n✅ Test complete!")