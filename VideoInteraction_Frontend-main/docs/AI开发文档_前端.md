# 【前端】短剧剧情即时互动 · 开发手册（原生微信小程序端）

> 面向 AI 编码代理，用于**独立开发前端**（单独仓库 / 会话）。本文档自包含。
> **平台定位**：原生微信小程序，不使用 uni-app、Vue、HBuilderX、mp-weixin 编译产物或跨端框架。
> 开发、预览、真机调试、上传体验版统一使用**微信开发者工具**。
> 后端由《【后端】spec》独立开发。**第 4 节 API 契约为前后端共享，字段不得单方修改。**

---

## 0. 执行约束（务必遵守）
1. **平台 = 原生微信小程序**：所有页面用 `.wxml + .wxss + .ts + .json` 实现，所有真机验证在微信开发者工具 / 真机预览上做。
2. **不臆造字段**：消费后端字段严格按 §4「共享契约」；不确定加 TODO，不发明。
3. **MVP 边界**：不做登录页、个人中心、分享、复杂主题。
4. **⚠️ cover-view 是最高风险**：互动浮层/飘屏/分支选项必须能盖在**正在播放的原生 video** 上；小程序端用 `cover-view`/`cover-image`（限制见 §8）。**P3 必须在微信开发者工具里先验证叠加成立再继续。**
5. **⚠️ 合法域名（小程序特有，最易卡住）**：小程序 `wx.request` / `video` 只能访问**已配置且 HTTPS** 的域名；开发期在开发者工具里**关闭域名校验**绕过（§5.4），勿因此卡住调试。
6. **时间用秒**：与 `e.detail.currentTime`（秒）直接比较，不要和毫秒混。
7. **用户标识**：`deviceId`(String) 首启生成并持久化，每请求携带。
8. **baseUrl 走配置**：开发者工具模拟器可用 localhost；真机预览须用**可达的 HTTPS 域名/IP**（§9.2）。
9. 只用原生微信小程序 API：`wx.request` / `wx.createVideoContext` / `wx.getStorageSync` / `wx.setStorageSync` / `wx.showToast` / `wx.navigateTo` 等，不引重型 UI 库；注释中文。
10. **不删除现有文件**：保持原项目结构，不删除 miniprogram 目录及其中的原有文件，保留所有原配置文件（project.config.json、package.json、tsconfig.json 等）。
<!-- 11. **使用 TypeScript**：把 .js 文件都改成 .ts，增加接口/类型定义，使用 ES6+ import/export 语法。 -->

---

## 1. 范围与技术栈
客户端：短剧列表 → 播放页（播放 + 高光互动 + 飘屏 + 分支 + 生成内容 + 点赞评论）。
技术栈（固定）：**原生微信小程序** · WXML · WXSS · TypeScript · 微信开发者工具。不要创建 Vue 文件，不要使用 `uni.*` API，不要生成 `dist/dev/mp-weixin`。

---

## 2. 全局约定（消费侧需知）
- JSON 小驼峰；视频时间秒；时间戳字符串 `yyyy-MM-dd HH:mm:ss`。
- 枚举：
  - `highlightType`：`COOL FUNNY TWIST SWEET FAMOUS BRANCH`
  - `componentType`：`emotion_button branch_choice`
  - `generationMode`：`PREGEN ONDEMAND`（MVP 现统一走 `PREGEN`：分支内容为后台预生成视频，存 COS；`ONDEMAND` 实时文本生成已退出分支主流程，保留为可选/降级）
  - `contentType`：`TEXT VIDEO IMAGE_SEQ`
- 统一响应 `{code,message,data}`，`code=0` 成功，非 0 弹 toast。错误码：1001 参数 / 1002 不存在 / 1003 重复 / 5000 服务异常。

---

