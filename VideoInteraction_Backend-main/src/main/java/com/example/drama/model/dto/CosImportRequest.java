package com.example.drama.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class CosImportRequest {
    @NotBlank
    private String dramaTitle;

    @NotEmpty
    @Valid
    private List<VideoItem> videos;

    @Data
    public static class VideoItem {
        private Integer dramaNo;
        private String dramaCode;
        private String dramaTitle;
        private String originalFolderName;
        private Integer episodeNo;
        private String originalFileName;
        private String normalizedFileName;
        private String backendKey;

        @NotBlank
        private String cosKey;

        private String cosUrl;
        private Long fileSize;
        private String contentType;
        private Integer duration;
    }
}
