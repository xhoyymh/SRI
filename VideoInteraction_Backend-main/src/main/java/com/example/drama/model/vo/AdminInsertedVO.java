package com.example.drama.model.vo;

import lombok.Data;

import java.util.List;

/** 4.12 highlights:batch 响应 */
@Data
public class AdminInsertedVO {
    private Integer inserted;
    private List<Long> ids;
}
