# 短剧剧情即时互动 · 后端

严格按 @docs/SPEC.md 实现，任何冲突以 SPEC.md 为准。本文件是规则摘要，SPEC.md 是完整规格。

## 硬规则（不可违反）
- **不臆造字段**：字段名/类型/枚举/接口路径严格按 SPEC.md 第 4 节「共享契约」；不确定处加 TODO 注释，不发明。
- **MVP 边界**：不做登录鉴权、在线实时视频生成编排、支付、推荐、后台管理 UI、微服务。
- **AI 一律 Mock**：AI 能力统一走 `AiStoryClient`，默认 `MockAiStoryClient` 返回预置内容，**禁止调用任何真实大模型**。
- **统一响应**：`ApiResponse{code,message,data}`，code=0 成功；HTTP 一律 200，业务错误用 code。
- **时间单位**：视频时间字段（startTime/endTime/duration）= 秒(int)；时间戳 = DATETIME（yyyy-MM-dd HH:mm:ss, Asia/Shanghai）。
- **用户标识**：deviceId(String)，免登录，不校验合法性。
- **不写死地址**：DB / baseUrl / admin token 走 application.yml 配置。
- 注释中文、命名英文；不引入 SPEC 未列依赖（Redis 属可选增强，baseline 不依赖）。

## 技术栈
JDK 17 · Spring Boot 3.2 · Maven · MyBatis-Plus · MySQL 8 · Lombok · Jakarta Validation · Knife4j。

## 执行方式
按 SPEC.md 第 9 节分阶段 P1→P5 推进：**每个 Phase 完成后，跑 SPEC.md 第 10 节对应 curl 测试点，全部 code=0 再进下一阶段**。
第 4 节 API 契约若需变更，先提示我同步前端 spec，不得单方改字段。
