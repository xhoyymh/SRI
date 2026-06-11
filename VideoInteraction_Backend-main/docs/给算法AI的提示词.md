# 给算法 AI 编码代理的提示词

> 使用方式：先把「提示词 0」完整复制给负责算法侧代码的 AI 编码代理。
> 目标：让它先读懂现有前端、后端、数据库和数据流，明确从哪里接入，再开始写算法导入代码。

---

## 提示词 0：先读懂前后端代码，输出接入点报告

```text
你是负责“短剧视频爽点 / 甜点 / 名场面 / 搞笑点 / 分支点分析”的 AI 编码代理。

你现在的第一任务不是写代码，而是先读懂这个项目现有前端和后端的真实代码，判断算法分析结果应该从哪里接入系统。

请遵守：

- 知之为知之，不知为不知。没有从代码或接口验证到的内容，不要当成事实。
- 第一轮只做代码阅读、接口追踪和接入点分析，不要直接改代码。
- 不要臆造接口字段，不要猜数据库结构。
- 时间单位统一按秒理解，除非你从代码里看到明确反例。
- 不要把 highlight_stat 当成控制按钮显示的表；它只是互动统计。
- 不要默认小程序跑的是 miniprogram/ 目录里的代码，必须先验证当前项目配置。

请阅读这两个项目：

前端小程序：
/Users/meteor/Data/Project/miniapp-1

后端：
/Users/meteor/Data/Project/Backend

你必须先完成以下代码阅读任务。

一、确认当前真正运行的前端代码

请检查：

1. /Users/meteor/Data/Project/miniapp-1/project.config.json
2. /Users/meteor/Data/Project/miniapp-1/app.json
3. /Users/meteor/Data/Project/miniapp-1/pages/play/index.js
4. 如存在 /Users/meteor/Data/Project/miniapp-1/miniprogram/，也要说明它是否真的被 DevTools 使用。

你要回答：

- 微信开发者工具当前应该运行根目录小程序代码，还是 miniprogram/ 目录代码？
- 判断依据是什么？
- 播放页实际入口文件是哪一个？

二、读懂前端如何连后端

请检查：

1. /Users/meteor/Data/Project/miniapp-1/utils/config.js
2. /Users/meteor/Data/Project/miniapp-1/api/request.js
3. /Users/meteor/Data/Project/miniapp-1/api/episode.js
4. /Users/meteor/Data/Project/miniapp-1/utils/mock.js

你要回答：

- BASE_URL 是什么？
- USE_MOCK 当前是什么？
- wx.request 是怎么拼接 URL 的？
- getEpisode、getHighlights、getInteractionStats 分别请求哪些后端接口？
- 如果 USE_MOCK=true，会不会绕过后端？

三、读懂前端如何显示视频、互动 icon 和分支点

请重点检查：

1. /Users/meteor/Data/Project/miniapp-1/pages/play/index.js
2. /Users/meteor/Data/Project/miniapp-1/pages/play/index.wxml
3. /Users/meteor/Data/Project/miniapp-1/utils/icon-assets.js

请追踪这些函数或逻辑：

- loadEpisode
- loadHighlights
- onTimeUpdate
- checkHighlight
- showOverlay
- onTapEmotion
- onTapBranch
- openBranch
- showStory
- showBigImage

你要回答：

- 前端视频播放地址来自哪里？
- 前端什么时候调用 highlights 接口？
- 每个高光点是靠什么字段决定出现时间？
- interactionConfig.componentType 支持哪些展示形态？
- emotion_button 的 optionCode、label、icon 如何进入页面？
- 当前小 icon 和大图是否优先走本地资源映射？
- 分支点点击后是怎样通过 generationId 获取内容的？

四、读懂后端接口和数据库写入链路

请检查：

1. /Users/meteor/Data/Project/Backend/src/main/resources/application.yml
2. /Users/meteor/Data/Project/Backend/src/main/java/com/example/drama/controller
3. /Users/meteor/Data/Project/Backend/src/main/java/com/example/drama/service
4. /Users/meteor/Data/Project/Backend/src/main/java/com/example/drama/model/dto
5. /Users/meteor/Data/Project/Backend/src/main/java/com/example/drama/model/vo
6. /Users/meteor/Data/Project/Backend/src/main/java/com/example/drama/model/entity
7. /Users/meteor/Data/Project/SVI/VideoInteraction_Backend-main/src/main/resources/sql/drama_current_dump.sql

请重点追踪：

- EpisodeController / EpisodeService
- HighlightController / HighlightService
- InteractionController / InteractionService
- AiController / AiService
- AdminController / AdminService
- AdminHighlightsBatchRequest
- AdminAiStoriesBatchRequest
- highlight 表
- highlight_stat 表
- ai_generation 表

你要回答：

- 后端服务端口和 context-path 是什么？
- GET /episodes/{episodeId} 返回什么关键字段？
- GET /episodes/{episodeId}/highlights 从哪张表读，返回什么结构？
- POST /admin/highlights:batch 如何把高光点写入数据库？
- POST /admin/ai-stories:batch 如何把预生成分支内容写入数据库？
- /admin/highlights:batch 是否返回新建 highlightId？
- 当前后端有没有自动分析视频并入库的服务？如果没有，请明确说没有。

五、输出《代码阅读和接入点报告》

在你写任何代码前，先输出一份报告，必须包含以下章节：

1. 当前运行的前端代码
   - 结论
   - 证据文件

2. 前端请求链路
   - config.js
   - request.js
   - episode.js
   - play/index.js
   - 实际接口列表

3. 高光点展示链路
   - 数据从哪个接口来
   - 哪些字段控制出现时间
   - 哪些字段控制按钮、icon、大图、分支
   - 哪些数据只做统计，不控制展示

4. 后端写入链路
   - admin 接口
   - DTO
   - service
   - 数据表
   - 返回值限制

5. 算法侧推荐接入方式
   - 推荐作为外部分析/导入程序接入，而不是直接塞进前端
   - 先 GET /episodes/{episodeId} 读取 videoUrl/duration
   - 算法输出 analysis-result.json
   - 再 POST /admin/highlights:batch 写入高光点
   - 分支 PREGEN 内容先 POST /admin/ai-stories:batch，再把 generationId 放进 branch_choice options

6. 当前系统缺口
   - 是否缺自动分析任务接口
   - 是否缺 batch 接口返回 highlightId
   - 是否缺覆盖旧算法结果的接口
   - 是否缺 reason/confidence 入库字段

7. 下一步实施计划
   - 最小导入脚本
   - 算法输出格式
   - PREGEN 分支内容
   - 真实视频分析 MVP
   - 端到端验收

如果你发现我的说明和代码不一致，以代码为准，并在报告里指出不一致。
```

