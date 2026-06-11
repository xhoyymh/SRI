# 【后端】短剧剧情即时互动 · AI 编码开发文档（独立 spec）

> 面向 AI 编码代理，用于**独立开发后端**（单独仓库 / 单独会话）。本文档自包含。
> 前端由另一份《【前端】…》独立开发。**第 4 节 API 契约为前后端共享，字段不得单方修改。**

---

## 0. 执行约束（务必遵守）
1. 不臆造字段：字段名/类型/枚举/路径严格按本文档；不确定处加 TODO 注释，不发明。
2. MVP 边界：只实现本文档功能。不做登录鉴权、在线实时视频生成编排、支付、推荐、后台 UI、微服务。
3. 可运行优先：每阶段产物能编译、能启动、过该阶段测试点再继续（§9）。
4. AI 能力一律走 `AiStoryClient`，默认 `MockAiStoryClient` 返回预置内容（§6.3），**不得调用任何真实大模型**。
5. 统一响应 `ApiResponse{code,message,data}`，`code=0` 成功（§2.4）。
6. 时间单位：视频时间字段（startTime/endTime/duration）= **秒(int)**；时间戳 = `DATETIME`。
7. 用户标识：免登录，用 `deviceId`(String)，不校验合法性。
8. baseUrl/DB 等走配置，**不准写死本地地址**。注释中文、命名英文。
9. 不引入未列依赖；Redis 属可选增强（§9 Phase 5），baseline 不依赖。

---

## 1. 范围与技术栈
实现服务端：短剧/剧集查询、高光点下发、互动上报与计数、剧情生成（Mock）、点赞评论、算法侧导入接口，Docker 部署公网可访问。

技术栈（固定）：JDK 17 · Spring Boot 3.2.x · Maven · MyBatis-Plus 3.5.x · MySQL 8 · Lombok · Jakarta Validation · Knife4j 4.x · Jackson · （可选）spring-data-redis · Docker。

---

## 2. 全局约定

### 2.1 命名/单位
JSON 小驼峰（`episodeId`）；DB 下划线（`episode_id`）+ MyBatis-Plus 驼峰映射。视频时间秒(int)；时间戳 DATETIME，输出 `yyyy-MM-dd HH:mm:ss`（时区 Asia/Shanghai）。

### 2.2 枚举
- `highlightType`：`COOL FUNNY TWIST SWEET FAMOUS BRANCH`
- `interactionType`：`click vote`
- `componentType`（interaction_config 内）：`emotion_button branch_choice`
- `generationMode`（branch option 内）：`PREGEN ONDEMAND`
- `contentType`：`TEXT VIDEO IMAGE_SEQ`
- `status`（ai_generation）：`success pending failed`

### 2.3 用户标识
请求携带 `deviceId`(String)，业务标识用，不鉴权。

### 2.4 统一响应 & 错误码
```json
{ "code": 0, "message": "success", "data": <any|null> }
```
| code | 含义 | HTTP |
|------|------|------|
| 0 | 成功 | 200 |
| 1001 | 参数校验失败 | 200 |
| 1002 | 资源不存在 | 200 |
| 1003 | 重复操作（幂等返回当前状态） | 200 |
| 5000 | 服务器内部错误 | 200 |
HTTP 一律 200，业务错误用 code；`@RestControllerAdvice` 兜底 5000，不泄露堆栈。

### 2.5 分页
列表置于 `data.list` + `data.total`；query `page`(默认1)、`size`(默认20)。

---

## 3. 项目结构
```
src/main/java/com/example/drama/
├── DramaApplication.java
├── common/        ApiResponse · ResultCode · GlobalExceptionHandler
├── config/        CorsConfig · MybatisPlusConfig · SwaggerConfig · AsyncConfig
├── controller/    Drama · Episode · Highlight · Interaction · AiStory · Admin
├── service/(+impl/)  Drama · Episode · Highlight · Interaction · AiStory
├── mapper/        Drama · Episode · Highlight · Interaction · HighlightStat
│                  · AiGeneration · AiGenerationLike · AiGenerationComment
├── model/         entity/ · dto/(含@Valid) · vo/(interactionConfig 解析后对象)
└── ai/            AiStoryClient · MockAiStoryClient(@Primary) · RemoteAiStoryClient
                   · AiStoryRequest · AiStoryResult
src/main/resources/  application.yml · sql/drama_current_dump.sql · mapper/*.xml(仅复杂SQL)
```

