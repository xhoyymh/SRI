package com.example.drama.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class UploadBatchCreateRequest {
    @NotBlank
    private String dramaTitle;

    @NotBlank
    private String dramaDescription;

    private String judgeApiKey;

    private String judgeEndpointId;

    private String generationApiKey;

    @Valid
    @NotEmpty
    private List<FileItem> files;

    @Valid
    private CoverFile coverFile;

    @Data
    public static class FileItem {
        @NotBlank
        private String fileName;
        private Long fileSize;
        private String contentType;
        private Integer episodeNo;
    }

    @Data
    public static class CoverFile {
        @NotBlank
        private String fileName;
        private Long fileSize;
        private String contentType;
    }
}
