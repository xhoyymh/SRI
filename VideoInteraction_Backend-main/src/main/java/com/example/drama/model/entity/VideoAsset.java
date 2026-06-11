package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("video_asset")
public class VideoAsset implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("batch_id")
    private Long batchId;

    @TableField("drama_id")
    private Long dramaId;

    @TableField("episode_id")
    private Long episodeId;

    @TableField("generation_id")
    private Long generationId;

    @TableField("asset_type")
    private String assetType;

    @TableField("drama_no")
    private Integer dramaNo;

    @TableField("drama_code")
    private String dramaCode;

    @TableField("episode_no")
    private Integer episodeNo;

    @TableField("original_folder_name")
    private String originalFolderName;

    @TableField("original_file_name")
    private String originalFileName;

    @TableField("normalized_file_name")
    private String normalizedFileName;

    @TableField("backend_key")
    private String backendKey;

    @TableField("cos_bucket")
    private String cosBucket;

    @TableField("cos_region")
    private String cosRegion;

    @TableField("cos_key")
    private String cosKey;

    @TableField("cos_url")
    private String cosUrl;

    @TableField("content_type")
    private String contentType;

    @TableField("file_size")
    private Long fileSize;

    private Integer duration;

    private String status;

    @TableField("rag_status")
    private String ragStatus;

    @TableField("rag_task_id")
    private Long ragTaskId;

    @TableField("rag_message")
    private String ragMessage;

    @TableField("rag_update_time")
    private LocalDateTime ragUpdateTime;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
