package com.example.drama.model.vo;

import lombok.Data;

import java.util.List;

@Data
public class UploadBatchVO {
    private Long batchId;
    private String dramaTitle;
    private String status;
    private UploadAssetUploadVO coverUpload;
    private List<UploadAssetUploadVO> uploads;
}
