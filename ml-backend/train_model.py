"""
SIGN LANGUAGE MODEL TRAINING SCRIPT
Uses MediaPipe 0.10.35 with the new API structure.
"""

import cv2
import mediapipe as mp
import numpy as np
import os
import pickle
import time
from sklearn.model_selection import train_test_split
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, accuracy_score
import warnings
warnings.filterwarnings('ignore')

# MediaPipe 0.10.35 uses 'tasks' instead of 'solutions'
# We'll use the HandLandmarker from the tasks vision module
try:
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    from mediapipe.tasks.python.vision import HandLandmarkerOptions, HandLandmarker
    from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode
    
    USE_NEW_API = True
    print("✅ Using MediaPipe new API (tasks)")
except ImportError:
    USE_NEW_API = False
    print("⚠️ Using MediaPipe old API (solutions)")

def extract_landmarks(image_path):
    """Extract 21 hand landmarks from an image"""
    try:
        image = cv2.imread(image_path)
        if image is None:
            return None
        
        if USE_NEW_API:
            # New API for MediaPipe 0.10.35
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
            
            # Create HandLandmarker
            options = HandLandmarkerOptions(
                base_options=python.BaseOptions(model_asset_path='hand_landmarker.task'),
                num_hands=1,
                min_hand_detection_confidence=0.7,
                min_hand_presence_confidence=0.7,
                min_tracking_confidence=0.5,
                running_mode=VisionTaskRunningMode.IMAGE
            )
            
            with HandLandmarker.create_from_options(options) as landmarker:
                detection_result = landmarker.detect(mp_image)
                
                if detection_result.hand_landmarks and len(detection_result.hand_landmarks) > 0:
                    landmarks = []
                    for hand_landmarks in detection_result.hand_landmarks:
                        for lm in hand_landmarks:
                            landmarks.extend([lm.x, lm.y, lm.z])
                    return landmarks
                return None
        else:
            # Old API fallback
            mp_hands = mp.solutions.hands
            hands = mp_hands.Hands(static_image_mode=True, max_num_hands=1, min_detection_confidence=0.7)
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = hands.process(image_rgb)
            hands.close()
            
            if not results.multi_hand_landmarks:
                return None
            
            landmarks = []
            for hand_landmarks in results.multi_hand_landmarks:
                for lm in hand_landmarks.landmark:
                    landmarks.extend([lm.x, lm.y, lm.z])
            return landmarks
            
    except Exception as e:
        print(f"Error processing {image_path}: {e}")
        return None

def train_model():
    print("=" * 60)
    print("TRAINING SVM MODEL FOR SIGN RECOGNITION")
    print("=" * 60)
    
    # Try to find dataset
    dataset_paths = ['samples', 'Dataset']
    dataset_path = None
    
    for path in dataset_paths:
        if os.path.exists(path):
            dataset_path = path
            break
    
    if not dataset_path:
        print("❌ Dataset folder not found!")
        print("   Looking for: 'samples' or 'Dataset' folder")
        return
    
    print(f"📁 Using dataset from: {dataset_path}/")
    print(f"📌 Using MediaPipe API: {'NEW (tasks)' if USE_NEW_API else 'OLD (solutions)'}")
    
    data = []
    labels = []
    total_images = 0
    processed_images = 0
    skipped_images = 0
    
    print("\n📥 Extracting features from dataset...")
    start_time = time.time()
    
    class_folders = [f for f in os.listdir(dataset_path) if os.path.isdir(os.path.join(dataset_path, f))]
    print(f"📊 Found classes: {class_folders}")
    
    # Limit images per class for faster processing
    MAX_IMAGES_PER_CLASS = 500
    
    for class_name in class_folders:
        class_path = os.path.join(dataset_path, class_name)
        class_images = [f for f in os.listdir(class_path) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        total_images += len(class_images)
        
        # Limit to MAX_IMAGES_PER_CLASS
        if len(class_images) > MAX_IMAGES_PER_CLASS:
            import random
            class_images = random.sample(class_images, MAX_IMAGES_PER_CLASS)
            print(f"  Processing {class_name}... (using {MAX_IMAGES_PER_CLASS}/{len(class_images)} images)")
        else:
            print(f"  Processing {class_name}... ({len(class_images)} images)")
        
        for i, image_file in enumerate(class_images):
            image_path = os.path.join(class_path, image_file)
            landmarks = extract_landmarks(image_path)
            
            if landmarks is not None:
                data.append(landmarks)
                labels.append(class_name)
                processed_images += 1
            else:
                skipped_images += 1
            
            if (i + 1) % 50 == 0:
                print(f"    Progress: {i+1}/{len(class_images)}")
    
    elapsed_time = time.time() - start_time
    
    if len(data) == 0:
        print("\n❌ No landmarks extracted from any images!")
        print("   Possible issues:")
        print("   - Images may not contain hands")
        print("   - Images may be corrupted")
        return
    
    print(f"\n✅ Feature extraction complete!")
    print(f"   Total images found: {total_images}")
    print(f"   Successfully processed: {processed_images}")
    print(f"   Skipped: {skipped_images}")
    print(f"   Time taken: {elapsed_time:.2f} seconds")
    print(f"\n📊 Classes found: {sorted(set(labels))}")
    print(f"📊 Total samples: {len(data)}")
    
    # Convert to numpy arrays
    data = np.array(data)
    labels = np.array(labels)
    
    # Normalize features
    scaler = StandardScaler()
    data_scaled = scaler.fit_transform(data)
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        data_scaled, labels, test_size=0.2, random_state=42, stratify=labels
    )
    
    print(f"\n📊 Training set: {len(X_train)} samples")
    print(f"📊 Test set: {len(X_test)} samples")
    
    # Train SVM
    print("\n🧠 Training SVM model...")
    svm = SVC(kernel='rbf', C=1.0, gamma='scale', probability=True, random_state=42)
    svm.fit(X_train, y_train)
    
    # Evaluate
    y_pred = svm.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    
    print(f"\n✅ Test Accuracy: {accuracy:.4f} ({accuracy*100:.2f}%)")
    
    print("\n📋 Classification Report:")
    print(classification_report(y_test, y_pred))
    
    # Save model
    os.makedirs('model', exist_ok=True)
    
    with open('model/svm_model.pickle', 'wb') as f:
        pickle.dump(svm, f)
    with open('model/scaler.pickle', 'wb') as f:
        pickle.dump(scaler, f)
    with open('model/classes.pickle', 'wb') as f:
        pickle.dump(sorted(set(labels)), f)
    
    print("\n" + "=" * 60)
    print("✅ MODEL SAVED SUCCESSFULLY!")
    print("=" * 60)
    print(f"📁 Files saved in 'model/' directory:")
    print("   - svm_model.pickle  (SVM classifier)")
    print("   - scaler.pickle     (Feature scaler)")
    print("   - classes.pickle    (Class names)")
    print(f"\n📊 Model accuracy: {accuracy*100:.2f}%")
    print("\n🔍 Next steps:")
    print("  1. Test with webcam: python test_webcam.py")
    print("  2. Start API server: python app.py")
    print("=" * 60)

if __name__ == "__main__":
    train_model()