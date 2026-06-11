package com.example.drama.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class DramaCommentRequest {
    @NotBlank
    private String deviceId;

    private String clientCommentId;

    @NotBlank
    @Size(max = 500, message = "评论内容不能超过500字")
    private String content;
}
