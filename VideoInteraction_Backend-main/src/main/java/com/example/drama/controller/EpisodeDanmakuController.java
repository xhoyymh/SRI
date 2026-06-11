package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.dto.EpisodeDanmakuRequest;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.vo.EpisodeDanmakuVO;
import com.example.drama.service.AuthService;
import com.example.drama.service.DanmakuService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/episodes")
@Tag(name = "普通弹幕")
public class EpisodeDanmakuController {
    private final AuthService authService;
    private final DanmakuService danmakuService;

    public EpisodeDanmakuController(AuthService authService, DanmakuService danmakuService) {
        this.authService = authService;
        this.danmakuService = danmakuService;
    }

    @GetMapping("/{episodeId}/danmaku")
    @Operation(summary = "剧集普通弹幕列表")
    public ApiResponse<List<EpisodeDanmakuVO>> list(@PathVariable("episodeId") Long episodeId,
                                                    @RequestParam(defaultValue = "200") long size) {
        return ApiResponse.success(danmakuService.list(episodeId, size));
    }

    @PostMapping("/{episodeId}/danmaku")
    @Operation(summary = "发送普通弹幕")
    public ApiResponse<EpisodeDanmakuVO> add(@PathVariable("episodeId") Long episodeId,
                                             @RequestHeader(value = "Authorization", required = false) String authorization,
                                             @Valid @RequestBody EpisodeDanmakuRequest request) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(danmakuService.add(episodeId, user, request));
    }
}
