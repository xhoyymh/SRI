#!/usr/bin/env bash
# =============================================================================
# 短剧后端冒烟脚本
# 覆盖：后端文档接口 4.1–4.12 + 联调清单第 3 节全部冒烟项（API 层）
# 仅验证后端 HTTP 契约；前端 UI 行为（cover-view 叠加、角标、飘屏）仍需在
# 微信开发者工具里人工核对。
#
# 用法:
#   bash smoke.sh
#   BASE_URL=http://192.168.1.10:8080/api/v1 ADMIN_TOKEN=dev-admin-token bash smoke.sh
# 依赖: curl（无需 jq）
# =============================================================================
set -u

BASE="${BASE_URL:-http://localhost:8080/api/v1}"
TOKEN="${ADMIN_TOKEN:-dev-admin-token}"
DEV="smoke-$(date +%s)"          # 本次运行唯一 deviceId，避免污染既有点赞
CT="Content-Type: application/json"
PASS=0; FAIL=0
RESP=""

# ---- 小工具 ----
get(){  RESP=$(curl -s "$BASE$1"); }
post(){ RESP=$(curl -s -X POST "$BASE$1" -H "$CT" -d "$2"); }
del(){  RESP=$(curl -s -X DELETE "$BASE$1" -H "$CT" -d "$2"); }
posttok(){ RESP=$(curl -s -X POST "$BASE$1" -H "$CT" -H "X-Admin-Token: $3" -d "$2"); }

# ok <描述> <grep正则>  —— 在 RESP 中匹配
ok(){
  if echo "$RESP" | grep -Eq "$2"; then
    printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1))
  else
    printf '  \033[31mFAIL\033[0m  %s\n' "$1"; printf '        resp: %s\n' "$RESP"; FAIL=$((FAIL+1))
  fi
}
# 取 RESP 中某数值字段的首个值
num(){ echo "$RESP" | grep -o "\"$1\":[0-9]*" | head -1 | grep -o '[0-9]*'; }
# 统计 RESP 中某 key 出现次数
cnt(){ echo "$RESP" | grep -o "\"$1\"" | wc -l | tr -d ' '; }

echo "BASE_URL = $BASE"
echo "deviceId = $DEV"
echo

# ---- 预检：服务可达 ----
if ! curl -s -o /dev/null -m 5 "$BASE/dramas"; then
  echo "无法访问 $BASE/dramas —— 请确认后端已启动、BASE_URL 正确、已导入 drama_current_dump.sql。"
  exit 2
fi

echo "== 4.1 GET /dramas =="
get "/dramas"
ok "[4.1] code:0" '"code":0'
ok "[4.1] 列表含 2 部剧 (清单#1)" "$([ "$(cnt dramaId)" -ge 2 ] && echo '"code":0' || echo '__none__')"

echo "== 4.2 GET /dramas/1 =="
get "/dramas/1"
ok "[4.2] dramaId:1 且含 episodes" '"dramaId":1'
ok "[4.2] 含剧集列表" '"episodes"'

echo "== 4.3 GET /episodes/101 (清单#2) =="
get "/episodes/101"
ok "[4.3] episodeId:101" '"episodeId":101'
ok "[4.3] 含 videoUrl(可播放前提)" '"videoUrl"'

echo "== 4.4 GET /episodes/101/highlights (清单#3) =="
get "/episodes/101/highlights"
ok "[4.4] code:0" '"code":0'
ok "[4.4] 返回 3 条高光" "$([ "$(cnt highlightId)" -ge 3 ] && echo '"code":0' || echo '__none__')"
ok "[4.4] 含情绪按钮配置(爽/名场面)" '"componentType":"emotion_button"'
ok "[4.4] 含分支配置(45s)" '"componentType":"branch_choice"'
ok "[4.4] 分支 alone 预生成视频 generationId:3001" '"generationId":3001'
ok "[4.4] 分支 team 预生成视频 generationId:3002" '"generationId":3002'
ok "[4.4] 分支均 PREGEN(无 ONDEMAND)" "$([ "$(cnt 'generationMode')" -ge 2 ] && ! echo "$RESP" | grep -q ONDEMAND && echo '"code":0' || echo '__none__')"
ok "[4.4] 分支含 resumeTime(回跳秒数)" '"resumeTime":55'

echo "== 4.5 POST /interactions  点\"爽\" (清单#4) =="
post "/interactions" "{\"deviceId\":\"$DEV\",\"dramaId\":1,\"episodeId\":101,\"highlightId\":1001,\"interactionType\":\"COOL\",\"optionCode\":\"cool\"}"
ok "[4.5] code:0 且返回 currentCount" '"currentCount":[0-9]'
C1=$(num currentCount)
post "/interactions" "{\"deviceId\":\"$DEV\",\"dramaId\":1,\"episodeId\":101,\"highlightId\":1001,\"interactionType\":\"COOL\",\"optionCode\":\"cool\"}"
C2=$(num currentCount)
ok "[4.5] 再次上报计数 +1 ($C1 -> $C2)" "$([ "${C2:-0}" -gt "${C1:-0}" ] && echo '"code":0' || echo '__none__')"
post "/interactions" "{\"deviceId\":\"$DEV\",\"episodeId\":101,\"interactionType\":\"COOL\"}"
ok "[4.5] 缺 highlightId -> 1001 参数校验失败" '"code":1001'

