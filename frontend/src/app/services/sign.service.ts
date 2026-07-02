import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SignService {
  private apiUrl = 'http://localhost:8080/api/signs';
  private pythonApiUrl = 'http://localhost:8000';

  constructor(private http: HttpClient) {}

  // ============================================
  // SPRING BOOT API CALLS
  // ============================================

  detectSign(signName: string, signEmoji: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/detect`, { signName, signEmoji });
  }

  getHistory(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/history`);
  }

  deleteAllHistory(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete-all`);
  }

  // ============================================
  // PYTHON AI SERVICE API CALLS
  // ============================================

  // Send hand landmarks to Python service for ASL recognition
  predictWithPython(landmarks: any[]): Observable<any> {
    return this.http.post(`${this.pythonApiUrl}/predict`, { landmarks });
  }

  // Check if Python service is running
  checkPythonService(): Observable<any> {
    return this.http.get(`${this.pythonApiUrl}/`);
  }
}