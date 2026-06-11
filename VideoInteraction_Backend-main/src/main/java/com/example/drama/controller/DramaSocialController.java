package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.dto.DramaCommentRequest;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.vo.DramaCommentItemVO;
import com.example.drama.model.vo.DramaCommentListVO;
import com.example.drama.model.vo.DramaSocialVO;
import com.example.drama.service.AuthService;
import com.example.drama.service.SocialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/dramas")
@Tag(name = "短剧社交")
public class DramaSocialController {
    private final AuthService authService;
    private final SocialService socialService;

    public DramaSocialController(AuthService authService, SocialService socialService) {
        this.authService = authService;
        this.socialService = socialService;
    }

    @GetMapping("/{dramaId}/social")
    @Operation(summary = "短剧点赞收藏评论统计")
    public ApiResponse<DramaSocialVO> social(@PathVariable("dramaId") Long dramaId,
                                             @RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.resolveUser(authorization);
        return ApiResponse.success(socialService.getSocial(dramaId, user));
    }

    @PostMapping("/{dramaId}/like")
    @Operation(summary = "点赞短剧")
    public ApiResponse<DramaSocialVO> like(@PathVariable("dramaId") Long dramaId,
                                           @RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(socialService.like(dramaId, user));
    }

    @DeleteMapping("/{dramaId}/like")
    @Operation(summary = "取消点赞短剧")
    public ApiResponse<DramaSocialVO> unlike(@PathVariable("dramaId") Long dramaId,
                                             @RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(socialService.unlike(dramaId, user));
    }

    @PostMapping("/{dramaId}/favorite")
    @Operation(summary = "收藏短剧")
    public ApiResponse<DramaSocialVO> favorite(@PathVariable("dramaId") Long dramaId,
                                               @RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(socialService.favorite(dramaId, user));
    }

    @DeleteMapping("/{dramaId}/favorite")
    @Operation(summary = "取消收藏短剧")
    public ApiResponse<DramaSocialVO> unfavorite(@PathVariable("dramaId") Long dramaId,
                                                 @RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(socialService.unfavorite(dramaId, user));
    }

    @GetMapping("/{dramaId}/comments")
    @Operation(summary = "短剧评论列表")
    public ApiResponse<DramaCommentListVO> comments(@PathVariable("dramaId") Long dramaId,
                                                    @RequestParam(defaultValue = "1") long page,
                                                    @RequestParam(defaultValue = "20") long size) {
        return ApiResponse.success(socialService.listComments(dramaId, page, size));
    }

    @PostMapping("/{dramaId}/comments")
    @Operation(summary = "发表短剧评论")
    public ApiResponse<DramaCommentItemVO> addComment(@PathVariable("dramaId") Long dramaId,
                                                      @RequestHeader(value = "Authorization", required = false) String authorization,
                                                      @Valid @RequestBody DramaCommentRequest request) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(socialService.addComment(dramaId, user, request));
    }
}
