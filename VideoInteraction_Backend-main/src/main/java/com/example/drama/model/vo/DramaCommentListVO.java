package com.example.drama.model.vo;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class DramaCommentListVO {
    private List<DramaCommentItemVO> list = new ArrayList<>();
    private Long total;
}
