package com.example.drama.controller;

import com.example.drama.common.ApiResponse;
import com.example.drama.model.dto.CosImportRequest;
import com.example.drama.model.dto.UploadBatchCompleteRequest;
import com.example.drama.model.dto.UploadBatchCreateRequest;
import com.example.drama.model.vo.CosImportVO;
import com.example.drama.model.vo.UploadAssetUploadVO;
import com.example.drama.model.vo.UploadBatchVO;
import com.example.drama.model.vo.UploadCompleteVO;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.service.AuthService;
import com.example.drama.service.UploadService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/uploads")
@Tag(name = "视频上传")
public class UploadController {
    private final UploadService uploadService;
    private final AuthService authService;

    public UploadController(UploadService uploadService, AuthService authService) {
        this.uploadService = uploadService;
        this.authService = authService;
    }

    @PostMapping("/batches")
    @Operation(summary = "创建上传批次并返回 COS 表单直传参数")
    public ApiResponse<UploadBatchVO> createBatch(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                  @Valid @RequestBody UploadBatchCreateRequest request) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(uploadService.createBatch(request, user));
    }

    @PostMapping("/batches/{batchId}/complete")
    @Operation(summary = "确认上传完成并触发 RAG 分析")
    public ApiResponse<UploadCompleteVO> completeBatch(@PathVariable("batchId") Long batchId,
                                                       @RequestHeader(value = "Authorization", required = false) String authorization,
                                                       @RequestBody(required = false) UploadBatchCompleteRequest request) {
        UserAccount user = authService.requireUser(authorization);
        return ApiResponse.success(uploadService.completeBatch(batchId, request, user));
    }

    @PostMapping("/cos/authorization")
    @Operation(summary = "给前端 COS SDK 分片直传签名")
    public ApiResponse<Map<String, Object>> createCosAuthorization(@RequestBody Map<String, Object> request) {
        return ApiResponse.success(uploadService.createCosAuthorization(request));
    }

    @PostMapping("/cos-imports")
    @Operation(summary = "导入已上传到 COS 的源视频并标记为待 RAG")
    public ApiResponse<CosImportVO> importCosVideos(@Valid @RequestBody CosImportRequest request) {
        return ApiResponse.success(uploadService.importCosVideos(request));
    }

    @GetMapping("/assets/{assetId}")
    @Operation(summary = "查询视频上传资产状态")
    public ApiResponse<UploadAssetUploadVO> getUploadAsset(@PathVariable("assetId") Long assetId) {
        return ApiResponse.success(uploadService.getUploadAsset(assetId));
    }

    @DeleteMapping("/assets/{assetId}")
    @Operation(summary = "删除自己上传的源视频")
    public ApiResponse<Void> deleteUploadAsset(@PathVariable("assetId") Long assetId,
                                               @RequestHeader(value = "Authorization", required = false) String authorization) {
        UserAccount user = authService.requireUser(authorization);
        uploadService.deleteUploadAsset(assetId, user);
        return ApiResponse.success();
    }

    @PostMapping(value = "/assets/{assetId}/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "上传源视频文件到后端并转存 COS")
    public ApiResponse<UploadAssetUploadVO> uploadAssetFile(@PathVariable("assetId") Long assetId,
                                                            @RequestPart("file") MultipartFile file) {
        return ApiResponse.success(uploadService.uploadAssetFile(assetId, file));
    }

}
