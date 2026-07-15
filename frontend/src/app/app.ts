import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { SignService } from './services/sign.service';
import { SignRecognitionService, PredictionResult } from './services/sign-recognition.service';
import { BehaviorSubject, Subscription, timer } from 'rxjs';

interface ChatMessage {
  sender: 'User Client' | 'Agent' | 'System';
  text: string;
  timestamp: Date;
  isSign?: boolean;
  id?: string;
}

interface Sign {
  name: string;
  emoji: string;
  confidence: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('mainVideo') mainVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('pipVideo') pipVideoRef!: ElementRef<HTMLVideoElement>;

  // ========== UI STATE ==========
  title = 'AI Sign Translator';
  isTerminalActive = false;
  showToast = false;
  showDevTools = false;
  isLoading = false;
  message = 'System standby...';
  
  // ========== SIGN DETECTION ==========
  currentSign = '';
  currentEmoji = '';
  confidence = 0;
  isDetecting = false;
  isRecordingSign = false;
  
  // ========== DATA ==========
  history: any[] = [];
  chatLines: ChatMessage[] = [];
  currentRole: 'deaf-user' | 'customer-service' = 'deaf-user';
  private messageIdCounter = 0;
  
  // ========== SIGNS ==========
  signs: Sign[] = [
    { name: 'A', emoji: '✊', confidence: 0 },
    { name: 'B', emoji: '🖐️', confidence: 0 },
    { name: 'C', emoji: '🤟', confidence: 0 },
    { name: 'H', emoji: '🤘', confidence: 0 },
    { name: 'I', emoji: '☝️', confidence: 0 },
    { name: 'R', emoji: '🤞', confidence: 0 },
    { name: 'V', emoji: '✌️', confidence: 0 },
    { name: 'W', emoji: '🤙', confidence: 0 },
    { name: 'Y', emoji: '👍', confidence: 0 }
  ];

  // ========== CONFIDENCE TRACKING ==========
  private confidenceHistory: Map<string, number[]> = new Map();
  private readonly MIN_CONFIDENCE = 30;
  private readonly HISTORY_SIZE = 5;
  private readonly STABLE_FRAMES = 2;

  // ========== BEST CAPTURED SIGN ==========
  bestCapturedSign: { name: string; emoji: string; confidence: number } | null = null;

  // ========== WEBRTC ==========
  private wsConnection!: WebSocket;
  private peerConnection!: RTCPeerConnection;
  private dataChannel?: RTCDataChannel;
  private localStream!: MediaStream;
  private isCallConnected = false;
  private isConnectingCall = false;
  private isSignalingConnected = false;

  // ========== FRAME LOOP ==========
  private frameLoopId: any = null;
  private speechRecognition: any = null;
  private isProcessing: boolean = false;
  private lastPredictionTime: number = 0;
  private readonly PREDICTION_INTERVAL = 500;

  // ========== TYPEWRITER ==========
  typewriterText$ = new BehaviorSubject<string>('');
  private typewriterSub!: Subscription;
  private phrases = ["Hello!", "Welcome to live sign support"];

  // ========== INTERIM TRANSCRIPT ==========
  private interimTranscript: string = '';
  private finalTranscript: string = '';
  private detectionCounter: Map<string, number> = new Map();

  // ========== VOICE RECOGNITION FLAG ==========
  private isVoiceRecognitionRunning: boolean = false;

  constructor(
    private signService: SignService,
    private signRecognitionService: SignRecognitionService
  ) {}

  // ============================================================
  // LIFECYCLE
  // ============================================================

  ngOnInit(): void {
    this.loadHistory();
    this.initializeSignaling();
    this.startSeamlessTypewriter();
    this.initializeVoiceRecognition();

    this.signs.forEach(sign => {
      this.confidenceHistory.set(sign.name, []);
      this.detectionCounter.set(sign.name, 0);
    });

    this.checkMLBackend();

    setTimeout(() => {
      this.showToast = true;
      setTimeout(() => { this.showToast = false; }, 6000);
    }, 600);
  }

  ngOnDestroy(): void {
    this.resetState();
    if (this.typewriterSub) {
      this.typewriterSub.unsubscribe();
    }
    if (this.wsConnection) {
      this.wsConnection.close();
    }
    if (this.speechRecognition) {
      try { this.speechRecognition.stop(); } catch(e) {}
      this.isVoiceRecognitionRunning = false;
    }
  }

  // ============================================================
  // SCROLL TO SECTION
  // ============================================================

  scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ============================================================
  // DISPLAY NAME & EMOJI HELPERS
  // ============================================================

