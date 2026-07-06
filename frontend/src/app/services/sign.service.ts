import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SignService {
  private apiUrl = 'http://localhost:8080/api/signs';

  constructor(private http: HttpClient) {}

  detectSign(signName: string, signEmoji: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/detect`, { signName, signEmoji });
  }

  getHistory(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/history`);
  }

  deleteAllHistory(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete-all`);
  }
}