---

## 4. 【共享契约】API 规格（Base `/api/v1`）

> 本节与《【前端】spec》完全一致，**字段不得单方修改**。出参省略 `{code,message,data}` 信封，仅写 `data`。

### 4.1 `GET /dramas`
data：`[{dramaId,title,description,coverUrl,tags:[String],episodeCount}]`（tags 由逗号串拆数组）

### 4.2 `GET /dramas/{dramaId}`
data：`{dramaId,title,description,coverUrl,tags:[],episodes:[{episodeId,episodeNo,title,duration}]}`；不存在→1002

### 4.3 `GET /episodes/{episodeId}`
data：`{episodeId,dramaId,episodeNo,title,videoUrl,duration}`；不存在→1002

### 4.4 `GET /episodes/{episodeId}/highlights`
data：`[{highlightId,episodeId,startTime,endTime,highlightType,title,triggerOnce,interactionConfig:{...}}]`
- `interactionConfig` 返回**已解析的 JSON 对象**（非字符串），按 `startTime ASC` 排序
- emotion：`{componentType:"emotion_button",buttons:[{optionCode,label,effect,icon}]}`
- branch：`{componentType:"branch_choice",options:[{optionCode,label,generationMode,generationId?}]}`

### 4.5 `POST /interactions`
入参：`{deviceId,dramaId?,episodeId,highlightId,interactionType,optionCode,content?}`（deviceId/episodeId/highlightId/interactionType/optionCode 必填，缺→1001）
行为：插 interaction 明细（@Async 可）+ highlight_stat upsert(+1)
data：`{highlightId,optionCode,currentCount}`

### 4.6 `GET /highlights/{highlightId}/stats`
data：`{highlightId,totalCount,options:[{optionCode,label,count}]}`

### 4.7 `GET /episodes/{episodeId}/interaction-stats`（轮询）
data：`[{highlightId,options:[{optionCode,count}]}]`

### 4.8 `POST /ai/story/generate`
入参：`{deviceId,dramaId?,episodeId,highlightId,optionCode,prompt?}`
行为：`AiStoryClient.generate()`（默认 Mock）→ 存 ai_generation(contentType=TEXT)
data：`{generationId,contentType,title,content,contentUrl,status,likeCount,commentCount}`

### 4.9 `GET /ai/story/{generationId}?deviceId=`
data：`{generationId,contentType,title,content,contentUrl,likeCount,commentCount,liked}`；不存在→1002

### 4.10 `POST` / `DELETE /ai/story/{generationId}/like`
入参：`{deviceId}`；唯一约束幂等；data：`{generationId,likeCount,liked}`

### 4.11 `GET` / `POST /ai/story/{generationId}/comments`
GET 分页：`{list:[{commentId,nickname,content,createTime}],total}`
POST 入参：`{deviceId,nickname?,content}`（content 必填≤500，否→1001）；data：`{commentId,createTime}`

### 4.12 算法侧导入（header `X-Admin-Token`，值见 application.yml）
- `POST /admin/highlights:batch`：`{episodeId,highlights:[{startTime,endTime,highlightType,title?,triggerOnce?,interactionConfig}]}` → `{inserted}`
- `POST /admin/ai-stories:batch`：`{items:[{episodeId,highlightId,optionCode,contentType,title?,content?,contentUrl?}]}` → `{inserted,ids:[]}`

---

