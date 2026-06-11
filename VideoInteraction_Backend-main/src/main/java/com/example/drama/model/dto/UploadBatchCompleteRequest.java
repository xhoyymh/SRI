package com.example.drama.model.dto;

import lombok.Data;

import java.util.List;

@Data
public class UploadBatchCompleteRequest {
    private List<Long> assetIds;
    private String coverKey;
    private String coverUrl;
}
