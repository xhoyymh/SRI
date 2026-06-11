package com.example.drama.model.vo;

import java.util.List;

public class InteractionConfigVO {
    private String componentType;
    private List<EmotionButtonVO> buttons;
    private List<BranchOptionVO> options;
    private String optionCode;
    private String label;
    private String generationMode;
    private Long generationId;
    private Integer resumeTime;
    private String actionLabel;
    private String userAction;

    public String getComponentType() {
        return componentType;
    }

    public void setComponentType(String componentType) {
        this.componentType = componentType;
    }

    public List<EmotionButtonVO> getButtons() {
        return buttons;
    }

    public void setButtons(List<EmotionButtonVO> buttons) {
        this.buttons = buttons;
    }

    public List<BranchOptionVO> getOptions() {
        return options;
    }

    public void setOptions(List<BranchOptionVO> options) {
        this.options = options;
    }

    public String getOptionCode() {
        return optionCode;
    }

    public void setOptionCode(String optionCode) {
        this.optionCode = optionCode;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getGenerationMode() {
        return generationMode;
    }

    public void setGenerationMode(String generationMode) {
        this.generationMode = generationMode;
    }

    public Long getGenerationId() {
        return generationId;
    }

    public void setGenerationId(Long generationId) {
        this.generationId = generationId;
    }

    public Integer getResumeTime() {
        return resumeTime;
    }

    public void setResumeTime(Integer resumeTime) {
        this.resumeTime = resumeTime;
    }

    public String getActionLabel() {
        return actionLabel;
    }

    public void setActionLabel(String actionLabel) {
        this.actionLabel = actionLabel;
    }

    public String getUserAction() {
        return userAction;
    }

    public void setUserAction(String userAction) {
        this.userAction = userAction;
    }
}