## 3. 项目结构
```text
├── miniprogram/
│   ├── app.ts
│   ├── app.json
│   ├── app.wxss
│   ├── static/
│   │   └── video/              # 本地视频文件
│   ├── pages/
│   │   ├── index/
│   │   │   ├── index.wxml     # 列表页 (F1)
│   │   │   ├── index.wxss
│   │   │   ├── index.ts
│   │   │   └── index.json
│   │   └── play/
│   │       ├── index.wxml     # 播放页 (F2~F7，核心)
│   │       ├── index.wxss
│   │       ├── index.ts
│   │       └── index.json
│   ├── components/
│   │   ├── drama-card/        # 剧集卡片
│   │   ├── highlight-overlay/ # 高光浮层数据与普通降级展示；盖 video 的部分优先写在 play/index.wxml 内的 cover-view
│   │   └── ...
│   ├── api/
│   │   ├── request.ts
│   │   ├── drama.ts
│   │   └── episode.ts
│   └── utils/
│       ├── config.ts
│       ├── device.ts
│       └── mock.ts            # 开发用
├── project.config.json
└── sitemap.json
```

> 说明：微信小程序的 `cover-view` 只能嵌在 `video` 内部并且只能包含受支持节点。为了降低风险，播放页上的视频覆盖层建议直接写在 `pages/play/index.wxml` 的 `<video>` 内，不要过度组件化。
<!-- 所有代码写在 miniprogram 目录下，保留项目根目录的所有原配置文件。 -->

---

## 4. 【共享契约】API 规格（Base `/api/v1`）+ 样例响应

> 与《【后端】spec》逐字一致。前端**消费**这些接口；样例供本地 Mock 与字段对照。

### 4.1 `GET /dramas`
```json
{"code":0,"message":"success","data":[
 {"dramaId":1,"title":"北派寻宝笔记","description":"寻宝+反转","coverUrl":"https://picsum.photos/seed/d1/300/400","tags":["爽剧","反转","悬疑"],"episodeCount":2},
 {"dramaId":2,"title":"天下第一纨绔","description":"逆袭","coverUrl":"https://picsum.photos/seed/d2/300/400","tags":["逆袭","搞笑"],"episodeCount":1}]}
```
### 4.2 `GET /dramas/{dramaId}`
```json
{"code":0,"data":{"dramaId":1,"title":"北派寻宝笔记","coverUrl":"...","tags":["爽剧"],
 "episodes":[{"episodeId":101,"episodeNo":1,"title":"第1集","duration":180},{"episodeId":102,"episodeNo":2,"title":"第2集","duration":175}]}}
```
### 4.3 `GET /episodes/{episodeId}`
```json
{"code":0,"data":{"episodeId":101,"dramaId":1,"episodeNo":1,"title":"第1集：藏宝图出现","videoUrl":"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4","duration":180}}
```
### 4.4 `GET /episodes/{episodeId}/highlights`（按 startTime 升序，interactionConfig 为对象，triggerOnce 为布尔）
```json
{"code":0,"data":[
 {"highlightId":1001,"episodeId":101,"startTime":15,"endTime":22,"highlightType":"COOL","title":"男主强势反击","triggerOnce":true,
  "interactionConfig":{"componentType":"emotion_button","buttons":[
    {"optionCode":"cool","label":"爽","effect":"float","icon":"https://picsum.photos/seed/cool/80"},
    {"optionCode":"famous_scene","label":"名场面","effect":"bubble","icon":"https://picsum.photos/seed/scene/80"}]}},
 {"highlightId":1003,"episodeId":101,"startTime":30,"endTime":36,"highlightType":"FUNNY","title":"搞笑桥段","triggerOnce":true,
  "interactionConfig":{"componentType":"emotion_button","buttons":[{"optionCode":"funny","label":"笑出鹅叫","effect":"shake","icon":"https://picsum.photos/seed/funny/80"}]}},
 {"highlightId":1002,"episodeId":101,"startTime":45,"endTime":55,"highlightType":"BRANCH","title":"是否独自进入古墓","triggerOnce":true,
  "interactionConfig":{"componentType":"branch_choice","options":[
    {"optionCode":"alone","label":"独自进入","generationMode":"PREGEN","generationId":3001,"resumeTime":55},
    {"optionCode":"team","label":"叫上伙伴","generationMode":"PREGEN","generationId":3002,"resumeTime":55}]}}]}
```
> **分支选项字段**（`interactionConfig.options[]`）：
> `optionCode` 选项编码 · `label` 按钮文案 · `generationMode` 生成模式（现统一 `PREGEN`，分支内容为后台预生成视频）· `generationId` 对应 `ai_generation` 记录 id（拿视频用 §4.9）· **`resumeTime`（秒，可选）：分支片段播完后主视频回跳到的时间点；缺省时前端回退用该高光的 `endTime`。**
### 4.5 `POST /interactions`
请求 `{deviceId,episodeId,highlightId,interactionType:"click",optionCode,content?}` → `{"code":0,"data":{"highlightId":1001,"optionCode":"cool","currentCount":129}}`
### 4.6 `GET /highlights/{highlightId}/stats`
`{"code":0,"data":{"highlightId":1001,"totalCount":168,"options":[{"optionCode":"cool","label":"爽","count":128},{"optionCode":"famous_scene","label":"名场面","count":40}]}}`
### 4.7 `GET /episodes/{episodeId}/interaction-stats`（每 4s 轮询）
`{"code":0,"data":[{"highlightId":1001,"options":[{"optionCode":"cool","count":131},{"optionCode":"famous_scene","count":42}]},{"highlightId":1003,"options":[{"optionCode":"funny","count":89}]}]}`
### 4.8 `POST /ai/story/generate`（ONDEMAND）
请求 `{deviceId,episodeId,highlightId,optionCode,prompt?}` → `{"code":0,"data":{"generationId":3002,"contentType":"TEXT","title":"携手闯古墓","content":"…","contentUrl":null,"status":"success","likeCount":0,"commentCount":0}}`
### 4.9 `GET /ai/story/{generationId}?deviceId=`（PREGEN）
`{"code":0,"data":{"generationId":3001,"contentType":"VIDEO","title":"独自深入古墓","content":null,"contentUrl":"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4","likeCount":56,"commentCount":2,"liked":false}}`
### 4.10 `POST` / `DELETE /ai/story/{generationId}/like`
请求 `{deviceId}` → `{"code":0,"data":{"generationId":3001,"likeCount":57,"liked":true}}`
### 4.11 `GET` / `POST /ai/story/{generationId}/comments`
GET → `{"code":0,"data":{"list":[{"commentId":7001,"nickname":"用户1234","content":"这个分支绝了","createTime":"2026-06-05 12:00:00"}],"total":2}}`
POST `{deviceId,nickname?,content}` → `{"code":0,"data":{"commentId":7003,"createTime":"2026-06-05 12:05:00"}}`

