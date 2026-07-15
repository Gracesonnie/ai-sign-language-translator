"""
FLASK API SERVER FOR SIGN RECOGNITION
FIXED - Works with Angular PNG images
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import pickle
import base64
from io import BytesIO
from PIL import Image
import os
import sys
import traceback
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.vision import HandLandmarkerOptions, HandLandmarker
from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode

app = Flask(__name__)
CORS(app, origins=["http://localhost:4200", "http://localhost:8080"])

print("=" * 60)
print("🚀 STARTING FLASK API SERVER")
print("=" * 60)

# ========== LOAD MODEL ==========
model_path = 'model/svm_model.pickle'
scaler_path = 'model/scaler.pickle'
classes_path = 'model/classes.pickle'

if not os.path.exists(model_path):
    print("❌ Model not found!")
    sys.exit(1)

try:
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)
    with open(classes_path, 'rb') as f:
        classes = pickle.load(f)
    classes = [str(c) for c in classes]
    print(f"✅ Model loaded: {classes}")
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)

# ========== INITIALIZE MEDIAPIPE ==========
if not os.path.exists('hand_landmarker.task'):
    print("❌ hand_landmarker.task not found!")
    sys.exit(1)

try:
    options = HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path='hand_landmarker.task'),
        num_hands=1,
        min_hand_detection_confidence=0.7,
        min_hand_presence_confidence=0.7,
        min_tracking_confidence=0.5,
        running_mode=VisionTaskRunningMode.IMAGE
    )
    landmarker = HandLandmarker.create_from_options(options)
    print("✅ MediaPipe initialized")
except Exception as e:
    print(f"❌ MediaPipe error: {e}")
    sys.exit(1)

def extract_landmarks_from_frame(frame):
    """Extract hand landmarks from frame"""
    try:
        # Convert to RGB
        if len(frame.shape) == 3:
            if frame.shape[2] == 4:
                rgb = cv2.cvtColor(frame, cv2.COLOR_RGBA2RGB)
            else:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        else:
            rgb = cv2.cvtColor(frame, cv2.COLOR_GRAY2RGB)
        
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_image)
        
        if not result.hand_landmarks:
            return None
        
        landmarks = []
        for hand in result.hand_landmarks:
            for lm in hand:
                landmarks.extend([lm.x, lm.y, lm.z])
        return landmarks
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'message': 'No data', 'sign': None, 'confidence': 0})
        
        image_data = data.get('image')
        if not image_data:
            return jsonify({'success': False, 'message': 'No image', 'sign': None, 'confidence': 0})
        
        # Clean image data
        if 'base64,' in image_data:
            image_data = image_data.split('base64,')[1]
        elif ',' in image_data:
            image_data = image_data.split(',')[1]
        
        # Decode
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        
        # Convert to RGB
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Convert to BGR for OpenCV
        frame_rgb = np.array(image)
        frame = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
        
        # Extract landmarks
        landmarks = extract_landmarks_from_frame(frame)
        
        if landmarks is None:
            return jsonify({'success': False, 'message': 'No hand detected', 'sign': None, 'confidence': 0})
        
        # Predict
        landmarks_scaled = scaler.transform([landmarks])
        prediction = model.predict(landmarks_scaled)[0]
        probabilities = model.predict_proba(landmarks_scaled)[0]
        confidence = float(max(probabilities))
        
        all_predictions = {}
        for i, class_name in enumerate(classes):
            all_predictions[class_name] = float(probabilities[i])
        
        print(f"✅ Prediction: {prediction} ({confidence:.2%})")
        
        return jsonify({
            'success': True,
            'sign': prediction,
            'confidence': confidence,
            'all_predictions': all_predictions
        })
        
    except Exception as e:
        print(f"❌ Error: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e), 'sign': None, 'confidence': 0})

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'classes': classes,
        'num_classes': len(classes)
    })

if __name__ == '__main__':
    print("=" * 60)
    print(f"📍 Server: http://localhost:5000")
    print(f"📊 Classes: {classes}")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)