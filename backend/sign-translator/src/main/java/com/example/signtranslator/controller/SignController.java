package com.example.signtranslator.controller;

import com.example.signtranslator.model.SignLog;
import com.example.signtranslator.repository.SignLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/signs")
@CrossOrigin(origins = "http://localhost:4200")
public class SignController {
    
    @Autowired
    private SignLogRepository signLogRepository;
    
    // SAVE a new sign (POST)
    @PostMapping("/detect")
    public Map<String, Object> detectSign(@RequestBody Map<String, String> request) {
        String signName = request.get("signName");
        String signEmoji = request.get("signEmoji");
        
        SignLog signLog = new SignLog(signName, signEmoji);
        SignLog savedLog = signLogRepository.save(signLog);
        
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Sign detected and saved!");
        response.put("sign", signName);
        response.put("emoji", signEmoji);
        response.put("timestamp", savedLog.getTimestamp());
        
        return response;
    }
    
    // GET all signs (GET)
    @GetMapping("/history")
    public List<SignLog> getHistory() {
        return signLogRepository.findAll();
    }
    
    // DELETE all signs (DELETE)
    @DeleteMapping("/delete-all")
    public Map<String, String> deleteAllHistory() {
        signLogRepository.deleteAll();
        Map<String, String> response = new HashMap<>();
        response.put("message", "All history deleted successfully!");
        return response;
    }
    
    // GET count (GET)
    @GetMapping("/count")
    public Map<String, Long> getCount() {
        Map<String, Long> response = new HashMap<>();
        response.put("totalSigns", signLogRepository.count());
        return response;
    }
}