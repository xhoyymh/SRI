package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.drama.common.BusinessException;
import com.example.drama.common.ResultCode;
import com.example.drama.config.CosProperties;
import com.example.drama.config.RagProperties;
import com.example.drama.mapper.AiGenerationMapper;
import com.example.drama.mapper.AnalysisTaskMapper;
import com.example.drama.mapper.EpisodeMapper;
import com.example.drama.mapper.HighlightMapper;
import com.example.drama.mapper.UploadBatchMapper;
import com.example.drama.mapper.VideoAssetMapper;
import com.example.drama.model.dto.AnalysisResultCallbackRequest;
import com.example.drama.model.dto.AnalysisStartRequest;
import com.example.drama.model.dto.AnalysisStatusCallbackRequest;
import com.example.drama.model.dto.GeneratedAssetCreateRequest;
import com.example.drama.model.entity.AiGeneration;
import com.example.drama.model.entity.AnalysisTask;
import com.example.drama.model.entity.Episode;
import com.example.drama.model.entity.Highlight;
import com.example.drama.model.entity.UploadBatch;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.entity.VideoAsset;
import com.example.drama.model.vo.AnalysisTaskVO;
import com.example.drama.model.vo.PendingVideoGroupVO;
import com.example.drama.model.vo.PendingVideoVO;
import com.example.drama.model.vo.UploadAssetUploadVO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AnalysisTaskService {
    private static final List<String> ACTIVE_STATUSES = List.of("QUEUED", "RUNNING");
    private static final List<String> STARTABLE_RAG_STATUSES = List.of("PENDING", "FAILED");

    private final AnalysisTaskMapper analysisTaskMapper;
    private final UploadBatchMapper uploadBatchMapper;
    private final VideoAssetMapper videoAssetMapper;
    private final EpisodeMapper episodeMapper;
    private final HighlightMapper highlightMapper;
    private final AiGenerationMapper aiGenerationMapper;
    private final SecretCryptoService secretCryptoService;
    private final RagProperties ragProperties;
    private final CosProperties cosProperties;
    private final CosPostPolicyService cosPostPolicyService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate = new RestTemplate();

    public AnalysisTaskService(AnalysisTaskMapper analysisTaskMapper,
                               UploadBatchMapper uploadBatchMapper,
                               VideoAssetMapper videoAssetMapper,
                               EpisodeMapper episodeMapper,
                               HighlightMapper highlightMapper,
                               AiGenerationMapper aiGenerationMapper,
                               SecretCryptoService secretCryptoService,
                               RagProperties ragProperties,
                               CosProperties cosProperties,
                               CosPostPolicyService cosPostPolicyService) {
        this.analysisTaskMapper = analysisTaskMapper;
        this.uploadBatchMapper = uploadBatchMapper;
        this.videoAssetMapper = videoAssetMapper;
        this.episodeMapper = episodeMapper;
        this.highlightMapper = highlightMapper;
        this.aiGenerationMapper = aiGenerationMapper;
        this.secretCryptoService = secretCryptoService;
        this.ragProperties = ragProperties;
        this.cosProperties = cosProperties;
        this.cosPostPolicyService = cosPostPolicyService;
    }

    public List<PendingVideoGroupVO> pendingVideos(UserAccount user) {
        List<VideoAsset> assets = videoAssetMapper.selectList(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .eq(VideoAsset::getStatus, "UPLOADED")
                .isNotNull(VideoAsset::getBatchId)
                .orderByAsc(VideoAsset::getBatchId)
                .orderByAsc(VideoAsset::getEpisodeNo));
        Map<Long, PendingVideoGroupVO> groups = new LinkedHashMap<>();
        Map<Long, UploadBatch> batches = new LinkedHashMap<>();
        for (VideoAsset asset : assets) {
            UploadBatch batch = batches.computeIfAbsent(asset.getBatchId(), uploadBatchMapper::selectById);
            if (!canAccessBatch(batch, user)) {
                continue;
            }
            PendingVideoGroupVO group = groups.computeIfAbsent(asset.getBatchId(), batchId -> {
                PendingVideoGroupVO vo = new PendingVideoGroupVO();
                vo.setBatchId(batchId);
                vo.setDramaId(batch == null ? asset.getDramaId() : batch.getDramaId());
                vo.setDramaNo(asset.getDramaNo());
                vo.setDramaCode(asset.getDramaCode());
                vo.setDramaTitle(batch == null ? asset.getOriginalFolderName() : batch.getDramaTitle());
                vo.setBatchStatus(batch == null ? null : batch.getStatus());
                vo.setTaskId(batch == null ? null : batch.getTaskId());
                vo.setVideos(new ArrayList<>());
                return vo;
            });
            group.getVideos().add(toPendingVideo(asset));
        }
        return new ArrayList<>(groups.values());
    }

    public AnalysisTaskVO getActiveTask(UserAccount user) {
        AnalysisTask task = findActiveTask();
        if (task == null || !canAccessTask(task, user)) {
            return null;
        }
        return toVO(task);
    }

    @Transactional
    public AnalysisTaskVO start(AnalysisStartRequest req, UserAccount user) {
        AnalysisTask active = findActiveTask();
        if (active != null) {
            throw new BusinessException(ResultCode.DUPLICATE_OPERATION.getCode(), "已有 RAG 任务正在处理");
        }
        List<Long> assetIds = distinctIds(req.getAssetIds());
        if (assetIds.isEmpty()) {
            throw new BusinessException(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "请选择要处理的视频");
        }
        List<VideoAsset> assets = loadSourceAssets(assetIds);
        if (assets.size() != assetIds.size()) {
            throw new BusinessException(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "存在无效的视频资产");
        }
        Long batchId = assets.get(0).getBatchId();
        UploadBatch selectedBatch = uploadBatchMapper.selectById(batchId);
        if (!canAccessBatch(selectedBatch, user)) {
            throw new BusinessException(403, "只能处理自己上传的短剧");
        }
        for (VideoAsset asset : assets) {
            if (!"UPLOADED".equals(asset.getStatus()) || asset.getEpisodeId() == null) {
                throw new BusinessException(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "视频尚未上传完成");
            }
            if (batchId == null || !batchId.equals(asset.getBatchId())) {
                throw new BusinessException(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "一次只能处理同一批次的视频");
            }
            String ragStatus = normalizeRagStatus(asset);
            if (!STARTABLE_RAG_STATUSES.contains(ragStatus)) {
                throw new BusinessException(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "所选视频包含已处理或处理中项目");
            }
        }

        LocalDateTime now = LocalDateTime.now();
        String judgeApiKey = req.getJudgeApiKey().trim();
        String judgeEndpointId = req.getJudgeEndpointId().trim();
        String generationApiKey = hasText(req.getGenerationApiKey()) ? req.getGenerationApiKey().trim() : null;
        AnalysisTask task = new AnalysisTask();
        task.setBatchId(batchId);
        task.setStatus("QUEUED");
        task.setStage("rag");
        task.setProgress(5);
        task.setMessage("等待启动 RAG 分析");
        task.setCallbackToken(UUID.randomUUID().toString().replace("-", ""));
        task.setJudgeApiKeyEnc(secretCryptoService.encrypt(judgeApiKey));
        task.setJudgeEndpointId(judgeEndpointId);
        task.setGenerationApiKeyEnc(secretCryptoService.encrypt(generationApiKey));
        task.setHasGenerationKey(hasText(generationApiKey) ? 1 : 0);
        task.setCreateTime(now);
        task.setUpdateTime(now);
        analysisTaskMapper.insert(task);

        for (VideoAsset asset : assets) {
            asset.setRagStatus("PROCESSING");
            asset.setRagTaskId(task.getId());
            asset.setRagMessage("RAG 任务已创建");
            asset.setRagUpdateTime(now);
            asset.setUpdateTime(now);
            videoAssetMapper.updateById(asset);
        }

        UploadBatch batch = selectedBatch;
        if (batch != null) {
            batch.setTaskId(task.getId());
            batch.setStatus("RAG_RUNNING");
            batch.setUpdateTime(now);
            uploadBatchMapper.updateById(batch);
        }

        triggerRag(task.getId());
        return toVO(analysisTaskMapper.selectById(task.getId()));
    }

    @Transactional
    public UploadAssetUploadVO createGeneratedAsset(Long taskId, GeneratedAssetCreateRequest req) {
        AnalysisTask task = requireTask(taskId);
        checkToken(task, req.getCallbackToken());
        UploadBatch batch = uploadBatchMapper.selectById(task.getBatchId());
        String fileName = req.getFileName() == null || req.getFileName().isBlank()
                ? "generated-" + System.currentTimeMillis()
                : req.getFileName();
        String objectKey = buildGeneratedObjectKey(taskId, req.getAssetType(), fileName);
        String cosUrl = cosPostPolicyService.publicUrl(objectKey);

        VideoAsset asset = new VideoAsset();
        asset.setBatchId(task.getBatchId());
        asset.setDramaId(batch == null ? null : batch.getDramaId());
        asset.setEpisodeId(req.getEpisodeId());
        asset.setGenerationId(req.getGenerationId());
        asset.setAssetType(req.getAssetType() == null ? "GENERATED_ASSET" : req.getAssetType());
        asset.setOriginalFolderName(batch == null ? null : batch.getDramaTitle());
        asset.setOriginalFileName(fileName);
        asset.setCosBucket(cosPostPolicyService.bucket());
        asset.setCosRegion(cosPostPolicyService.region());
        asset.setCosKey(objectKey);
        asset.setCosUrl(cosUrl);
        asset.setContentType(req.getContentType());
        asset.setFileSize(req.getFileSize());
        asset.setStatus("CREATED");
        asset.setCreateTime(LocalDateTime.now());
        asset.setUpdateTime(LocalDateTime.now());
        videoAssetMapper.insert(asset);

        CosPostPolicyService.SignedPut signedPut = cosPostPolicyService.buildSignedPut(objectKey);
        UploadAssetUploadVO vo = new UploadAssetUploadVO();
        vo.setAssetId(asset.getId());
        vo.setOriginalFileName(fileName);
        vo.setObjectKey(objectKey);
        vo.setCosUrl(cosUrl);
        vo.setUploadMethod(signedPut.getUploadMethod());
        vo.setUploadUrl(signedPut.getUploadUrl());
        vo.setHeaders(signedPut.getHeaders());
        vo.setFormData(signedPut.getFormData());
        vo.setExpiresAt(signedPut.getExpiresAt());
        return vo;
    }

    public AnalysisTaskVO getTask(Long taskId, UserAccount user) {
        AnalysisTask task = requireTask(taskId);
        ensureTaskVisible(task, user);
        return toVO(task);
    }

    @Transactional
    public AnalysisTaskVO retry(Long taskId, UserAccount user) {
        AnalysisTask task = requireTask(taskId);
        ensureTaskVisible(task, user);
        AnalysisTask active = findActiveTask();
        if (active != null && !active.getId().equals(taskId)) {
            throw new BusinessException(ResultCode.DUPLICATE_OPERATION.getCode(), "已有 RAG 任务正在处理");
        }
        if (ACTIVE_STATUSES.contains(task.getStatus())) {
            return toVO(task);
        }
        LocalDateTime now = LocalDateTime.now();
        task.setStatus("QUEUED");
        task.setStage("rag");
        task.setProgress(5);
        task.setMessage("重新启动 RAG 分析");
        task.setErrorMessage(null);
        task.setUpdateTime(now);
        analysisTaskMapper.updateById(task);
        markTaskAssets(task.getId(), "PROCESSING", "重新启动 RAG 分析");
        UploadBatch batch = uploadBatchMapper.selectById(task.getBatchId());
        if (batch != null) {
            batch.setStatus("RAG_RUNNING");
            batch.setTaskId(task.getId());
            batch.setUpdateTime(now);
            uploadBatchMapper.updateById(batch);
        }
        triggerRag(taskId);
        return toVO(analysisTaskMapper.selectById(taskId));
    }

    @Transactional
    public void triggerRag(Long taskId) {
        AnalysisTask task = requireTask(taskId);
        if (ragProperties.getBaseUrl() == null || ragProperties.getBaseUrl().isBlank()) {
            task.setStatus("QUEUED");
            task.setStage("rag");
            task.setProgress(5);
            task.setMessage("RAG_BASE_URL 未配置，任务已排队等待外部 RAG 服务拉起");
            task.setUpdateTime(LocalDateTime.now());
            analysisTaskMapper.updateById(task);
            markTaskAssets(taskId, "PROCESSING", task.getMessage());
            return;
        }
        try {
            Map<String, Object> body = buildRagStartBody(task);
            String url = ragProperties.getBaseUrl().replaceAll("/+$", "") + "/tasks";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            String jsonBody = objectMapper.writeValueAsString(body);
            restTemplate.postForEntity(url, new HttpEntity<>(jsonBody, headers), String.class);
            task.setStatus("RUNNING");
            task.setStage("rag");
            task.setProgress(10);
            task.setMessage("已提交 RAG 服务处理");
            task.setErrorMessage(null);
            markTaskAssets(taskId, "PROCESSING", task.getMessage());
        } catch (Exception e) {
            task.setStatus("FAILED");
            task.setStage("rag");
            task.setErrorMessage("启动 RAG 服务失败：" + e.getMessage());
            markTaskAssets(taskId, "FAILED", task.getErrorMessage());
            updateBatchAfterTask(task);
        }
        task.setUpdateTime(LocalDateTime.now());
        analysisTaskMapper.updateById(task);
    }

    @Transactional
    public AnalysisTaskVO updateStatus(Long taskId, AnalysisStatusCallbackRequest req) {
        AnalysisTask task = requireTask(taskId);
        checkToken(task, req.getCallbackToken());
        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            task.setStatus(req.getStatus());
        }
        if (req.getStage() != null) {
            task.setStage(req.getStage());
        }
        if (req.getProgress() != null) {
            task.setProgress(Math.max(0, Math.min(100, req.getProgress())));
        }
        task.setMessage(req.getMessage());
        task.setErrorMessage(req.getErrorMessage());
        task.setUpdateTime(LocalDateTime.now());
        analysisTaskMapper.updateById(task);

        if ("FAILED".equals(task.getStatus())) {
            markTaskAssets(taskId, "FAILED", task.getErrorMessage() == null ? task.getMessage() : task.getErrorMessage());
            updateBatchAfterTask(task);
        } else if (ACTIVE_STATUSES.contains(task.getStatus())) {
            markTaskAssets(taskId, "PROCESSING", task.getMessage());
        }
        return toVO(task);
    }

    @Transactional
    public AnalysisTaskVO acceptResult(Long taskId, AnalysisResultCallbackRequest req) {
        AnalysisTask task = requireTask(taskId);
        checkToken(task, req.getCallbackToken());
        Map<String, Long> generationIds = importAiStories(req);
        Set<Long> storyEpisodeIds = storyEpisodeIds(req);
        Set<Long> highlightEpisodeIds = importHighlights(task, req, generationIds);
        try {
            task.setResultJson(req.getResultJson() != null ? req.getResultJson().toString() : objectMapper.writeValueAsString(req));
        } catch (Exception ignored) {
            task.setResultJson("{}");
        }
        String status = req.getStatus() == null || req.getStatus().isBlank() ? "SUCCESS" : req.getStatus();
        task.setStatus(status);
        task.setStage("done");
        task.setProgress(100);
        task.setMessage(req.getMessage() == null ? "RAG 分析结果已导入" : req.getMessage());
        task.setErrorMessage(null);
        task.setUpdateTime(LocalDateTime.now());
        analysisTaskMapper.updateById(task);

        if ("FAILED".equals(status)) {
            markTaskAssets(taskId, "FAILED", task.getMessage());
        } else {
            markCompletedTaskAssets(task, highlightEpisodeIds, storyEpisodeIds);
        }
        updateBatchAfterTask(task);
        return toVO(task);
    }

    private Map<String, Object> buildRagStartBody(AnalysisTask task) {
        UploadBatch batch = uploadBatchMapper.selectById(task.getBatchId());
        List<VideoAsset> assets = sourceAssetsForTask(task.getId());

        List<Map<String, Object>> videos = new ArrayList<>();
        for (VideoAsset asset : assets) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("assetId", asset.getId());
            item.put("episodeId", asset.getEpisodeId());
            item.put("episodeNo", asset.getEpisodeNo());
            item.put("dramaNo", asset.getDramaNo());
            item.put("dramaCode", asset.getDramaCode());
            item.put("originalFileName", asset.getOriginalFileName());
            item.put("normalizedFileName", asset.getNormalizedFileName());
            item.put("backendKey", asset.getBackendKey());
            item.put("cosKey", asset.getCosKey());
            item.put("cosUrl", asset.getCosUrl());
            item.put("downloadUrl", resolveAssetDownloadUrl(asset));
            videos.add(item);
        }

        Map<String, Object> ark = new LinkedHashMap<>();
        ark.put("baseUrl", "https://ark.cn-beijing.volces.com/api/v3");
        ark.put("judgeApiKey", secretCryptoService.decrypt(task.getJudgeApiKeyEnc()));
        ark.put("judgeEndpointId", task.getJudgeEndpointId());
        ark.put("generationApiKey", secretCryptoService.decrypt(task.getGenerationApiKeyEnc()));
        ark.put("hasGenerationKey", task.getHasGenerationKey() != null && task.getHasGenerationKey() == 1);

        Map<String, Object> cos = new LinkedHashMap<>();
        cos.put("bucket", cosProperties.getBucket());
        cos.put("region", cosProperties.getRegion());
        cos.put("domain", cosProperties.getDomain());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("taskId", task.getId());
        body.put("batchId", task.getBatchId());
        body.put("dramaId", batch == null ? null : batch.getDramaId());
        body.put("dramaTitle", batch == null ? "" : batch.getDramaTitle());
        body.put("callbackBaseUrl", ragProperties.getCallbackBaseUrl());
        body.put("callbackToken", task.getCallbackToken());
        body.put("cos", cos);
        body.put("ark", ark);
        body.put("videos", videos);
        return body;
    }

    private String resolveAssetDownloadUrl(VideoAsset asset) {
        if (asset == null) {
            return "";
        }
        if ("local".equalsIgnoreCase(asset.getCosBucket())) {
            return asset.getCosUrl();
        }
        return cosPostPolicyService.buildSignedGetUrl(asset.getCosKey());
    }

    private Map<String, Long> importAiStories(AnalysisResultCallbackRequest req) {
        Map<String, Long> ids = new LinkedHashMap<>();
        if (req.getAiStories() == null) {
            return ids;
        }
        for (AnalysisResultCallbackRequest.AiStoryItem item : req.getAiStories()) {
            AiGeneration gen = new AiGeneration();
            gen.setDramaId(resolveDramaId(item.getEpisodeId()));
            gen.setEpisodeId(item.getEpisodeId());
            gen.setHighlightId(item.getHighlightId());
            gen.setOptionCode(item.getOptionCode());
            gen.setContentType(item.getContentType() == null ? "VIDEO" : item.getContentType());
            gen.setTitle(item.getTitle());
            gen.setPrompt(item.getPrompt() == null ? item.getContent() : item.getPrompt());
            gen.setContent(item.getContent());
            gen.setContentUrl(item.getContentUrl());
            gen.setStatus("success");
            gen.setLikeCount(0);
            gen.setCommentCount(0);
            gen.setCreateTime(LocalDateTime.now());
            aiGenerationMapper.insert(gen);
            if (item.getClientRef() != null && !item.getClientRef().isBlank()) {
                ids.put(item.getClientRef(), gen.getId());
            }
            if (item.getAssetId() != null) {
                VideoAsset asset = videoAssetMapper.selectById(item.getAssetId());
                if (asset != null) {
                    asset.setGenerationId(gen.getId());
                    asset.setStatus("GENERATED");
                    if (item.getContentUrl() != null) {
                        asset.setCosUrl(item.getContentUrl());
                    }
                    asset.setUpdateTime(LocalDateTime.now());
                    videoAssetMapper.updateById(asset);
                }
            }
        }
        return ids;
    }

    private Set<Long> importHighlights(AnalysisTask task, AnalysisResultCallbackRequest req, Map<String, Long> generationIds) {
        Set<Long> episodeIdsToRefresh = sourceAssetsForTask(task.getId()).stream()
                .map(VideoAsset::getEpisodeId)
                .filter(id -> id != null)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (req.getHighlights() != null) {
            for (AnalysisResultCallbackRequest.HighlightItem item : req.getHighlights()) {
                if (item.getEpisodeId() != null) {
                    episodeIdsToRefresh.add(item.getEpisodeId());
                }
            }
        }
        if (!episodeIdsToRefresh.isEmpty()) {
            highlightMapper.delete(new LambdaQueryWrapper<Highlight>()
                    .in(Highlight::getEpisodeId, episodeIdsToRefresh)
                    .eq(Highlight::getSource, "rag"));
        }
        Set<Long> insertedEpisodes = new LinkedHashSet<>();
        if (req.getHighlights() == null) {
            return insertedEpisodes;
        }
        for (AnalysisResultCallbackRequest.HighlightItem item : req.getHighlights()) {
            if (item.getEpisodeId() == null) {
                continue;
            }
            Episode episode = episodeMapper.selectById(item.getEpisodeId());
            if (episode == null) {
                continue;
            }
            Highlight highlight = new Highlight();
            highlight.setDramaId(episode.getDramaId());
            highlight.setEpisodeId(item.getEpisodeId());
            highlight.setStartTime(item.getStartTime());
            highlight.setEndTime(item.getEndTime());
            highlight.setHighlightType(item.getHighlightType());
            highlight.setTitle(item.getTitle());
            highlight.setDescription(item.getDescription());
            highlight.setTriggerOnce(item.getTriggerOnce() == null ? 1 : item.getTriggerOnce());
            highlight.setInteractionConfig(resolveGenerationRefs(item.getInteractionConfig(), generationIds));
            highlight.setSource("rag");
            if (item.getConfidence() != null) {
                highlight.setConfidence(item.getConfidence());
            }
            highlight.setCreateTime(LocalDateTime.now());
            highlightMapper.insert(highlight);
            insertedEpisodes.add(item.getEpisodeId());
        }
        return insertedEpisodes;
    }

    private String resolveGenerationRefs(JsonNode config, Map<String, Long> generationIds) {
        if (config == null || config.isNull()) {
            return null;
        }
        JsonNode copy = config.deepCopy();
        if (copy instanceof ObjectNode objectNode) {
            replaceGenerationClientRef(objectNode, generationIds);
            JsonNode options = objectNode.get("options");
            if (options != null && options.isArray()) {
                for (JsonNode option : options) {
                    if (option instanceof ObjectNode optNode) {
                        replaceGenerationClientRef(optNode, generationIds);
                        String outcome = optNode.path("branchOutcome").asText("");
                        if ("MAINLINE".equalsIgnoreCase(outcome) && !optNode.has("isCorrect")) {
                            optNode.put("isCorrect", true);
                        }
                        if ("TRIAL".equalsIgnoreCase(outcome) && !optNode.has("isCorrect")) {
                            optNode.put("isCorrect", false);
                        }
                        if (optNode.has("retryTime") && !optNode.has("resumeTime")) {
                            optNode.put("resumeTime", optNode.path("retryTime").asInt());
                        }
                    }
                }
            }
        }
        return copy.toString();
    }

    private void replaceGenerationClientRef(ObjectNode node, Map<String, Long> generationIds) {
        JsonNode ref = node.get("generationClientRef");
        if (ref == null) {
            return;
        }
        Long id = generationIds.get(ref.asText());
        if (id != null) {
            node.put("generationId", id);
        }
        node.remove("generationClientRef");
    }

    private void markCompletedTaskAssets(AnalysisTask task, Set<Long> highlightEpisodeIds, Set<Long> storyEpisodeIds) {
        LocalDateTime now = LocalDateTime.now();
        for (VideoAsset asset : sourceAssetsForTask(task.getId())) {
            boolean hasInteractiveContent = asset.getEpisodeId() != null
                    && (highlightEpisodeIds.contains(asset.getEpisodeId()) || storyEpisodeIds.contains(asset.getEpisodeId()));
            asset.setRagStatus(hasInteractiveContent ? "ANALYZED" : "NO_INTERACTION");
            asset.setRagMessage(hasInteractiveContent ? "RAG 已生成互动内容" : "RAG 已判断无互动点");
            asset.setRagUpdateTime(now);
            asset.setUpdateTime(now);
            videoAssetMapper.updateById(asset);
        }
    }

    private void markTaskAssets(Long taskId, String status, String message) {
        LocalDateTime now = LocalDateTime.now();
        for (VideoAsset asset : sourceAssetsForTask(taskId)) {
            asset.setRagStatus(status);
            asset.setRagMessage(message);
            asset.setRagUpdateTime(now);
            asset.setUpdateTime(now);
            videoAssetMapper.updateById(asset);
        }
    }

    private void updateBatchAfterTask(AnalysisTask task) {
        UploadBatch batch = uploadBatchMapper.selectById(task.getBatchId());
        if (batch == null) {
            return;
        }
        List<VideoAsset> sourceAssets = videoAssetMapper.selectList(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getBatchId, task.getBatchId())
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .eq(VideoAsset::getStatus, "UPLOADED"));
        boolean allDone = !sourceAssets.isEmpty() && sourceAssets.stream()
                .allMatch(asset -> List.of("ANALYZED", "NO_INTERACTION").contains(normalizeRagStatus(asset)));
        boolean anyFailed = sourceAssets.stream().anyMatch(asset -> "FAILED".equals(normalizeRagStatus(asset)));
        batch.setStatus(allDone ? "ANALYZED" : anyFailed ? "RAG_FAILED" : "READY_FOR_RAG");
        batch.setTaskId(task.getId());
        batch.setUpdateTime(LocalDateTime.now());
        uploadBatchMapper.updateById(batch);
    }

    private Set<Long> storyEpisodeIds(AnalysisResultCallbackRequest req) {
        Set<Long> ids = new LinkedHashSet<>();
        if (req.getAiStories() == null) {
            return ids;
        }
        for (AnalysisResultCallbackRequest.AiStoryItem item : req.getAiStories()) {
            if (item.getEpisodeId() != null) {
                ids.add(item.getEpisodeId());
            }
        }
        return ids;
    }

    private List<VideoAsset> sourceAssetsForTask(Long taskId) {
        return videoAssetMapper.selectList(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .eq(VideoAsset::getRagTaskId, taskId)
                .orderByAsc(VideoAsset::getEpisodeNo));
    }

    private List<VideoAsset> loadSourceAssets(List<Long> assetIds) {
        if (assetIds.isEmpty()) {
            return List.of();
        }
        return videoAssetMapper.selectList(new LambdaQueryWrapper<VideoAsset>()
                .in(VideoAsset::getId, assetIds)
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .orderByAsc(VideoAsset::getEpisodeNo));
    }

    private boolean canAccessTask(AnalysisTask task, UserAccount user) {
        if (task == null) {
            return false;
        }
        UploadBatch batch = uploadBatchMapper.selectById(task.getBatchId());
        return canAccessBatch(batch, user);
    }

    private void ensureTaskVisible(AnalysisTask task, UserAccount user) {
        if (!canAccessTask(task, user)) {
            throw new BusinessException(403, "只能查看或重试自己上传短剧的 RAG 任务");
        }
    }

    private boolean canAccessBatch(UploadBatch batch, UserAccount user) {
        if (batch == null || batch.getUserId() == null) {
            return true;
        }
        return user != null && batch.getUserId().equals(user.getId());
    }

    private AnalysisTask findActiveTask() {
        List<AnalysisTask> tasks = analysisTaskMapper.selectList(new LambdaQueryWrapper<AnalysisTask>()
                .in(AnalysisTask::getStatus, ACTIVE_STATUSES)
                .orderByAsc(AnalysisTask::getCreateTime));
        for (AnalysisTask task : tasks) {
            if (!sourceAssetsForTask(task.getId()).isEmpty()) {
                return task;
            }
        }
        return null;
    }

    private List<Long> distinctIds(List<Long> ids) {
        if (ids == null) {
            return List.of();
        }
        return ids.stream()
                .filter(id -> id != null)
                .distinct()
                .collect(Collectors.toList());
    }

    private String normalizeRagStatus(VideoAsset asset) {
        return asset.getRagStatus() == null || asset.getRagStatus().isBlank() ? "PENDING" : asset.getRagStatus();
    }

    private PendingVideoVO toPendingVideo(VideoAsset asset) {
        PendingVideoVO vo = new PendingVideoVO();
        vo.setAssetId(asset.getId());
        vo.setBatchId(asset.getBatchId());
        vo.setDramaId(asset.getDramaId());
        vo.setEpisodeId(asset.getEpisodeId());
        vo.setDramaNo(asset.getDramaNo());
        vo.setDramaCode(asset.getDramaCode());
        vo.setEpisodeNo(asset.getEpisodeNo());
        vo.setOriginalFileName(asset.getOriginalFileName());
        vo.setNormalizedFileName(asset.getNormalizedFileName());
        vo.setBackendKey(asset.getBackendKey());
        vo.setCosKey(asset.getCosKey());
        vo.setCosUrl(asset.getCosUrl());
        vo.setStatus(asset.getStatus());
        vo.setRagStatus(normalizeRagStatus(asset));
        vo.setRagTaskId(asset.getRagTaskId());
        vo.setRagMessage(asset.getRagMessage());
        vo.setRagUpdateTime(asset.getRagUpdateTime());
        return vo;
    }

    private Long resolveDramaId(Long episodeId) {
        if (episodeId == null) {
            return null;
        }
        Episode episode = episodeMapper.selectById(episodeId);
        return episode == null ? null : episode.getDramaId();
    }

    private AnalysisTask requireTask(Long taskId) {
        AnalysisTask task = analysisTaskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        return task;
    }

    private void checkToken(AnalysisTask task, String callbackToken) {
        if (callbackToken == null || !callbackToken.equals(task.getCallbackToken())) {
            throw new BusinessException(403, "callbackToken 无效");
        }
    }

    private AnalysisTaskVO toVO(AnalysisTask task) {
        AnalysisTaskVO vo = new AnalysisTaskVO();
        vo.setTaskId(task.getId());
        vo.setBatchId(task.getBatchId());
        vo.setStatus(task.getStatus());
        vo.setStage(task.getStage());
        vo.setProgress(task.getProgress());
        vo.setMessage(task.getMessage());
        vo.setErrorMessage(task.getErrorMessage());
        vo.setHasGenerationKey(task.getHasGenerationKey() != null && task.getHasGenerationKey() == 1);
        vo.setCreateTime(task.getCreateTime());
        vo.setUpdateTime(task.getUpdateTime());
        return vo;
    }

    private String buildGeneratedObjectKey(Long taskId, String assetType, String fileName) {
        String ext = "";
        int dot = fileName.lastIndexOf('.');
        if (dot >= 0) {
            ext = fileName.substring(dot).toLowerCase();
            fileName = fileName.substring(0, dot);
        }
        String safeName = fileName.replaceAll("[^A-Za-z0-9_-]+", "_").replaceAll("_+", "_");
        if (safeName.isBlank()) {
            safeName = "asset";
        }
        String type = assetType == null ? "asset" : assetType.toLowerCase().replaceAll("[^a-z0-9_-]+", "_");
        return "generated/" + taskId + "/" + type + "/" + safeName + "-" + System.currentTimeMillis() + ext;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