---

## 提示词 1：基于报告确认接入方案

```text
你已经完成《代码阅读和接入点报告》。现在请基于报告给出接入方案，不要跳过系统现状。

请回答：

1. 算法侧代码应该放在哪里？
   - 可以是后端项目里的一个独立 tools/analysis-importer
   - 也可以是独立项目
   - 请选择你认为最不影响现有系统的方案

2. 算法侧最小输入是什么？
   - episodeId
   - 后端 BASE_URL
   - admin token
   - 可选本地 analysis-result.json

3. 算法侧最小输出是什么？
   - highlights
   - branchStories
   - analysis-log

4. 需要调用哪些后端接口？

5. 需要修改哪些后端代码？如果不需要，也明确说不需要。

6. 需要修改哪些前端代码？如果不需要，也明确说不需要。

7. 哪些事情现在不能做或不应该做？

请先输出方案，不要写代码。方案通过后，再开始实现。
```

---

## 提示词 2：做最小可运行导入脚本

```text
现在实现第一阶段：不做真实 AI 视频识别，先做一个可运行的导入脚本，验证算法结果能写入后端，并被前端读取。

要求：

1. 脚本支持配置：
   - BASE_URL，默认 http://localhost:8080/api/v1
   - ADMIN_TOKEN，默认 dev-admin-token
   - EPISODE_ID，默认 101

2. 先调用：
   GET /episodes/{episodeId}

   读取：
   - episodeId
   - videoUrl
   - duration

3. 读取本地 analysis-result.json。

4. 校验 analysis-result.json：
   - startTime/endTime 是秒
   - 0 <= startTime < endTime <= duration
   - highlightType 是 COOL/FUNNY/SWEET/FAMOUS/TWIST/BRANCH
   - componentType 是 emotion_button 或 branch_choice
   - optionCode 必须是稳定英文码，不要用中文
   - 不同场景如果不希望同时出现，就不要共用同一个 highlight 时间窗

5. 把 analysis-result.json 转换为：
   POST /admin/highlights:batch

6. 调用：
   GET /episodes/{episodeId}/highlights

   验证新数据已经能被业务接口返回。

第一阶段不要做视频下载、抽帧、ASR、大模型调用。只验证系统接入链路。

请给出：

- 你创建/修改的文件
- 运行命令
- analysis-result.json 示例
- 后端接口返回的验证证据
```