---

## 5. 开发与运行环境（原生微信小程序）

### 5.1 工具
- **微信开发者工具**（官方，免费）：写代码、模拟器调试、真机预览、上传体验版。
- 新建项目时选择「小程序」项目，目录直接指向本仓库根目录。
- 不需要执行跨端编译命令；不要导入 `dist/dev/mp-weixin`。

### 5.2 AppID（开发期可免繁琐注册）
- 开发调试：开发者工具新建项目时可选「**测试号**」或「**游客模式 / 不使用 AppID**」在模拟器开发。
- 真机预览 / 体验版：需登录一个小程序账号。MVP 演示可走「预览二维码 / 体验版」。
- 正式 AppID 填入 `project.config.json` 的 `appid` 字段：`wx416c91bf581d3831`。

### 5.3 同源/网络
小程序无浏览器跨域概念，**但有「合法域名」校验**（见 §5.4）。后端无需为小程序配 CORS。

### 5.4 ⚠️ 合法域名（小程序最容易卡住的点）
- 小程序 `wx.request` 的域名、`<video>` 的视频域名，正式环境必须是 **HTTPS** 且在小程序后台「开发管理 → 服务器域名」里配置：
  - `request合法域名`：后端 API 域名
  - 视频文件域名：视频所在域名（种子视频在 `commondatastorage.googleapis.com`）
- **开发期绕过**：微信开发者工具 → 右上「详情」→「本地设置」→ 勾选「**不校验合法域名、web-view、TLS 版本以及 HTTPS 证书**」。开发阶段务必勾上，否则请求/视频全失败。
- 演示/上线前：后端要有 HTTPS 公网域名并加白名单；视频也放到白名单内的 HTTPS 域名（或自己 OSS）。

