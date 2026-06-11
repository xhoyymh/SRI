package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("episode_danmaku")
public class EpisodeDanmaku implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("drama_id")
    private Long dramaId;

    @TableField("episode_id")
    private Long episodeId;

    @TableField("user_id")
    private Long userId;

    @TableField("device_id")
    private String deviceId;

    private String nickname;

    private String content;

    @TableField("`current_time`")
    private BigDecimal currentTime;

    @TableField("client_danmaku_id")
    private String clientDanmakuId;

    @TableField("create_time")
    private LocalDateTime createTime;
}
