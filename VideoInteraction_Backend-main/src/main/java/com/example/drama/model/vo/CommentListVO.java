package com.example.drama.model.vo;

import lombok.Data;

import java.util.List;

/** 4.11 GET 评论分页 */
@Data
public class CommentListVO {
    private List<CommentItemVO> list;
    private Long total;
}
