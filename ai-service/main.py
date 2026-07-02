# main.py - Simple ASL Recognition Service

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import math

# ============================================
# DATA MODELS
# ============================================

class Landmark(BaseModel):
    x: float
    y: float
    z: float

class PredictionRequest(BaseModel):
    landmarks: List[Landmark]

class PredictionResponse(BaseModel):
    letter: str
    confidence: float
    success: bool
    message: Optional[str] = None

# ============================================
# FASTAPI APP
# ============================================

app = FastAPI(title="ASL Recognition Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# GESTURE RECOGNIZER
# ============================================

class GestureRecognizer:
    def __init__(self):
        self.finger_tips = [4, 8, 12, 16, 20]
        self.finger_pip = [3, 6, 10, 14, 18]
    
    def distance(self, p1, p2):
        return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2)
    
    def get_finger_states(self, landmarks):
        states = []
        for i in range(5):
            tip = self.finger_tips[i]
            pip = self.finger_pip[i]
            if i == 0:  # Thumb
                dist = self.distance(landmarks[tip], landmarks[2])
                extended = dist > 0.1
            else:
                extended = landmarks[tip].y < landmarks[pip].y - 0.02
            states.append(1 if extended else 0)
        return states
    
    def classify(self, landmarks):
        states = self.get_finger_states(landmarks)
        
        # Map states to letters
        if states == [1, 0, 0, 0, 0]: return "A", 0.90
        if states == [1, 1, 1, 1, 1]: return "B", 0.85
        if states == [0, 0, 0, 0, 0]: return "E", 0.85
        if states == [0, 1, 0, 0, 0]: return "D", 0.90
        if states == [1, 1, 0, 0, 0]: return "L", 0.85
        if states == [1, 1, 0, 0, 1]: return "Y", 0.85
        if states == [0, 1, 1, 0, 0]: return "H", 0.85
        if states == [0, 0, 0, 0, 1]: return "I", 0.85
        
        return "?", 0.50

recognizer = GestureRecognizer()
print("✅ ASL Recognizer loaded!")

# ============================================
# API ENDPOINTS
# ============================================

@app.get("/")
async def root():
    return {
        "service": "ASL Recognition Service",
        "status": "running",
        "recognizer": "active"
    }

@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    if len(request.landmarks) != 21:
        raise HTTPException(status_code=400, detail="Expected 21 landmarks")
    
    letter, confidence = recognizer.classify(request.landmarks)
    return PredictionResponse(
        letter=letter,
        confidence=confidence,
        success=True,
        message=f"Detected: {letter}"
    )

# ============================================
# RUN
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)