## 5. 数据库（建表 DDL）
8 张表，时间字段秒、时间戳 DATETIME：
```sql
CREATE TABLE drama (
  id BIGINT PRIMARY KEY AUTO_INCREMENT, title VARCHAR(128) NOT NULL, description TEXT,
  cover_url VARCHAR(512), tags VARCHAR(255), status TINYINT DEFAULT 1,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP, update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE episode (
  id BIGINT PRIMARY KEY AUTO_INCREMENT, drama_id BIGINT NOT NULL, episode_no INT NOT NULL,
  title VARCHAR(128), video_url VARCHAR(512) NOT NULL, duration INT COMMENT '秒',
  subtitle_text LONGTEXT, create_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_drama(drama_id));
CREATE TABLE highlight (
  id BIGINT PRIMARY KEY AUTO_INCREMENT, drama_id BIGINT NOT NULL, episode_id BIGINT NOT NULL,
  start_time INT NOT NULL COMMENT '秒', end_time INT NOT NULL COMMENT '秒',
  highlight_type VARCHAR(32) NOT NULL, title VARCHAR(128), description TEXT, trigger_once TINYINT DEFAULT 1,
  interaction_config JSON, source VARCHAR(32) DEFAULT 'manual', confidence DECIMAL(5,4) DEFAULT 1.0,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_ep(episode_id));
CREATE TABLE interaction (
  id BIGINT PRIMARY KEY AUTO_INCREMENT, device_id VARCHAR(64) NOT NULL, drama_id BIGINT, episode_id BIGINT,
  highlight_id BIGINT NOT NULL, interaction_type VARCHAR(32) NOT NULL, option_code VARCHAR(64), content TEXT,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_hl(highlight_id));
CREATE TABLE highlight_stat (
  id BIGINT PRIMARY KEY AUTO_INCREMENT, highlight_id BIGINT NOT NULL, option_code VARCHAR(64) NOT NULL,
  label VARCHAR(64), count INT DEFAULT 0, update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_hl_opt(highlight_id,option_code));
CREATE TABLE ai_generation (
  id BIGINT PRIMARY KEY AUTO_INCREMENT, device_id VARCHAR(64), drama_id BIGINT, episode_id BIGINT,
  highlight_id BIGINT, option_code VARCHAR(64), prompt TEXT, content_type VARCHAR(16) DEFAULT 'TEXT',
  title VARCHAR(128), content TEXT, content_url VARCHAR(512), status VARCHAR(16) DEFAULT 'success',
  like_count INT DEFAULT 0, comment_count INT DEFAULT 0, create_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_hl(highlight_id));
CREATE TABLE ai_generation_like (
  id BIGINT PRIMARY KEY AUTO_INCREMENT, generation_id BIGINT NOT NULL, device_id VARCHAR(64) NOT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uk_gen_dev(generation_id,device_id));
CREATE TABLE ai_generation_comment (
  id BIGINT PRIMARY KEY AUTO_INCREMENT, generation_id BIGINT NOT NULL, device_id VARCHAR(64),
  nickname VARCHAR(64), content TEXT NOT NULL, create_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_gen(generation_id));
```

### 5.1 种子数据（必须写入，启动即可端到端）
```sql
INSERT INTO drama(id,title,description,cover_url,tags,status) VALUES
(1,'北派寻宝笔记','寻宝题材，含反转与爽点','https://picsum.photos/seed/d1/300/400','爽剧,反转,悬疑',1),
(2,'天下第一纨绔','纨绔逆袭，名场面密集','https://picsum.photos/seed/d2/300/400','逆袭,搞笑',1);
INSERT INTO episode(id,drama_id,episode_no,title,video_url,duration) VALUES
(101,1,1,'第1集：藏宝图出现','https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',180),
(102,1,2,'第2集：古墓疑云','https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',175),
(201,2,1,'第1集：纨绔登场','https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',160);
INSERT INTO highlight(id,drama_id,episode_id,start_time,end_time,highlight_type,title,trigger_once,interaction_config,source) VALUES
(1001,1,101,15,22,'COOL','男主强势反击',1,'{"componentType":"emotion_button","buttons":[{"optionCode":"cool","label":"爽","effect":"float","icon":"https://picsum.photos/seed/cool/80"},{"optionCode":"famous_scene","label":"名场面","effect":"bubble","icon":"https://picsum.photos/seed/scene/80"}]}','manual'),
(1003,1,101,30,36,'FUNNY','搞笑桥段',1,'{"componentType":"emotion_button","buttons":[{"optionCode":"funny","label":"笑出鹅叫","effect":"shake","icon":"https://picsum.photos/seed/funny/80"}]}','manual'),
(1002,1,101,45,55,'BRANCH','是否独自进入古墓',1,'{"componentType":"branch_choice","options":[{"optionCode":"alone","label":"独自进入","generationMode":"PREGEN","generationId":3001},{"optionCode":"team","label":"叫上伙伴","generationMode":"ONDEMAND"}]}','manual');
INSERT INTO ai_generation(id,drama_id,episode_id,highlight_id,option_code,content_type,title,content,content_url,status,like_count,comment_count) VALUES
(3001,1,101,1002,'alone','VIDEO','独自深入古墓',NULL,'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4','success',56,2);
INSERT INTO highlight_stat(highlight_id,option_code,label,count) VALUES
(1001,'cool','爽',128),(1001,'famous_scene','名场面',40),(1003,'funny','笑出鹅叫',73);
INSERT INTO ai_generation_comment(generation_id,device_id,nickname,content) VALUES
(3001,'dev-seed','用户1234','这个分支绝了'),(3001,'dev-seed','用户5678','想看后续');
```

