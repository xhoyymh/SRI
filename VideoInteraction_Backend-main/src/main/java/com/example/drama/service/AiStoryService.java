package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.drama.common.BusinessException;
import com.example.drama.common.ResultCode;
import com.example.drama.mapper.AiGenerationCommentMapper;
import com.example.drama.mapper.AiGenerationLikeMapper;
import com.example.drama.mapper.AiGenerationMapper;
import com.example.drama.mapper.EpisodeMapper;
import com.example.drama.mapper.VideoAssetMapper;
import com.example.drama.model.dto.AiStoryGenerateRequest;
import com.example.drama.model.dto.CommentRequest;
import com.example.drama.model.entity.AiGeneration;
import com.example.drama.model.entity.AiGenerationComment;
import com.example.drama.model.entity.AiGenerationLike;
import com.example.drama.model.entity.Episode;
import com.example.drama.model.entity.VideoAsset;
import com.example.drama.model.vo.*;
import com.example.drama.service.ai.AiStoryClient;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * AI 剧情生成 + 社交（点赞/评论）服务。对应后端文档 4.8–4.11。
 */
@Service
public class AiStoryService {

    private final AiGenerationMapper aiGenerationMapper;
    private final AiGenerationLikeMapper aiGenerationLikeMapper;
    private final AiGenerationCommentMapper aiGenerationCommentMapper;
    private final EpisodeMapper episodeMapper;
    private final VideoAssetMapper videoAssetMapper;
    private final CosPostPolicyService cosPostPolicyService;
    private final AiStoryClient aiStoryClient;

    public AiStoryService(AiGenerationMapper aiGenerationMapper,
                          AiGenerationLikeMapper aiGenerationLikeMapper,
                          AiGenerationCommentMapper aiGenerationCommentMapper,
                          EpisodeMapper episodeMapper,
                          VideoAssetMapper videoAssetMapper,
                          CosPostPolicyService cosPostPolicyService,
                          AiStoryClient aiStoryClient) {
        this.aiGenerationMapper = aiGenerationMapper;
        this.aiGenerationLikeMapper = aiGenerationLikeMapper;
        this.aiGenerationCommentMapper = aiGenerationCommentMapper;
        this.episodeMapper = episodeMapper;
        this.videoAssetMapper = videoAssetMapper;
        this.cosPostPolicyService = cosPostPolicyService;
        this.aiStoryClient = aiStoryClient;
    }

    /** 4.8 生成剧情并落库（默认 Mock，contentType=TEXT）。 */
    @Transactional
    public AiStoryVO generate(AiStoryGenerateRequest req) {
        AiStoryClient.Generated g = aiStoryClient.generate(
                req.getEpisodeId(), req.getHighlightId(), req.getOptionCode(), req.getPrompt());

        AiGeneration entity = new AiGeneration();
        entity.setDeviceId(req.getDeviceId());
        entity.setDramaId(resolveDramaId(req.getDramaId(), req.getEpisodeId()));
        entity.setEpisodeId(req.getEpisodeId());
        entity.setHighlightId(req.getHighlightId());
        entity.setOptionCode(req.getOptionCode());
        entity.setPrompt(req.getPrompt());
        entity.setContentType(g.contentType);
        entity.setTitle(g.title);
        entity.setContent(g.content);
        entity.setContentUrl(g.contentUrl);
        entity.setStatus(g.status);
        entity.setLikeCount(0);
        entity.setCommentCount(0);
        entity.setCreateTime(LocalDateTime.now());
        aiGenerationMapper.insert(entity);

        AiStoryVO vo = new AiStoryVO();
        vo.setGenerationId(entity.getId());
        vo.setContentType(entity.getContentType());
        vo.setTitle(entity.getTitle());
        vo.setContent(entity.getContent());
        vo.setContentUrl(entity.getContentUrl());
        vo.setStatus(entity.getStatus());
        vo.setLikeCount(entity.getLikeCount());
        vo.setCommentCount(entity.getCommentCount());
        return vo;
    }

