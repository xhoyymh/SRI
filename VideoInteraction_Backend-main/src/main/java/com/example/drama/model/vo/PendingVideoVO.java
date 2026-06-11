package com.example.drama.model.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class PendingVideoVO {
    private Long assetId;
    private Long batchId;
    private Long dramaId;
    private Long episodeId;
    private Integer dramaNo;
    private String dramaCode;
    private Integer episodeNo;
    private String originalFileName;
    private String normalizedFileName;
    private String backendKey;
    private String cosKey;
    private String cosUrl;
    private String status;
    private String ragStatus;
    private Long ragTaskId;
    private String ragMessage;
    private LocalDateTime ragUpdateTime;
}
