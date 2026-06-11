package com.example.drama.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class InteractionRequest {
    @NotBlank
    private String deviceId;

    private Long dramaId;

    private Long episodeId;

    @NotNull
    private Long highlightId;

    @NotBlank
    private String interactionType;

    private String optionCode;

    private String content;

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public Long getDramaId() {
        return dramaId;
    }

    public void setDramaId(Long dramaId) {
        this.dramaId = dramaId;
    }

    public Long getEpisodeId() {
        return episodeId;
    }

    public void setEpisodeId(Long episodeId) {
        this.episodeId = episodeId;
    }

    public Long getHighlightId() {
        return highlightId;
    }

    public void setHighlightId(Long highlightId) {
        this.highlightId = highlightId;
    }

    public String getInteractionType() {
        return interactionType;
    }

    public void setInteractionType(String interactionType) {
        this.interactionType = interactionType;
    }

    public String getOptionCode() {
        return optionCode;
    }

    public void setOptionCode(String optionCode) {
        this.optionCode = optionCode;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
