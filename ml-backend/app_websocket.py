from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import cv2
import numpy as np
import pickle
import base64
from io import BytesIO
from PIL import Image
import os
import mediapipe as mp
import eventlet
eventlet.monkey_patch()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Load model
model_path = 'model/svm_model.pickle'
scaler_path = 'model/scaler.pickle'
classes_path = 'model/classes.pickle'

if not os.path.exists(model_path):
    print("⚠️ Model not found! Run train_model.py first.")
    exit(1)

with open(model_path, 'rb') as f:
    model = pickle.load(f)
with open(scaler_path, 'rb') as f:
    scaler = pickle.load(f)
with open(classes_path, 'rb') as f:
    classes = pickle.load(f)

print(f"✅ Model loaded! Classes: {classes}")

# Initialize MediaPipe - using the working approach from test_webcam.py
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=1,
    min_detection_confidence=0.7
)

def extract_landmarks_from_frame(frame):
    """Extract hand landmarks from a video frame"""
    try:
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(image_rgb)
        
        if not results.multi_hand_landmarks:
            return None
        
        landmarks = []
        for hand_landmarks in results.multi_hand_landmarks:
            for lm in hand_landmarks.landmark:
                landmarks.extend([lm.x, lm.y, lm.z])
        return landmarks
    except Exception as e:
        print(f"❌ Error extracting landmarks: {e}")
        return None

def predict_sign_from_frame(frame):
    """Process a single frame and return prediction"""
    landmarks = extract_landmarks_from_frame(frame)
    
    if landmarks is None:
        return None
    
    landmarks_scaled = scaler.transform([landmarks])
    prediction = model.predict(landmarks_scaled)[0]
    probabilities = model.predict_proba(landmarks_scaled)[0]
    confidence = float(max(probabilities))
    
    all_predictions = {}
    for i, class_name in enumerate(classes):
        all_predictions[class_name] = float(probabilities[i])
    
    return {
        'sign': prediction,
        'confidence': confidence,
        'all_predictions': all_predictions
    }

# ========== WEBSOCKET EVENTS ==========

@socketio.on('connect')
def handle_connect():
    print(f"✅ Client connected: {request.sid}")
    emit('connected', {'status': 'connected', 'classes': classes})

@socketio.on('disconnect')
def handle_disconnect():
    print(f"❌ Client disconnected: {request.sid}")

@socketio.on('frame')
def handle_frame(data):
    """Receive video frame from Angular and return prediction"""
    try:
        image_data = data.get('image')
        if not image_data:
            emit('prediction', {'success': False, 'message': 'No image data'})
            return
        
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        frame = np.array(image)
        
        # Convert to BGR for OpenCV
        if len(frame.shape) == 3 and frame.shape[2] == 4:
            frame = cv2.cvtColor(frame, cv2.COLOR_RGBA2RGB)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        elif len(frame.shape) == 3 and frame.shape[2] == 3:
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        elif len(frame.shape) == 2:
            frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        
        # Predict
        result = predict_sign_from_frame(frame)
        
        if result:
            emit('prediction', {
                'success': True,
                'sign': result['sign'],
                'confidence': result['confidence'],
                'all_predictions': result['all_predictions']
            })
        else:
            emit('prediction', {
                'success': False,
                'message': 'No hand detected',
                'sign': None,
                'confidence': 0
            })
            
    except Exception as e:
        print(f"❌ Error: {e}")
        emit('prediction', {
            'success': False,
            'message': str(e),
            'sign': None,
            'confidence': 0
        })

# ========== REST API ==========

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'model_loaded': True,
        'classes': classes,
        'num_classes': len(classes)
    })

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'name': 'Sign Recognition WebSocket API',
        'version': '1.0.0',
        'websocket': 'ws://localhost:5000'
    })

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 WEBSOCKET SIGN RECOGNITION SERVER")
    print("=" * 60)
    print(f"📍 Server: http://localhost:5000")
    print(f"📊 Classes: {classes}")
    print("=" * 60)
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)