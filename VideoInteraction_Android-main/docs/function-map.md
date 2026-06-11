# Android Function Map

Source frontend: `VideoInteraction_Frontend-main`

## Pages

| Mini program page | Android route | Status |
| --- | --- | --- |
| `pages/home/index` | `home` | Short-video feed, random drama, video playback, social actions, comments, danmaku, emotion buttons, branch choice, action button, generated story playback |
| `pages/index/index` | `theater` | Drama list, category chips, search, search history, continue/open drama |
| `pages/mine/index` | `mine` | Login/register/logout, liked dramas, favorite dramas, continue watching, upload/RAG entry |
| `pages/upload/index` | `upload` | Up to 100 videos, episode inference/editing, drama title, required drama description, judge key, endpoint id, generation key, batch create, video upload, batch complete |
| `pages/rag/index` | `rag` | Pending-video groups, batch selection, required judge key and endpoint id, optional generation key, start task, retry, active task polling |
| `pages/play/index` | `play` | Full-drama video page, episode selector, progress restore, highlight interactions, branch/action generated video restore |
| `custom-tab-bar` | bottom `tab-bar` | Home, Theater, Mine |

## API Mapping

| Mini program API | Android implementation |
| --- | --- |
| `api/request.js` | `request()` in `app.js`, adds `deviceId`, unwraps `{ code, message, data }`, sends bearer token |
| `api/drama.js` | `api.listDramas`, `api.getDrama` |
| `api/episode.js` | `api.getEpisode`, `api.getHighlights`, `api.getInteractionStats` |
| `api/interaction.js` | `api.createInteraction` |
| `api/danmaku.js` | `api.listDanmaku`, `api.postDanmaku` |
| `api/ai.js` | `api.getStory`, `api.generateStory` |
| `api/social.js` | `api.getDramaSocial`, like/favorite/comment APIs, `api.getMySocial` |
| `api/auth.js` | `api.login`, `api.register`, `api.logout`, `/auth/me` refresh |
| `api/upload.js` | `api.createUploadBatch`, `uploadBackendFile`, `api.completeUploadBatch` |
| `api/analysis.js` | pending videos, active task, start task, retry, poll task |

## Deliberate Android Differences

- Android uses native browser video controls for stable pause, seek and fullscreen-like behavior inside WebView.
- Android uploads selected local files through backend multipart upload, then the backend writes to COS. This avoids depending on the WeChat-only COS SDK.
- Device id comes from Android `Settings.Secure.ANDROID_ID` through `AndroidBridge`.
