package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.dto.InteractionRequest;
import com.example.drama.model.dto.InteractionResponse;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.vo.EpisodeInteractionStatVO;
import com.example.drama.model.vo.HighlightStatVO;
import com.example.drama.service.AuthService;
import com.example.drama.service.InteractionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping
@Tag(name = "互动模块")
public class InteractionController {

    private final InteractionService interactionService;
    private final AuthService authService;

    public InteractionController(InteractionService interactionService, AuthService authService) {
        this.interactionService = interactionService;
        this.authService = authService;
    }

    @PostMapping("/interactions")
    @Operation(summary = "上报互动")
    public ApiResponse<InteractionResponse> report(@Valid @RequestBody InteractionRequest request,
                                                   @RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.resolveUser(authorization);
        return ApiResponse.success(interactionService.report(request, user));
    }

    @GetMapping("/highlights/{highlightId}/stats")
    @Operation(summary = "单点统计")
    public ApiResponse<HighlightStatVO> getHighlightStat(@PathVariable("highlightId") Long highlightId) {
        return ApiResponse.success(interactionService.getHighlightStat(highlightId));
    }

    @GetMapping("/episodes/{episodeId}/interaction-stats")
    @Operation(summary = "整集聚合统计")
    public ApiResponse<List<EpisodeInteractionStatVO>> getEpisodeInteractionStats(@PathVariable("episodeId") Long episodeId) {
        return ApiResponse.success(interactionService.getEpisodeInteractionStats(episodeId));
    }
}
