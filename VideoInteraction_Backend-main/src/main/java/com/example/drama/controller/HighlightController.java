package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.vo.HighlightVO;
import com.example.drama.service.HighlightService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/episodes")
@Tag(name = "高光点管理")
public class HighlightController {

    private final HighlightService highlightService;

    public HighlightController(HighlightService highlightService) {
        this.highlightService = highlightService;
    }

    @GetMapping("/{episodeId}/highlights")
    @Operation(summary = "获取剧集高光点列表")
    public ApiResponse<List<HighlightVO>> getByEpisodeId(@PathVariable("episodeId") Long episodeId) {
        return ApiResponse.success(highlightService.getByEpisodeId(episodeId));
    }
}
