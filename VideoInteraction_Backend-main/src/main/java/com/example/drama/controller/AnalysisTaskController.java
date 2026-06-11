package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.dto.AnalysisResultCallbackRequest;
import com.example.drama.model.dto.AnalysisStartRequest;
import com.example.drama.model.dto.AnalysisStatusCallbackRequest;
import com.example.drama.model.dto.GeneratedAssetCreateRequest;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.vo.AnalysisTaskVO;
import com.example.drama.model.vo.PendingVideoGroupVO;
import com.example.drama.model.vo.UploadAssetUploadVO;
import com.example.drama.service.AnalysisTaskService;
import com.example.drama.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/analysis-tasks")
@Tag(name = "RAG 分析任务")
public class AnalysisTaskController {
    private final AnalysisTaskService analysisTaskService;
    private final AuthService authService;

    public AnalysisTaskController(AnalysisTaskService analysisTaskService, AuthService authService) {
        this.analysisTaskService = analysisTaskService;
        this.authService = authService;
    }

    @GetMapping("/pending-videos")
    @Operation(summary = "查询已上传视频的 RAG 处理状态")
    public ApiResponse<List<PendingVideoGroupVO>> pendingVideos(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(analysisTaskService.pendingVideos(user));
    }

    @GetMapping("/active")
    @Operation(summary = "查询当前正在处理的 RAG 任务")
    public ApiResponse<AnalysisTaskVO> activeTask(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(analysisTaskService.getActiveTask(user));
    }

    @PostMapping("/start")
    @Operation(summary = "手动启动 RAG 分析任务")
    public ApiResponse<AnalysisTaskVO> start(@RequestHeader(value = "Authorization", required = false) String authorization,
                                             @Valid @RequestBody AnalysisStartRequest request) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(analysisTaskService.start(request, user));
    }

    @GetMapping("/{taskId}")
    @Operation(summary = "查询分析任务状态")
    public ApiResponse<AnalysisTaskVO> getTask(@PathVariable("taskId") Long taskId,
                                               @RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(analysisTaskService.getTask(taskId, user));
    }

    @PostMapping("/{taskId}/retry")
    @Operation(summary = "重试分析任务")
    public ApiResponse<AnalysisTaskVO> retry(@PathVariable("taskId") Long taskId,
                                             @RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(analysisTaskService.retry(taskId, user));
    }

    @PostMapping("/{taskId}/status")
    @Operation(summary = "RAG 服务回调更新任务状态")
    public ApiResponse<AnalysisTaskVO> updateStatus(@PathVariable("taskId") Long taskId,
                                                    @RequestBody AnalysisStatusCallbackRequest request) {
        return ApiResponse.success(analysisTaskService.updateStatus(taskId, request));
    }

    @PostMapping("/{taskId}/result")
    @Operation(summary = "RAG 服务回调提交分析结果并导入数据库")
    public ApiResponse<AnalysisTaskVO> acceptResult(@PathVariable("taskId") Long taskId,
                                                    @Valid @RequestBody AnalysisResultCallbackRequest request) {
        return ApiResponse.success(analysisTaskService.acceptResult(taskId, request));
    }

    @PostMapping("/{taskId}/assets")
    @Operation(summary = "RAG 服务申请生成素材的 COS 上传参数")
    public ApiResponse<UploadAssetUploadVO> createGeneratedAsset(@PathVariable("taskId") Long taskId,
                                                                 @Valid @RequestBody GeneratedAssetCreateRequest request) {
        return ApiResponse.success(analysisTaskService.createGeneratedAsset(taskId, request));
    }
}
