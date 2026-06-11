package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.drama.mapper.HighlightMapper;
import com.example.drama.model.entity.Highlight;
import com.example.drama.model.vo.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class HighlightService {

    private final HighlightMapper highlightMapper;
    private final ObjectMapper objectMapper;

    public HighlightService(HighlightMapper highlightMapper) {
        this.highlightMapper = highlightMapper;
        // 忽略未知字段：DB 里的配置 JSON 若比代码多出字段（分仓/版本差异），不致整段解析失败
        this.objectMapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    public List<HighlightVO> getByEpisodeId(Long episodeId) {
        LambdaQueryWrapper<Highlight> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Highlight::getEpisodeId, episodeId);
        wrapper.orderByAsc(Highlight::getStartTime);

        List<Highlight> highlights = highlightMapper.selectList(wrapper);
        return highlights.stream().map(this::convertToVO).collect(Collectors.toList());
    }

    private HighlightVO convertToVO(Highlight highlight) {
        HighlightVO vo = new HighlightVO();
        vo.setHighlightId(highlight.getId());
        vo.setEpisodeId(highlight.getEpisodeId());
        vo.setStartTime(highlight.getStartTime());
        vo.setEndTime(highlight.getEndTime());
        vo.setHighlightType(highlight.getHighlightType());
        vo.setTitle(highlight.getTitle());
        vo.setTriggerOnce(highlight.getTriggerOnce() != null && highlight.getTriggerOnce() == 1);

        if (highlight.getInteractionConfig() != null && !highlight.getInteractionConfig().isEmpty()) {
            vo.setInteractionConfig(parseInteractionConfig(highlight.getInteractionConfig()));
        }

        return vo;
    }

    private JsonNode parseInteractionConfig(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
