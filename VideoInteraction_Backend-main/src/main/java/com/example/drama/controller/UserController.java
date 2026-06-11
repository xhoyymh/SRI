package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.dto.SocialMigrationRequest;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.vo.DramaSocialListVO;
import com.example.drama.model.vo.SocialMigrationVO;
import com.example.drama.service.AuthService;
import com.example.drama.service.SocialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users/me")
@Tag(name = "用户个人数据")
public class UserController {
    private final AuthService authService;
    private final SocialService socialService;

    public UserController(AuthService authService, SocialService socialService) {
        this.authService = authService;
        this.socialService = socialService;
    }

    @GetMapping("/social")
    @Operation(summary = "当前用户点赞收藏短剧")
    public ApiResponse<DramaSocialListVO> social(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(socialService.mySocial(user));
    }

    @PostMapping("/migration")
    @Operation(summary = "迁移本机旧社交数据")
    public ApiResponse<SocialMigrationVO> migrate(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                  @RequestBody SocialMigrationRequest request) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(socialService.migrate(user, request == null ? new SocialMigrationRequest() : request));
    }
}
