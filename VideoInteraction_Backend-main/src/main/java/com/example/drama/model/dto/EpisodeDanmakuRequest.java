package com.example.drama.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class EpisodeDanmakuRequest {
    @NotBlank
    private String deviceId;

    private Long dramaId;

    private Double currentTime;

    private String clientDanmakuId;

    @NotBlank
    @Size(max = 120, message = "弹幕不能超过120字")
    private String content;
}
