# SRI - 短剧剧情即时互动激发系统

本仓库是 AI 全栈挑战赛短剧互动项目的脱敏源码包，包含：

- `VideoInteraction_Frontend-main`：原生微信小程序端。
- `VideoInteraction_Android-main`：Android WebView APK 端。
- `VideoInteraction_Backend-main`：Spring Boot 后端服务。
- `Videointeraciton_RAG`：Python AI/RAG 短剧分析服务。
- `封面`：演示短剧封面素材。

## 脱敏说明

仓库不包含真实 API Key、本机 SDK 路径、`.env`、`application-local.yml`、`local.properties`、依赖目录、虚拟环境、构建产物、日志、大视频文件和运行时数据库。运行前请按各模块的 `.example` 文件创建本地配置。

## 快速入口

后端：

```bash
cd VideoInteraction_Backend-main
cp .env.example .env
mvn spring-boot:run
```

RAG 服务：

```bash
cd Videointeraciton_RAG
cp .env.example .env
python rag_service.py --host 0.0.0.0 --port 8091
```

Android：

```bash
cd VideoInteraction_Android-main
cp local.properties.example local.properties
./gradlew assembleDebug
```

小程序端请用微信开发者工具打开 `VideoInteraction_Frontend-main`。

