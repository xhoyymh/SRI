package com.example.drama.model.vo;

public class BranchOptionVO {
    private String optionCode;
    private String label;
    private String generationMode;
    private Long generationId;
    /** MAINLINE=正确主线继续原片；TRIAL=试错分支，播完回到 retryTime。 */
    private String branchOutcome;
    /** 试错分支播完后回到的分支点秒数；兼容旧字段 resumeTime。 */
    private Integer retryTime;
    /** 分支视频片段播完后，主视频回跳的秒数；缺省时前端取 highlight.endTime。 */
    private Integer resumeTime;
    /** 是否正确主线：true/缺省=播完接主线续播；false=错误分支，播完进入失败序列（黑屏+回分支点+置灰）。 */
    private Boolean isCorrect;
    /** 错误分支黑屏文案（可选）；当崩坏结尾已烘焙进视频时留空，前端只显示「重新选择」。 */
    private String failText;

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

    public String getBranchOutcome() {
        return branchOutcome;
    }

    public void setBranchOutcome(String branchOutcome) {
        this.branchOutcome = branchOutcome;
    }

    public Integer getRetryTime() {
        return retryTime;
    }

    public void setRetryTime(Integer retryTime) {
        this.retryTime = retryTime;
    }

    public Integer getResumeTime() {
        return resumeTime;
    }

    public void setResumeTime(Integer resumeTime) {
        this.resumeTime = resumeTime;
    }

    // 用 getIsCorrect/setIsCorrect（而非 isCorrect()），保证 JSON 属性名就是 "isCorrect"
    public Boolean getIsCorrect() {
        return isCorrect;
    }

    public void setIsCorrect(Boolean isCorrect) {
        this.isCorrect = isCorrect;
    }

    public String getFailText() {
        return failText;
    }

    public void setFailText(String failText) {
        this.failText = failText;
    }
}
