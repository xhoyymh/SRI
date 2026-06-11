package com.example.drama.model.vo;

import lombok.Data;

/** 4.8 生成响应 */
@Data
public class AiStoryVO {
    private Long generationId;
    private String contentType;
    private String title;
    private String content;
    private String contentUrl;
    private String status;
    private Integer likeCount;
    private Integer commentCount;
}
