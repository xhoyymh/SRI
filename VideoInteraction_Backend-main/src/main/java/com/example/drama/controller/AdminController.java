package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.common.BusinessException;
import com.example.drama.model.dto.AdminAiStoriesBatchRequest;
import com.example.drama.model.dto.AdminHighlightsBatchRequest;
import com.example.drama.model.vo.AdminAiStoriesInsertedVO;
import com.example.drama.model.vo.AdminInsertedVO;
import com.example.drama.service.AdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

/**
 * 算法侧导入接口（4.12）。需 header X-Admin-Token，值取 application.yml 的 admin.token。
 */
@RestController
@RequestMapping("/admin")
@Tag(name = "算法侧导入")
public class AdminController {

    private final AdminService adminService;

    @Value("${admin.token}")
    private String adminToken;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @PostMapping("/highlights:batch")
    @Operation(summary = "批量导入高光点")
    public ApiResponse<AdminInsertedVO> batchHighlights(
            @RequestHeader(value = "X-Admin-Token", required = false) String token,
            @Valid @RequestBody AdminHighlightsBatchRequest request) {
        checkToken(token);
        return ApiResponse.success(adminService.batchHighlights(request));
    }

    @PostMapping("/ai-stories:batch")
    @Operation(summary = "批量导入AI生成内容")
    public ApiResponse<AdminAiStoriesInsertedVO> batchAiStories(
            @RequestHeader(value = "X-Admin-Token", required = false) String token,
            @Valid @RequestBody AdminAiStoriesBatchRequest request) {
        checkToken(token);
        return ApiResponse.success(adminService.batchAiStories(request));
    }

    private void checkToken(String token) {
        if (adminToken == null || !adminToken.equals(token)) {
            throw new BusinessException(403, "X-Admin-Token 无效");
        }
    }
}
