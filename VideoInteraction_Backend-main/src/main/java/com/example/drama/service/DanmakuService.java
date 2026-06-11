package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.drama.common.BusinessException;
import com.example.drama.mapper.EpisodeDanmakuMapper;
import com.example.drama.mapper.EpisodeMapper;
import com.example.drama.model.dto.EpisodeDanmakuRequest;
import com.example.drama.model.entity.Episode;
import com.example.drama.model.entity.EpisodeDanmaku;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.vo.EpisodeDanmakuVO;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class DanmakuService {
    private final EpisodeDanmakuMapper danmakuMapper;
    private final EpisodeMapper episodeMapper;

    public DanmakuService(EpisodeDanmakuMapper danmakuMapper, EpisodeMapper episodeMapper) {
        this.danmakuMapper = danmakuMapper;
        this.episodeMapper = episodeMapper;
    }

    public List<EpisodeDanmakuVO> list(Long episodeId, long size) {
        ensureEpisode(episodeId);
        Page<EpisodeDanmaku> page = new Page<>(1, Math.max(1, Math.min(500, size)));
        Page<EpisodeDanmaku> result = danmakuMapper.selectPage(page, new LambdaQueryWrapper<EpisodeDanmaku>()
                .eq(EpisodeDanmaku::getEpisodeId, episodeId)
                .orderByAsc(EpisodeDanmaku::getCurrentTime)
                .orderByAsc(EpisodeDanmaku::getId));
        return result.getRecords().stream().map(this::toVO).collect(Collectors.toList());
    }

    public EpisodeDanmakuVO add(Long episodeId, UserAccount user, EpisodeDanmakuRequest request) {
        Episode episode = ensureEpisode(episodeId);
        String clientDanmakuId = normalizeClientId(request.getClientDanmakuId());
        if (clientDanmakuId != null) {
            EpisodeDanmaku existing = findByClientId(user.getId(), clientDanmakuId);
            if (existing != null) return toVO(existing);
        }
        EpisodeDanmaku danmaku = new EpisodeDanmaku();
        danmaku.setEpisodeId(episodeId);
        danmaku.setDramaId(request.getDramaId() != null ? request.getDramaId() : episode.getDramaId());
        danmaku.setUserId(user.getId());
        danmaku.setDeviceId(request.getDeviceId());
        danmaku.setNickname(user.getUsername());
        danmaku.setContent(normalizeContent(request.getContent()));
        danmaku.setCurrentTime(toSeconds(request.getCurrentTime()));
        danmaku.setClientDanmakuId(clientDanmakuId);
        danmaku.setCreateTime(LocalDateTime.now());
        try {
            danmakuMapper.insert(danmaku);
        } catch (DuplicateKeyException e) {
            EpisodeDanmaku existing = clientDanmakuId == null ? null : findByClientId(user.getId(), clientDanmakuId);
            if (existing != null) return toVO(existing);
            throw e;
        }
        return toVO(danmaku);
    }

    private Episode ensureEpisode(Long episodeId) {
        Episode episode = episodeId == null ? null : episodeMapper.selectById(episodeId);
        if (episode == null) throw new BusinessException(1002, "剧集不存在");
        return episode;
    }

    private EpisodeDanmaku findByClientId(Long userId, String clientDanmakuId) {
        return danmakuMapper.selectOne(new LambdaQueryWrapper<EpisodeDanmaku>()
                .eq(EpisodeDanmaku::getUserId, userId)
                .eq(EpisodeDanmaku::getClientDanmakuId, clientDanmakuId)
                .last("LIMIT 1"));
    }

    private String normalizeContent(String content) {
        String value = content == null ? "" : content.trim();
        if (value.isEmpty()) throw new BusinessException(1001, "请输入弹幕内容");
        return value.length() > 120 ? value.substring(0, 120) : value;
    }

    private BigDecimal toSeconds(Double value) {
        double seconds = value == null || !Double.isFinite(value) ? 0 : Math.max(0, value);
        return BigDecimal.valueOf(seconds).setScale(3, RoundingMode.HALF_UP);
    }

    private String normalizeClientId(String clientId) {
        String value = clientId == null ? "" : clientId.trim();
        return value.isEmpty() ? null : value.substring(0, Math.min(64, value.length()));
    }

    private EpisodeDanmakuVO toVO(EpisodeDanmaku danmaku) {
        EpisodeDanmakuVO vo = new EpisodeDanmakuVO();
        vo.setDanmakuId(danmaku.getId());
        vo.setDramaId(danmaku.getDramaId());
        vo.setEpisodeId(danmaku.getEpisodeId());
        vo.setNickname(danmaku.getNickname());
        vo.setContent(danmaku.getContent());
        vo.setCurrentTime(danmaku.getCurrentTime() == null ? 0 : danmaku.getCurrentTime().doubleValue());
        vo.setCreateTime(danmaku.getCreateTime());
        return vo;
    }
}
