package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.drama.common.BusinessException;
import com.example.drama.common.ResultCode;
import com.example.drama.mapper.DramaMapper;
import com.example.drama.mapper.EpisodeMapper;
import com.example.drama.mapper.UploadBatchMapper;
import com.example.drama.mapper.VideoAssetMapper;
import com.example.drama.mapper.VideoNameMappingMapper;
import com.example.drama.model.dto.CosImportRequest;
import com.example.drama.model.dto.UploadBatchCompleteRequest;
import com.example.drama.model.dto.UploadBatchCreateRequest;
import com.example.drama.model.entity.Drama;
import com.example.drama.model.entity.Episode;
import com.example.drama.model.entity.UploadBatch;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.entity.VideoAsset;
import com.example.drama.model.entity.VideoNameMapping;
import com.example.drama.model.vo.CosImportVO;
import com.example.drama.model.vo.UploadAssetUploadVO;
import com.example.drama.model.vo.UploadBatchVO;
import com.example.drama.model.vo.UploadCompleteVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class UploadService {
    private static final Logger log = LoggerFactory.getLogger(UploadService.class);
    private final UploadBatchMapper uploadBatchMapper;
    private final VideoAssetMapper videoAssetMapper;
    private final DramaMapper dramaMapper;
    private final EpisodeMapper episodeMapper;
    private final VideoNameMappingMapper videoNameMappingMapper;
    private final CosPostPolicyService cosPostPolicyService;

    public UploadService(UploadBatchMapper uploadBatchMapper,
                         VideoAssetMapper videoAssetMapper,
                         DramaMapper dramaMapper,
                         EpisodeMapper episodeMapper,
                         VideoNameMappingMapper videoNameMappingMapper,
                         CosPostPolicyService cosPostPolicyService) {
        this.uploadBatchMapper = uploadBatchMapper;
        this.videoAssetMapper = videoAssetMapper;
        this.dramaMapper = dramaMapper;
        this.episodeMapper = episodeMapper;
        this.videoNameMappingMapper = videoNameMappingMapper;
        this.cosPostPolicyService = cosPostPolicyService;
    }

    @Transactional
    public UploadBatchVO createBatch(UploadBatchCreateRequest req, UserAccount user) {
        LocalDateTime now = LocalDateTime.now();
        String dramaTitle = req.getDramaTitle().trim();
        String dramaDescription = req.getDramaDescription().trim();
        List<UploadBatchCreateRequest.FileItem> files = dedupeFilesKeepLatestByEpisode(req.getFiles());
        Drama drama = findOrCreateDrama(dramaTitle, dramaDescription);
        UploadBatch batch = new UploadBatch();
        batch.setDramaId(drama.getId());
        batch.setUserId(user == null ? null : user.getId());
        batch.setDramaTitle(dramaTitle);
        batch.setStatus("CREATED");
        batch.setFileCount(files.size());
        batch.setCreateTime(now);
        batch.setUpdateTime(now);
        uploadBatchMapper.insert(batch);

        UploadAssetUploadVO coverUpload = buildCoverUpload(batch.getId(), dramaTitle, req.getCoverFile());
        List<UploadAssetUploadVO> uploads = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            UploadBatchCreateRequest.FileItem file = files.get(i);
            Integer episodeNo = file.getEpisodeNo() != null ? file.getEpisodeNo() : inferEpisodeNo(file.getFileName(), i + 1);
            String objectKey = buildObjectKey(batch.getId(), dramaTitle, episodeNo, file.getFileName());
            String cosUrl = cosPostPolicyService.publicUrl(objectKey);
            boolean skipUpload = canSkipExistingCosVideo(objectKey, file.getFileSize());
            String normalizedFileName = basename(objectKey);

            VideoAsset asset = new VideoAsset();
            asset.setBatchId(batch.getId());
            asset.setDramaId(drama.getId());
            asset.setAssetType("SOURCE_VIDEO");
            asset.setEpisodeNo(episodeNo);
            asset.setOriginalFolderName(dramaTitle);
            asset.setOriginalFileName(file.getFileName());
            asset.setNormalizedFileName(normalizedFileName);
            asset.setBackendKey("video/" + safeSlug(dramaTitle) + "/" + normalizedFileName);
            asset.setCosBucket(cosPostPolicyService.bucket());
            asset.setCosRegion(cosPostPolicyService.region());
            asset.setCosKey(objectKey);
            asset.setCosUrl(cosUrl);
            asset.setContentType(file.getContentType());
            asset.setFileSize(file.getFileSize());
            asset.setStatus(skipUpload ? "UPLOADED" : "CREATED");
            asset.setRagStatus("WAITING_UPLOAD");
            asset.setRagMessage("Waiting for COS upload");
            asset.setRagUpdateTime(now);
            asset.setCreateTime(now);
            asset.setUpdateTime(now);
            videoAssetMapper.insert(asset);

            UploadAssetUploadVO vo = new UploadAssetUploadVO();
            vo.setAssetId(asset.getId());
            vo.setOriginalFileName(file.getFileName());
            vo.setEpisodeNo(episodeNo);
            vo.setBucket(cosPostPolicyService.bucket());
            vo.setRegion(cosPostPolicyService.region());
            vo.setObjectKey(objectKey);
            vo.setCosUrl(cosUrl);
            vo.setStatus(asset.getStatus());
            if (skipUpload) {
                vo.setUploadMethod("SKIP");
                log.info("源视频已存在，跳过重复上传: assetId={}, episodeNo={}, key={}, size={}",
                        asset.getId(), episodeNo, objectKey, file.getFileSize());
            } else {
                applyDirectUploadParams(vo);
            }
            uploads.add(vo);
        }

        UploadBatchVO vo = new UploadBatchVO();
        vo.setBatchId(batch.getId());
        vo.setDramaTitle(batch.getDramaTitle());
        vo.setStatus(batch.getStatus());
        vo.setCoverUpload(coverUpload);
        vo.setUploads(uploads);
        return vo;
    }

    private List<UploadBatchCreateRequest.FileItem> dedupeFilesKeepLatestByEpisode(List<UploadBatchCreateRequest.FileItem> files) {
        Map<Integer, UploadBatchCreateRequest.FileItem> deduped = new LinkedHashMap<>();
        for (int i = 0; i < files.size(); i++) {
            UploadBatchCreateRequest.FileItem file = files.get(i);
            int episodeNo = file.getEpisodeNo() != null && file.getEpisodeNo() > 0
                    ? file.getEpisodeNo()
                    : inferEpisodeNo(file.getFileName(), i + 1);
            file.setEpisodeNo(episodeNo);
            deduped.remove(episodeNo);
            deduped.put(episodeNo, file);
        }
        return new ArrayList<>(deduped.values());
    }

    private List<CosImportRequest.VideoItem> dedupeCosVideosKeepLatestByEpisode(List<CosImportRequest.VideoItem> videos) {
        Map<Integer, CosImportRequest.VideoItem> deduped = new LinkedHashMap<>();
        for (int i = 0; i < videos.size(); i++) {
            CosImportRequest.VideoItem video = videos.get(i);
            int episodeNo = video.getEpisodeNo() != null && video.getEpisodeNo() > 0
                    ? video.getEpisodeNo()
                    : inferEpisodeNo(firstText(video.getOriginalFileName(), video.getNormalizedFileName(), basename(video.getCosKey())), i + 1);
            video.setEpisodeNo(episodeNo);
            deduped.remove(episodeNo);
            deduped.put(episodeNo, video);
        }
        return new ArrayList<>(deduped.values());
    }

    private boolean canSkipExistingCosVideo(String objectKey, Long fileSize) {
        if (!hasText(objectKey) || fileSize == null || fileSize <= 0) {
            return false;
        }
        VideoAsset existing = videoAssetMapper.selectOne(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .eq(VideoAsset::getCosKey, objectKey)
                .eq(VideoAsset::getFileSize, fileSize)
                .in(VideoAsset::getStatus, List.of("UPLOADED", "COS_UPLOADED", "REPLACED"))
                .orderByDesc(VideoAsset::getUpdateTime)
                .last("LIMIT 1"));
        if (existing == null) {
            return false;
        }
        try {
            return cosPostPolicyService.objectExists(objectKey);
        } catch (Exception e) {
            log.warn("重复上传秒传 HEAD 校验失败，改走真实上传: key={}, error={}", objectKey, e.getMessage());
            return false;
        }
    }

    public UploadAssetUploadVO getUploadAsset(Long assetId) {
        VideoAsset asset = videoAssetMapper.selectById(assetId);
        if (asset == null || !"SOURCE_VIDEO".equals(asset.getAssetType())) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        UploadAssetUploadVO vo = toUploadAssetVO(asset);
        applyDirectUploadParams(vo);
        return vo;
    }

    public UploadAssetUploadVO uploadAssetFile(Long assetId, MultipartFile file) {
        VideoAsset asset = videoAssetMapper.selectById(assetId);
        if (asset == null || !"SOURCE_VIDEO".equals(asset.getAssetType())) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "上传文件不能为空");
        }
        Long maxUploadBytes = cosPostPolicyService.maxUploadBytes();
        if (maxUploadBytes != null && maxUploadBytes > 0 && file.getSize() > maxUploadBytes) {
            throw new BusinessException(4000, "视频超过上传大小限制");
        }

        String contentType = hasText(file.getContentType()) ? file.getContentType() : asset.getContentType();
        try (InputStream input = file.getInputStream()) {
            cosPostPolicyService.uploadObject(asset.getCosKey(), input, file.getSize(), contentType);
        } catch (IOException e) {
            throw new BusinessException(5000, "上传源视频到 COS 失败: " + e.getMessage());
        }

        LocalDateTime now = LocalDateTime.now();
        asset.setStatus("COS_UPLOADED");
        asset.setCosBucket(cosPostPolicyService.bucket());
        asset.setCosRegion(cosPostPolicyService.region());
        asset.setCosUrl(cosPostPolicyService.publicUrl(asset.getCosKey()));
        asset.setFileSize(file.getSize());
        if (hasText(contentType)) {
            asset.setContentType(contentType);
        }
        asset.setUpdateTime(now);
        videoAssetMapper.updateById(asset);
        log.info("后端已上传源视频到 COS: assetId={}, key={}", asset.getId(), asset.getCosKey());
        return toUploadAssetVO(asset);
    }

    @Transactional
    public void deleteUploadAsset(Long assetId, UserAccount user) {
        VideoAsset asset = videoAssetMapper.selectById(assetId);
        if (asset == null || !"SOURCE_VIDEO".equals(asset.getAssetType())) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        UploadBatch batch = asset.getBatchId() == null ? null : uploadBatchMapper.selectById(asset.getBatchId());
        if (batch == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        ensureBatchOwner(batch, user);
        if (!isDeletableRagStatus(asset)) {
            throw new BusinessException(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "视频正在处理或已生成结果，暂不能删除");
        }
        if ("DELETED".equals(asset.getStatus())) {
            return;
        }

        if (hasText(asset.getCosKey())) {
            boolean deleted = cosPostPolicyService.deleteObjectBestEffort(asset.getCosKey());
            if (!deleted) {
                log.warn("用户删除视频时 COS 对象未确认删除 assetId={}, key={}", asset.getId(), asset.getCosKey());
            }
        }

        LocalDateTime now = LocalDateTime.now();
        asset.setStatus("DELETED");
        asset.setRagStatus("DELETED");
        asset.setRagTaskId(null);
        asset.setRagMessage("用户已删除");
        asset.setRagUpdateTime(now);
        asset.setUpdateTime(now);
        videoAssetMapper.updateById(asset);
        refreshBatchAfterAssetDelete(batch, now);
    }

    private UploadAssetUploadVO toUploadAssetVO(VideoAsset asset) {
        UploadAssetUploadVO vo = new UploadAssetUploadVO();
        vo.setAssetId(asset.getId());
        vo.setOriginalFileName(asset.getOriginalFileName());
        vo.setEpisodeNo(asset.getEpisodeNo());
        vo.setBucket(cosPostPolicyService.bucket());
        vo.setRegion(cosPostPolicyService.region());
        vo.setObjectKey(asset.getCosKey());
        vo.setCosUrl(asset.getCosUrl());
        vo.setStatus(asset.getStatus());
        return vo;
    }

    private void applyDirectUploadParams(UploadAssetUploadVO vo) {
        vo.setUploadMethod("COS_SDK");
        vo.setUploadUrl(null);
        vo.setHeaders(Map.of());
        vo.setFormData(Map.of());
        vo.setExpiresAt(null);
    }

    private UploadAssetUploadVO buildCoverUpload(Long batchId,
                                                 String dramaTitle,
                                                 UploadBatchCreateRequest.CoverFile coverFile) {
        if (coverFile == null || !hasText(coverFile.getFileName())) {
            return null;
        }
        String objectKey = buildCoverObjectKey(batchId, dramaTitle, coverFile.getFileName());
        UploadAssetUploadVO vo = new UploadAssetUploadVO();
        vo.setOriginalFileName(coverFile.getFileName());
        vo.setBucket(cosPostPolicyService.bucket());
        vo.setRegion(cosPostPolicyService.region());
        vo.setObjectKey(objectKey);
        vo.setCosUrl(cosPostPolicyService.publicUrl(objectKey));
        vo.setStatus("CREATED");
        applyDirectUploadParams(vo);
        return vo;
    }

    private void applyUploadedCover(Drama drama, UploadBatchCompleteRequest req, LocalDateTime now) {
        if (drama == null || req == null) {
            return;
        }
        String coverUrl = "";
        String coverKey = req.getCoverKey();
        if (hasText(coverKey)) {
            String normalizedKey = normalizeCosKey(coverKey);
            coverUrl = cosPostPolicyService.publicUrl(normalizedKey);
            try {
                if (!cosPostPolicyService.objectExists(normalizedKey)) {
                    log.warn("COS 灏侀潰鏆傛湭閫氳繃 HEAD 鏍￠獙锛屼粛淇濆瓨鍒扮煭鍓? dramaId={}, key={}",
                            drama.getId(), normalizedKey);
                }
            } catch (Exception e) {
                log.warn("COS 灏侀潰 HEAD 鏍￠獙澶辫触锛屼粛淇濆瓨鍒扮煭鍓? dramaId={}, key={}, error={}",
                        drama.getId(), normalizedKey, e.getMessage());
            }
        } else if (hasText(req.getCoverUrl())) {
            coverUrl = req.getCoverUrl().trim();
        }
        if (!hasText(coverUrl) || coverUrl.equals(drama.getCoverUrl())) {
            return;
        }
        drama.setCoverUrl(coverUrl);
        drama.setUpdateTime(now);
        dramaMapper.updateById(drama);
    }

    public Map<String, Object> createCosAuthorization(Map<String, Object> request) {
        return cosPostPolicyService.buildSdkAuthorization(request);
    }

    @Transactional
    public CosImportVO importCosVideos(CosImportRequest req) {
        LocalDateTime now = LocalDateTime.now();
        String dramaTitle = req.getDramaTitle().trim();
        List<CosImportRequest.VideoItem> videos = dedupeCosVideosKeepLatestByEpisode(req.getVideos());
        ResolvedVideoNaming batchNaming = resolveBatchVideoNaming(dramaTitle, videos);
        Drama drama = findOrCreateDrama(dramaTitle, batchNaming.dramaNo(), batchNaming.dramaCode(), batchNaming.originalFolderName());

        UploadBatch batch = new UploadBatch();
        batch.setDramaId(drama.getId());
        batch.setDramaTitle(dramaTitle);
        batch.setStatus("READY_FOR_RAG");
        batch.setFileCount(videos.size());
        batch.setCreateTime(now);
        batch.setUpdateTime(now);
        uploadBatchMapper.insert(batch);

        List<Long> assetIds = new ArrayList<>();
        List<Long> episodeIds = new ArrayList<>();
        for (int i = 0; i < videos.size(); i++) {
            CosImportRequest.VideoItem video = videos.get(i);
            Integer episodeNo = video.getEpisodeNo() != null && video.getEpisodeNo() > 0
                    ? video.getEpisodeNo()
                    : inferEpisodeNo(firstText(video.getOriginalFileName(), video.getNormalizedFileName(), basename(video.getCosKey())), i + 1);
            String cosKey = normalizeCosKey(video.getCosKey());
            String normalizedFileName = firstText(video.getNormalizedFileName(), basename(cosKey));
            ResolvedVideoNaming naming = resolveVideoNaming(
                    video,
                    normalizedFileName,
                    cosKey,
                    drama.getDramaNo(),
                    drama.getDramaCode(),
                    firstText(drama.getOriginalFolderName(), dramaTitle));
            String originalFileName = resolveOriginalFileName(video, naming.normalizedFileName(), cosKey);
            String cosUrl = hasText(video.getCosUrl()) ? video.getCosUrl().trim() : cosPostPolicyService.publicUrl(cosKey);

            Episode episode = findOrCreateEpisode(
                    drama.getId(),
                    episodeNo,
                    originalFileName,
                    naming.normalizedFileName(),
                    naming.backendKey(),
                    cosKey,
                    cosUrl);
            if (video.getDuration() != null && video.getDuration() > 0) {
                episode.setDuration(video.getDuration());
                episodeMapper.updateById(episode);
            }

            VideoAsset asset = new VideoAsset();
            asset.setBatchId(batch.getId());
            asset.setDramaId(drama.getId());
            asset.setEpisodeId(episode.getId());
            asset.setAssetType("SOURCE_VIDEO");
            asset.setDramaNo(naming.dramaNo());
            asset.setDramaCode(naming.dramaCode());
            asset.setEpisodeNo(episodeNo);
            asset.setOriginalFolderName(firstText(naming.originalFolderName(), dramaTitle));
            asset.setOriginalFileName(originalFileName);
            asset.setNormalizedFileName(naming.normalizedFileName());
            asset.setBackendKey(naming.backendKey());
            asset.setCosBucket(cosPostPolicyService.bucket());
            asset.setCosRegion(cosPostPolicyService.region());
            asset.setCosKey(cosKey);
            asset.setCosUrl(cosUrl);
            asset.setContentType(hasText(video.getContentType()) ? video.getContentType() : "video/mp4");
            asset.setFileSize(video.getFileSize());
            asset.setDuration(video.getDuration());
            asset.setStatus("UPLOADED");
            asset.setRagStatus("PENDING");
            asset.setRagTaskId(null);
            asset.setRagMessage("Ready for RAG");
            asset.setRagUpdateTime(now);
            asset.setCreateTime(now);
            asset.setUpdateTime(now);
            videoAssetMapper.insert(asset);

            upsertVideoNameMapping(video, drama, episode, asset, batch, now);
            markPreviousSourceVideosReplaced(drama.getId(), episodeNo, asset.getId(), asset.getCosKey(), now);
            verifyCosObjectBestEffort(asset);
            assetIds.add(asset.getId());
            episodeIds.add(episode.getId());
        }

        CosImportVO vo = new CosImportVO();
        vo.setBatchId(batch.getId());
        vo.setDramaId(drama.getId());
        vo.setStatus(batch.getStatus());
        vo.setAssetIds(assetIds);
        vo.setEpisodeIds(episodeIds);
        return vo;
    }

    @Transactional
    public UploadCompleteVO completeBatch(Long batchId, UploadBatchCompleteRequest req, UserAccount user) {
        UploadBatch batch = uploadBatchMapper.selectById(batchId);
        if (batch == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        ensureBatchOwner(batch, user);
        List<VideoAsset> assets = loadAssets(batchId, req == null ? null : req.getAssetIds());
        if (assets.isEmpty()) {
            throw new BusinessException(ResultCode.PARAM_VALIDATION_FAILED);
        }

        Drama drama = findOrCreateDrama(batch.getDramaTitle());
        List<Long> episodeIds = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        applyUploadedCover(drama, req, now);
        for (VideoAsset asset : assets) {
            if (!"UPLOADED".equals(asset.getStatus())) {
                verifyCosObjectBestEffort(asset);
            }
            Episode episode = findOrCreateEpisode(
                    drama.getId(),
                    asset.getEpisodeNo(),
                    asset.getOriginalFileName(),
                    asset.getNormalizedFileName(),
                    asset.getBackendKey(),
                    asset.getCosKey(),
                    asset.getCosUrl());
            episodeIds.add(episode.getId());
            markPreviousSourceVideosReplaced(drama.getId(), asset.getEpisodeNo(), asset.getId(), asset.getCosKey(), now);
            asset.setDramaId(drama.getId());
            asset.setEpisodeId(episode.getId());
            asset.setStatus("UPLOADED");
            asset.setRagStatus("PENDING");
            asset.setRagTaskId(null);
            asset.setRagMessage("Ready for RAG");
            asset.setRagUpdateTime(now);
            asset.setUpdateTime(now);
            videoAssetMapper.updateById(asset);
        }

        batch.setDramaId(drama.getId());
        batch.setStatus("READY_FOR_RAG");
        batch.setUpdateTime(now);
        uploadBatchMapper.updateById(batch);

        UploadCompleteVO vo = new UploadCompleteVO();
        vo.setBatchId(batch.getId());
        vo.setDramaId(drama.getId());
        vo.setTaskId(batch.getTaskId());
        vo.setStatus(batch.getStatus());
        vo.setEpisodeIds(episodeIds);
        return vo;
    }

    private void ensureBatchOwner(UploadBatch batch, UserAccount user) {
        Long ownerId = batch == null ? null : batch.getUserId();
        if (ownerId != null && (user == null || !ownerId.equals(user.getId()))) {
            throw new BusinessException(403, "只能操作自己上传的批次");
        }
    }

    private boolean isDeletableRagStatus(VideoAsset asset) {
        String ragStatus = asset.getRagStatus();
        if (ragStatus == null || ragStatus.isBlank()) {
            ragStatus = "PENDING";
        }
        ragStatus = ragStatus.toUpperCase();
        return "WAITING_UPLOAD".equals(ragStatus)
                || "PENDING".equals(ragStatus)
                || "FAILED".equals(ragStatus);
    }

    private void refreshBatchAfterAssetDelete(UploadBatch batch, LocalDateTime now) {
        Long remaining = videoAssetMapper.selectCount(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getBatchId, batch.getId())
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .ne(VideoAsset::getStatus, "DELETED"));
        int count = remaining == null ? 0 : remaining.intValue();
        batch.setFileCount(count);
        if (count == 0) {
            batch.setStatus("DELETED");
        }
        batch.setUpdateTime(now);
        uploadBatchMapper.updateById(batch);
    }

    private void verifyCosObjectBestEffort(VideoAsset asset) {
        try {
            if (!cosPostPolicyService.objectExists(asset.getCosKey())) {
                log.warn("COS 对象暂未通过 HEAD 校验，仍按前端直传成功继续建表: assetId={}, key={}",
                        asset.getId(), asset.getCosKey());
            }
        } catch (Exception e) {
            log.warn("COS 对象 HEAD 校验失败，仍按前端直传成功继续建表: assetId={}, key={}, error={}",
                    asset.getId(), asset.getCosKey(), e.getMessage());
        }
    }

    private List<VideoAsset> loadAssets(Long batchId, List<Long> assetIds) {
        LambdaQueryWrapper<VideoAsset> wrapper = new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getBatchId, batchId)
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .orderByAsc(VideoAsset::getEpisodeNo);
        if (assetIds != null && !assetIds.isEmpty()) {
            wrapper.in(VideoAsset::getId, assetIds);
        }
        return videoAssetMapper.selectList(wrapper);
    }

    private void markPreviousSourceVideosReplaced(Long dramaId, Integer episodeNo, Long currentAssetId, String currentCosKey, LocalDateTime now) {
        if (dramaId == null || episodeNo == null || currentAssetId == null) {
            return;
        }
        List<VideoAsset> previousAssets = videoAssetMapper.selectList(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .eq(VideoAsset::getDramaId, dramaId)
                .eq(VideoAsset::getEpisodeNo, episodeNo)
                .ne(VideoAsset::getId, currentAssetId)
                .in(VideoAsset::getStatus, List.of("UPLOADED", "COS_UPLOADED", "CREATED")));
        for (VideoAsset previous : previousAssets) {
            if (previous.getCosKey() != null && !previous.getCosKey().equals(currentCosKey)) {
                boolean deleted = cosPostPolicyService.deleteObjectBestEffort(previous.getCosKey());
                if (!deleted) {
                    log.warn("旧视频删除失败或未确认删除 assetId={}, key={}", previous.getId(), previous.getCosKey());
                }
            }
            previous.setStatus("REPLACED");
            previous.setUpdateTime(now);
            videoAssetMapper.updateById(previous);
        }
    }

    private record ResolvedVideoNaming(
            Integer dramaNo,
            String dramaCode,
            String originalFolderName,
            String normalizedFileName,
            String backendKey
    ) {
    }

    private ResolvedVideoNaming resolveBatchVideoNaming(String dramaTitle, List<CosImportRequest.VideoItem> videos) {
        Integer dramaNo = null;
        String dramaCode = null;
        String originalFolderName = null;
        for (CosImportRequest.VideoItem video : videos) {
            String cosKey = normalizeCosKey(video.getCosKey());
            String normalizedFileName = firstText(video.getNormalizedFileName(), basename(cosKey));
            ResolvedVideoNaming naming = resolveVideoNaming(video, normalizedFileName, cosKey, null, null, dramaTitle);
            if (dramaNo == null) {
                dramaNo = naming.dramaNo();
            }
            if (!hasText(dramaCode)) {
                dramaCode = naming.dramaCode();
            }
            if (!hasText(originalFolderName)) {
                originalFolderName = naming.originalFolderName();
            }
            if (dramaNo != null && hasText(dramaCode) && hasText(originalFolderName)) {
                break;
            }
        }
        return new ResolvedVideoNaming(
                dramaNo,
                firstText(dramaCode, dramaNo == null ? null : "episode" + String.format("%02d", dramaNo)),
                firstText(originalFolderName, dramaTitle),
                null,
                null);
    }

    private ResolvedVideoNaming resolveVideoNaming(CosImportRequest.VideoItem video,
                                                   String fallbackNormalizedFileName,
                                                   String cosKey,
                                                   Integer fallbackDramaNo,
                                                   String fallbackDramaCode,
                                                   String fallbackOriginalFolderName) {
        String normalizedFileName = firstText(video.getNormalizedFileName(), fallbackNormalizedFileName, basename(cosKey));
        Integer dramaNo = video.getDramaNo() != null && video.getDramaNo() > 0
                ? video.getDramaNo()
                : firstNonNull(fallbackDramaNo, inferDramaNo(firstText(video.getDramaCode(), normalizedFileName, cosKey)));
        String dramaCode = firstText(video.getDramaCode(), fallbackDramaCode,
                dramaNo == null ? null : "episode" + String.format("%02d", dramaNo));
        String originalFolderName = firstText(video.getOriginalFolderName(), video.getDramaTitle(), fallbackOriginalFolderName);
        String backendKey = firstText(video.getBackendKey(),
                hasText(dramaCode) && hasText(normalizedFileName) ? "video/" + dramaCode + "/" + normalizedFileName : null);
        return new ResolvedVideoNaming(dramaNo, dramaCode, originalFolderName, normalizedFileName, backendKey);
    }

    private void upsertVideoNameMapping(CosImportRequest.VideoItem video,
                                        Drama drama,
                                        Episode episode,
                                        VideoAsset asset,
                                        UploadBatch batch,
                                        LocalDateTime now) {
        String normalizedFileName = firstText(video.getNormalizedFileName(), asset.getNormalizedFileName(), basename(asset.getCosKey()));
        if (!hasText(normalizedFileName)) {
            return;
        }
        ResolvedVideoNaming naming = resolveVideoNaming(
                video,
                normalizedFileName,
                asset.getCosKey(),
                asset.getDramaNo(),
                asset.getDramaCode(),
                firstText(asset.getOriginalFolderName(), drama.getOriginalFolderName(), drama.getTitle()));

        VideoNameMapping mapping = videoNameMappingMapper.selectOne(new LambdaQueryWrapper<VideoNameMapping>()
                .eq(VideoNameMapping::getNormalizedFileName, normalizedFileName)
                .last("LIMIT 1"));
        if (mapping == null) {
            mapping = new VideoNameMapping();
            mapping.setCreateTime(now);
        }
        mapping.setDramaId(drama.getId());
        mapping.setEpisodeId(episode.getId());
        mapping.setVideoAssetId(asset.getId());
        mapping.setBatchId(batch.getId());
        mapping.setDramaNo(naming.dramaNo());
        mapping.setDramaCode(naming.dramaCode());
        mapping.setDramaTitle(drama.getTitle());
        mapping.setOriginalFolderName(naming.originalFolderName());
        mapping.setOriginalFileName(resolveOriginalFileName(video, naming.normalizedFileName(), asset.getCosKey()));
        mapping.setNormalizedFileName(naming.normalizedFileName());
        mapping.setEpisodeNo(asset.getEpisodeNo());
        mapping.setBackendKey(naming.backendKey());
        mapping.setCosKey(asset.getCosKey());
        mapping.setCosUrl(asset.getCosUrl());
        mapping.setFileSize(asset.getFileSize());
        mapping.setContentType(asset.getContentType());
        mapping.setUpdateTime(now);
        if (mapping.getId() == null) {
            videoNameMappingMapper.insert(mapping);
        } else {
            videoNameMappingMapper.updateById(mapping);
        }
    }

    private String resolveOriginalFileName(CosImportRequest.VideoItem video, String normalizedFileName, String cosKey) {
        String candidate = firstText(video.getOriginalFileName(), normalizedFileName, basename(cosKey));
        VideoNameMapping existing = findVideoNameMapping(normalizedFileName);
        if (existing != null
                && hasText(existing.getOriginalFileName())
                && isSameText(candidate, normalizedFileName)) {
            return existing.getOriginalFileName();
        }
        return candidate;
    }

    private VideoNameMapping findVideoNameMapping(String normalizedFileName) {
        if (!hasText(normalizedFileName)) {
            return null;
        }
        return videoNameMappingMapper.selectOne(new LambdaQueryWrapper<VideoNameMapping>()
                .eq(VideoNameMapping::getNormalizedFileName, normalizedFileName)
                .last("LIMIT 1"));
    }

    private boolean isSameText(String left, String right) {
        return hasText(left) && hasText(right) && left.trim().equalsIgnoreCase(right.trim());
    }

    private Integer firstNonNull(Integer... values) {
        for (Integer value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private Drama findOrCreateDrama(String title) {
        return findOrCreateDrama(title, null, null, null, null);
    }

    private Drama findOrCreateDrama(String title, String description) {
        return findOrCreateDrama(title, null, null, null, description);
    }

    private Drama findOrCreateDrama(String title, Integer dramaNo, String dramaCode, String originalFolderName) {
        return findOrCreateDrama(title, dramaNo, dramaCode, originalFolderName, null);
    }

    private Drama findOrCreateDrama(String title, Integer dramaNo, String dramaCode, String originalFolderName, String description) {
        Drama existing = dramaMapper.selectOne(new LambdaQueryWrapper<Drama>().eq(Drama::getTitle, title).last("LIMIT 1"));
        if (existing != null) {
            boolean changed = false;
            if (dramaNo != null && (existing.getDramaNo() == null || !existing.getDramaNo().equals(dramaNo))) {
                existing.setDramaNo(dramaNo);
                changed = true;
            }
            if (hasText(dramaCode) && !dramaCode.equals(existing.getDramaCode())) {
                existing.setDramaCode(dramaCode);
                changed = true;
            }
            if (hasText(originalFolderName) && !originalFolderName.equals(existing.getOriginalFolderName())) {
                existing.setOriginalFolderName(originalFolderName);
                changed = true;
            }
            if (hasText(description) && !description.trim().equals(existing.getDescription())) {
                existing.setDescription(description.trim());
                changed = true;
            }
            String defaultCoverUrl = defaultCoverUrl(
                    firstNonNull(dramaNo, existing.getDramaNo()),
                    firstText(dramaCode, existing.getDramaCode()));
            if (!hasText(existing.getCoverUrl()) && hasText(defaultCoverUrl)) {
                existing.setCoverUrl(defaultCoverUrl);
                changed = true;
            }
            if (changed) {
                existing.setUpdateTime(LocalDateTime.now());
                dramaMapper.updateById(existing);
            }
            return existing;
        }
        Drama drama = new Drama();
        drama.setTitle(title);
        drama.setDramaNo(dramaNo);
        drama.setDramaCode(dramaCode);
        drama.setOriginalFolderName(originalFolderName);
        drama.setDescription(hasText(description) ? description.trim() : "用户上传短剧");
        drama.setCoverUrl(defaultCoverUrl(dramaNo, dramaCode));
        drama.setTags("上传,RAG");
        drama.setStatus(1);
        drama.setCreateTime(LocalDateTime.now());
        drama.setUpdateTime(LocalDateTime.now());
        dramaMapper.insert(drama);
        return drama;
    }

    private String defaultCoverUrl(Integer dramaNo, String dramaCode) {
        String code = firstText(dramaCode, dramaNo == null ? null : "episode" + String.format("%02d", dramaNo));
        return hasText(code) ? "/assets/covers/" + code + ".png" : null;
    }

    private Episode findOrCreateEpisode(Long dramaId,
                                        Integer episodeNo,
                                        String fileName,
                                        String normalizedFileName,
                                        String backendKey,
                                        String cosKey,
                                        String videoUrl) {
        Episode existing = episodeMapper.selectOne(new LambdaQueryWrapper<Episode>()
                .eq(Episode::getDramaId, dramaId)
                .eq(Episode::getEpisodeNo, episodeNo)
                .last("LIMIT 1"));
        if (existing != null) {
            existing.setOriginalFileName(fileName);
            existing.setNormalizedFileName(normalizedFileName);
            existing.setBackendKey(backendKey);
            existing.setCosKey(cosKey);
            existing.setTitle(buildEpisodeTitle(episodeNo, fileName));
            existing.setVideoUrl(videoUrl);
            episodeMapper.updateById(existing);
            return existing;
        }
        Episode episode = new Episode();
        episode.setDramaId(dramaId);
        episode.setEpisodeNo(episodeNo);
        episode.setOriginalFileName(fileName);
        episode.setNormalizedFileName(normalizedFileName);
        episode.setBackendKey(backendKey);
        episode.setCosKey(cosKey);
        episode.setTitle(buildEpisodeTitle(episodeNo, fileName));
        episode.setVideoUrl(videoUrl);
        episode.setDuration(0);
        episode.setCreateTime(LocalDateTime.now());
        episodeMapper.insert(episode);
        return episode;
    }

    private String buildEpisodeTitle(Integer episodeNo, String fileName) {
        return "\u7b2c" + episodeNo + "\u96c6";
    }

    private Integer inferEpisodeNo(String fileName, int fallback) {
        String name = fileName == null ? "" : fileName;
        List<Pattern> patterns = List.of(
                Pattern.compile("(?i)^episode\\d{1,4}[_\\-](\\d{1,4})"),
                Pattern.compile("第\\s*(\\d{1,4})\\s*集"),
                Pattern.compile("(?i)ep(?:isode)?[_\\-\\s]*(\\d{1,4})"),
                Pattern.compile("(?i)episode[_\\-\\s]*(\\d{1,4})"),
                Pattern.compile("(^|[^\\d])(\\d{1,4})([^\\d]|$)")
        );
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(name);
            if (matcher.find()) {
                String n = matcher.group(matcher.groupCount() >= 2 ? 2 : 1);
                try {
                    int value = Integer.parseInt(n);
                    if (value > 0) {
                        return value;
                    }
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return fallback;
    }

    private Integer inferDramaNo(String text) {
        if (!hasText(text)) {
            return null;
        }
        Matcher matcher = Pattern.compile("(?i)episode(\\d{1,4})(?:[_\\-/]|$)").matcher(text);
        if (!matcher.find()) {
            return null;
        }
        try {
            int value = Integer.parseInt(matcher.group(1));
            return value > 0 ? value : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String buildObjectKey(Long batchId, String dramaTitle, Integer episodeNo, String fileName) {
        String ext = "";
        if (fileName != null) {
            int dot = fileName.lastIndexOf('.');
            if (dot >= 0) {
                ext = fileName.substring(dot).toLowerCase();
            }
        }
        if (ext.isBlank()) {
            ext = ".mp4";
        }
        String batchPart = batchId == null ? "batch_unknown" : "batch_" + batchId;
        return "uploads/" + safeSlug(dramaTitle) + "/" + batchPart + "/source/episode"
                + String.format("%02d", episodeNo) + ext;
    }

    private String buildCoverObjectKey(Long batchId, String dramaTitle, String fileName) {
        String batchPart = batchId == null ? "batch_unknown" : "batch_" + batchId;
        return "uploads/" + safeSlug(dramaTitle) + "/" + batchPart + "/cover/cover" + coverExtension(fileName);
    }

    private String coverExtension(String fileName) {
        String ext = "";
        if (fileName != null) {
            int dot = fileName.lastIndexOf('.');
            if (dot >= 0) {
                ext = fileName.substring(dot).toLowerCase();
            }
        }
        return List.of(".jpg", ".jpeg", ".png", ".webp").contains(ext) ? ext : ".jpg";
    }

    private String normalizeCosKey(String cosKey) {
        String text = cosKey == null ? "" : cosKey.trim().replace('\\', '/');
        int query = text.indexOf('?');
        if (query >= 0) {
            text = text.substring(0, query);
        }
        if (text.startsWith("http://") || text.startsWith("https://")) {
            int scheme = text.indexOf("://");
            int pathStart = text.indexOf('/', scheme + 3);
            text = pathStart >= 0 ? text.substring(pathStart + 1) : "";
        }
        while (text.startsWith("/")) {
            text = text.substring(1);
        }
        if (!hasText(text)) {
            throw new BusinessException(ResultCode.PARAM_VALIDATION_FAILED.getCode(), "cosKey 不能为空");
        }
        return text;
    }

    private String basename(String path) {
        String text = path == null ? "" : path.trim().replace('\\', '/');
        int query = text.indexOf('?');
        if (query >= 0) {
            text = text.substring(0, query);
        }
        int slash = text.lastIndexOf('/');
        return slash >= 0 ? text.substring(slash + 1) : text;
    }

    private String firstText(String... values) {
        for (String value : values) {
            if (hasText(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private String safeSlug(String text) {
        String base = text == null ? "drama" : text.trim();
        String ascii = base.chars()
                .mapToObj(c -> (c < 128 && (Character.isLetterOrDigit(c) || c == '-' || c == '_')) ? String.valueOf((char) c) : "_")
                .collect(Collectors.joining())
                .replaceAll("_+", "_")
                .replaceAll("^_+|_+$", "");
        if (ascii.isBlank()) {
            ascii = "drama_" + Integer.toHexString(base.hashCode());
        }
        return ascii;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
