package com.example.drama.model.vo;

import lombok.Data;

import java.util.List;

@Data
public class UploadCompleteVO {
    private Long batchId;
    private Long dramaId;
    private Long taskId;
    private String status;
    private List<Long> episodeIds;
}
