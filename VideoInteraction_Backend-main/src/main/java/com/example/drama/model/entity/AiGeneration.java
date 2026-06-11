package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("ai_generation")
public class AiGeneration implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("device_id")
    private String deviceId;

    @TableField("drama_id")
    private Long dramaId;

    @TableField("episode_id")
    private Long episodeId;

    @TableField("highlight_id")
    private Long highlightId;

    @TableField("option_code")
    private String optionCode;

    private String prompt;

    @TableField("content_type")
    private String contentType;

    private String title;

    private String content;

    @TableField("content_url")
    private String contentUrl;

    private String status;

    @TableField("like_count")
    private Integer likeCount;

    @TableField("comment_count")
    private Integer commentCount;

    @TableField("create_time")
    private LocalDateTime createTime;
}
