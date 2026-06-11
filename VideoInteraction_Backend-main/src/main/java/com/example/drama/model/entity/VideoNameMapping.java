package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("video_name_mapping")
public class VideoNameMapping implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("drama_id")
    private Long dramaId;

    @TableField("episode_id")
    private Long episodeId;

    @TableField("video_asset_id")
    private Long videoAssetId;

    @TableField("batch_id")
    private Long batchId;

    @TableField("drama_no")
    private Integer dramaNo;

    @TableField("drama_code")
    private String dramaCode;

    @TableField("drama_title")
    private String dramaTitle;

    @TableField("original_folder_name")
    private String originalFolderName;

    @TableField("original_file_name")
    private String originalFileName;

    @TableField("normalized_file_name")
    private String normalizedFileName;

    @TableField("episode_no")
    private Integer episodeNo;

    @TableField("backend_key")
    private String backendKey;

    @TableField("cos_key")
    private String cosKey;

    @TableField("cos_url")
    private String cosUrl;

    @TableField("file_size")
    private Long fileSize;

    @TableField("content_type")
    private String contentType;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
