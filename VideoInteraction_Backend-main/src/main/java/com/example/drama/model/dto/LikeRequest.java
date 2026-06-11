package com.example.drama.model.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LikeRequest {
    @NotBlank
    private String deviceId;
}
