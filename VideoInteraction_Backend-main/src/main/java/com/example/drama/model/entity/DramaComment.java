package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("drama_comment")
public class DramaComment implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("drama_id")
    private Long dramaId;

    @TableField("user_id")
    private Long userId;

    @TableField("device_id")
    private String deviceId;

    private String nickname;

    private String content;

    @TableField("client_comment_id")
    private String clientCommentId;

    @TableField("create_time")
    private LocalDateTime createTime;
}
