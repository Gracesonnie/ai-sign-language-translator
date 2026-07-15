import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface PredictionResult {
  success: boolean;
  sign: string | null;
  confidence: number;
  message?: string;
  all_predictions?: { [key: string]: number };
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket: Socket | null = null;
  private predictionSubject = new Subject<PredictionResult>();
  private connectedSubject = new Subject<boolean>();

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io('http://localhost:5000', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      this.connectedSubject.next(true);
    });

    this.socket.on('connected', (data) => {
      console.log('📊 Server connected:', data);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      this.connectedSubject.next(false);
    });

    this.socket.on('prediction', (data: PredictionResult) => {
      this.predictionSubject.next(data);
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      this.connectedSubject.next(false);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendFrame(imageData: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('frame', { image: imageData });
    }
  }

  getPredictions(): Observable<PredictionResult> {
    return this.predictionSubject.asObservable();
  }

  getConnectionStatus(): Observable<boolean> {
    return this.connectedSubject.asObservable();
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}