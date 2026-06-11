package com.example.drama.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AuthRequest {
    @NotBlank
    private String deviceId;

    @NotBlank
    @Size(max = 64, message = "用户名不能超过64字")
    private String username;

    @NotBlank
    @Size(max = 128, message = "密码不能超过128字")
    private String password;
}
