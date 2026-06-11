package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("ai_generation_comment")
public class AiGenerationComment implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("generation_id")
    private Long generationId;

    @TableField("device_id")
    private String deviceId;

    private String nickname;

    private String content;

    @TableField("create_time")
    private LocalDateTime createTime;
}
