package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("interaction")
public class Interaction implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("device_id")
    private String deviceId;

    @TableField("user_id")
    private Long userId;

    @TableField("drama_id")
    private Long dramaId;

    @TableField("episode_id")
    private Long episodeId;

    @TableField("highlight_id")
    private Long highlightId;

    @TableField("interaction_type")
    private String interactionType;

    @TableField("option_code")
    private String optionCode;

    private String content;

    @TableField("create_time")
    private LocalDateTime createTime;
}
