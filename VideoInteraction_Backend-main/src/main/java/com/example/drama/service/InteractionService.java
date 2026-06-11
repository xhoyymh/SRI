package com.example.drama.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.drama.mapper.HighlightMapper;
import com.example.drama.mapper.HighlightStatMapper;
import com.example.drama.mapper.InteractionMapper;
import com.example.drama.model.dto.InteractionRequest;
import com.example.drama.model.dto.InteractionResponse;
import com.example.drama.model.entity.Highlight;
import com.example.drama.model.entity.HighlightStat;
import com.example.drama.model.entity.Interaction;
import com.example.drama.model.entity.UserAccount;
import com.example.drama.model.vo.*;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class InteractionService {

    private final InteractionMapper interactionMapper;
    private final HighlightStatMapper highlightStatMapper;
    private final HighlightMapper highlightMapper;
    private final ObjectMapper objectMapper;

    public InteractionService(InteractionMapper interactionMapper, HighlightStatMapper highlightStatMapper, HighlightMapper highlightMapper) {
        this.interactionMapper = interactionMapper;
        this.highlightStatMapper = highlightStatMapper;
        this.highlightMapper = highlightMapper;
        // 忽略未知字段，避免配置 JSON 多字段时解析失败
        this.objectMapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    @Transactional
    public InteractionResponse report(InteractionRequest request, UserAccount user) {
        // 1. 插入interaction明细
        Interaction interaction = new Interaction();
        interaction.setDeviceId(request.getDeviceId());
        if (user != null) {
            interaction.setUserId(user.getId());
        }
        interaction.setDramaId(request.getDramaId());
        interaction.setEpisodeId(request.getEpisodeId());
        interaction.setHighlightId(request.getHighlightId());
        interaction.setInteractionType(request.getInteractionType());
        interaction.setOptionCode(request.getOptionCode());
        interaction.setContent(request.getContent());
        interaction.setCreateTime(LocalDateTime.now());
        interactionMapper.insert(interaction);

        // 2. upsert highlight_stat
        String optionCode = request.getOptionCode() != null ? request.getOptionCode() : "default";

        LambdaQueryWrapper<HighlightStat> statWrapper = new LambdaQueryWrapper<>();
        statWrapper.eq(HighlightStat::getHighlightId, request.getHighlightId());
        statWrapper.eq(HighlightStat::getOptionCode, optionCode);
        HighlightStat existingStat = highlightStatMapper.selectOne(statWrapper);

        if (existingStat != null) {
            existingStat.setCount(existingStat.getCount() + 1);
            existingStat.setUpdateTime(LocalDateTime.now());
            highlightStatMapper.updateById(existingStat);
        } else {
            // 从highlight的interactionConfig中获取label
            Highlight highlight = highlightMapper.selectById(request.getHighlightId());
            String label = optionCode;
            if (highlight != null && highlight.getInteractionConfig() != null) {
                label = extractLabelFromConfig(highlight.getInteractionConfig(), optionCode);
            }

            HighlightStat newStat = new HighlightStat();
            newStat.setHighlightId(request.getHighlightId());
            newStat.setOptionCode(optionCode);
            newStat.setLabel(label);
            newStat.setCount(1);
            newStat.setUpdateTime(LocalDateTime.now());
            highlightStatMapper.insert(newStat);
            existingStat = newStat;
        }

        // 3. 返回当前统计
        InteractionResponse response = new InteractionResponse();
        response.setHighlightId(request.getHighlightId());
        response.setOptionCode(optionCode);
        response.setCurrentCount(existingStat.getCount());
        HighlightStatVO stat = getHighlightStat(request.getHighlightId());
        response.setTotalCount(stat.getTotalCount());
        response.setParticipantCount(stat.getParticipantCount());
        return response;
    }

    public HighlightStatVO getHighlightStat(Long highlightId) {
        LambdaQueryWrapper<HighlightStat> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(HighlightStat::getHighlightId, highlightId);
        List<HighlightStat> stats = highlightStatMapper.selectList(wrapper);

        HighlightStatVO vo = new HighlightStatVO();
        vo.setHighlightId(highlightId);

        int total = 0;
        List<OptionStatVO> options = new ArrayList<>();
        for (HighlightStat stat : stats) {
            OptionStatVO opt = new OptionStatVO();
            opt.setOptionCode(stat.getOptionCode());
            opt.setLabel(stat.getLabel());
            opt.setCount(stat.getCount());
            options.add(opt);
            total += stat.getCount();
        }
        vo.setTotalCount(total);
        vo.setParticipantCount(countParticipants(highlightId));
        vo.setOptions(options);
        return vo;
    }

    private int countParticipants(Long highlightId) {
        List<Interaction> interactions = interactionMapper.selectList(new LambdaQueryWrapper<Interaction>()
                .eq(Interaction::getHighlightId, highlightId));
        Set<String> participants = new HashSet<>();
        for (Interaction interaction : interactions) {
            if (interaction.getUserId() != null) {
                participants.add("u:" + interaction.getUserId());
            } else if (interaction.getDeviceId() != null && !interaction.getDeviceId().isBlank()) {
                participants.add("d:" + interaction.getDeviceId());
            }
        }
        return participants.size();
    }

    public List<EpisodeInteractionStatVO> getEpisodeInteractionStats(Long episodeId) {
        // 先找到该集的所有highlightId
        LambdaQueryWrapper<Highlight> hlWrapper = new LambdaQueryWrapper<>();
        hlWrapper.eq(Highlight::getEpisodeId, episodeId);
        hlWrapper.select(Highlight::getId);
        List<Long> highlightIds = highlightMapper.selectList(hlWrapper)
                .stream()
                .map(Highlight::getId)
                .collect(Collectors.toList());

        if (highlightIds.isEmpty()) {
            return new ArrayList<>();
        }

        // 查询这些highlight的统计
        LambdaQueryWrapper<HighlightStat> statWrapper = new LambdaQueryWrapper<>();
        statWrapper.in(HighlightStat::getHighlightId, highlightIds);
        List<HighlightStat> allStats = highlightStatMapper.selectList(statWrapper);

        // 按highlightId分组
        Map<Long, List<HighlightStat>> statMap = allStats.stream()
                .collect(Collectors.groupingBy(HighlightStat::getHighlightId));

        List<EpisodeInteractionStatVO> result = new ArrayList<>();
        for (Long hlId : highlightIds) {
            EpisodeInteractionStatVO vo = new EpisodeInteractionStatVO();
            vo.setHighlightId(hlId);

            List<HighlightStat> hlStats = statMap.getOrDefault(hlId, new ArrayList<>());
            List<SimpleOptionStatVO> options = hlStats.stream()
                    .map(s -> {
                        SimpleOptionStatVO opt = new SimpleOptionStatVO();
                        opt.setOptionCode(s.getOptionCode());
                        opt.setCount(s.getCount());
                        return opt;
                    })
                    .collect(Collectors.toList());
            vo.setOptions(options);
            result.add(vo);
        }
        return result;
    }

    private String extractLabelFromConfig(String configJson, String optionCode) {
        try {
            InteractionConfigVO config = objectMapper.readValue(configJson, InteractionConfigVO.class);
            if (config.getButtons() != null) {
                for (EmotionButtonVO btn : config.getButtons()) {
                    if (btn.getOptionCode().equals(optionCode)) {
                        return btn.getLabel();
                    }
                }
            }
            if (config.getOptions() != null) {
                for (BranchOptionVO opt : config.getOptions()) {
                    if (opt.getOptionCode().equals(optionCode)) {
                        return opt.getLabel();
                    }
                }
            }
        } catch (Exception ignored) {}
        return optionCode;
    }
}