    /** 4.9 详情，含当前设备是否已点赞；不存在→1002。 */
    public AiStoryDetailVO getDetail(Long generationId, String deviceId) {
        AiGeneration entity = aiGenerationMapper.selectById(generationId);
        if (entity == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        AiStoryDetailVO vo = new AiStoryDetailVO();
        vo.setGenerationId(entity.getId());
        vo.setContentType(entity.getContentType());
        vo.setTitle(entity.getTitle());
        vo.setContent(entity.getContent());
        vo.setContentUrl(resolvePlayableContentUrl(entity));
        vo.setLikeCount(entity.getLikeCount());
        vo.setCommentCount(entity.getCommentCount());
        vo.setLiked(deviceId != null && !deviceId.isEmpty() && isLiked(generationId, deviceId));
        return vo;
    }

    /** 4.10 点赞，唯一键幂等：已赞则不再 +1。 */
    @Transactional
    public LikeVO like(Long generationId, String deviceId) {
        AiGeneration entity = aiGenerationMapper.selectById(generationId);
        if (entity == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        int likeCount = entity.getLikeCount() == null ? 0 : entity.getLikeCount();
        if (!isLiked(generationId, deviceId)) {
            try {
                AiGenerationLike likeRow = new AiGenerationLike();
                likeRow.setGenerationId(generationId);
                likeRow.setDeviceId(deviceId);
                likeRow.setCreateTime(LocalDateTime.now());
                aiGenerationLikeMapper.insert(likeRow);
                likeCount += 1;
                entity.setLikeCount(likeCount);
                aiGenerationMapper.updateById(entity);
            } catch (DuplicateKeyException ignored) {
                // 并发下唯一键冲突：视为已赞，计数不变
            }
        }
        return buildLikeVO(generationId, likeCount, true);
    }

    /** 4.10 取消点赞：删除点赞记录并 -1（不低于 0）。 */
    @Transactional
    public LikeVO unlike(Long generationId, String deviceId) {
        AiGeneration entity = aiGenerationMapper.selectById(generationId);
        if (entity == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        int likeCount = entity.getLikeCount() == null ? 0 : entity.getLikeCount();
        LambdaQueryWrapper<AiGenerationLike> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AiGenerationLike::getGenerationId, generationId);
        wrapper.eq(AiGenerationLike::getDeviceId, deviceId);
        int deleted = aiGenerationLikeMapper.delete(wrapper);
        if (deleted > 0) {
            likeCount = Math.max(0, likeCount - 1);
            entity.setLikeCount(likeCount);
            aiGenerationMapper.updateById(entity);
        }
        return buildLikeVO(generationId, likeCount, false);
    }

    /** 4.11 GET 评论分页，最新在前。 */
    public CommentListVO listComments(Long generationId, long page, long size) {
        Page<AiGenerationComment> pageReq = new Page<>(page, size);
        LambdaQueryWrapper<AiGenerationComment> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AiGenerationComment::getGenerationId, generationId);
        wrapper.orderByDesc(AiGenerationComment::getCreateTime);
        wrapper.orderByDesc(AiGenerationComment::getId);
        Page<AiGenerationComment> result = aiGenerationCommentMapper.selectPage(pageReq, wrapper);

        List<CommentItemVO> list = result.getRecords().stream().map(c -> {
            CommentItemVO item = new CommentItemVO();
            item.setCommentId(c.getId());
            item.setNickname(c.getNickname());
            item.setContent(c.getContent());
            item.setCreateTime(c.getCreateTime());
            return item;
        }).collect(Collectors.toList());

        CommentListVO vo = new CommentListVO();
        vo.setList(list);
        vo.setTotal(result.getTotal());
        return vo;
    }

    /** 4.11 POST 发表评论；不存在→1002（content 校验在 Controller @Valid）。 */
    @Transactional
    public CommentCreateVO addComment(Long generationId, CommentRequest req) {
        AiGeneration entity = aiGenerationMapper.selectById(generationId);
        if (entity == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        AiGenerationComment comment = new AiGenerationComment();
        comment.setGenerationId(generationId);
        comment.setDeviceId(req.getDeviceId());
        comment.setNickname(req.getNickname());
        comment.setContent(req.getContent());
        comment.setCreateTime(LocalDateTime.now());
        aiGenerationCommentMapper.insert(comment);

        int commentCount = entity.getCommentCount() == null ? 0 : entity.getCommentCount();
        entity.setCommentCount(commentCount + 1);
        aiGenerationMapper.updateById(entity);

        CommentCreateVO vo = new CommentCreateVO();
        vo.setCommentId(comment.getId());
        vo.setCreateTime(comment.getCreateTime());
        return vo;
    }

    // ---- 内部工具 ----

    private boolean isLiked(Long generationId, String deviceId) {
        LambdaQueryWrapper<AiGenerationLike> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AiGenerationLike::getGenerationId, generationId);
        wrapper.eq(AiGenerationLike::getDeviceId, deviceId);
        return aiGenerationLikeMapper.selectCount(wrapper) > 0;
    }

    private LikeVO buildLikeVO(Long generationId, int likeCount, boolean liked) {
        LikeVO vo = new LikeVO();
        vo.setGenerationId(generationId);
        vo.setLikeCount(likeCount);
        vo.setLiked(liked);
        return vo;
    }

    /** 优先用入参 dramaId；缺省则按 episode 反查，仍无则置空（drama_id 可空）。 */
    private Long resolveDramaId(Long dramaId, Long episodeId) {
        if (dramaId != null) {
            return dramaId;
        }
        if (episodeId != null) {
            Episode episode = episodeMapper.selectById(episodeId);
            if (episode != null) {
                return episode.getDramaId();
            }
        }
        return null;
    }

    private String resolvePlayableContentUrl(AiGeneration entity) {
        if (entity == null || entity.getId() == null) {
            return entity == null ? null : entity.getContentUrl();
        }
        VideoAsset asset = videoAssetMapper.selectOne(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getGenerationId, entity.getId())
                .orderByDesc(VideoAsset::getId)
                .last("LIMIT 1"));
        if (asset != null && asset.getCosKey() != null && !asset.getCosKey().isBlank()) {
            return cosPostPolicyService.buildPlayableGetUrl(asset.getCosKey());
        }
        return entity.getContentUrl();
    }
}
