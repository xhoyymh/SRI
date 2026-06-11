package com.example.drama.model.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("highlight_stat")
public class HighlightStat implements Serializable {
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("highlight_id")
    private Long highlightId;

    @TableField("option_code")
    private String optionCode;

    private String label;

    private Integer count;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
