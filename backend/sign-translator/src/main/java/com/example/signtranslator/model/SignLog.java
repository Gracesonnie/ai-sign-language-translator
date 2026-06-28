package com.example.signtranslator.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "sign_logs")
public class SignLog {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String signName;
    
    @Column(nullable = false)
    private String signEmoji;
    
    @Column(nullable = false)
    private LocalDateTime timestamp;
    
    public SignLog() {
    }
    
    public SignLog(String signName, String signEmoji) {
        this.signName = signName;
        this.signEmoji = signEmoji;
        this.timestamp = LocalDateTime.now();
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public String getSignName() { return signName; }
    public void setSignName(String signName) { this.signName = signName; }
    
    public String getSignEmoji() { return signEmoji; }
    public void setSignEmoji(String signEmoji) { this.signEmoji = signEmoji; }
    
    public LocalDateTime getTimestamp() { return timestamp; }
    public void setTimestamp(LocalDateTime timestamp) { this.timestamp = timestamp; }
}