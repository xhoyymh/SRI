package com.example.drama.model.vo;

import lombok.Data;

import java.util.List;

/** 4.12 ai-stories:batch 响应 */
@Data
public class AdminAiStoriesInsertedVO {
    private Integer inserted;
    private List<Long> ids;
}
