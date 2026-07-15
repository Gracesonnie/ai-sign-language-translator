import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

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
export class SignRecognitionService {
  private apiUrl = 'http://localhost:5000/api';

  constructor(private http: HttpClient) {}

  predictSign(imageData: string): Observable<PredictionResult> {
    return this.http.post<PredictionResult>(`${this.apiUrl}/predict`, { image: imageData })
      .pipe(
        catchError((error) => {
          console.error('Prediction error:', error);
          throw error;
        })
      );
  }

  healthCheck(): Observable<{ status: string; classes: string[] }> {
    return this.http.get<{ status: string; classes: string[] }>(`${this.apiUrl}/health`);
  }

  getClasses(): Observable<string[]> {
    return this.healthCheck().pipe(
      map((response) => response.classes || [])
    );
  }
}