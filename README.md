# SRI - 短剧剧情即时互动激发系统

SRI 是一个面向短剧场景的 AI 全栈互动项目。它把短剧从普通播放升级为“剧情时间线上的即时互动”：用户在爽点、反转点、名场面、分支点或动作点出现时，可以点击情绪按钮、发送弹幕、选择剧情分支、触发动作互动，并查看 AI 生成的分支/动作内容。

仓库是脱敏源码包，不包含真实 API Key、本机 SDK 路径、`.env`、`application-local.yml`、`local.properties`、依赖目录、虚拟环境、构建产物、日志、大视频文件和运行时数据库。

## 项目结构

```text
.
├── VideoInteraction_Frontend-main   # 原生微信小程序端
├── VideoInteraction_Android-main    # Android WebView APK 端
├── VideoInteraction_Backend-main    # Spring Boot 后端服务
├── Videointeraciton_RAG             # Python AI/RAG 短剧分析服务
└── 封面                              # 演示短剧封面素材
```

## 功能概览

- 短剧首页/剧场：短剧列表、封面、标签、搜索历史、首页滑动切剧。
- 播放互动：自动播放、自动连播、倍速菜单、长按 2x、情绪大图、统计弹幕、高光按钮、分支播放、动作互动。
- 社交能力：登录注册、点赞、收藏、评论、弹幕发送。
- 上传工作台：小程序 COS 直传、Android multipart 上传、封面选择、上传批次、视频资产表、完成回调。
- RAG 分析：上传视频后启动 RAG 任务，抽帧/ASR/OCR/多模态理解，生成高光弹幕、分支选择和动作互动配置。
- 双端适配：同一后端和 AI 链路支持微信小程序端与 Android WebView APK 端。

## 环境要求

|模块|建议环境|
|---|---|
|后端|JDK 17、Maven、MySQL 8，可选 Docker / Docker Compose|
|RAG 服务|Python 3.10/3.11、ffmpeg、可访问火山方舟 OpenAI 兼容接口|
|微信小程序|微信开发者工具|
|Android|Android Studio 或 Gradle + Android SDK|

## 1. 启动后端

后端目录：

```bash
cd VideoInteraction_Backend-main
```

### 方式 A：Docker Compose

复制环境变量示例：

```bash
cp .env.example .env
```

编辑 `.env`，至少设置：

```env
MYSQL_ROOT_PASSWORD=change-me
SPRING_DATASOURCE_PASSWORD=change-me
APP_SECRET_KEY=change-this-secret
```

需要上传到腾讯云 COS 时，再填写：

```env
COS_SECRET_ID=
COS_SECRET_KEY=
COS_PLAYBACK_PROXY_BASE_URL=
```

启动：

```bash
docker compose up --build
```

后端默认地址：

```text
http://localhost:8080/api/v1
```

接口文档：

```text
http://localhost:8080/api/v1/doc.html
```

### 方式 B：本地 Maven + MySQL

创建并导入数据库：

```bash
mysql -uroot -p --default-character-set=utf8mb4 < src/main/resources/sql/drama_current_dump.sql
```

设置环境变量。PowerShell 示例：

```powershell
$env:SPRING_DATASOURCE_URL="jdbc:mysql://localhost:3306/drama?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai&connectionCollation=utf8mb4_unicode_ci"
$env:SPRING_DATASOURCE_USERNAME="root"
$env:SPRING_DATASOURCE_PASSWORD="<YOUR_MYSQL_PASSWORD>"
$env:APP_SECRET_KEY="<CHANGE_ME>"
$env:RAG_BASE_URL="http://localhost:8091"
$env:BACKEND_CALLBACK_BASE_URL="http://localhost:8080/api/v1"
mvn spring-boot:run
```

后端启动后可先检查：

```bash
curl http://localhost:8080/api/v1/dramas
```

## 2. 启动 RAG 服务

RAG 目录：

```bash
cd Videointeraciton_RAG
```

创建虚拟环境并安装依赖：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Linux/macOS 激活命令为：

```bash
source .venv/bin/activate
```

复制并填写模型配置：

```bash
cp .env.example .env
```

`.env` 中至少填写：

