package com.example.drama.model.vo;

import lombok.Data;

import java.time.LocalDateTime;

/** 4.11 POST 发表评论响应 */
@Data
public class CommentCreateVO {
    private Long commentId;
    private LocalDateTime createTime;
}
