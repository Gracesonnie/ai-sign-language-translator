import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { SignService } from './services/sign.service';
import { ElementRef, ViewChild } from '@angular/core';
import { BehaviorSubject, Subscription, timer } from 'rxjs';

declare const tmImage: any;

interface ChatMessage {
  sender: 'User Client' | 'Agent' | 'System';
  text: string;
  timestamp: Date;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('webcam') webcamRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;

  title = 'AI Sign Translator';
  history: any[] = [];
  currentSign = '';
  currentEmoji = '';
  confidence = 0;
  isDetecting = false;
  message = 'System standby...';
  isLoading = false;

  isTerminalActive = false;
  showToast = false; 

  // 📝 Simplified 2-phrase Typewriter Configuration Array
  typewriterText$ = new BehaviorSubject<string>(''); 
  private typewriterSub!: Subscription;
  private phrases = [
  "Hello!",
  "Welcome to live sign support" 
];

  isRecordingSign = false;
  private bestCapturedSign: { name: string; emoji: string; confidence: number } | null = null;

  chatLines: ChatMessage[] = [];
  currentRole: 'deaf-user' | 'customer-service' = 'deaf-user';

  private wsConnection!: WebSocket;
  private peerConnection!: RTCPeerConnection;
  private dataChannel?: RTCDataChannel;
  private localStream!: MediaStream;

  private modelURL = 'https://teachablemachine.withgoogle.com/models/Z70ESd76G/';
  private model: any = null;
  private frameLoopId: any = null;
  private speechRecognition: any = null;

  signs = [
    { name: 'B', emoji: '🖐️' },
    { name: 'C', emoji: '🤏' }
  ];

  constructor(private signService: SignService) {}

  ngOnInit() {
    this.loadHistory();
    this.initializeSignaling();
    this.setupVoiceRecognition();
    this.addLogEntry('System', 'Welcome to SignBridge Live Terminal.');
    this.startSeamlessTypewriter(); 
    
    setTimeout(() => {
      this.triggerPopupSequence();
    }, 600);
  }

  // 🔄 Native RxJS Typewriter Pipeline with Relaxed Pacing Parameters
  private startSeamlessTypewriter(): void {
    let currentPhraseIndex = 0;
    let currentCharIndex = 0;
    let isDeleting = false;
    let stayCounter = 0; // ⏳ Added to pause upon fully writing a phrase

    // 💡 Slowed down typing pacing rate interval framework from 100ms to 180ms
    this.typewriterSub = timer(0, 180).subscribe(() => {
      const currentPhrase = this.phrases[currentPhraseIndex];

      if (!isDeleting && currentCharIndex === currentPhrase.length) {
        // Hold the phrase text visible on screen for 10 counts before starting to delete it
        stayCounter++;
        if (stayCounter < 10) return; 
        
        isDeleting = true;
        stayCounter = 0;
      }

      if (isDeleting) {
        this.typewriterText$.next(currentPhrase.substring(0, currentCharIndex - 1));
        currentCharIndex--;
      } else {
        this.typewriterText$.next(currentPhrase.substring(0, currentCharIndex + 1));
        currentCharIndex++;
      }

      // If text is fully deleted, move right into the next phrase track
      if (isDeleting && currentCharIndex === 0) {
        isDeleting = false;
        currentPhraseIndex = (currentPhraseIndex + 1) % this.phrases.length;
        stayCounter = 0;
      }
    });
  }

  private triggerPopupSequence(): void {
    this.showToast = true;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("Welcome to our customer service live translator, let's get started!");
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
    setTimeout(() => {
      this.showToast = false;
    }, 6000);
  }

  async activateTranslationHub(): Promise<void> {
    this.showToast = false;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isTerminalActive = true; 
    setTimeout(async () => {
      await this.autoStartContinuousCall();
    }, 400);
  }

  setRole(role: 'deaf-user' | 'customer-service'): void {
    this.currentRole = role;
    this.message = `Role switched to ${role === 'deaf-user' ? 'User Client' : 'Customer Service'}. Re-initializing...`;
    this.resetState();
    this.chatLines = [];
    this.addLogEntry('System', `Switched view to ${role === 'deaf-user' ? 'User Client Dashboard' : 'Agent Dashboard'}.`);
    setTimeout(async () => {
      await this.autoStartContinuousCall();
    }, 500);
  }

