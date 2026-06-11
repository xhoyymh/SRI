package com.example.drama.model.vo;

import com.fasterxml.jackson.databind.JsonNode;

public class HighlightVO {
    private Long highlightId;
    private Long episodeId;
    private Integer startTime;
    private Integer endTime;
    private String highlightType;
    private String title;
    private Boolean triggerOnce;
    private JsonNode interactionConfig;

    public Long getHighlightId() {
        return highlightId;
    }

    public void setHighlightId(Long highlightId) {
        this.highlightId = highlightId;
    }

    public Long getEpisodeId() {
        return episodeId;
    }

    public void setEpisodeId(Long episodeId) {
        this.episodeId = episodeId;
    }

    public Integer getStartTime() {
        return startTime;
    }

    public void setStartTime(Integer startTime) {
        this.startTime = startTime;
    }

    public Integer getEndTime() {
        return endTime;
    }

    public void setEndTime(Integer endTime) {
        this.endTime = endTime;
    }

    public String getHighlightType() {
        return highlightType;
    }

    public void setHighlightType(String highlightType) {
        this.highlightType = highlightType;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public Boolean getTriggerOnce() {
        return triggerOnce;
    }

    public void setTriggerOnce(Boolean triggerOnce) {
        this.triggerOnce = triggerOnce;
    }

    public JsonNode getInteractionConfig() {
        return interactionConfig;
    }

    public void setInteractionConfig(JsonNode interactionConfig) {
        this.interactionConfig = interactionConfig;
    }
}
