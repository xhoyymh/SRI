package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.dto.AuthRequest;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.vo.AuthVO;
import com.example.drama.model.vo.UserVO;
import com.example.drama.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
@Tag(name = "账号登录")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @Operation(summary = "注册并登录")
    public ApiResponse<AuthVO> register(@Valid @RequestBody AuthRequest request) {
        return ApiResponse.success(authService.register(request));
    }

    @PostMapping("/login")
    @Operation(summary = "登录")
    public ApiResponse<AuthVO> login(@Valid @RequestBody AuthRequest request) {
        return ApiResponse.success(authService.login(request));
    }

    @PostMapping("/logout")
    @Operation(summary = "退出登录")
    public ApiResponse<Void> logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        authService.logout(authorization);
        return ApiResponse.success();
    }

    @GetMapping("/me")
    @Operation(summary = "当前登录用户")
    public ApiResponse<UserVO> me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(authService.toVO(user));
    }
}
