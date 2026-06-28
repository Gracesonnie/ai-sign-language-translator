import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { SignService } from './services/sign.service';

declare const tmImage: any;
declare const tf: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit {
  @ViewChild('webcam') webcamRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  title = 'AI Sign Translator';
  history: any[] = [];
  currentSign = '';
  currentEmoji = '';
  confidence = 0;
  isDetecting = false;
  message = 'Click "Start Camera" to begin';
  isLoading = false;

  private lastDetectedSign = '';
  private lastDetectedEmoji = '';

  private modelURL = 'https://teachablemachine.withgoogle.com/models/xTXWS7rR1/';
  private model: any = null;
  private webcam: any = null;
  private predictionInterval: any = null;
  private predictionCount = 0;

  signs = [
    { name: 'Hello', emoji: '👋' },
    { name: 'Stand', emoji: '🧍‍♀️' }
  ];

  constructor(private signService: SignService) {}

  ngOnInit() {
    this.loadHistory();
  }

  async startCamera(): Promise<void> {
    try {
      this.message = '⏳ Loading model...';
      this.isLoading = true;
      
      this.lastDetectedSign = '';
      this.lastDetectedEmoji = '';
      
      let attempts = 0;
      while (typeof tmImage === 'undefined' && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      if (typeof tmImage === 'undefined') {
        throw new Error('tmImage not loaded. Please refresh the page.');
      }
      
      const modelURL = this.modelURL + 'model.json';
      const metadataURL = this.modelURL + 'metadata.json';
      
      this.model = await tmImage.load(modelURL, metadataURL);
      console.log('✅ Model loaded!');
      
      const flip = true;
      this.webcam = new tmImage.Webcam(640, 480, flip);
      await this.webcam.setup();
      await this.webcam.play();
      
      const videoElement = this.webcamRef?.nativeElement;
      if (videoElement) {
        videoElement.srcObject = this.webcam.video.srcObject;
        videoElement.style.display = 'block';
        await videoElement.play();
        console.log('📹 Video is displaying!');
      }
      
      this.message = '🤖 Show Hello 👋 or Stand 🧍‍♀️ gesture!';
      this.isDetecting = true;
      this.isLoading = false;
      this.predictionCount = 0;
      
      this.predictionInterval = setInterval(() => {
        this.predict();
      }, 1500);
      
    } catch (error) {
      console.error('Error:', error);
      this.message = '❌ Error: ' + ((error as any).message || 'Check console');
      this.isLoading = false;
    }
  }

  async predict(): Promise<void> {
    if (!this.isDetecting || !this.model || !this.webcam) {
      return;
    }
    
    try {
      this.predictionCount++;
      if (this.predictionCount % 2 !== 0) {
        return;
      }
      
      const prediction = await this.model.predict(this.webcam.canvas);
      
      const topPrediction = prediction.reduce((prev: any, current: any) => {
        return (prev.probability > current.probability) ? prev : current;
      });
      
      const confidenceValue = Math.round(topPrediction.probability * 100);
      const predictedClass = topPrediction.className;
      
      if (confidenceValue > 70) {
        const matchedSign = this.signs.find(s => s.name === predictedClass);
        if (matchedSign) {
          this.currentSign = matchedSign.name;
          this.currentEmoji = matchedSign.emoji;
          this.confidence = confidenceValue;
          this.message = `👀 Detected: ${matchedSign.emoji} ${matchedSign.name} (${confidenceValue}% confidence)`;
          
          this.lastDetectedSign = matchedSign.name;
          this.lastDetectedEmoji = matchedSign.emoji;
        }
      }
      
      this.drawPrediction(prediction);
      
    } catch (error) {
      console.error('Prediction error:', error);
    }
  }

  drawPrediction(predictions: any[]): void {
    try {
      const canvas = this.canvasRef?.nativeElement;
      if (!canvas) {
        return;
      }
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      
      canvas.width = 640;
      canvas.height = 480;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (this.webcam && this.webcam.canvas) {
        ctx.drawImage(this.webcam.canvas, 0, 0, canvas.width, canvas.height);
      }
      
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(10, canvas.height - 80, 300, 70);
      
      ctx.fillStyle = 'white';
      ctx.font = '16px Arial';
      predictions.forEach((pred: any, index: number) => {
        const y = canvas.height - 55 + (index * 25);
        const confidenceValue = Math.round(pred.probability * 100);
        ctx.fillText(`${pred.className}: ${confidenceValue}%`, 20, y);
      });
      
    } catch (error) {
      console.error('Draw error:', error);
    }
  }

  stopCamera(): void {
    this.isDetecting = false;
    
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
      this.predictionInterval = null;
    }
    
    if (this.webcam) {
      this.webcam.stop();
    }
    
    if (this.webcamRef && this.webcamRef.nativeElement) {
      this.webcamRef.nativeElement.srcObject = null;
    }
    
    // Save only ONCE when camera stops
    if (this.lastDetectedSign && this.lastDetectedEmoji) {
      this.signService.detectSign(this.lastDetectedSign, this.lastDetectedEmoji).subscribe({
        next: () => {
          this.message = `✅ Saved: ${this.lastDetectedEmoji} ${this.lastDetectedSign}`;
          this.loadHistory();
          console.log(`✅ Saved: ${this.lastDetectedSign}`);
        },
        error: (error) => {
          this.message = '❌ Error saving. Check backend!';
          console.error('Save error:', error);
        }
      });
    } else {
      this.message = 'No sign detected while camera was on';
    }
    
    this.predictionCount = 0;
    
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  deleteAllHistory(): void {
    if (this.history.length === 0) return;
    
    if (confirm(`Delete all ${this.history.length} history entries?`)) {
      this.signService.deleteAllHistory().subscribe({
        next: () => {
          this.history = [];
          this.message = '🗑️ All history deleted!';
          console.log('🗑️ All history deleted');
        },
        error: (error) => {
          this.message = '❌ Error deleting history';
          console.error('Delete error:', error);
        }
      });
    }
  }

  loadHistory(): void {
    this.signService.getHistory().subscribe({
      next: (data) => {
        this.history = data;
      },
      error: (error) => {
        console.error('Error loading history:', error);
      }
    });
  }

  testSign(signName: string, signEmoji: string): void {
    this.signService.detectSign(signName, signEmoji).subscribe({
      next: () => {
        this.currentSign = signName;
        this.currentEmoji = signEmoji;
        this.message = `✅ Manually saved: ${signEmoji} ${signName}`;
        this.loadHistory();
      },
      error: (error) => {
        this.message = '❌ Error saving. Check backend!';
        console.error(error);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopCamera();
    if (typeof tf !== 'undefined' && tf.tidy) {
      tf.tidy(() => {
        console.log('🧹 TensorFlow memory cleaned up');
      });
    }
  }
}