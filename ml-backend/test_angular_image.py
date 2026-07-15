import requests
import base64
import cv2
import os

# Take a photo with webcam
cap = cv2.VideoCapture(0)
ret, frame = cap.read()
cap.release()

if not ret:
    print("❌ Could not capture image")
    exit()

# Save as JPEG
_, buffer = cv2.imencode('.jpg', frame)
image_b64 = base64.b64encode(buffer).decode('utf-8')

# Send to API
response = requests.post(
    'http://localhost:5000/api/predict',
    json={'image': f'data:image/jpeg;base64,{image_b64}'}
)

print("Response:", response.json())