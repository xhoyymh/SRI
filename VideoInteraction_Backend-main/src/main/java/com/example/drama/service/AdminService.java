package com.example.drama.service;

import com.example.drama.common.BusinessException;
import com.example.drama.common.ResultCode;
import com.example.drama.mapper.AiGenerationMapper;
import com.example.drama.mapper.EpisodeMapper;
import com.example.drama.mapper.HighlightMapper;
import com.example.drama.model.dto.AdminAiStoriesBatchRequest;
import com.example.drama.model.dto.AdminHighlightsBatchRequest;
import com.example.drama.model.entity.AiGeneration;
import com.example.drama.model.entity.Episode;
import com.example.drama.model.entity.Highlight;
import com.example.drama.model.vo.AdminAiStoriesInsertedVO;
import com.example.drama.model.vo.AdminInsertedVO;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 算法侧批量导入服务，对应后端文档 4.12。
 * 未提供的字段一律不写，交由数据库默认值（trigger_once=1、source=manual、content_type=TEXT、status=success、计数=0）。
 */
@Service
public class AdminService {

    private final HighlightMapper highlightMapper;
    private final AiGenerationMapper aiGenerationMapper;
    private final EpisodeMapper episodeMapper;

    public AdminService(HighlightMapper highlightMapper,
                        AiGenerationMapper aiGenerationMapper,
                        EpisodeMapper episodeMapper) {
        this.highlightMapper = highlightMapper;
        this.aiGenerationMapper = aiGenerationMapper;
        this.episodeMapper = episodeMapper;
    }

    /** 批量导入高光点；dramaId 由 episode 反查（highlight.drama_id 非空）。 */
    @Transactional
    public AdminInsertedVO batchHighlights(AdminHighlightsBatchRequest req) {
        Episode episode = episodeMapper.selectById(req.getEpisodeId());
        if (episode == null) {
            throw new BusinessException(ResultCode.RESOURCE_NOT_FOUND);
        }
        int inserted = 0;
        List<Long> ids = new ArrayList<>();
        if (req.getHighlights() != null) {
            for (AdminHighlightsBatchRequest.Item item : req.getHighlights()) {
                Highlight hl = new Highlight();
                hl.setDramaId(episode.getDramaId());
                hl.setEpisodeId(req.getEpisodeId());
                hl.setStartTime(item.getStartTime());
                hl.setEndTime(item.getEndTime());
                hl.setHighlightType(item.getHighlightType());
                hl.setTitle(item.getTitle());
                hl.setTriggerOnce(item.getTriggerOnce());
                hl.setInteractionConfig(jsonToString(item.getInteractionConfig()));
                inserted += highlightMapper.insert(hl);
                ids.add(hl.getId());
            }
        }
        AdminInsertedVO vo = new AdminInsertedVO();
        vo.setInserted(inserted);
        vo.setIds(ids);
        return vo;
    }

    /** 批量导入 AI 生成内容，返回插入条数与自增 id 列表。 */
    @Transactional
    public AdminAiStoriesInsertedVO batchAiStories(AdminAiStoriesBatchRequest req) {
        int inserted = 0;
        List<Long> ids = new ArrayList<>();
        if (req.getItems() != null) {
            for (AdminAiStoriesBatchRequest.Item item : req.getItems()) {
                AiGeneration gen = new AiGeneration();
                gen.setDramaId(resolveDramaId(item.getEpisodeId()));
                gen.setEpisodeId(item.getEpisodeId());
                gen.setHighlightId(item.getHighlightId());
                gen.setOptionCode(item.getOptionCode());
                gen.setContentType(item.getContentType());
                gen.setTitle(item.getTitle());
                gen.setContent(item.getContent());
                gen.setContentUrl(item.getContentUrl());
                inserted += aiGenerationMapper.insert(gen);
                ids.add(gen.getId());
            }
        }
        AdminAiStoriesInsertedVO vo = new AdminAiStoriesInsertedVO();
        vo.setInserted(inserted);
        vo.setIds(ids);
        return vo;
    }

    private Long resolveDramaId(Long episodeId) {
        if (episodeId == null) {
            return null;
        }
        Episode episode = episodeMapper.selectById(episodeId);
        return episode != null ? episode.getDramaId() : null;
    }

    /** JsonNode → 紧凑 JSON 字符串；null 透传（落库 NULL）。 */
    private String jsonToString(JsonNode node) {
        return node == null ? null : node.toString();
    }
}