### 5.5 真机预览
开发者工具点「预览」生成二维码，微信扫码在手机上跑。真机会重新校验合法域名，所以真机演示前需后端 HTTPS + 白名单，或上传体验版后测试。

---

## 6. 列表页 `pages/index/index` (F1)
- `onLoad` → `GET /dramas` → `drama-card` 网格（封面 / 标题 / 简介 / 标签 / 集数）。
- 点击卡片 → `GET /dramas/{id}` 取首集 → `wx.navigateTo({ url: '/pages/play/index?episodeId=101&dramaId=1' })`。
- 验收：渲染 2 部剧；点击进播放页。

示例逻辑：
```js
// pages/index/index.js
const dramaApi = require('../../api/drama')

Page({
  data: { dramas: [], loading: false },

  onLoad() {
    this.loadDramas()
  },

  async loadDramas() {
    this.setData({ loading: true })
    try {
      const dramas = await dramaApi.listDramas()
      this.setData({ dramas })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onTapDrama(e) {
    const dramaId = e.currentTarget.dataset.id
    const detail = await dramaApi.getDramaDetail(dramaId)
    const first = detail.episodes && detail.episodes[0]
    if (!first) return wx.showToast({ title: '暂无剧集', icon: 'none' })
    wx.navigateTo({ url: `/pages/play/index?episodeId=${first.episodeId}&dramaId=${dramaId}` })
  }
})
```

---

## 7. 播放页 `pages/play/index` (F2~F7，核心)

### 7.1 生命周期
```js
onLoad(options):
  episodeId = Number(options.episodeId)
  GET /episodes/{id}            → videoUrl,duration
  GET /episodes/{id}/highlights → highlights[]（本地缓存）
  videoCtx = wx.createVideoContext('dramaVideo', this)
  startPolling()   // setInterval 4000ms
onUnload: clearInterval; 重置状态
```

### 7.2 播放与播控 (F2)
WXML：
```xml
<video
  id="dramaVideo"
  class="drama-video"
  src="{{videoUrl}}"
  controls
  bindtimeupdate="onTimeUpdate"
>
  <cover-view wx:if="{{overlay.show}}" class="overlay">
    <cover-view class="overlay-title">{{overlay.title}}</cover-view>
    <cover-view class="button-row">
      <cover-view
        wx:for="{{overlay.buttons}}"
        wx:key="optionCode"
        class="emotion-item"
        data-option-code="{{item.optionCode}}"
        data-label="{{item.label}}"
        bindtap="onTapEmotion"
      >
        <cover-image class="emotion-icon" src="{{item.icon}}" />
        <cover-view class="emotion-label">{{item.label}}</cover-view>
        <cover-view class="emotion-count">{{item.currentCount || 0}}</cover-view>
      </cover-view>
    </cover-view>
  </cover-view>
</video>
```

### 7.3 高光调度 (F3)
```js
Page({
  data: {
    episodeId: null,
    videoUrl: '',
    highlights: [],
    overlay: { show: false, highlightId: null, title: '', buttons: [] }
  },

  triggeredMap: {},
  shownMap: {},
  videoCtx: null,
  pollTimer: null,

  onLoad(options) {
    this.setData({ episodeId: Number(options.episodeId) })
    this.videoCtx = wx.createVideoContext('dramaVideo', this)
    this.initPage()
  },

  onUnload() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.triggeredMap = {}
    this.shownMap = {}
  },

  onTimeUpdate(e) {
    const cur = Math.floor(e.detail.currentTime) // 秒
    this.checkHighlight(cur)
  },

  checkHighlight(cur) {
    const highlights = this.data.highlights || []
    highlights.forEach(h => {
      const inWin = cur >= h.startTime && cur <= h.endTime
      const id = String(h.highlightId)
      const alreadyTriggered = h.triggerOnce && this.triggeredMap[id]

      if (inWin && !this.shownMap[id] && !alreadyTriggered) {
        if (h.highlightType === 'BRANCH') {
          this.videoCtx.pause()
          this.openBranch(h)
        } else {
          this.showOverlay(h)
        }
        this.shownMap[id] = true
        if (h.triggerOnce) this.triggeredMap[id] = true
      }

      if (!inWin && this.shownMap[id]) {
        delete this.shownMap[id]
        this.hideOverlay(h.highlightId)
      }
    })
  }
})
```
拖动跳变时「窗口判断 + 已触发集合」天然兼容，不误触发。

