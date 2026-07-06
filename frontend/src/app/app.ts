import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { SignService } from './services/sign.service';

declare const tmImage: any;

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

  // YOUR RETRAINED MODEL URL
  private modelURL = 'https://teachablemachine.withgoogle.com/models/Z70ESd76G/';
 
  private model: any = null;
  private webcam: any = null;
  private predictionInterval: any = null;
  private isPredicting = false;

  signs = [
    { name: 'A', emoji: '✊' },
    { name: 'B', emoji: '🖐️' },
    { name: 'C', emoji: '🤏' }
  ];

  constructor(private signService: SignService) {}

  ngOnInit() {
    this.loadHistory();
  }

  resetState(): void {
    this.isLoading = false;
    this.isDetecting = false;
    this.message = 'Click "Start Camera" to begin.';
    this.currentSign = '';
    this.currentEmoji = '';
    this.confidence = 0;
    this.isPredicting = false;
    
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
      this.predictionInterval = null;
    }
    
    if (this.webcam) {
      try { this.webcam.stop(); } catch(e) {}
      this.webcam = null;
    }
    
    if (this.webcamRef && this.webcamRef.nativeElement) {
      this.webcamRef.nativeElement.srcObject = null;
    }
    
    console.log('🔄 Reset');
  }

  async startCamera(): Promise<void> {
    try {
      this.resetState();
      this.message = '⏳ Loading model...';
      this.isLoading = true;
      
      console.log('📥 Loading retrained model...');
      this.model = await tmImage.load(
        this.modelURL + 'model.json',
        this.modelURL + 'metadata.json'
      );
      console.log('✅ Retrained model loaded!');
      
      console.log('📷 Starting webcam...');
      this.message = '📷 Starting camera...';
      this.webcam = new tmImage.Webcam(640, 480, true);
      await this.webcam.setup();
      await this.webcam.play();
      console.log('✅ Webcam playing!');
      
      const videoElement = this.webcamRef?.nativeElement;
      if (videoElement) {
        videoElement.srcObject = this.webcam.video.srcObject;
        videoElement.style.display = 'block';
        await videoElement.play();
        console.log('📹 Video displaying!');
      }
      
      this.isDetecting = true;
      this.isLoading = false;
      this.message = '🤖 Show A, B, or C!';
      
      this.predictionInterval = setInterval(() => {
        this.detectSign();
      }, 2000);
      
    } catch (error) {
      console.error('❌ Error:', error);
      this.message = '❌ Error: ' + ((error as any).message || 'Check console');
      this.isLoading = false;
    }
  }

  async detectSign(): Promise<void> {
    if (!this.isDetecting || !this.model || !this.webcam || this.isPredicting) {
      return;
    }
    
    this.isPredicting = true;
    
    try {
      const prediction = await this.model.predict(this.webcam.canvas);
      
      let top = prediction[0];
      for (let i = 1; i < prediction.length; i++) {
        if (prediction[i].probability > top.probability) {
          top = prediction[i];
        }
      }
      
      const confidenceValue = Math.round(top.probability * 100);
      const predictedClass = top.className;
      
      if (confidenceValue > 70) {
        const matchedSign = this.signs.find(s => s.name === predictedClass);
        if (matchedSign) {
          this.currentSign = matchedSign.name;
          this.currentEmoji = matchedSign.emoji;
          this.confidence = confidenceValue;
          this.message = `✅ ${matchedSign.emoji} ${matchedSign.name}`;
          this.lastDetectedSign = matchedSign.name;
          this.lastDetectedEmoji = matchedSign.emoji;
        }
      }
      
      if (prediction && typeof prediction.dispose === 'function') {
        prediction.dispose();
      }
      
    } catch (error) {
      console.error('Detection error:', error);
    } finally {
      this.isPredicting = false;
    }
  }

  stopCamera(): void {
    this.isDetecting = false;
    this.isPredicting = false;
    
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
      this.predictionInterval = null;
    }
    
    if (this.webcam) {
      try { this.webcam.stop(); } catch(e) {}
      this.webcam = null;
    }
    
    if (this.webcamRef && this.webcamRef.nativeElement) {
      this.webcamRef.nativeElement.srcObject = null;
    }
    
    if (this.lastDetectedSign && this.lastDetectedEmoji) {
      this.signService.detectSign(this.lastDetectedSign, this.lastDetectedEmoji).subscribe({
        next: () => {
          this.message = `✅ Saved: ${this.lastDetectedEmoji} ${this.lastDetectedSign}`;
          this.loadHistory();
        },
        error: (error) => {
          this.message = '❌ Error saving';
        }
      });
    } else {
      this.message = 'No sign detected';
    }
    
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  loadHistory(): void {
    this.signService.getHistory().subscribe({
      next: (data) => { this.history = data; },
      error: (error) => { console.error('Error loading history:', error); }
    });
  }

  deleteAllHistory(): void {
    if (this.history.length === 0) return;
    if (confirm(`Delete all ${this.history.length} entries?`)) {
      this.signService.deleteAllHistory().subscribe({
        next: () => {
          this.history = [];
          this.message = '🗑️ All history deleted!';
        },
        error: (error) => {
          this.message = '❌ Error deleting history';
        }
      });
    }
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
      }
    });
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }
}