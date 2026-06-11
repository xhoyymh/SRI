package com.example.drama.model.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserVO {
    private Long userId;
    private String username;
    private LocalDateTime createdAt;
}
