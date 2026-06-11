package com.example.drama.model.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CommentItemVO {
    private Long commentId;
    private String nickname;
    private String content;
    private LocalDateTime createTime;
}