### 7.4 互动点击 (F4)
点击按钮 `optionCode`：① 本地立即动效（float/bubble/shake → 简单 scale/位移）② `POST /interactions` ③ 用返回 `currentCount` 更新角标。

```js
async onTapEmotion(e) {
  const optionCode = e.currentTarget.dataset.optionCode
  const highlightId = this.data.overlay.highlightId
  // TODO: 本地设置一个 animatingOptionCode，WXSS 做简单 scale，不做复杂动画
  const result = await interactionApi.createInteraction({
    episodeId: this.data.episodeId,
    highlightId,
    interactionType: 'click',
    optionCode
  })
  this.updateOverlayCount(optionCode, result.currentCount)
}
```

### 7.5 飘屏 (F5)
轮询 `GET /episodes/{id}/interaction-stats` → 与上次 count 比增量 → `cover-view` 飘出「爽/笑」图标 + 更新计数。轮询定时器在 `onUnload` 清理。

### 7.6 分支 (F6)：切源播放 → 回跳主线（状态机）
命中 `BRANCH`（窗口内、未触发过）→ `videoCtx.pause()` → `cover-view` 展示 `interactionConfig.options`（盖在暂停的 video 上）。

选择 option 后（统一 `PREGEN`）：
1. 记下回跳点 `resume = option.resumeTime ?? highlight.endTime`，保存当前主视频地址 `mainVideoUrl`；
2. `GET /ai/story/{generationId}` 取分支内容；
3. 按 `contentType` 分流：
   - `VIDEO`（主流程）→ 把页面 `videoUrl` 切到 `contentUrl`（COS 视频），置 `inBranch=true`，重渲后播放；
   - `TEXT`（降级）→ `cover-view` 文本面板展示 `content`，点「继续」直接走第 5 步回跳；
4. **分支视频 `bindended`** → 把 `videoUrl` 切回 `mainVideoUrl`，置 `pendingSeek=resume`；
5. 主视频重渲后在 **`bindloadedmetadata`** 里 `videoCtx.seek(pendingSeek)` 再 `play()`，清 `inBranch`/`pendingSeek`，恢复主线。

要点：
- 一个 `<video id="dramaVideo">` 复用，靠切 `src` 实现"切源/回跳"；切源后必须等节点重渲（`bindloadedmetadata`）再 `seek`，否则 seek 落空（§见 CLAUDE 提示）。
- `inBranch` 期间 `onTimeUpdate` 直接 return，不跑高光调度（分支片段不该触发高光/飘屏）。
- 该高光 `triggerOnce=true`：弹出时即标记已触发，回跳到 `endTime` 落在窗口内也不会二次弹。
- 分支片段同样支持点赞/评论（§7.7），用其 `generationId`。

### 7.7 点赞评论 (F7)
`generated-story-popup` 下挂 `comment-popup`：点赞 `POST/DELETE /ai/story/{id}/like`（本地维护 `liked` 即时反馈）；评论 `GET/POST /ai/story/{id}/comments`。

---

## 8. ⚠️ cover-view 在小程序端（最高风险，本项目成败关键）

### 8.1 问题
小程序端 `<video>` 是**原生组件**，层级最高，普通 `<view>`/`<image>` **无法覆盖其上**。互动按钮若用普通 `view`，会被视频盖住、看不见也点不到。

### 8.2 方案 A（首选）：cover-view / cover-image
盖在视频上的元素**必须**用 `cover-view`/`cover-image`，嵌在 `<video>` 内：
```xml
<video id="dramaVideo" src="{{videoUrl}}" controls bindtimeupdate="onTimeUpdate">
  <cover-view class="overlay" wx:if="{{overlay.show}}">
    <cover-view wx:for="{{overlay.buttons}}" wx:key="optionCode" data-option-code="{{item.optionCode}}" bindtap="onTapEmotion">
      <cover-image class="emotion-icon" src="{{item.icon}}" />
      <cover-view class="badge">{{item.currentCount || 0}}</cover-view>
    </cover-view>
  </cover-view>
</video>
```
小程序端 cover-view 限制（必须遵守）：
- 只能嵌套 `cover-view` / `cover-image` / `button`；**文字必须放在 cover-view 内**，不能直接写裸文本/普通组件。
- CSS 受限，**复杂关键帧动画不可用**；用简单 `transform` / `scale` / 位置变化。
- 注意层级与定位：`cover-view` 用 `position` + `top/left/right/bottom` 定位，避免被 video 控件遮挡。