---

## 提示词 3：定义算法输出 JSON

```text
请为算法侧定义稳定的 analysis-result.json 格式，并实现校验逻辑。

目标格式示例：

{
  "episodeId": 101,
  "videoUrl": "http://localhost:8000/episode-03.mp4",
  "highlights": [
    {
      "startTime": 8,
      "endTime": 14,
      "highlightType": "SWEET",
      "title": "心动名场面",
      "componentType": "emotion_button",
      "buttons": [
        { "optionCode": "sweet", "label": "甜", "effect": "float" }
      ],
      "reason": "人物靠近、台词暧昧、背景音乐转柔和",
      "confidence": 0.82
    },
    {
      "startTime": 45,
      "endTime": 55,
      "highlightType": "BRANCH",
      "title": "是否独自进入古墓",
      "componentType": "branch_choice",
      "options": [
        { "optionCode": "alone", "label": "独自进入", "generationMode": "PREGEN", "resumeTime": 55 },
        { "optionCode": "team", "label": "叫上伙伴", "generationMode": "PREGEN", "resumeTime": 55 }
      ],
      "reason": "主角进入关键选择点，后续剧情可明显分叉",
      "confidence": 0.76
    }
  ],
  "branchStories": []
}

注意：

- reason/confidence 当前后端不一定存库，可以保留在算法侧日志。
- 导入后端时要把 componentType/buttons/options 包进 interactionConfig。
- 前端显示依赖 highlight.startTime、highlight.endTime、interactionConfig，不依赖 highlight_stat。
- 如果你需要新增 reason/confidence 入库，先提出后端最小增强方案，不要直接改表。

请实现：

- JSON schema 或等价校验
- 示例文件
- 转换为后端请求体的函数
- 单元测试或命令行自测
```

---

## 提示词 4：接入分支视频 PREGEN

```text
现在实现 PREGEN 分支内容导入。

背景：

- 分支点 highlight 使用 componentType=branch_choice。
- 每个分支 option 可以带 generationMode=PREGEN 和 generationId。
- generationId 对应后端 ai_generation 表中的一条内容。
- 前端用户点击分支时，会用 generationId 调 GET /ai/story/{generationId} 获取内容。

请实现：

1. analysis-result.json 允许声明 branchStories，例如：

{
  "branchStories": [
    {
      "localKey": "alone-story",
      "episodeId": 101,
      "optionCode": "alone",
      "contentType": "VIDEO",
      "title": "独自深入古墓",
      "contentUrl": "https://example.com/branch-alone.mp4"
    }
  ]
}

2. 导入顺序：
   - 先调用 POST /admin/ai-stories:batch 导入 branchStories。
   - 读取返回的 ids。
   - 把返回 id 回填到 branch_choice.options[].generationId。
   - 再调用 POST /admin/highlights:batch 导入分支高光。

3. 注意当前后端 /admin/highlights:batch 只返回 inserted，不返回新建 highlightId。
   - MVP 可以先让 ai_generation.highlightId 为空。
   - 前端实际依赖 options[].generationId 查询分支内容。
   - 如果你认为必须严格绑定新 highlightId，请提出后端增强方案，而不是随便猜 ID。

请给出：

- 请求顺序
- 示例 JSON
- 运行命令
- 验证 curl：
  - GET /episodes/{episodeId}/highlights
  - GET /ai/story/{generationId}
```

---

## 提示词 5：实现真实视频分析 MVP

