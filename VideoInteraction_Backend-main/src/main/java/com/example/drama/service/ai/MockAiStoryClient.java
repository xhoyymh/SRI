package com.example.drama.service.ai;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Mock 生成：不依赖外部服务，按入参拼一段确定性文本，便于联调。
 * 仅当 ai.story.client=mock（默认）时生效。
 */
@Component
@ConditionalOnProperty(name = "ai.story.client", havingValue = "mock", matchIfMissing = true)
public class MockAiStoryClient implements AiStoryClient {

    @Override
    public Generated generate(Long episodeId, Long highlightId, String optionCode, String prompt) {
        Generated g = new Generated();
        g.contentType = "TEXT";
        g.title = "AI 续写 · " + (optionCode == null ? "分支" : optionCode);
        StringBuilder sb = new StringBuilder();
        sb.append("【").append(optionCode).append("】这是基于你的选择生成的剧情走向。");
        if (prompt != null && !prompt.isBlank()) {
            sb.append("结合你的设定「").append(prompt.trim()).append("」，");
        }
        sb.append("主角做出了出人意料的决定，故事就此转入全新支线……（Mock 文本，接入算法后替换）");
        g.content = sb.toString();
        g.contentUrl = null;
        g.status = "success";
        return g;
    }
}