  private getDisplayName(modelName: string | null): string {
    if (!modelName) {
      return 'Unknown';
    }
    
    if (modelName.length === 1 && modelName >= 'A' && modelName <= 'Z') {
      return modelName;
    }
    
    const displayMap: { [key: string]: string } = {
      'Hello': 'A',
      'Stand': 'B',
      'Thanks': 'C',
      'Please': 'R',
      'Yes': 'V',
      'No': 'H',
      'Help': 'I',
      'Love': 'W',
      'Okay': 'Y'
    };
    
    return displayMap[modelName] || modelName;
  }

  private getEmojiForSign(signName: string | null): string {
    if (!signName) {
      return '❓';
    }
    
    const emojiMap: { [key: string]: string } = {
      'A': '✊',
      'B': '🖐️',
      'C': '🤟',
      'H': '🤘',
      'I': '☝️',
      'R': '🤞',
      'V': '✌️',
      'W': '🤙',
      'Y': '👍',
      'Hello': '👋',
      'Stand': '🧍',
      'Thanks': '🙏',
      'Please': '🤲',
      'Yes': '👍',
      'No': '👎',
      'Help': '🆘',
      'Love': '❤️',
      'Okay': '👌'
    };
    
    const displayName = this.getDisplayName(signName);
    return emojiMap[displayName] || emojiMap[signName] || '❓';
  }

  // ============================================================
  // SPEECH SYNTHESIS - Voice feedback for agent (FIXED)
  // ============================================================

