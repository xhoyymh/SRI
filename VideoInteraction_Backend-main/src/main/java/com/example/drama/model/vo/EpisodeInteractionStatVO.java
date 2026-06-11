package com.example.drama.model.vo;

import java.util.List;

public class EpisodeInteractionStatVO {
    private Long highlightId;
    private List<SimpleOptionStatVO> options;

    public Long getHighlightId() {
        return highlightId;
    }

    public void setHighlightId(Long highlightId) {
        this.highlightId = highlightId;
    }

    public List<SimpleOptionStatVO> getOptions() {
        return options;
    }

    public void setOptions(List<SimpleOptionStatVO> options) {
        this.options = options;
    }
}
