package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.drama.common.BusinessException;
import com.example.drama.common.ResultCode;
import com.example.drama.mapper.EpisodeMapper;
import com.example.drama.mapper.VideoAssetMapper;
import com.example.drama.model.entity.Episode;
import com.example.drama.model.entity.VideoAsset;
import com.example.drama.model.vo.EpisodeDetailVO;
import org.springframework.stereotype.Service;

@Service
public class EpisodeService {

    private final EpisodeMapper episodeMapper;
    private final VideoAssetMapper videoAssetMapper;
    private final CosPostPolicyService cosPostPolicyService;

    public EpisodeService(EpisodeMapper episodeMapper,
                          VideoAssetMapper videoAssetMapper,
                          CosPostPolicyService cosPostPolicyService) {
        this.episodeMapper = episodeMapper;
        this.videoAssetMapper = videoAssetMapper;
        this.cosPostPolicyService = cosPostPolicyService;
    }

    public EpisodeDetailVO getDetail(Long episodeId) {
        Episode episode = episodeMapper.selectById(episodeId);
        if (episode == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }

        EpisodeDetailVO vo = new EpisodeDetailVO();
        vo.setEpisodeId(episode.getId());
        vo.setDramaId(episode.getDramaId());
        vo.setEpisodeNo(episode.getEpisodeNo());
        vo.setTitle(episode.getTitle());
        vo.setVideoUrl(resolvePlayableUrl(episode));
        vo.setDuration(episode.getDuration());
        return vo;
    }

    private String resolvePlayableUrl(Episode episode) {
        VideoAsset asset = videoAssetMapper.selectOne(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getAssetType, "SOURCE_VIDEO")
                .eq(VideoAsset::getStatus, "UPLOADED")
                .eq(VideoAsset::getEpisodeId, episode.getId())
                .orderByDesc(VideoAsset::getUpdateTime)
                .last("LIMIT 1"));
        if (asset != null && asset.getCosKey() != null && !asset.getCosKey().isBlank()) {
            if ("local".equalsIgnoreCase(asset.getCosBucket())) {
                return asset.getCosUrl();
            }
            return cosPostPolicyService.buildPlayableGetUrl(asset.getCosKey());
        }
        return episode.getVideoUrl();
    }
}
