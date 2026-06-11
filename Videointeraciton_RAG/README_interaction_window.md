
# 互动持续窗口版脚本

## 替换文件
把压缩包内容复制到项目根目录：
- 1_prepare_dataset.py
- 2_build_rag.py
- 3_predict.py
- src/prompts.py

## 第一批 seed 数据生成
```powershell
python 1_prepare_dataset.py --input-dir data/raw_videos_seed --out data/samples/seed_samples_unlabeled.jsonl --work-dir data/work_seed --segment-seconds 30 --frame-count 3 --batch-segments 3 --sheet-columns 3 --asr-model-size medium --asr-device cuda --asr-compute-type float16 --language zh --skip-ocr --temperature 0 --max-tokens 4096
```

## 新 label 格式
三类互动都必须有 interaction_window，高光弹幕也不例外：
```json
"label": {
  "source": "human",
  "is_interactive": true,
  "interaction_type": "高光弹幕",
  "trigger_time": 18.0,
  "interaction_window": {"start": 18.0, "end": 22.0, "duration": 4.0},
  "insert_position": "overlay",
  "continuity_safe": true,
  "must_not_change_main_plot": true,
  "resume_condition": "弹幕/特效覆盖结束后继续播放原视频，不改变人物动作、台词和剧情结果",
  "confidence": 0.9,
  "reason_type": "打脸",
  "requires_visual": false,
  "reason": "人工确认：该处有明显打脸爽点，适合持续展示高光弹幕"
}
```
none 样本：
```json
"label": {
  "source": "human",
  "is_interactive": false,
  "interaction_type": "none",
  "trigger_time": null,
  "interaction_window": null,
  "insert_position": null,
  "continuity_safe": false,
  "must_not_change_main_plot": true,
  "resume_condition": "",
  "confidence": 0.9,
  "reason_type": "普通对话",
  "requires_visual": false,
  "reason": "人工确认：普通铺垫片段，不适合插入或覆盖互动"
}
```

## insert_position
- 高光弹幕：overlay
- 分支创建：before_decision
- 动作互动：during_action

## 构建 RAG
```powershell
python 2_build_rag.py --samples data/samples/seed_samples_labeled_final.jsonl --cases data/rag/rag_cases_v1.jsonl --db data/rag/rag_cases_v1.sqlite --require-human
```

严格检查：
```powershell
python 2_build_rag.py --samples data/samples/seed_samples_labeled_final.jsonl --cases data/rag/rag_cases_v1.jsonl --db data/rag/rag_cases_v1.sqlite --require-human --strict
```