  private addLogEntry(sender: 'User Client' | 'Agent' | 'System', text: string) {
    this.chatLines.push({ sender, text, timestamp: new Date() });
    if (this.chatLines.length > 8) {
      this.chatLines.shift();
    }
  }

  private initializeSignaling(): void {
    try {
      this.wsConnection = new WebSocket('ws://localhost:8081');
      this.wsConnection.onmessage = async (msg) => {
        const data = JSON.parse(msg.data);
        if (data.sdp) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
          if (data.sdp.type === 'offer') {
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.wsConnection.send(JSON.stringify({ sdp: this.peerConnection.localDescription }));
          }
        } else if (data.ice) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.ice));
        }
      };
      this.wsConnection.onerror = () => {
        console.warn('Signaling server unavailable on port 8081. Running in local standalone preview mode.');
      };
    } catch (e) {
      console.error('Signaling error:', e);
    }
  }

  async autoStartContinuousCall(): Promise<void> {
    try {
      this.isLoading = true;
      this.message = '⏳ Loading AI Model & Video Streams...';
      
      this.model = await tmImage.load(
        this.modelURL + 'model.json',
        this.modelURL + 'metadata.json'
      );
      
      const constraints: MediaStreamConstraints = { 
        video: { width: 640, height: 480, facingMode: 'user' }, 
        audio: true 
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      const videoElement = this.webcamRef?.nativeElement;
      if (videoElement) {
        videoElement.srcObject = this.localStream;
        videoElement.onloadedmetadata = async () => {
          await videoElement.play();
        };
      }
      
      this.initializePeerConnection();
      this.isDetecting = true;
      this.isLoading = false;
      this.message = '🟢 Live video frames active. Ready to manually record signs.';
      
      if (this.currentRole === 'customer-service') {
        this.startVoiceListening();
      }
    } catch (error) {
      console.error('❌ AutoStart Pipeline Error:', error);
      this.message = '❌ Core initialization error. Check camera permissions.';
      this.isLoading = false;
    }
  }

  private initializePeerConnection(): void {
    try {
      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      this.peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          if (this.currentRole === 'customer-service' && this.webcamRef) {
            this.webcamRef.nativeElement.srcObject = event.streams[0];
          } else if (this.currentRole === 'deaf-user' && this.remoteVideoRef) {
            this.remoteVideoRef.nativeElement.srcObject = event.streams[0];
          }
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
          this.wsConnection.send(JSON.stringify({ ice: event.candidate }));
        }
      };

      if (this.currentRole === 'deaf-user') {
        this.dataChannel = this.peerConnection.createDataChannel('signTransmitter');
        this.configureDataChannel();
      } else {
        this.peerConnection.ondatachannel = (event) => {
          this.dataChannel = event.channel;
          this.configureDataChannel();
        };
      }
    } catch (e) {
      console.warn('WebRTC peer initialization skipped:', e);
    }
  }

  private configureDataChannel(): void {
    if (!this.dataChannel) return;
    this.dataChannel.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'SIGN_EVENT') {
        this.currentSign = payload.name;
        this.addLogEntry('User Client', payload.name);
        this.speakText(`User signed ${payload.name}`);
        if (this.currentRole === 'customer-service') {
          this.signService.detectSign(payload.name, payload.emoji).subscribe({
            next: () => this.loadHistory(),
            error: (err) => console.error('Error logging to DB:', err)
          });
        }
      } else if (payload.type === 'VOICE_RESPONSE') {
        this.addLogEntry('Agent', payload.text);
      }
    };
  }

  private speakText(textToSay: string): void {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSay);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }

  private setupVoiceRecognition(): void {
    const speechContext = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (speechContext) {
      this.speechRecognition = new speechContext();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = false;
      this.speechRecognition.lang = 'en-US';
      this.speechRecognition.onresult = (event: any) => {
        const lastResultIndex = event.results.length - 1;
        const spokenText = event.results[lastResultIndex][0].transcript;
        this.addLogEntry('Agent', spokenText);
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
          this.dataChannel.send(JSON.stringify({ type: 'VOICE_RESPONSE', text: spokenText }));
        }
      };
    }
  }

  private startVoiceListening(): void {
    if (this.speechRecognition && this.currentRole === 'customer-service') {
      try { this.speechRecognition.start(); } catch(e) {}
    }
  }

  startSignRecording(): void {
    if (!this.isDetecting || !this.model || this.isRecordingSign) return;
    this.isRecordingSign = true;
    this.bestCapturedSign = null;
    this.message = '🔴 Recording active... Hold your sign in front of the camera.';
    this.executeRecordingAnalysisLoop();
  }

  stopSignRecording(): void {
    if (!this.isRecordingSign) return;
    this.isRecordingSign = false;
    if (this.frameLoopId) cancelAnimationFrame(this.frameLoopId);

    if (this.bestCapturedSign && this.bestCapturedSign.confidence > 30) {
      const locked = this.bestCapturedSign;
      this.currentSign = locked.name;
      this.currentEmoji = locked.emoji;
      this.confidence = locked.confidence;
      this.addLogEntry('User Client', locked.name);

      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify({
          type: 'SIGN_EVENT',
          name: locked.name,
          emoji: locked.emoji,
          confidence: locked.confidence
        }));
      }
      this.message = `✅ Locked in Sign: ${locked.name} (${locked.confidence}% confidence)`;
    } else {
      this.message = '⚠️ Recording stopped, but no clear sign was captured. Try holding closer.';
    }
  }

  private async executeRecordingAnalysisLoop(): Promise<void> {
    if (!this.isRecordingSign || !this.model || !this.webcamRef) return;
    try {
      const videoEl = this.webcamRef.nativeElement;
      if (videoEl && videoEl.readyState >= 2 && !videoEl.paused) {
        const prediction = await this.model.predict(videoEl);
        let top = prediction[0];
        for (let i = 1; i < prediction.length; i++) {
          if (prediction[i].probability > top.probability) top = prediction[i];
        }
        const confidenceValue = Math.round(top.probability * 100);
        const matchedSign = this.signs.find(s => s.name === top.className);

        if (matchedSign && confidenceValue > 30) {
          if (!this.bestCapturedSign || confidenceValue > this.bestCapturedSign.confidence) {
            this.bestCapturedSign = {
              name: matchedSign.name,
              emoji: matchedSign.emoji,
              confidence: confidenceValue
            };
          }
        }
      }
    } catch (error) {
      console.error('Recording stream error:', error);
    }
    if (this.isRecordingSign) {
      this.frameLoopId = requestAnimationFrame(() => this.executeRecordingAnalysisLoop());
    }
  }

  establishCall(): void {
    if (!this.peerConnection) return;
    this.message = '📡 Exchanging connection signals...';
    this.peerConnection.createOffer().then(offer => {
      return this.peerConnection.setLocalDescription(offer);
    }).then(() => {
      if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
        this.wsConnection.send(JSON.stringify({ sdp: this.peerConnection.localDescription }));
      }
    });
  }

  resetState(): void {
    this.isRecordingSign = false;
    this.isDetecting = false;
    this.currentSign = '';
    this.chatLines = [];
    if (this.speechRecognition) {
      try { this.speechRecognition.stop(); } catch(e) {}
    }
    if (this.frameLoopId) cancelAnimationFrame(this.frameLoopId);
    if (this.localStream) this.localStream.getTracks().forEach(track => track.stop());
    if (this.webcamRef?.nativeElement) this.webcamRef.nativeElement.srcObject = null;
    if (this.remoteVideoRef?.nativeElement) this.remoteVideoRef.nativeElement.srcObject = null;
    if (this.peerConnection) this.peerConnection.close();
  }

  returnToHome(): void {
    this.resetState();
    this.isTerminalActive = false; 
    this.message = 'System standby...';
    setTimeout(() => {
      this.triggerPopupSequence();
    }, 400);
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
        error: (error) => { this.message = '❌ Error deleting history'; }
      });
    }
  }

  testSign(signName: string, signEmoji: string): void {
    this.addLogEntry('User Client', signName);
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: 'SIGN_EVENT',
        name: signName,
        emoji: signEmoji,
        confidence: 100
      }));
    }
    this.signService.detectSign(signName, signEmoji).subscribe({
      next: () => {
        this.currentSign = signName;
        this.loadHistory();
      },
      error: (error) => { this.message = '❌ Error saving manual test sign.'; }
    });
  }

  ngOnDestroy(): void {
    this.resetState();
    if (this.typewriterSub) this.typewriterSub.unsubscribe();
    if (this.wsConnection) this.wsConnection.close();
  }
}