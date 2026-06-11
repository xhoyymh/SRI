package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("drama")
public class Drama implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private String title;

    @TableField("drama_no")
    private Integer dramaNo;

    @TableField("drama_code")
    private String dramaCode;

    @TableField("original_folder_name")
    private String originalFolderName;

    private String description;

    @TableField("cover_url")
    private String coverUrl;

    private String tags;

    private Integer status;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
