package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("analysis_task")
public class AnalysisTask implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("batch_id")
    private Long batchId;

    private String status;

    private String stage;

    private Integer progress;

    private String message;

    @TableField("error_message")
    private String errorMessage;

    @TableField("callback_token")
    private String callbackToken;

    @TableField("judge_api_key_enc")
    private String judgeApiKeyEnc;

    @TableField("judge_endpoint_id")
    private String judgeEndpointId;

    @TableField("generation_api_key_enc")
    private String generationApiKeyEnc;

    @TableField("has_generation_key")
    private Integer hasGenerationKey;

    @TableField("result_json")
    private String resultJson;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
