package com.example.drama.model.dto;

public class InteractionResponse {
    private Long highlightId;
    private String optionCode;
    private Integer currentCount;
    private Integer totalCount;
    private Integer participantCount;

    public Long getHighlightId() {
        return highlightId;
    }

    public void setHighlightId(Long highlightId) {
        this.highlightId = highlightId;
    }

    public String getOptionCode() {
        return optionCode;
    }

    public void setOptionCode(String optionCode) {
        this.optionCode = optionCode;
    }

    public Integer getCurrentCount() {
        return currentCount;
    }

    public void setCurrentCount(Integer currentCount) {
        this.currentCount = currentCount;
    }

    public Integer getTotalCount() {
        return totalCount;
    }

    public void setTotalCount(Integer totalCount) {
        this.totalCount = totalCount;
    }

    public Integer getParticipantCount() {
        return participantCount;
    }

    public void setParticipantCount(Integer participantCount) {
        this.participantCount = participantCount;
    }
}