---

## 6. 实现要点

### 6.1 通用
- 8 表对应 8 实体 + 8 Mapper(继承 BaseMapper)。
- `interaction_config`：DB JSON，实体 String 存，VO 用 Jackson 解析成对象返回。
- upsert 计数（HighlightStatMapper.xml）：
  ```sql
  INSERT INTO highlight_stat(highlight_id,option_code,label,count) VALUES(#{hid},#{opt},#{label},1)
  ON DUPLICATE KEY UPDATE count=count+1, update_time=NOW();
  ```
- 点赞幂等：唯一键冲突视为已赞；like_count 与 like 表同事务一致。
- CORS：`/**` 放开 GET/POST/PUT/DELETE/OPTIONS。

### 6.2 AiStoryClient
```java
public interface AiStoryClient { AiStoryResult generate(AiStoryRequest req); }
```
- `MockAiStoryClient`(@Primary)：按 optionCode 查 §6.3，返回 title+content。
- `RemoteAiStoryClient`：留空 + TODO（调算法 HTTP），`ai.story.client=remote` 时启用，异常自动降级 Mock。

### 6.3 Mock 预置内容
| optionCode | title | content（节选） |
|---|---|---|
| alone | 独自深入古墓 | 男主独自带图进入古墓，墙上图案与身世有关…… |
| team | 携手闯古墓 | 男主召集旧友，分工破解机关…… |
| save_heroine | 雨夜营救 | 男主截断退路，险中救回女主…… |
| revenge | 雷霆反击 | 男主设局反将一军，当众揭穿…… |
| (default) | 剧情继续 | 故事走向新的转折…… |

### 6.4 application.yml 要点
```yaml
server: { port: 8080, servlet: { context-path: /api/v1 } }   # Controller 路径不再带 /api/v1
spring:
  datasource: { url: jdbc:mysql://localhost:3306/drama?serverTimezone=Asia/Shanghai, username: root, password: root }
  jackson: { date-format: yyyy-MM-dd HH:mm:ss, time-zone: Asia/Shanghai }
mybatis-plus: { configuration: { map-underscore-to-camel-case: true } }
ai: { story: { client: mock } }
admin: { token: dev-admin-token }
```

---

## 7. 构建运行
```bash
mysql -uroot -proot -e "CREATE DATABASE drama DEFAULT CHARSET utf8mb4;"
mysql -uroot -proot < src/main/resources/sql/drama_current_dump.sql
mvn spring-boot:run
# Knife4j: http://localhost:8080/api/v1/doc.html
```
Docker：
```yaml
services:
  mysql: { image: mysql:8, environment: { MYSQL_ROOT_PASSWORD: root, MYSQL_DATABASE: drama },
           volumes: ["./src/main/resources/sql/drama_current_dump.sql:/docker-entrypoint-initdb.d/01-drama-current-dump.sql:ro"], ports: ["3306:3306"] }
  app:   { build: ., depends_on: [mysql], ports: ["8080:8080"],
           environment: { SPRING_DATASOURCE_URL: "jdbc:mysql://mysql:3306/drama?serverTimezone=Asia/Shanghai" } }
```