### 8.3 方案 B（备选）：video 同层渲染
微信小程序 `<video>` 支持「同层渲染」（基础库较新版本），开启后部分普通组件可叠加于视频上。可作为 cover-view 不满足时的尝试，但兼容性不稳定，**优先用 cover-view**。

### 8.4 方案 C（降级）：暂停 + 全屏普通层
互动瞬间 `videoCtx.pause()` → 用普通 `view` 全屏做动效/弹窗 → 恢复播放。复杂弹窗（分支选项、生成内容）小程序端建议走这条，避免和 cover-view 限制较劲。

### 8.5 ✅ P3 验证标准（在微信开发者工具里做，三条同时成立才算过）
1. 视频在**小程序模拟器里真实播放**（画面在动；记得在「本地设置」勾「不校验合法域名」，否则视频加载不出）。
2. 互动按钮（`cover-image` / `cover-view`）浮在**正在播放的视频画面之上**，肉眼可见。
3. 点击按钮，计数能 +1。

> 反例（不算过）：用普通 `view`（会被视频盖住）、或播放区是空背景没视频——都没触达真正的难点。
> 验证产出：微信开发者工具运行截图，画面里**同时**有 视频画面 + 浮其上的按钮 + 点击后计数变化。

---

## 9. 关键实现

### 9.1 `api/request.js`
封装 `wx.request`：注入 `BASE_URL` + 自动带 `deviceId`；拆 `{code,message,data}`，`code===0` resolve data，否则 `wx.showToast` + reject。

```js
// api/request.js
const { BASE_URL, USE_MOCK } = require('../utils/config')
const { getDeviceId } = require('../utils/device')
const mock = require('../utils/mock')

function request(options) {
  const { url, method = 'GET', data = {} } = options

  if (USE_MOCK) {
    return mock.handleMock({ url, method, data: { ...data, deviceId: getDeviceId() } })
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data: { ...data, deviceId: getDeviceId() },
      header: { 'content-type': 'application/json' },
      success(res) {
        const body = res.data || {}
        if (body.code === 0) {
          resolve(body.data)
        } else {
          wx.showToast({ title: body.message || '请求失败', icon: 'none' })
          reject(body)
        }
      },
      fail(err) {
        wx.showToast({ title: '网络请求失败', icon: 'none' })
        reject(err)
      }
    })
  })
}

module.exports = { request }
```

### 9.2 `utils/config.js`（小程序 BASE_URL）
```js
// 开发者工具模拟器：可用 localhost（与后端同机时）
// 真机预览/体验版：必须 HTTPS 域名且在小程序后台白名单
const BASE_URL = 'http://localhost:8080/api/v1' // 模拟器调试
// 真机/演示：'https://<你的后端HTTPS域名>/api/v1'
const USE_MOCK = true // 后端未就绪时本地 Mock；联调置 false

module.exports = { BASE_URL, USE_MOCK }
```
> 提醒：模拟器能用 localhost；**真机预览不能用 localhost**，且小程序真机会校验合法域名 → 需 HTTPS 公网域名 + 后台白名单。

### 9.3 `utils/device.js`
```js
function getDeviceId() {
  let id = wx.getStorageSync('deviceId')
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    wx.setStorageSync('deviceId', id)
  }
  return id
}

module.exports = { getDeviceId }
```

### 9.4 `app.json`
```json
{
  "pages": [
    "pages/index/index",
    "pages/play/index"
  ],
  "window": {
    "navigationBarTitleText": "短剧互动",
    "navigationBarBackgroundColor": "#111111",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#111111"
  },
  "usingComponents": {}
}
```

