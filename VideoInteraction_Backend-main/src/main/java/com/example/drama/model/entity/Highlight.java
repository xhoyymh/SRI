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
@TableName("highlight")
public class Highlight implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("drama_id")
    private Long dramaId;

    @TableField("episode_id")
    private Long episodeId;

    @TableField("start_time")
    private Integer startTime;

    @TableField("end_time")
    private Integer endTime;

    @TableField("highlight_type")
    private String highlightType;

    private String title;

    private String description;

    @TableField("trigger_once")
    private Integer triggerOnce;

    @TableField("interaction_config")
    private String interactionConfig;

    private String source;

    private BigDecimal confidence;

    @TableField("create_time")
    private LocalDateTime createTime;
}
