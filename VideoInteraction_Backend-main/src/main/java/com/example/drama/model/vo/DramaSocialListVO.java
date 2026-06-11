package com.example.drama.model.vo;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class DramaSocialListVO {
    private List<DramaVO> liked = new ArrayList<>();
    private List<DramaVO> favorites = new ArrayList<>();
}
