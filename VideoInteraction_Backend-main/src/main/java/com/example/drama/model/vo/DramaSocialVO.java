package com.example.drama.model.vo;

import lombok.Data;

@Data
public class DramaSocialVO {
    private Long dramaId;
    private Boolean liked;
    private Boolean favorited;
    private Long likeCount;
    private Long favoriteCount;
    private Long commentCount;
}
