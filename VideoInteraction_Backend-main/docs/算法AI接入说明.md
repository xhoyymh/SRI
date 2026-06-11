# 算法 AI 接入说明

> 给负责“视频爽点 / 分支点分析”的同学和他的 AI 编码代理使用。
> 目标：算法代码分析视频后，把互动时间点和分支内容写入现有短剧互动系统。

---

## 1. 当前系统边界

现有后端已经实现：

- 剧集查询：`GET /episodes/{episodeId}`
- 高光点下发：`GET /episodes/{episodeId}/highlights`
- 互动上报和计数：`POST /interactions`
- AI 分支内容查询、点赞、评论：`/ai/story/...`
- 算法侧导入接口：
  - `POST /admin/highlights:batch`
  - `POST /admin/ai-stories:batch`

现有后端还没有实现：

- 自动下载 / 上传视频
- ffmpeg 抽帧
- ASR 字幕识别
- 大模型分析爽点 / 分支点
- 后台异步分析任务
- 分析完成后自动入库 job

所以当前推荐接入方式是：

```text
算法代码作为独立脚本或独立服务运行
-> 读取后端 episode 信息
-> 分析 videoUrl 指向的视频
-> 产出 highlights / aiStories JSON
-> 调后端 admin 导入接口入库
-> 前端通过现有接口读取并展示
```

---

## 2. 如何启动本系统

### 2.1 启动数据库

本地开发默认 MySQL：

```bash
mysql -uroot -p12345678 < src/main/resources/sql/drama_current_dump.sql
```

如果需要清空重建开发数据，也重新导入当前完整快照：

```bash
mysql -uroot -p12345678 < src/main/resources/sql/drama_current_dump.sql
```

### 2.2 启动后端

在 `/Users/meteor/Data/Project/Backend` 下运行：

```bash
mvn spring-boot:run
```

默认地址：

```text
http://localhost:8080/api/v1
```

接口文档：

```text
http://localhost:8080/api/v1/doc.html
```

### 2.3 冒烟测试

```bash
bash smoke.sh
```

如果后端不在本机：

```bash
BASE_URL=http://<后端IP>:8080/api/v1 ADMIN_TOKEN=dev-admin-token bash smoke.sh
```

---

## 3. 算法代码怎么接入

### 3.1 读取待分析视频

先从后端拿剧集信息：

```bash
curl http://localhost:8080/api/v1/episodes/101
```

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "episodeId": 101,
    "dramaId": 1,
    "episodeNo": 1,
    "title": "第1集：藏宝图出现",
    "videoUrl": "http://localhost:8000/episode-03.mp4",
    "duration": 180
  }
}
```

算法代码使用：

- `episodeId`：后续导入时必须带
- `videoUrl`：待分析视频地址
- `duration`：用于校验时间点不能超过视频长度

时间单位统一是**秒**，不要用毫秒。

---

## 4. 高光点导入接口

### 4.1 接口

```http
POST /api/v1/admin/highlights:batch
Header: X-Admin-Token: dev-admin-token
Content-Type: application/json
```

### 4.2 请求结构

```json
{
  "episodeId": 101,
  "highlights": [
    {
      "startTime": 15,
      "endTime": 22,
      "highlightType": "COOL",
      "title": "男主强势反击",
      "triggerOnce": 1,
      "interactionConfig": {
        "componentType": "emotion_button",
        "buttons": [
          {
            "optionCode": "cool",
            "label": "爽",
            "effect": "float",
            "icon": "/icon/shaung.png"
          }
        ]
      }
    }
  ]
}
```

### 4.3 字段说明

| 字段 | 说明 |
|------|------|
| `episodeId` | 剧集 ID |
| `startTime` | 高光开始秒数 |
| `endTime` | 高光结束秒数 |
| `highlightType` | `COOL` / `FUNNY` / `SWEET` / `FAMOUS` / `TWIST` / `BRANCH` |
| `title` | 前端浮层标题 |
| `triggerOnce` | 一般填 `1`，同一个高光窗口只触发一次 |
| `interactionConfig.componentType` | `emotion_button` 或 `branch_choice` |

### 4.4 情绪按钮场景码

当前前端已把这些图标打包进小程序，后端只要给 `optionCode` 即可稳定展示：

| optionCode | label | 建议 highlightType |
|------------|-------|--------------------|
| `cool` | 爽 | `COOL` |
| `famous_scene` | 名场面 | `FAMOUS` |
| `funny` | 笑出鹅叫 | `FUNNY` |
| `sweet` | 甜 | `SWEET` |

可以带 `icon` 字段，但前端对以上已知 `optionCode` 会优先使用本地包内图标。

### 4.5 避免同一时间重复弹按钮

如果不希望“爽”和“名场面”同时出现，不要把它们放在同一个 `highlight` 的 `buttons` 数组里。

推荐拆成两个高光点：

```json
{
  "episodeId": 101,
  "highlights": [
    {
      "startTime": 15,
      "endTime": 22,
      "highlightType": "COOL",
      "title": "男主强势反击",
      "triggerOnce": 1,
      "interactionConfig": {
        "componentType": "emotion_button",
        "buttons": [
          { "optionCode": "cool", "label": "爽", "effect": "float" }
        ]
      }
    },
    {
      "startTime": 70,
      "endTime": 78,
      "highlightType": "FAMOUS",
      "title": "名场面出现",
      "triggerOnce": 1,
      "interactionConfig": {
        "componentType": "emotion_button",
        "buttons": [
          { "optionCode": "famous_scene", "label": "名场面", "effect": "bubble" }
        ]
      }
    }
  ]
}
```

不要只改 `highlight_stat.highlight_id`。`highlight_stat` 只是计数表，不能决定按钮什么时候显示。

---

## 5. 分支点导入

分支点使用：

```json
{
  "componentType": "branch_choice",
  "options": [
    {
      "optionCode": "alone",
      "label": "独自进入",
      "generationMode": "PREGEN",
      "generationId": 3001,
      "resumeTime": 55
    },
    {
      "optionCode": "team",
      "label": "叫上伙伴",
      "generationMode": "PREGEN",
      "generationId": 3002,
      "resumeTime": 55
    }
  ]
}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `optionCode` | 分支选项码，英文稳定标识 |
| `label` | 前端按钮文案 |
| `generationMode` | `PREGEN` 或 `ONDEMAND` |
| `generationId` | 预生成内容 ID，`PREGEN` 时需要 |
| `resumeTime` | 分支内容结束后，主视频回跳秒数 |

