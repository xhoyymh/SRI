package com.example.drama.model.vo;

import lombok.Data;

import java.util.Map;

@Data
public class UploadAssetUploadVO {
    private Long assetId;
    private String originalFileName;
    private Integer episodeNo;
    private String bucket;
    private String region;
    private String objectKey;
    private String cosUrl;
    private String uploadMethod;
    private String uploadUrl;
    private Map<String, String> headers;
    private Map<String, String> formData;
    private Long expiresAt;
    private String status;
}
