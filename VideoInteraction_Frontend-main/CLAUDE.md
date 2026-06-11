# 短剧剧情即时互动 · 前端（原生微信小程序）

严格按 @docs/SPEC.md 实现，任何冲突以 SPEC.md 为准。本文件是规则摘要，SPEC.md 是完整规格。
平台：**原生微信小程序**，使用微信开发者工具开发、预览、真机调试和上传体验版。不要使用 uni-app、Vue、HBuilderX 或 mp-weixin 编译链路。

## 硬规则（不可违反）
- **不臆造字段**：消费后端字段严格按 SPEC.md 第 4 节「共享契约」；不确定加 TODO，不发明。
- **MVP 边界**：不做登录页、个人中心、分享、复杂主题。
- **⚠️ cover-view 最高风险**：互动浮层/飘屏/分支选项必须用 `cover-view`/`cover-image` 盖在**正在播放的原生 video** 上；普通 `view` 盖不住。小程序端限制更严：文字须放 `cover-view` 内、无复杂动画；复杂弹窗用「暂停 + 全屏普通层」降级。**P3 必须在微信开发者工具里先验证叠加成立再继续。**
- **⚠️ 合法域名（小程序特有，最易卡住）**：`wx.request` 和 `video` 域名需 HTTPS + 后台白名单；开发期在微信开发者工具「详情 → 本地设置」勾「**不校验合法域名…**」绕过，否则请求和视频全失败。别因此误判成别的 bug。
- **时间用秒**：与 `video` 的 `timeupdate` 事件返回值 `e.detail.currentTime`（秒）直接比较，不要和毫秒混。
- **用户标识**：`deviceId`(String) 首启生成并持久化，每请求携带。
- **baseUrl 走配置**：模拟器可用 localhost；**真机预览不能用 localhost**，须 HTTPS 域名 + 白名单。
- 只用原生微信小程序能力：`wx.request`、`wx.createVideoContext`、`wx.getStorageSync`、`wx.setStorageSync`、`wx.showToast`、`wx.navigateTo` 等；不引重型 UI 库；注释中文。
- **不删除现有文件**：保持原项目结构，不删除 miniprogram 目录及其中的原有文件，保留所有原配置文件。
<!-- - **使用 TypeScript**：所有 .js 文件改为 .ts，增加接口/类型定义，使用 ES6+ import/export 语法。 -->

## 技术栈
原生微信小程序：WXML + WXSS + TypeScript。交付体验版 / 预览二维码。
AppID：已注册，`wx416c91bf581d3831`。

## 执行方式
按 SPEC.md 第 11 节分阶段 P1→P6 推进：**每阶段过该阶段手测点再继续**。
P2 起在微信开发者工具里记得勾「不校验合法域名」，否则视频加载不出。
后端未就绪时用 SPEC.md 第 10 节本地 Mock（`USE_MOCK=true`）独立开发，联调切 `false`。
第 4 节 API 契约若需变更，先提示我同步后端 spec，不得单方改字段。
