package com.example.drama.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AiStoryGenerateRequest {
    @NotBlank
    private String deviceId;
    private Long dramaId;
    @NotNull
    private Long episodeId;
    @NotNull
    private Long highlightId;
    @NotBlank
    private String optionCode;
    private String prompt;
}
