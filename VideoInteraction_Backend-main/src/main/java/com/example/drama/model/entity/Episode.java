package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("episode")
public class Episode implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("drama_id")
    private Long dramaId;

    @TableField("episode_no")
    private Integer episodeNo;

    @TableField("original_file_name")
    private String originalFileName;

    @TableField("normalized_file_name")
    private String normalizedFileName;

    @TableField("backend_key")
    private String backendKey;

    @TableField("cos_key")
    private String cosKey;

    private String title;

    @TableField("video_url")
    private String videoUrl;

    private Integer duration;

    @TableField("subtitle_text")
    private String subtitleText;

    @TableField("create_time")
    private LocalDateTime createTime;
}
