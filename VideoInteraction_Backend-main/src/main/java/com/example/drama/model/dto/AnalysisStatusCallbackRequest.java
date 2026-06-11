package com.example.drama.model.dto;

import lombok.Data;

@Data
public class AnalysisStatusCallbackRequest {
    private String callbackToken;
    private String status;
    private String stage;
    private Integer progress;
    private String message;
    private String errorMessage;
}
