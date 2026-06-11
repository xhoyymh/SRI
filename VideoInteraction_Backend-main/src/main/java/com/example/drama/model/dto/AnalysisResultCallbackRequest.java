package com.example.drama.model.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class AnalysisResultCallbackRequest {
    @NotBlank
    private String callbackToken;
    private String status;
    private String message;
    private List<AiStoryItem> aiStories;
    private List<HighlightItem> highlights;
    private JsonNode resultJson;

    @Data
    public static class AiStoryItem {
        private String clientRef;
        private Long episodeId;
        private Long highlightId;
        private String optionCode;
        private String contentType;
        private String title;
        private String prompt;
        private String content;
        private String contentUrl;
        private Long assetId;
    }

    @Data
    public static class HighlightItem {
        private Long episodeId;
        private Integer startTime;
        private Integer endTime;
        private String highlightType;
        private String title;
        private String description;
        private BigDecimal confidence;
        private Integer triggerOnce;
        private JsonNode interactionConfig;
    }
}