```env
ARK_API_KEY=<YOUR_ARK_API_KEY>
ARK_ENDPOINT_ID=<YOUR_ARK_ENDPOINT_ID>
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

启动 RAG 服务：

```bash
python rag_service.py --host 0.0.0.0 --port 8091
```

检查服务状态：

```bash
curl http://localhost:8091
```

说明：

- 仓库不包含真实 RAG 数据库、大视频和运行时结果。
- 如果需要从零建立 RAG 库，按 `Videointeraciton_RAG/README.md` 运行 `1_prepare_dataset.py`、`2_build_rag.py`、`3_predict.py`。
- 如果只演示已有后端种子数据的播放互动，可以先不启动 RAG 服务。

## 3. 运行微信小程序端

用微信开发者工具打开：

```text
VideoInteraction_Frontend-main
```

检查接口地址：

```js
// VideoInteraction_Frontend-main/utils/config.js
const BASE_URL = 'http://localhost:8080/api/v1'
const USE_MOCK = false
```

本机模拟器可以使用 `localhost`。真机预览时，`localhost` 指向手机本身，请改成手机可访问的局域网 IP 或公网 HTTPS 域名。

开发阶段如果请求或视频加载失败，可在微信开发者工具中打开：

```text
详情 -> 本地设置 -> 不校验合法域名、web-view、TLS 版本以及 HTTPS 证书
```

正式真机/体验版需要在小程序后台配置合法 request 域名和视频域名。

## 4. 运行 Android APK 端

Android 目录：

```bash
cd VideoInteraction_Android-main
```

复制本机 SDK 配置：

```bash
cp local.properties.example local.properties
```

编辑 `local.properties`：

```properties
sdk.dir=<ANDROID_SDK_PATH>
```

检查接口地址：

```js
// VideoInteraction_Android-main/app/src/main/assets/web/app.js
const CONFIG = {
  BASE_URL: "http://localhost:8080/api/v1"
}
```

真机运行时同样不要使用 `localhost`，请改成手机能访问到的后端地址。

构建 Debug APK：

```bash
./gradlew assembleDebug
```

Windows 可使用：

```powershell
.\gradlew.bat assembleDebug
```

生成路径通常为：

```text
VideoInteraction_Android-main/app/build/outputs/apk/debug/app-debug.apk
```

## 5. 推荐演示流程

1. 启动 MySQL 和 Spring Boot 后端。
2. 打开 `http://localhost:8080/api/v1/doc.html` 或请求 `/dramas`，确认后端可用。
3. 启动 RAG 服务，确认 `http://localhost:8091` 可访问。
4. 打开小程序或安装 Android APK。
5. 进入首页/剧场，选择短剧播放。
6. 观察自动播放、自动连播、情绪按钮、情绪大图、弹幕、分支选择、动作互动、点赞收藏评论。
7. 进入上传页，填写短剧标题、剧情简介、模型 API Key / endpoint，选择视频和封面。
8. 上传完成后进入 RAG 工作台，选择待处理批次并启动分析。
9. 分析完成后回到播放页，验证 AI 生成的互动点已按时间线触发。

## 6. 配置速查

|配置|位置|说明|
|---|---|---|
|后端端口|`VideoInteraction_Backend-main/src/main/resources/application.yml`|默认 `8080`，上下文路径 `/api/v1`|
|MySQL|环境变量 `SPRING_DATASOURCE_*`|数据库地址、账号、密码|
|COS|环境变量 `COS_SECRET_ID` / `COS_SECRET_KEY`|上传和生成素材需要|
|RAG 地址|环境变量 `RAG_BASE_URL`|后端调用 RAG 服务的地址|
|后端回调地址|环境变量 `BACKEND_CALLBACK_BASE_URL`|RAG 服务回调后端时使用|
|小程序 API|`VideoInteraction_Frontend-main/utils/config.js`|修改 `BASE_URL`|
|Android API|`VideoInteraction_Android-main/app/src/main/assets/web/app.js`|修改 `CONFIG.BASE_URL`|
|RAG 模型|`Videointeraciton_RAG/.env`|填写 `ARK_API_KEY` 和 `ARK_ENDPOINT_ID`|

## 7. 常见问题

### 真机访问不到后端

模拟器可以用 `localhost`，真机不行。请把 `BASE_URL` 改成手机可访问的局域网 IP 或公网域名，例如：

```text
http://192.168.1.10:8080/api/v1
```

微信小程序正式预览还需要 HTTPS 和合法域名配置。

### 上传失败或 COS 报错

确认后端已经配置：

```env
COS_SECRET_ID=
COS_SECRET_KEY=
```

并确认 bucket、region、domain 与 `application.yml` 中一致。

### RAG 任务一直失败

优先检查：

- RAG 服务是否启动在 `8091`。
- 后端 `RAG_BASE_URL` 是否能访问 RAG 服务。
- `BACKEND_CALLBACK_BASE_URL` 是否能被 RAG 服务访问。
- RAG `.env` 是否填写了真实 `ARK_API_KEY` 和 `ARK_ENDPOINT_ID`。
- 运行环境是否安装了 ffmpeg 和 Python 依赖。

### Android 构建找不到 SDK

确认 `VideoInteraction_Android-main/local.properties` 已存在，并填写：

```properties
sdk.dir=<ANDROID_SDK_PATH>
```

### 不想上传真实密钥

不要提交这些文件：

```text
.env
application-local.yml
src/main/resources/application-local.yml
local.properties
```

仓库 `.gitignore` 已默认忽略它们。

## 8. 安全说明

本仓库已经做过脱敏处理，但你在本地运行时仍需要自己创建 `.env`、`application-local.yml` 或 `local.properties`。这些文件只能保存在本机或部署环境中，不要提交到 GitHub。

如果误提交了真实 key，请立即：

1. 在对应云平台撤销/轮换 key。
2. 从 Git 历史中清理敏感提交。
3. 重新推送清理后的历史。

