package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("user_session")
public class UserSession implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("user_id")
    private Long userId;

    @TableField("token_hash")
    private String tokenHash;

    @TableField("device_id")
    private String deviceId;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("expire_time")
    private LocalDateTime expireTime;
}
