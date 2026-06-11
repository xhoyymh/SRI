package com.example.drama.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CommentRequest {
    @NotBlank
    private String deviceId;
    private String nickname;
    @NotBlank
    @Size(max = 500, message = "评论内容不能超过500字")
    private String content;
}
