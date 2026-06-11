package com.example.drama.model.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class EpisodeDanmakuVO {
    private Long danmakuId;
    private Long dramaId;
    private Long episodeId;
    private String nickname;
    private String content;
    private Double currentTime;
    private LocalDateTime createTime;
}
