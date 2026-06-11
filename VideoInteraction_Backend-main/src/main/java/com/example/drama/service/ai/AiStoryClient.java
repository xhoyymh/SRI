package com.example.drama.service.ai;

/**
 * AI 故事生成客户端。默认 Mock 实现（ai.story.client=mock）。
 * 接入真实算法服务时新增一个实现并切换配置即可，Service 层不感知。
 */
public interface AiStoryClient {

    /** 生成结果载体；Mock 默认产出 TEXT。 */
    class Generated {
        public String contentType = "TEXT";
        public String title;
        public String content;
        public String contentUrl;
        public String status = "success";
    }

    Generated generate(Long episodeId, Long highlightId, String optionCode, String prompt);
}
