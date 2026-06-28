package com.example.signtranslator.repository;

import com.example.signtranslator.model.SignLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface SignLogRepository extends JpaRepository<SignLog, Long> {
    List<SignLog> findBySignName(String signName);
}