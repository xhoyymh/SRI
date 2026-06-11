package com.example.drama.model.vo;

import lombok.Data;

/** 4.9 详情（含当前设备是否已点赞） */
@Data
public class AiStoryDetailVO {
    private Long generationId;
    private String contentType;
    private String title;
    private String content;
    private String contentUrl;
    private Integer likeCount;
    private Integer commentCount;
    private Boolean liked;
}
