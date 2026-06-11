package com.example.drama.model.vo;

import java.util.List;

public class HighlightStatVO {
    private Long highlightId;
    private Integer totalCount;
    private Integer participantCount;
    private List<OptionStatVO> options;

    public Long getHighlightId() {
        return highlightId;
    }

    public void setHighlightId(Long highlightId) {
        this.highlightId = highlightId;
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

    public List<OptionStatVO> getOptions() {
        return options;
    }

    public void setOptions(List<OptionStatVO> options) {
        this.options = options;
    }
}
