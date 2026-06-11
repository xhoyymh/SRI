package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.example.drama.common.BusinessException;
import com.example.drama.common.ResultCode;
import com.example.drama.mapper.AiGenerationMapper;
import com.example.drama.mapper.DramaMapper;
import com.example.drama.mapper.EpisodeMapper;
import com.example.drama.mapper.HighlightMapper;
import com.example.drama.mapper.HighlightStatMapper;
import com.example.drama.mapper.InteractionMapper;
import com.example.drama.mapper.VideoAssetMapper;
import com.example.drama.model.entity.AiGeneration;
import com.example.drama.model.entity.Drama;
import com.example.drama.model.entity.Episode;
import com.example.drama.model.entity.Highlight;
import com.example.drama.model.entity.HighlightStat;
import com.example.drama.model.entity.Interaction;
import com.example.drama.model.entity.VideoAsset;
import com.example.drama.model.vo.DramaDetailVO;
import com.example.drama.model.vo.DramaVO;
import com.example.drama.model.vo.EpisodeVO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class DramaService {

    private final DramaMapper dramaMapper;
    private final EpisodeMapper episodeMapper;
    private final VideoAssetMapper videoAssetMapper;
    private final HighlightMapper highlightMapper;
    private final HighlightStatMapper highlightStatMapper;
    private final InteractionMapper interactionMapper;
    private final AiGenerationMapper aiGenerationMapper;
    private final CosPostPolicyService cosPostPolicyService;

    public DramaService(DramaMapper dramaMapper,
                        EpisodeMapper episodeMapper,
                        VideoAssetMapper videoAssetMapper,
                        HighlightMapper highlightMapper,
                        HighlightStatMapper highlightStatMapper,
                        InteractionMapper interactionMapper,
                        AiGenerationMapper aiGenerationMapper,
                        CosPostPolicyService cosPostPolicyService) {
        this.dramaMapper = dramaMapper;
        this.episodeMapper = episodeMapper;
        this.videoAssetMapper = videoAssetMapper;
        this.highlightMapper = highlightMapper;
        this.highlightStatMapper = highlightStatMapper;
        this.interactionMapper = interactionMapper;
        this.aiGenerationMapper = aiGenerationMapper;
        this.cosPostPolicyService = cosPostPolicyService;
    }

    public List<DramaVO> listAll() {
        Set<Long> uploadedDramaIds = uploadedSourceVideos(null).stream()
                .map(VideoAsset::getDramaId)
                .filter(id -> id != null)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (uploadedDramaIds.isEmpty()) {
            return List.of();
        }
        List<Drama> dramas = dramaMapper.selectList(
                new LambdaQueryWrapper<Drama>()
                        .in(Drama::getId, uploadedDramaIds)
                        .eq(Drama::getStatus, 1)
        );
        return dramas.stream().map(this::convertToVO).collect(Collectors.toList());
    }

    public DramaDetailVO getDetail(Long dramaId) {
        Drama drama = dramaMapper.selectById(dramaId);
        List<VideoAsset> sourceVideos = uploadedSourceVideos(dramaId);
        if (drama == null || sourceVideos.isEmpty()) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }

        Set<Long> episodeIds = sourceVideos.stream()
                .map(VideoAsset::getEpisodeId)
                .filter(id -> id != null)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (episodeIds.isEmpty()) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        List<Episode> episodes = episodeMapper.selectList(
            new LambdaQueryWrapper<Episode>()
                    .eq(Episode::getDramaId, dramaId)
                    .in(Episode::getId, episodeIds)
                    .orderByAsc(Episode::getEpisodeNo)
        );

        DramaDetailVO vo = new DramaDetailVO();
        vo.setDramaId(drama.getId());
        vo.setTitle(drama.getTitle());
        vo.setDescription(drama.getDescription());
        vo.setCoverUrl(drama.getCoverUrl());
        if (drama.getTags() != null && !drama.getTags().isEmpty()) {
            vo.setTags(Arrays.asList(drama.getTags().split(",")));
        }
        vo.setEpisodes(episodes.stream().map(this::convertToEpisodeVO).collect(Collectors.toList()));
        return vo;
    }

    @Transactional
    public Map<String, Object> cleanupMissingSourceVideos() {
        List<VideoAsset> sourceVideos = videoAssetMapper.selectList(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .in(VideoAsset::getStatus, List.of("UPLOADED", "COS_UPLOADED"))
                .isNotNull(VideoAsset::getCosKey)
                .orderByAsc(VideoAsset::getId));

        LocalDateTime now = LocalDateTime.now();
        List<Long> missingEpisodeIds = new ArrayList<>();
        List<Long> missingAssetIds = new ArrayList<>();
        int checked = 0;
        int missing = 0;
        int checkFailed = 0;
        int clearedEpisodeUrls = 0;

        for (VideoAsset asset : sourceVideos) {
            if ("local".equalsIgnoreCase(asset.getCosBucket())) {
                continue;
            }
            checked++;
            boolean exists;
            try {
                exists = cosPostPolicyService.objectExists(asset.getCosKey());
            } catch (Exception e) {
                checkFailed++;
                continue;
            }
            if (exists) {
                continue;
            }

            missing++;
            missingAssetIds.add(asset.getId());
            if (asset.getEpisodeId() != null) {
                missingEpisodeIds.add(asset.getEpisodeId());
            }
            asset.setStatus("MISSING");
            asset.setUpdateTime(now);
            videoAssetMapper.updateById(asset);

            if (asset.getEpisodeId() != null && !hasOtherUploadedSource(asset.getEpisodeId(), asset.getId())) {
                episodeMapper.update(null, new LambdaUpdateWrapper<Episode>()
                        .eq(Episode::getId, asset.getEpisodeId())
                        .set(Episode::getVideoUrl, null));
                clearedEpisodeUrls++;
            }
        }

        CleanupCounts counts = cleanupEpisodeResults(missingEpisodeIds, now);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("checked", checked);
        result.put("missing", missing);
        result.put("checkFailed", checkFailed);
        result.put("missingAssetIds", missingAssetIds);
        result.put("missingEpisodeIds", missingEpisodeIds.stream().distinct().collect(Collectors.toList()));
        result.put("clearedEpisodeUrls", clearedEpisodeUrls);
        result.put("deletedHighlights", counts.deletedHighlights);
        result.put("deletedHighlightStats", counts.deletedHighlightStats);
        result.put("deletedInteractions", counts.deletedInteractions);
        result.put("deletedAiGenerations", counts.deletedAiGenerations);
        result.put("markedGeneratedAssetsMissing", counts.markedGeneratedAssetsMissing);
        return result;
    }

    private DramaVO convertToVO(Drama drama) {
        DramaVO vo = new DramaVO();
        vo.setDramaId(drama.getId());
        vo.setTitle(drama.getTitle());
        vo.setDescription(drama.getDescription());
        vo.setCoverUrl(drama.getCoverUrl());
        if (drama.getTags() != null && !drama.getTags().isEmpty()) {
            vo.setTags(Arrays.asList(drama.getTags().split(",")));
        }
        vo.setEpisodeCount((int) uploadedSourceVideos(drama.getId()).stream()
                .map(VideoAsset::getEpisodeId)
                .filter(id -> id != null)
                .distinct()
                .count());
        return vo;
    }

    private List<VideoAsset> uploadedSourceVideos(Long dramaId) {
        LambdaQueryWrapper<VideoAsset> wrapper = new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .eq(VideoAsset::getStatus, "UPLOADED")
                .isNotNull(VideoAsset::getDramaId)
                .orderByAsc(VideoAsset::getEpisodeNo);
        if (dramaId != null) {
            wrapper.eq(VideoAsset::getDramaId, dramaId);
        }
        return videoAssetMapper.selectList(wrapper);
    }

    private boolean hasOtherUploadedSource(Long episodeId, Long excludedAssetId) {
        LambdaQueryWrapper<VideoAsset> wrapper = new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .eq(VideoAsset::getStatus, "UPLOADED")
                .eq(VideoAsset::getEpisodeId, episodeId);
        if (excludedAssetId != null) {
            wrapper.ne(VideoAsset::getId, excludedAssetId);
        }
        return videoAssetMapper.selectCount(wrapper) > 0;
    }

    private CleanupCounts cleanupEpisodeResults(List<Long> episodeIds, LocalDateTime now) {
        CleanupCounts counts = new CleanupCounts();
        List<Long> uniqueEpisodeIds = episodeIds == null
                ? List.of()
                : episodeIds.stream().filter(id -> id != null).distinct().collect(Collectors.toList());
        if (uniqueEpisodeIds.isEmpty()) {
            return counts;
        }

        List<Highlight> ragHighlights = highlightMapper.selectList(new LambdaQueryWrapper<Highlight>()
                .in(Highlight::getEpisodeId, uniqueEpisodeIds)
                .eq(Highlight::getSource, "rag"));
        List<Long> highlightIds = ragHighlights.stream().map(Highlight::getId).collect(Collectors.toList());
        if (!highlightIds.isEmpty()) {
            counts.deletedHighlightStats = highlightStatMapper.delete(new LambdaQueryWrapper<HighlightStat>()
                    .in(HighlightStat::getHighlightId, highlightIds));
            counts.deletedInteractions = interactionMapper.delete(new LambdaQueryWrapper<Interaction>()
                    .in(Interaction::getHighlightId, highlightIds));
            counts.deletedHighlights = highlightMapper.delete(new LambdaQueryWrapper<Highlight>()
                    .in(Highlight::getId, highlightIds));
        }
        counts.deletedAiGenerations = aiGenerationMapper.delete(new LambdaQueryWrapper<AiGeneration>()
                .in(AiGeneration::getEpisodeId, uniqueEpisodeIds));

        List<VideoAsset> generatedAssets = videoAssetMapper.selectList(new LambdaQueryWrapper<VideoAsset>()
                .ne(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .in(VideoAsset::getEpisodeId, uniqueEpisodeIds)
                .ne(VideoAsset::getStatus, "MISSING"));
        for (VideoAsset asset : generatedAssets) {
            asset.setStatus("MISSING");
            asset.setUpdateTime(now);
            videoAssetMapper.updateById(asset);
            counts.markedGeneratedAssetsMissing++;
        }
        return counts;
    }

    private EpisodeVO convertToEpisodeVO(Episode episode) {
        EpisodeVO vo = new EpisodeVO();
        vo.setEpisodeId(episode.getId());
        vo.setEpisodeNo(episode.getEpisodeNo());
        vo.setTitle(episode.getTitle());
        vo.setDuration(episode.getDuration());
        return vo;
    }

    private static class CleanupCounts {
        private int deletedHighlights;
        private int deletedHighlightStats;
        private int deletedInteractions;
        private int deletedAiGenerations;
        private int markedGeneratedAssetsMissing;
    }
}