echo "== 4.6 GET /highlights/1001/stats =="
get "/highlights/1001/stats"
ok "[4.6] 含 totalCount + options[].label" '"totalCount"'
ok "[4.6] 含选项 label" '"label"'

echo "== 4.7 GET /episodes/101/interaction-stats (清单#5 飘屏数据源) =="
get "/episodes/101/interaction-stats"
ok "[4.7] code:0 含 highlightId 聚合" '"highlightId"'

echo "== 4.8 POST /ai/story/generate  (可选/降级文本生成，已非分支主流程) =="
post "/ai/story/generate" "{\"deviceId\":\"$DEV\",\"dramaId\":1,\"episodeId\":101,\"highlightId\":1002,\"optionCode\":\"team\"}"
ok "[4.8] code:0" '"code":0'
ok "[4.8] Mock 产出 contentType:TEXT" '"contentType":"TEXT"'
ok "[4.8] 含 title/content" '"content"'
GEN=$(num generationId)
echo "        -> 新生成 generationId=${GEN} (仅用于后续点赞/评论冒烟)"

echo "== 4.9 GET /ai/story/{id}  分支预生成视频(清单#6) =="
get "/ai/story/$GEN?deviceId=$DEV"
ok "[4.9] 返回详情(liked:false)" '"liked":false'
get "/ai/story/3001?deviceId=$DEV"
ok "[4.9] alone(3001) contentType:VIDEO 独自进入播视频" '"contentType":"VIDEO"'
ok "[4.9] alone(3001) 含 contentUrl(COS地址)" '"contentUrl"'
get "/ai/story/3002?deviceId=$DEV"
ok "[4.9] team(3002) contentType:VIDEO 叫上伙伴也播视频" '"contentType":"VIDEO"'
ok "[4.9] team(3002) 含 contentUrl(COS地址)" '"contentUrl"'
get "/ai/story/99999999?deviceId=$DEV"
ok "[4.9] 不存在 -> 1002" '"code":1002'

echo "== 4.10 POST/DELETE /ai/story/{id}/like (清单#7 点赞幂等) =="
post "/ai/story/$GEN/like" "{\"deviceId\":\"$DEV\"}"
ok "[4.10] 点赞 liked:true" '"liked":true'
L1=$(num likeCount)
post "/ai/story/$GEN/like" "{\"deviceId\":\"$DEV\"}"
L2=$(num likeCount)
ok "[4.10] 重复点赞计数不变 ($L1 -> $L2)" "$([ "${L1:-0}" -eq "${L2:-0}" ] && echo '"code":0' || echo '__none__')"
del "/ai/story/$GEN/like" "{\"deviceId\":\"$DEV\"}"
L3=$(num likeCount)
ok "[4.10] 取消点赞 liked:false 且 -1 ($L2 -> $L3)" "$([ "${L3:-0}" -lt "${L2:-0}" ] && echo '"liked":false' || echo '__none__')"

echo "== 4.11 GET/POST /ai/story/{id}/comments (清单#7 评论) =="
get "/ai/story/3001/comments?page=1&size=20"
ok "[4.11] 列表含 total + list" '"total"'
ok "[4.11] 种子评论存在(>=2)" "$([ "$(num total)" -ge 2 ] && echo '"total"' || echo '__none__')"
post "/ai/story/$GEN/comments" "{\"deviceId\":\"$DEV\",\"nickname\":\"冒烟测试\",\"content\":\"自动化冒烟评论\"}"
ok "[4.11] 发评论返回 commentId" '"commentId":[0-9]'
get "/ai/story/$GEN/comments?page=1&size=20"
ok "[4.11] 新评论出现在列表" '自动化冒烟评论'
post "/ai/story/$GEN/comments" "{\"deviceId\":\"$DEV\",\"content\":\"\"}"
ok "[4.11] 空内容 -> 1001" '"code":1001'

echo "== 4.12 admin 导入 (X-Admin-Token) =="
posttok "/admin/highlights:batch" "{\"episodeId\":101,\"highlights\":[{\"startTime\":70,\"endTime\":78,\"highlightType\":\"COOL\",\"title\":\"冒烟高光\",\"triggerOnce\":1,\"interactionConfig\":{\"componentType\":\"emotion_button\",\"buttons\":[{\"optionCode\":\"cool\",\"label\":\"爽\"}]}}]}" "$TOKEN"
ok "[4.12] highlights:batch inserted>=1" '"inserted":[1-9]'
posttok "/admin/ai-stories:batch" "{\"items\":[{\"episodeId\":101,\"highlightId\":1002,\"optionCode\":\"team\",\"contentType\":\"TEXT\",\"title\":\"冒烟导入\",\"content\":\"导入正文\"}]}" "$TOKEN"
ok "[4.12] ai-stories:batch 返回 inserted+ids" '"ids"'
post "/admin/highlights:batch" "{\"episodeId\":101,\"highlights\":[]}"   # 无 token
ok "[4.12] 无 token -> 403" '"code":403'
posttok "/admin/highlights:batch" "{\"episodeId\":101,\"highlights\":[]}" "wrong-token"
ok "[4.12] 错误 token -> 403" '"code":403'

echo
echo "================  结果  ================"
echo "  PASS: $PASS    FAIL: $FAIL"
echo "========================================"
[ "$FAIL" -eq 0 ] || exit 1