### 9.5 `project.config.json`
```json
{
  "appid": "wx416c91bf581d3831",
  "projectname": "interactive-drama-miniprogram",
  "compileType": "miniprogram",
  "setting": {
    "urlCheck": false,
    "es6": true,
    "enhance": true,
    "postcss": true,
    "minified": true
  }
}
```

---

## 10. 本地 Mock（后端未就绪时）
`utils/mock.js` 导出 §4 各接口样例响应；`request.js` 在 `USE_MOCK=true` 时按 path 返回 mock。互动上报 mock 本地 +1；轮询 mock 每次随机 +1~3 制造飘屏。联调置 false 切真实后端。

Mock 必须返回 Promise，保持和真实 `wx.request` 封装调用方式一致：
```js
function handleMock({ url, method, data }) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // TODO: 按 url/method 返回 §4 样例 data，不改变字段
      resolve(mockData)
    }, 200)
  })
}
module.exports = { handleMock }
```

---

## 11. 分阶段（每阶段过手测点再继续）
| Phase | 内容 | 手测点（平台） |
|-------|------|----------------|
| P1 工程 | 原生小程序工程初始化 + app.json/project.config.json + request/config/device/mock | 微信开发者工具能打开、空壳页渲染 |
| P2 列表+播放 | 列表页 + 播放页 video | 模拟器：列表 2 剧 → 点击 → **视频真实播放**（勾不校验域名） |
| P3 高光+叠加 | cover-view 浮层 + timeupdate 调度 | **开发者工具：§8.5 三条同时成立**（视频在播+按钮浮其上+点击计数+1）→ 不过不许进 P4 |
| P4 互动 | 上报 + 角标 + 飘屏轮询 | 点「爽」动效+计数+1；飘屏定时出现 |
| P5 分支+社交 | 分支弹窗 + 切播/生成 + 点赞评论 | 45s 弹分支；alone 播视频、team 出文本；点赞+评论 |
| P6 真机/体验版 | 切真实后端(HTTPS+白名单) + 预览/体验版 | 真机扫码跑通全流程 |

---

## 12. 测试点（开发者工具 + 真机预览手测清单）
- [ ] 列表页 2 剧信息正确，点击进入
- [ ] 播放/暂停/拖动正常（已勾「不校验合法域名」使视频可加载）
- [ ] 15s 弹「爽/名场面」**覆盖在正在播放的视频上**（cover-view 生效），22s 消失，不重复
- [ ] 点「爽」有动效，角标 +1
- [ ] 每 ~4s 飘屏/计数变化
- [ ] 45s 弹分支；「独自进入」播视频，「叫上伙伴」出文本剧情
- [ ] 生成内容点赞（+1，重复点不加）、评论后列表出现
- [ ] 真机预览：后端 HTTPS + 白名单后，以上全通
- [ ] 切 `USE_MOCK=false` 后字段与真实后端一致（无报错）

---

## 13. 联调约定（与后端对齐）
- 模拟器 `BASE_URL` 可用 localhost；真机须 HTTPS 域名 + 小程序后台白名单（request + 视频域名）。
- 每请求带 `deviceId`；字段/枚举/错误码以 §2/§4 为准；**契约变更需同步后端 spec**。
- 小程序无需后端 CORS；卡请求多半是「合法域名校验」未关或域名未白名单。

---

## 14. 预期成果（DoD）
1. 原生微信小程序工程：列表页 + 播放页 + 必要组件，过 §12 手测清单。
2. **cover-view 互动浮层在开发者工具/真机上正确覆盖正在播放的视频**。
3. `USE_MOCK` 可独立开发；切真实后端字段一致。
4. 真机预览/体验版连后端(HTTPS+白名单)跑通 F1~F7。
5. 无写死地址、关键逻辑中文注释。产物：原生小程序前端仓库 + 体验版二维码。

## 15. 执行顺序
P1 原生小程序工程 + Mock + 开发者工具跑通 → P2 列表/播放（勾不校验域名，确认视频能播）→ **P3 先在开发者工具验证 cover-view 叠加（§8.5）再写时间轴调度** → P4 互动/飘屏 → P5 分支/社交 → P6 切后端(HTTPS+白名单)+真机预览。每阶段过手测点再继续。冲突以本文档为准，未覆盖处保持最简 + TODO。
