package com.example.drama.model.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AnalysisTaskVO {
    private Long taskId;
    private Long batchId;
    private String status;
    private String stage;
    private Integer progress;
    private String message;
    private String errorMessage;
    private Boolean hasGenerationKey;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
