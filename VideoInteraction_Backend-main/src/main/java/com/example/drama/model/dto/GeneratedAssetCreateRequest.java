package com.example.drama.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class GeneratedAssetCreateRequest {
    @NotBlank
    private String callbackToken;
    private Long episodeId;
    private Long generationId;
    private String assetType;
    private String fileName;
    private String contentType;
    private Long fileSize;
}
