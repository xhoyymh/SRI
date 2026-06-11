package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("upload_batch")
public class UploadBatch implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("drama_id")
    private Long dramaId;

    @TableField("user_id")
    private Long userId;

    @TableField("drama_title")
    private String dramaTitle;

    private String status;

    @TableField("rag_status")
    private String ragStatus;

    @TableField("rag_task_id")
    private Long ragTaskId;

    @TableField("rag_message")
    private String ragMessage;

    @TableField("rag_update_time")
    private LocalDateTime ragUpdateTime;

    @TableField("file_count")
    private Integer fileCount;

    @TableField("task_id")
    private Long taskId;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
