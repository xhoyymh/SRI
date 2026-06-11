package com.example.drama.model.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DramaCommentItemVO {
    private Long commentId;
    private String nickname;
    private String content;
    private LocalDateTime createTime;
}