### 5.1 PREGEN 分支内容导入

如果算法侧已经生成好分支视频，先导入 AI 内容：

```bash
curl -X POST http://localhost:8080/api/v1/admin/ai-stories:batch \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: dev-admin-token" \
  -d '{
    "items": [
      {
        "episodeId": 101,
        "highlightId": 1002,
        "optionCode": "alone",
        "contentType": "VIDEO",
        "title": "独自深入古墓",
        "contentUrl": "https://example.com/branch-alone.mp4"
      }
    ]
  }'
```

返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "inserted": 1,
    "ids": [3007]
  }
}
```

然后把返回的 `3007` 填到分支高光的 `generationId` 中。

注意：当前 `highlights:batch` 只返回 `inserted`，不返回新建的 `highlightId`。如果需要严格把 `ai_generation.highlight_id` 回填为新高光 ID，后端还需要增强接口；MVP 可以先不回填，前端只依赖 `generationId` 查询分支内容。

### 5.2 ONDEMAND 分支

如果想让用户点击时再生成，可以使用：

```json
{
  "optionCode": "team",
  "label": "叫上伙伴",
  "generationMode": "ONDEMAND",
  "resumeTime": 55
}
```

当前后端的 `POST /ai/story/generate` 仍是 Mock 文本生成；真实模型生成需要后续接入。

---

## 6. 算法输出建议格式

建议算法代码先产出一个本地 JSON 文件，确认无误后再调用后端导入。

示例：

```json
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
      "reason": "人物靠近、台词暧昧、背景音乐转柔和"
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
      "reason": "主角进入关键选择点，后续剧情可明显分叉"
    }
  ]
}
```

导入后端时需要转换成 `/admin/highlights:batch` 的字段结构，`reason` 可以先保存在算法侧日志里；当前后端没有单独存 `reason` 字段。

---

## 7. 质量要求

算法侧导入前请做这些校验：

1. `startTime` 和 `endTime` 必须是秒，且 `0 <= startTime < endTime <= duration`
2. 情绪按钮时间窗尽量不要重叠，否则前端同一时刻可能只显示最后一个浮层
3. 分支点不要和情绪按钮重叠
4. `optionCode` 使用稳定英文码，不要用中文
5. `highlightType` 使用大写枚举
6. `interactionConfig.componentType` 必须是 `emotion_button` 或 `branch_choice`
7. `PREGEN` 分支必须有可查询的 `generationId`
8. 视频地址在真机环境必须是 HTTPS 或可访问公网地址，不能用本机 `localhost`

---

## 8. 验证接入结果

### 8.1 查高光点

```bash
curl http://localhost:8080/api/v1/episodes/101/highlights
```

应看到刚导入的：

- `startTime`
- `endTime`
- `highlightType`
- `interactionConfig`

### 8.2 查互动统计

```bash
curl http://localhost:8080/api/v1/episodes/101/interaction-stats
```

刚导入的高光如果还没人点击，统计可能为空或没有对应 option，这是正常的。第一次用户点击后，`POST /interactions` 会创建统计。

### 8.3 前端验证

1. 微信开发者工具打开 `/Users/meteor/Data/Project/miniapp-1`
2. 确认 `utils/config.js`：

```js
const BASE_URL = 'http://localhost:8080/api/v1'
const USE_MOCK = false
```

3. 重新编译
4. 播放对应剧集
5. 到 `startTime` 时应出现互动按钮或分支选择

---

## 9. 当前 API 限制和建议增强

当前接口能完成 MVP 导入，但有几个限制：

1. `POST /admin/highlights:batch` 只返回插入数量，不返回新建 `highlightId`
2. 没有“按 episodeId 覆盖旧分析结果”的接口
3. 没有分析任务状态：`pending/running/success/failed`
4. 没有保存算法解释 `reason/confidence`
5. 没有视频分析任务表

如果后续要做成完整后台分析系统，建议新增：

```text
POST /admin/episodes/{episodeId}/analyze
GET  /admin/analysis-tasks/{taskId}
POST /admin/analysis-results
```

并新增分析任务表：

```text
analysis_task(id, episode_id, video_url, status, result_json, error_message, create_time, update_time)
```

但在当前阶段，先让算法代码调用已有 `/admin/highlights:batch` 和 `/admin/ai-stories:batch` 即可完成前端联调。
