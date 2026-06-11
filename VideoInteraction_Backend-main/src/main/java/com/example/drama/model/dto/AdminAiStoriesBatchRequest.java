package com.example.drama.model.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class AdminAiStoriesBatchRequest {
    @NotNull
    private List<Item> items;

    @Data
    public static class Item {
        private Long episodeId;
        private Long highlightId;
        private String optionCode;
        private String contentType;
        private String title;
        private String content;
        private String contentUrl;
    }
}
