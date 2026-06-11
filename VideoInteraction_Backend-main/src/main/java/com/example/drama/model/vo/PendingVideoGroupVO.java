package com.example.drama.model.vo;

import lombok.Data;

import java.util.List;

@Data
public class PendingVideoGroupVO {
    private Long batchId;
    private Long dramaId;
    private Integer dramaNo;
    private String dramaCode;
    private String dramaTitle;
    private String batchStatus;
    private Long taskId;
    private List<PendingVideoVO> videos;
}
