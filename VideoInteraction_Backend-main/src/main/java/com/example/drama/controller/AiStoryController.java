package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.dto.AiStoryGenerateRequest;
import com.example.drama.model.dto.CommentRequest;
import com.example.drama.model.dto.LikeRequest;
import com.example.drama.model.vo.AiStoryDetailVO;
import com.example.drama.model.vo.AiStoryVO;
import com.example.drama.model.vo.CommentCreateVO;
import com.example.drama.model.vo.CommentListVO;
import com.example.drama.model.vo.LikeVO;
import com.example.drama.service.AiStoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/ai/story")
@Tag(name = "AI剧情生成与社交")
public class AiStoryController {

    private final AiStoryService aiStoryService;

    public AiStoryController(AiStoryService aiStoryService) {
        this.aiStoryService = aiStoryService;
    }

    @PostMapping("/generate")
    @Operation(summary = "生成剧情（默认 Mock）")
    public ApiResponse<AiStoryVO> generate(@Valid @RequestBody AiStoryGenerateRequest request) {
        return ApiResponse.success(aiStoryService.generate(request));
    }

    @GetMapping("/{generationId}")
    @Operation(summary = "生成内容详情")
    public ApiResponse<AiStoryDetailVO> getDetail(@PathVariable("generationId") Long generationId,
                                                  @RequestParam(required = false) String deviceId) {
        return ApiResponse.success(aiStoryService.getDetail(generationId, deviceId));
    }

    @PostMapping("/{generationId}/like")
    @Operation(summary = "点赞（幂等）")
    public ApiResponse<LikeVO> like(@PathVariable("generationId") Long generationId,
                                    @Valid @RequestBody LikeRequest request) {
        return ApiResponse.success(aiStoryService.like(generationId, request.getDeviceId()));
    }

    @DeleteMapping("/{generationId}/like")
    @Operation(summary = "取消点赞")
    public ApiResponse<LikeVO> unlike(@PathVariable("generationId") Long generationId,
                                      @Valid @RequestBody LikeRequest request) {
        return ApiResponse.success(aiStoryService.unlike(generationId, request.getDeviceId()));
    }

    @GetMapping("/{generationId}/comments")
    @Operation(summary = "评论列表（分页）")
    public ApiResponse<CommentListVO> listComments(@PathVariable("generationId") Long generationId,
                                                   @RequestParam(defaultValue = "1") long page,
                                                   @RequestParam(defaultValue = "20") long size) {
        return ApiResponse.success(aiStoryService.listComments(generationId, page, size));
    }

    @PostMapping("/{generationId}/comments")
    @Operation(summary = "发表评论")
    public ApiResponse<CommentCreateVO> addComment(@PathVariable("generationId") Long generationId,
                                                   @Valid @RequestBody CommentRequest request) {
        return ApiResponse.success(aiStoryService.addComment(generationId, request));
    }
}
