package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.vo.DramaDetailVO;
import com.example.drama.model.vo.DramaVO;
import com.example.drama.service.DramaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/dramas")
@Tag(name = "短剧管理")
public class DramaController {

    private final DramaService dramaService;

    public DramaController(DramaService dramaService) {
        this.dramaService = dramaService;
    }

    @GetMapping
    @Operation(summary = "获取短剧列表")
    public ApiResponse<List<DramaVO>> list() {
        return ApiResponse.success(dramaService.listAll());
    }

    @GetMapping("/{dramaId}")
    @Operation(summary = "获取短剧详情")
    public ApiResponse<DramaDetailVO> getDetail(@PathVariable("dramaId") Long dramaId) {
        return ApiResponse.success(dramaService.getDetail(dramaId));
    }

    @PostMapping("/cleanup-missing-source-videos")
    @Operation(summary = "清理 COS 已不存在的源视频映射")
    public ApiResponse<Map<String, Object>> cleanupMissingSourceVideos() {
        return ApiResponse.success(dramaService.cleanupMissingSourceVideos());
    }
}
