package com.example.drama.model.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class AdminHighlightsBatchRequest {
    @NotNull
    private Long episodeId;
    @NotNull
    private List<Item> highlights;

    @Data
    public static class Item {
        private Integer startTime;
        private Integer endTime;
        private String highlightType;
        private String title;
        private Integer triggerOnce;
        /** 原样接收 JSON 对象，落库为字符串 */
        private JsonNode interactionConfig;
    }
}