```text
现在开始实现真实视频分析 MVP。继续遵守前面读代码得出的接口契约。

建议流程：

1. 获取 episode：
   - GET /episodes/{episodeId}
   - 读取 videoUrl、duration

2. 获取视频材料：
   - 如果 videoUrl 是本地可访问地址，下载或直接读取。
   - 如果是真机/远程环境，确保 URL 可访问。

3. 生成候选时间点：
   - 可以先基于字幕、镜头变化、音量变化、人工规则。
   - 如果有多模态模型，再接入模型。

4. 输出 analysis-result.json：
   - COOL：爽点、反击、打脸、强转折
   - FAMOUS：名场面、强视觉记忆点
   - FUNNY：搞笑点
   - SWEET：甜点、暧昧、心动
   - BRANCH：剧情分叉选择点

5. 做质量过滤：
   - 时间窗不要太短，建议 4-10 秒。
   - 同一时间不要堆多个情绪按钮。
   - 分支点必须是观众能理解的选择点。
   - endTime 不得超过 duration。

请先实现可解释的规则/模型调用框架，输出每个高光的 reason 和 confidence。

当前后端不保存 reason/confidence 时，先写入算法侧日志文件：

- analysis-result.json
- analysis-log.json

不要直接改后端表结构，除非你先提出变更方案并解释前端/后端影响。
```

---

## 提示词 6：端到端验收

```text
请对算法接入做端到端验收。

验收步骤：

1. 启动后端：
   mvn spring-boot:run

2. 确认接口可达：
   curl http://localhost:8080/api/v1/episodes/101

3. 运行算法分析和导入：
   BASE_URL=http://localhost:8080/api/v1 ADMIN_TOKEN=dev-admin-token EPISODE_ID=101 <你的命令>

4. 验证高光接口：
   curl http://localhost:8080/api/v1/episodes/101/highlights

5. 验证分支内容：
   curl "http://localhost:8080/api/v1/ai/story/<generationId>?deviceId=dev-test"

6. 验证统计接口：
   curl http://localhost:8080/api/v1/episodes/101/interaction-stats

7. 前端验证：
   - 微信开发者工具打开 /Users/meteor/Data/Project/miniapp-1
   - 确认 utils/config.js 中 USE_MOCK=false
   - BASE_URL=http://localhost:8080/api/v1
   - 重新编译
   - 播放到 startTime，检查互动按钮或分支选择是否出现

请输出一份验收报告：

- 运行了哪些命令
- 每个命令的关键输出
- 导入了哪些 highlight
- 每个 highlight 的 startTime/endTime/type/title/optionCode
- 有哪些失败或风险
- 下一步建议
```

---

## 提示词 7：如果需要增强后端

```text
如果现有后端接口阻碍算法接入，请不要直接大改。

先写一份最小增强提案，包含：

1. 为什么现有接口不够
2. 最小新增接口是什么
3. 请求/响应 JSON
4. 会影响哪些现有前端/后端接口
5. 是否需要改数据库
6. 如何验证

优先考虑这些增强：

- POST /admin/highlights:batch 返回新建 highlightIds
- POST /admin/episodes/{episodeId}/analysis-results 覆盖该集旧算法结果
- POST /admin/episodes/{episodeId}/analyze 创建分析任务
- GET /admin/analysis-tasks/{taskId} 查询任务状态

在没有确认前，不要改已有业务接口字段。
```

---

## 提示词 8：重要约束复读

```text
请再次检查你的实现是否违反以下约束：

- 有没有先读前端和后端代码，并输出接入点报告？
- 有没有把根目录小程序和 miniprogram/ 目录搞混？
- 有没有把秒当成毫秒？
- 有没有把 optionCode 写成中文？
- 有没有直接改 highlight_stat 试图控制按钮显示？
- 有没有让多个不该同时出现的按钮共用同一个 highlight？
- 有没有让 PREGEN 分支缺 generationId？
- 有没有用 localhost 视频地址做真机验证？
- 有没有假设 /admin/highlights:batch 会返回 highlightId？
- 有没有绕过 X-Admin-Token？
- 有没有修改前端接口契约？

如果有，先修正，再继续。
```
