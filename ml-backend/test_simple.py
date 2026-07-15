import cv2
import base64
import requests
import numpy as np
from PIL import Image
import io
import os

# Check if API is running
try:
    response = requests.get('http://localhost:5000/api/health', timeout=2)
    print("✅ API is running")
except:
    print("❌ API is not running! Start with: python app.py")
    exit(1)

# Open webcam and capture a frame
cap = cv2.VideoCapture(0)
ret, frame = cap.read()
cap.release()

if not ret:
    print("❌ Failed to capture frame")
    exit(1)

# Convert to base64
_, buffer = cv2.imencode('.jpg', frame)
image_b64 = base64.b64encode(buffer).decode('utf-8')

# Send to API
print("📤 Sending image to API...")
response = requests.post(
    'http://localhost:5000/api/predict',
    json={'image': f'data:image/jpeg;base64,{image_b64}'}
)

print("=" * 60)
print("🔬 API TEST RESULT")
print("=" * 60)
print("Status Code:", response.status_code)

if response.status_code == 200:
    result = response.json()
    print("Success:", result.get('success'))
    print("Sign:", result.get('sign'))
    print("Confidence:", result.get('confidence'))
    print("Message:", result.get('message'))
else:
    print("Error:", response.text)
print("=" * 60)