package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.vo.EpisodeDetailVO;
import com.example.drama.service.EpisodeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/episodes")
@Tag(name = "剧集管理")
public class EpisodeController {

    private final EpisodeService episodeService;

    public EpisodeController(EpisodeService episodeService) {
        this.episodeService = episodeService;
    }

    @GetMapping("/{episodeId}")
    @Operation(summary = "获取剧集详情")
    public ApiResponse<EpisodeDetailVO> getDetail(@PathVariable("episodeId") Long episodeId) {
        return ApiResponse.success(episodeService.getDetail(episodeId));
    }
}