  private speakTextForAgent(text: string): void {
    // Only speak if agent role is active
    if (this.currentRole !== 'customer-service') {
      console.log('🔇 Not in agent mode, skipping voice');
      return;
    }
    
    if (!('speechSynthesis' in window)) {
      console.warn('⚠️ Speech synthesis not supported');
      return;
    }
    
    try {
      // Cancel any previous speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.lang = 'en-US';
      
      // Small delay to ensure browser handles autoplay
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
        console.log(`🔊 Agent hears: "${text}"`);
      }, 150);
      
    } catch (error) {
      console.error('❌ Speech synthesis error:', error);
    }
  }

  // ============================================================
  // DEBUG METHOD
  // ============================================================

  async debugModelOutput(): Promise<void> {
    if (!this.mainVideoRef) {
      this.message = '❌ Camera not ready';
      return;
    }

    try {
      const videoEl = this.mainVideoRef.nativeElement;
      if (videoEl && videoEl.readyState >= 2) {
        const canvas = document.createElement('canvas');
        const videoWidth = videoEl.videoWidth || 640;
        const videoHeight = videoEl.videoHeight || 480;
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoEl, 0, 0, videoWidth, videoHeight);
        const imageData = canvas.toDataURL('image/png');

        console.log('========================================');
        console.log('🔬 MODEL OUTPUT DEBUG');
        console.log('========================================');
        
        this.signRecognitionService.predictSign(imageData).subscribe({
          next: (result) => {
            console.log('Sign detected:', result.sign);
            console.log('Confidence:', result.confidence);
            console.log('Success:', result.success);
            console.log('----------------------------------------');
            if (result.all_predictions) {
              console.log('📊 All predictions:');
              const sorted = Object.entries(result.all_predictions)
                .sort((a, b) => b[1] - a[1]);
              sorted.forEach(([sign, conf], index) => {
                const bar = '█'.repeat(Math.round(conf * 40));
                const pct = (conf * 100).toFixed(1);
                console.log(`  ${index + 1}. ${sign.padEnd(10)} ${bar} ${pct}%`);
              });
            }
            console.log('========================================');
            
            const displayName = result.sign ? this.getDisplayName(result.sign) : 'Unknown';
            const confidencePct = result.confidence ? Math.round(result.confidence * 100) : 0;
            const emoji = result.sign ? this.getEmojiForSign(result.sign) : '❓';
            this.message = `🔬 Debug: "${result.sign || 'null'}" → Display: "${displayName}" (${confidencePct}%)`;
            this.currentSign = displayName;
            this.currentEmoji = emoji;
            this.confidence = confidencePct;
          },
          error: (error) => {
            console.error('❌ Debug error:', error);
            this.message = '❌ Debug failed: ' + (error.message || 'Unknown error');
          }
        });
      }
    } catch (error) {
      console.error('Debug error:', error);
      this.message = '❌ Debug failed: ' + (error as any).message;
    }
  }

  // ============================================================
  // TEST METHODS
  // ============================================================

  async testAPIDirectly(): Promise<void> {
    if (!this.mainVideoRef) {
      this.message = '❌ Camera not ready';
      return;
    }

    try {
      const videoEl = this.mainVideoRef.nativeElement;
      if (videoEl && videoEl.readyState >= 2) {
        const canvas = document.createElement('canvas');
        const videoWidth = videoEl.videoWidth || 640;
        const videoHeight = videoEl.videoHeight || 480;
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoEl, 0, 0, videoWidth, videoHeight);
        
        const imageData = canvas.toDataURL('image/png');

        console.log('🧪 Testing API directly...');
        
        this.signRecognitionService.predictSign(imageData).subscribe({
          next: (result) => {
            console.log('🧪 API Result:', result);
            if (result.success && result.sign) {
              const displayName = this.getDisplayName(result.sign);
              const confidence = Math.round(result.confidence * 100);
              const emoji = this.getEmojiForSign(result.sign);
              this.message = `🧪 API Test: "${displayName}" (${confidence}%)`;
              this.currentSign = displayName;
              this.currentEmoji = emoji;
              this.confidence = confidence;
            } else {
              this.message = `🧪 API Test: ${result.message || 'No hand detected'}`;
            }
          },
          error: (error) => {
            console.error('🧪 API Error:', error);
            this.message = '❌ API Error: ' + error.message;
          }
        });
      }
    } catch (error) {
      console.error('Test error:', error);
      this.message = '❌ Test failed: ' + error;
    }
  }

  async testMLBackend(): Promise<void> {
    if (!this.mainVideoRef) {
      this.message = '❌ Camera not ready';
      return;
    }

    try {
      const videoEl = this.mainVideoRef.nativeElement;
      if (videoEl && videoEl.readyState >= 2) {
        const canvas = document.createElement('canvas');
        const videoWidth = videoEl.videoWidth || 640;
        const videoHeight = videoEl.videoHeight || 480;
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoEl, 0, 0, videoWidth, videoHeight);
        const imageData = canvas.toDataURL('image/png');

        console.log('🔬 Testing ML Backend...');
        this.signRecognitionService.predictSign(imageData).subscribe({
          next: (result: PredictionResult) => {
            console.log('🔬 ML Backend Result:', result);
            if (result.success && result.sign) {
              const displayName = this.getDisplayName(result.sign);
              const confidence = Math.round(result.confidence * 100);
              const emoji = this.getEmojiForSign(result.sign);
              this.message = `🔬 Detected: "${displayName}" (${confidence}%)`;
              this.currentSign = displayName;
              this.currentEmoji = emoji;
              this.confidence = confidence;
            } else {
              this.message = `🔬 ${result.message || 'No hand detected'}`;
            }
          },
          error: (error) => {
            console.error('ML test error:', error);
            this.message = '❌ ML service error. Check if Python backend is running on port 5000.';
          }
        });
      }
    } catch (error) {
      console.error('Test error:', error);
      this.message = '❌ Test failed: ' + error;
    }
  }

  // ============================================================
  // VOICE RECOGNITION (Agent only)
  // ============================================================

  private initializeVoiceRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'en-US';
      this.speechRecognition.maxAlternatives = 1;
      
      this.speechRecognition.onresult = (event: any) => {
        if (this.currentRole !== 'customer-service' || !this.isTerminalActive) return;
        
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          }
        }
        
        if (final) {
          const text = final.trim();
          if (text && text.length > 1) {
            console.log('🎤 Agent said:', text);
            this.addChatMessage('Agent', text, false);
            
            if (this.dataChannel && this.dataChannel.readyState === 'open') {
              this.dataChannel.send(JSON.stringify({
                type: 'CHAT_MESSAGE',
                sender: 'Agent',
                text: text,
                isSign: false
              }));
            }
          }
        }
      };
      
      this.speechRecognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
      };
      
      this.speechRecognition.onend = () => {
        console.log('🎤 Speech recognition ended');
        this.isVoiceRecognitionRunning = false;
        if (this.currentRole === 'customer-service' && this.isTerminalActive) {
          setTimeout(() => this.startVoiceListening(), 500);
        }
      };
    } else {
      console.warn('⚠️ Speech recognition not supported in this browser');
      this.message = '⚠️ Speech recognition not supported. Please use Chrome or Edge.';
    }
  }

  private startVoiceListening(): void {
    if (this.isVoiceRecognitionRunning) {
      console.log('🎙️ Voice recognition already running');
      return;
    }
    
    if (this.speechRecognition && this.currentRole === 'customer-service') {
      try {
        this.speechRecognition.start();
        this.isVoiceRecognitionRunning = true;
        console.log('🎙️ Agent voice recognition started');
        this.message = '🎙️ Agent is listening... Speak clearly.';
      } catch(e) {
        console.warn('Voice recognition error:', e);
        this.isVoiceRecognitionRunning = false;
      }
    }
  }

  private stopVoiceListening(): void {
    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop();
        this.isVoiceRecognitionRunning = false;
        console.log('🎙️ Voice recognition stopped');
      } catch(e) {
        console.warn('Error stopping voice recognition:', e);
        this.isVoiceRecognitionRunning = false;
      }
    }
  }

  // ============================================================
  // CHAT MANAGEMENT
  // ============================================================

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }

  private addChatMessage(sender: 'User Client' | 'Agent' | 'System', text: string, isSign: boolean = false): void {
    const message: ChatMessage = {
      sender: sender,
      text: text,
      timestamp: new Date(),
      isSign: isSign,
      id: this.generateMessageId()
    };
    
    this.chatLines.push(message);
    console.log(`💬 [${sender}] ${text}`);
    
    setTimeout(() => {
      const linesElement = document.getElementById('lines');
      if (linesElement) {
        linesElement.scrollTop = linesElement.scrollHeight;
      }
    }, 50);
    
    if (this.chatLines.length > 50) {
      this.chatLines.shift();
    }
  }

  // ============================================================
  // WEBRTC DATA CHANNEL
  // ============================================================

  private configureDataChannel(): void {
    if (!this.dataChannel) return;
    
    this.dataChannel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('📨 Received from peer:', payload);
        
        switch(payload.type) {
          case 'CHAT_MESSAGE':
            this.addChatMessage(
              payload.sender as 'User Client' | 'Agent' | 'System',
              payload.text,
              payload.isSign || false
            );
            if (payload.isSign && this.currentRole === 'customer-service') {
              const signName = payload.text.split(' ')[0];
              this.speakTextForAgent(`User signed ${signName}`);
            }
            break;
            
          case 'SIGN_EVENT':
            const displayName = this.getDisplayName(payload.name);
            const emoji = this.getEmojiForSign(payload.name);
            this.currentSign = displayName;
            this.currentEmoji = emoji;
            this.confidence = payload.confidence || 0;
            this.addChatMessage('User Client', `${displayName} ${emoji}`, true);
            
            if (this.currentRole === 'customer-service') {
              this.speakTextForAgent(`User signed ${displayName}`);
              this.autoRespondAsAgent(displayName);
            }
            
            if (this.currentRole === 'customer-service') {
              this.signService.detectSign(displayName, emoji).subscribe({
                next: () => this.loadHistory(),
                error: (err) => console.error('Error saving:', err)
              });
            }
            break;
            
          default:
            console.warn('Unknown message type:', payload.type);
        }
      } catch (e) {
        console.warn('Error parsing data channel message:', e);
      }
    };
    
    this.dataChannel.onopen = () => {
      console.log('✅ Data channel opened');
      this.isCallConnected = true;
      this.addChatMessage('System', 'Call connected successfully!', false);
    };
    
    this.dataChannel.onclose = () => {
      console.log('❌ Data channel closed');
      this.isCallConnected = false;
      this.addChatMessage('System', 'Call disconnected.', false);
      setTimeout(() => {
        if (!this.isCallConnected && this.peerConnection) {
          console.log('🔄 Attempting to reconnect data channel...');
          this.establishCall();
        }
      }, 2000);
    };
  }

  // ============================================================
  // AUTO RESPOND AS AGENT
  // ============================================================

  private autoRespondAsAgent(userMessage: string): void {
    const responses = [
      "Thank you for signing. How can I help you?",
      "I see. Let me check that for you.",
      "Got it! I'll look into this right away.",
      "Is there anything else you'd like to add?",
      "I understand. Give me a moment.",
      "Thanks for letting me know.",
      "Let me get that information for you.",
      "I appreciate your patience."
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    setTimeout(() => {
      this.addChatMessage('Agent', randomResponse, false);
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify({
          type: 'CHAT_MESSAGE',
          sender: 'Agent',
          text: randomResponse,
          isSign: false
        }));
      }
      console.log('🔊 Agent auto-responded:', randomResponse);
    }, 1500);
  }

  // ============================================================
  // ML BACKEND
  // ============================================================

  private checkMLBackend(): void {
    this.signRecognitionService.healthCheck().subscribe({
      next: (health) => {
        console.log('✅ ML Backend healthy:', health);
        this.message = '✅ ML Backend connected!';
        if (health.classes && health.classes.length > 0) {
          this.signs = health.classes.map(cls => ({
            name: cls,
            emoji: this.getEmojiForSign(cls),
            confidence: 0
          }));
        }
      },
      error: () => {
        console.warn('⚠️ ML Backend not available.');
        this.message = '⚠️ ML Backend unavailable. Please start the Python server.';
      }
    });
  }

  // ============================================================
  // HELPERS
  // ============================================================

  getColorForSign(signName: string): string {
    const colors: { [key: string]: string } = {
      'A': '#ef4444',
      'B': '#3b82f6',
      'C': '#10b981',
      'H': '#ec4899',
      'I': '#06b6d4',
      'R': '#8b5cf6',
      'V': '#f59e0b',
      'W': '#f97316',
      'Y': '#14b8a6'
    };
    return colors[signName] || '#6b7280';
  }

  getAvailableSigns(): string {
    return this.signs.map(s => `${s.name} ${s.emoji}`).join('  ');
  }

  clearConfidenceHistory(): void {
    this.confidenceHistory.forEach(history => history.length = 0);
    this.detectionCounter.forEach((_, key) => this.detectionCounter.set(key, 0));
    this.bestCapturedSign = null;
    this.currentSign = '';
    this.currentEmoji = '';
    this.confidence = 0;
    this.message = '🧹 Confidence tracking reset.';
    console.log('🧹 Confidence history cleared');
  }

  clearConversation(): void {
    this.chatLines = [];
    this.addChatMessage('System', 'Conversation cleared.', false);
  }

  // ============================================================
  // TEST VOICE - For debugging
  // ============================================================

  testVoice(): void {
    this.speakTextForAgent('This is a voice test. The audio system is working properly.');
    this.message = '🔊 Voice test triggered!';
  }

  // ============================================================
  // RECORDING - USER SIGNS
  // ============================================================

  private async executeRecordingAnalysisLoop(): Promise<void> {
    if (this.isProcessing || !this.isRecordingSign || !this.mainVideoRef) {
      if (this.isRecordingSign) {
        this.frameLoopId = requestAnimationFrame(() => this.executeRecordingAnalysisLoop());
      }
      return;
    }

    try {
      const videoEl = this.mainVideoRef.nativeElement;
      if (videoEl && videoEl.readyState >= 2 && !videoEl.paused) {
        
        const now = Date.now();
        if (now - this.lastPredictionTime < this.PREDICTION_INTERVAL) {
          this.frameLoopId = requestAnimationFrame(() => this.executeRecordingAnalysisLoop());
          return;
        }
        this.lastPredictionTime = now;
        this.isProcessing = true;

        const canvas = document.createElement('canvas');
        const videoWidth = videoEl.videoWidth || 640;
        const videoHeight = videoEl.videoHeight || 480;
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoEl, 0, 0, videoWidth, videoHeight);
        
        const imageData = canvas.toDataURL('image/png');

        console.log(`📸 Sending frame to API... Size: ${canvas.width}x${canvas.height} (PNG)`);

        this.signRecognitionService.predictSign(imageData).subscribe({
          next: (result: PredictionResult) => {
            console.log('🔍 API Response:', result);
            
            if (result.success && result.sign) {
              const confidenceValue = Math.round(result.confidence * 100);
              const displayName = this.getDisplayName(result.sign);
              const displayEmoji = this.getEmojiForSign(result.sign);
              
              console.log(`✅ Detected: ${result.sign} → Display: ${displayName} ${displayEmoji} (${confidenceValue}%)`);
              
              if (result.all_predictions) {
                console.log('📊 All predictions:');
                const sorted = Object.entries(result.all_predictions)
                  .sort((a, b) => b[1] - a[1]);
                sorted.slice(0, 3).forEach(([sign, conf], index) => {
                  const pct = (conf * 100).toFixed(1);
                  console.log(`   ${index + 1}. ${sign}: ${pct}%`);
                });
              }
              console.log('---');
              
              if (confidenceValue >= this.MIN_CONFIDENCE) {
                if (!this.bestCapturedSign || confidenceValue > this.bestCapturedSign.confidence) {
                  this.bestCapturedSign = {
                    name: result.sign,
                    emoji: this.getEmojiForSign(result.sign),
                    confidence: confidenceValue
                  };
                  this.currentSign = displayName;
                  this.currentEmoji = displayEmoji;
                  this.confidence = confidenceValue;
                  this.message = `🎯 Capturing: ${displayName} ${displayEmoji} (${confidenceValue}%)`;
                }
              }
            } else {
              console.log('❌ No sign detected:', result.message);
            }
            this.isProcessing = false;
          },
          error: (error) => {
            console.error('❌ API Error:', error);
            this.isProcessing = false;
          }
        });
      } else {
        this.isProcessing = false;
      }
    } catch (error) {
      console.error('Recording stream error:', error);
      this.isProcessing = false;
    }

    if (this.isRecordingSign) {
      this.frameLoopId = requestAnimationFrame(() => this.executeRecordingAnalysisLoop());
    }
  }

  startSignRecording(): void {
    if (!this.isDetecting || this.isRecordingSign) {
      if (!this.isDetecting) {
        this.message = '⏳ Camera not ready. Please wait...';
      }
      return;
    }
    
    this.isRecordingSign = true;
    this.bestCapturedSign = null;
    this.confidenceHistory.forEach(history => history.length = 0);
    this.detectionCounter.forEach((_, key) => this.detectionCounter.set(key, 0));
    this.lastPredictionTime = 0;
    this.isProcessing = false;
    this.message = '🔴 Recording active... Hold your sign in front of the camera.';
    this.executeRecordingAnalysisLoop();
  }

  // ============================================================
  // STOP SIGN RECORDING - UPDATED: Immediately updates history & speaks
  // ============================================================

  stopSignRecording(): void {
    if (!this.isRecordingSign) return;
    this.isRecordingSign = false;
    this.isProcessing = false;

    if (this.frameLoopId) {
      cancelAnimationFrame(this.frameLoopId);
      this.frameLoopId = null;
    }

    if (this.bestCapturedSign && this.bestCapturedSign.confidence > this.MIN_CONFIDENCE) {
      const locked = this.bestCapturedSign;
      const displayName = this.getDisplayName(locked.name);
      const displayEmoji = this.getEmojiForSign(locked.name);
      
      this.currentSign = displayName;
      this.currentEmoji = displayEmoji;
      this.confidence = Math.round(locked.confidence);
      
      // Add chat message for the sign
      this.addChatMessage('User Client', `${displayName} ${displayEmoji}`, true);
      
      // ✅ SPEAK THE SIGN FOR THE AGENT
      const voiceMessage = `User signed ${displayName}`;
      this.speakTextForAgent(voiceMessage);
      
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify({
          type: 'CHAT_MESSAGE',
          sender: 'User Client',
          text: `${displayName} ${displayEmoji}`,
          isSign: true,
          signName: displayName,
          signEmoji: displayEmoji,
          confidence: locked.confidence
        }));
      }
      
      this.message = `✅ Sign "${displayName}" ${displayEmoji} captured! (${Math.round(locked.confidence)}% confidence)`;
      
      // Save to database and reload history
      this.signService.detectSign(displayName, displayEmoji).subscribe({
        next: (response: any) => {
          console.log('✅ Sign saved to database:', response);
          this.loadHistory();
        },
        error: (err) => {
          console.error('Error saving to DB:', err);
          const now = new Date();
          const newEntry = {
            id: Date.now(),
            signName: displayName,
            signEmoji: displayEmoji,
            timestamp: now.toISOString()
          };
          this.history = [newEntry, ...this.history];
          this.history = [...this.history];
        }
      });

    } else {
      const confidenceMsg = this.bestCapturedSign
        ? ` (${Math.round(this.bestCapturedSign.confidence)}%)`
        : '';
      this.message = `⚠️ No clear sign captured${confidenceMsg}. Try again.`;
      this.currentSign = '';
      this.currentEmoji = '';
      this.confidence = 0;
    }

    this.bestCapturedSign = null;
    this.confidenceHistory.forEach(history => history.length = 0);
    this.detectionCounter.forEach((_, key) => this.detectionCounter.set(key, 0));
  }

  // ============================================================
  // TEST SIGN (Manual)
  // ============================================================

  testSign(signName: string, signEmoji: string): void {
    const displayName = this.getDisplayName(signName);
    const displayEmoji = this.getEmojiForSign(signName);
    
    this.addChatMessage('User Client', `${displayName} ${displayEmoji}`, true);
    
    // ✅ SPEAK THE SIGN FOR THE AGENT
    if (this.currentRole === 'customer-service') {
      const voiceMessage = `User signed ${displayName}`;
      this.speakTextForAgent(voiceMessage);
    }
    
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: 'CHAT_MESSAGE',
        sender: 'User Client',
        text: `${displayName} ${displayEmoji}`,
        isSign: true,
        signName: displayName,
        signEmoji: displayEmoji,
        confidence: 100
      }));
    }
    
    this.signService.detectSign(displayName, displayEmoji).subscribe({
      next: () => {
        this.currentSign = displayName;
        this.loadHistory();
        this.message = `✅ Test sign "${displayName}" sent!`;
      },
      error: (error) => {
        console.error(error);
        this.message = '❌ Error saving manual test sign.';
        const now = new Date();
        const newEntry = {
          id: Date.now(),
          signName: displayName,
          signEmoji: displayEmoji,
          timestamp: now.toISOString()
        };
        this.history = [newEntry, ...this.history];
      }
    });
  }

  // ============================================================
  // NAVIGATION
  // ============================================================

  activateTranslationHub(): void {
    this.showToast = false;
    this.isTerminalActive = true;
    
    setTimeout(async () => {
      await this.autoStartContinuousCall();
    }, 400);
  }

  returnToHome(): void {
    this.resetState();
    this.isTerminalActive = false;
    this.message = 'System standby...';
    this.stopVoiceListening();
    this.isVoiceRecognitionRunning = false;
    setTimeout(() => {
      this.showToast = true;
      setTimeout(() => { this.showToast = false; }, 6000);
    }, 400);
  }

  // ============================================================
  // AUTO START
  // ============================================================

  async autoStartContinuousCall(): Promise<void> {
    try {
      this.isLoading = true;
      this.message = '⏳ Connecting to ML Backend & Camera...';

      this.signRecognitionService.healthCheck().subscribe({
        next: (health) => {
          console.log('✅ ML Backend healthy:', health);
          this.message = `🟢 ML Backend ready! Detecting ${health.classes?.length || this.signs.length} signs.`;
          this.isLoading = false;
        },
        error: () => {
          console.warn('⚠️ ML Backend not available');
          this.message = '⚠️ ML Backend unavailable. Please start the Python server.';
          this.isLoading = false;
        }
      });

      const constraints: MediaStreamConstraints = {
        video: { 
          width: 640, 
          height: 480, 
          facingMode: 'user'
        },
        audio: true
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('📹 Local stream acquired');

      if (this.mainVideoRef && this.mainVideoRef.nativeElement) {
        this.mainVideoRef.nativeElement.srcObject = this.localStream;
        console.log(`📹 ${this.currentRole} video set to MAIN (big) view`);
      }

      this.initializePeerConnection();
      this.isDetecting = true;
      this.isLoading = false;
      this.message = `🟢 Live! Connected to ML backend. Press record to detect signs.`;

    } catch (error) {
      console.error('❌ AutoStart Pipeline Error:', error);
      this.message = '❌ Core initialization error. Check camera permissions.';
      this.isLoading = false;
    }
  }

  // ============================================================
  // ROLE - Keeps conversation when switching
  // ============================================================

  setRole(role: 'deaf-user' | 'customer-service'): void {
    this.stopVoiceListening();
    this.isVoiceRecognitionRunning = false;
    this.isConnectingCall = false;
    this.isCallConnected = false;
    
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch(e) {}
      this.peerConnection = null as any;
    }
    
    this.currentRole = role;
    this.message = `Role switched to ${role === 'deaf-user' ? 'User Client' : 'Customer Service'}.`;
    this.dataChannel = undefined;
    
    // ✅ KEEP conversation - DO NOT clear chatLines
    this.addChatMessage('System', `Switched to ${role === 'deaf-user' ? 'User Client' : 'Agent'} view.`, false);
    
    setTimeout(async () => {
      await this.autoStartContinuousCall();
      setTimeout(() => {
        this.establishCall();
      }, 1000);
      
      if (role === 'customer-service') {
        setTimeout(() => this.startVoiceListening(), 2000);
      }
    }, 500);
  }

  // ============================================================
  // WEBRTC
  // ============================================================

  private initializeSignaling(): void {
    try {
      if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
        this.wsConnection.close();
      }
      
      this.wsConnection = new WebSocket('ws://localhost:8081');
      
      this.wsConnection.onopen = () => {
        console.log('✅ WebSocket signaling connected');
        this.isSignalingConnected = true;
      };
      
      this.wsConnection.onmessage = async (msg) => {
        try {
          const data = JSON.parse(msg.data);
          console.log('📨 Signaling message:', data);
          
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
        } catch (e) {
          console.error('Error processing signaling message:', e);
        }
      };
      
      this.wsConnection.onerror = (error) => {
        console.warn('WebSocket error:', error);
        this.isSignalingConnected = false;
      };
      
      this.wsConnection.onclose = () => {
        console.warn('WebSocket closed');
        this.isSignalingConnected = false;
        setTimeout(() => {
          if (!this.isSignalingConnected && this.isTerminalActive) {
            console.log('🔄 Reconnecting signaling...');
            this.initializeSignaling();
          }
        }, 3000);
      };
    } catch (e) {
      console.error('Signaling error:', e);
    }
  }

  private initializePeerConnection(): void {
    try {
      if (this.peerConnection) {
        try {
          this.peerConnection.close();
        } catch(e) {}
      }
      
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
        console.log('📹 Local tracks added to peer connection');
      }

      this.peerConnection.ontrack = (event) => {
        console.log('📹 Remote track received:', event.track.kind);
        
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          console.log('📹 Remote stream received, role:', this.currentRole);
          
          if (this.pipVideoRef && this.pipVideoRef.nativeElement) {
            this.pipVideoRef.nativeElement.srcObject = remoteStream;
            console.log(`📹 Remote video set to PIP (small) view for ${this.currentRole}`);
          }
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
          this.wsConnection.send(JSON.stringify({ ice: event.candidate }));
          console.log('📤 ICE candidate sent');
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('🔗 ICE state:', this.peerConnection.iceConnectionState);
        if (this.peerConnection.iceConnectionState === 'connected') {
          this.message = '✅ ICE connected!';
        } else if (this.peerConnection.iceConnectionState === 'failed') {
          this.message = '❌ ICE connection failed';
          this.peerConnection.restartIce();
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        console.log('🔗 Connection state:', this.peerConnection.connectionState);
        if (this.peerConnection.connectionState === 'connected') {
          this.message = '✅ Call connected!';
          this.isCallConnected = true;
        } else if (this.peerConnection.connectionState === 'disconnected') {
          this.message = '❌ Call disconnected';
          this.isCallConnected = false;
        } else if (this.peerConnection.connectionState === 'failed') {
          this.message = '❌ Call failed';
          this.isCallConnected = false;
          this.addChatMessage('System', 'Call failed. Retrying...', false);
          setTimeout(() => {
            if (!this.isCallConnected && this.isTerminalActive) {
              this.establishCall();
            }
          }, 3000);
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
      console.warn('WebRTC peer initialization error:', e);
    }
  }

  establishCall(): void {
    if (this.isConnectingCall) {
      console.log('⏳ Call already connecting...');
      return;
    }
    
    if (!this.peerConnection) {
      this.message = '❌ Peer connection not initialized';
      return;
    }
    
    if (!this.isSignalingConnected) {
      this.message = '⚠️ Signaling server not connected. Retrying...';
      this.initializeSignaling();
      setTimeout(() => {
        if (this.isSignalingConnected) {
          this.establishCall();
        }
      }, 2000);
      return;
    }
    
    this.isConnectingCall = true;
    this.message = '📡 Exchanging connection signals...';
    
    this.addChatMessage('System', 'Connecting to call...', false);
    
    this.peerConnection.createOffer()
      .then(offer => {
        return this.peerConnection.setLocalDescription(offer);
      })
      .then(() => {
        if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
          this.wsConnection.send(JSON.stringify({ sdp: this.peerConnection.localDescription }));
          console.log('📡 Offer sent');
          this.isConnectingCall = false;
        } else {
          this.message = '⚠️ Signaling server not connected';
          this.isConnectingCall = false;
          this.isSignalingConnected = false;
          this.initializeSignaling();
        }
      })
      .catch(error => {
        console.error('❌ Error creating offer:', error);
        this.message = '❌ Failed to connect call';
        this.isConnectingCall = false;
      });
  }

  // ============================================================
  // RESET
  // ============================================================

  resetState(): void {
    this.isRecordingSign = false;
    this.isDetecting = false;
    this.currentSign = '';
    this.chatLines = [];
    this.isProcessing = false;
    this.isLoading = false;
    this.isCallConnected = false;
    this.isConnectingCall = false;
    this.isSignalingConnected = false;
    this.stopVoiceListening();
    this.isVoiceRecognitionRunning = false;
    this.interimTranscript = '';
    this.detectionCounter.forEach((_, key) => this.detectionCounter.set(key, 0));
    
    if (this.frameLoopId) {
      cancelAnimationFrame(this.frameLoopId);
      this.frameLoopId = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    if (this.mainVideoRef?.nativeElement) {
      this.mainVideoRef.nativeElement.srcObject = null;
    }
    if (this.pipVideoRef?.nativeElement) {
      this.pipVideoRef.nativeElement.srcObject = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    if (this.wsConnection) {
      this.wsConnection.close();
    }
  }

  // ============================================================
  // HISTORY - UPDATED: Shows newest first and updates immediately
  // ============================================================

  loadHistory(): void {
    this.signService.getHistory().subscribe({
      next: (data) => { 
        // ✅ Reverse the order so newest shows first
        this.history = data.reverse(); 
        console.log('📜 History loaded:', data.length, 'entries');
      },
      error: (error) => { 
        console.error('Error loading history:', error); 
      }
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
          console.error(error);
        }
      });
    }
  }

  // ============================================================
  // TYPEWRITER
  // ============================================================

  private startSeamlessTypewriter(): void {
    let currentPhraseIndex = 0;
    let currentCharIndex = 0;
    let isDeleting = false;
    let stayCounter = 0;

    this.typewriterSub = timer(0, 180).subscribe(() => {
      const currentPhrase = this.phrases[currentPhraseIndex];

      if (!isDeleting && currentCharIndex === currentPhrase.length) {
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

      if (isDeleting && currentCharIndex === 0) {
        isDeleting = false;
        currentPhraseIndex = (currentPhraseIndex + 1) % this.phrases.length;
        stayCounter = 0;
      }
    });
  }
}