---

## 8. 联调约定（与前端对齐）
- 前端 baseUrl 指向本服务（开发本机 IP:8080/api/v1，生产公网）。
- CORS 必须放开（前端 H5 调试会跨域）。
- 字段、枚举、错误码以 §2/§4 为准，**任何契约变更需同步前端 spec**。

---

## 9. 分阶段（每阶段过验证门再继续）
| Phase | 内容 | 验证门 |
|-------|------|--------|
| P1 骨架 | 工程 + 实体/Mapper + ApiResponse + 异常 + CORS + drama_current_dump.sql | 启动成功；`GET /dramas` 返回数据 |
| P2 内容 | drama/episode 接口 | `GET /dramas/1`、`/episodes/101` 正确 |
| P3 高光 | highlights 接口（JSON 解析 + 排序） | `/episodes/101/highlights` 返回 3 条、config 为对象 |
| P4 互动 | interactions + 两个 stats 接口 + upsert | 上报后 currentCount+1；stats 正确 |
| P5 生成+社交+部署 | ai/story 全接口 + Mock + 点赞评论 + admin 导入 + Docker | curl 全过；Docker 起服务正常 |
| P5+ 可选 | Redis 缓存 hl:ep / 计数加速 | 不接也算完成 |

---

## 10. 测试点（curl，期望 code=0）
```bash
B=http://localhost:8080/api/v1
curl $B/dramas                                   # 2 条，tags 数组
curl $B/dramas/1                                 # 含 2 集
curl $B/episodes/101                             # 有 videoUrl
curl $B/episodes/101/highlights                  # 3 条，config 对象，startTime 升序
curl -X POST $B/interactions -H "Content-Type:application/json" -d '{"deviceId":"dev-t","episodeId":101,"highlightId":1001,"interactionType":"click","optionCode":"cool"}'  # 129
curl $B/highlights/1001/stats                    # cool/famous_scene
curl $B/episodes/101/interaction-stats           # 含 1001、1003
curl -X POST $B/ai/story/generate -H "Content-Type:application/json" -d '{"deviceId":"dev-t","episodeId":101,"highlightId":1002,"optionCode":"team","prompt":"x"}'  # TEXT
curl "$B/ai/story/3001?deviceId=dev-t"           # VIDEO,有 contentUrl
curl -X POST $B/ai/story/3001/like -H "Content-Type:application/json" -d '{"deviceId":"dev-t"}'  # +1
curl -X POST $B/ai/story/3001/like -H "Content-Type:application/json" -d '{"deviceId":"dev-t"}'  # 幂等不变
curl -X POST $B/ai/story/3001/comments -H "Content-Type:application/json" -d '{"deviceId":"dev-t","content":"赞"}'
curl $B/ai/story/3001/comments                   # 含新评论
```
边界：`/dramas/999`→1002；`/interactions` 缺 highlightId→1001；评论 content 空→1001；内部异常→5000。
单测（可选）：upsert+1 正确；Mock 各 optionCode 非空；点赞幂等仅 +1。

---

## 11. 预期成果（DoD）
1. 可运行 Spring Boot 服务，§4 全部接口实现并过 §10 测试。
2. drama_current_dump.sql 一键建库+当前数据；Knife4j 文档可访问。
3. Dockerfile + docker-compose 可部署，公网可访问。
4. 分层清晰、统一响应、无写死地址、关键逻辑中文注释。
5. 产物：后端仓库 · drama_current_dump.sql · Dockerfile · docker-compose.yml。

## 12. 执行顺序
P1 骨架跑通 `/dramas` → P2 内容 → P3 高光（含 JSON 解析）→ P4 互动计数 → P5 生成/社交/导入/Docker。每阶段跑该阶段 curl 测试，全绿再继续。冲突以本文档为准，未覆盖处保持最简 + TODO。
