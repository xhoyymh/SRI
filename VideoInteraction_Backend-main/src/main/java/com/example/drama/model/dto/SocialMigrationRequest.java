package com.example.drama.model.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SocialMigrationRequest {
    private List<Long> likedDramaIds = new ArrayList<>();
    private List<Long> favoriteDramaIds = new ArrayList<>();
    private List<CommentItem> comments = new ArrayList<>();

    @Data
    public static class CommentItem {
        private Long dramaId;
        private String clientCommentId;
        private String content;
        private Long createdAt;
    }
}
