package com.example.drama.model.vo;

import lombok.Data;

/** 4.10 点赞/取消点赞响应 */
@Data
public class LikeVO {
    private Long generationId;
    private Integer likeCount;
    private Boolean liked;
}
