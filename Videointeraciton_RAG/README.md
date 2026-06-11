# Doubao 短剧互动点判断器：简化 3 脚本版

这个版本把原来的 11 个脚本合并成 3 个主脚本：

```text
1_prepare_dataset.py   抽帧 + ASR + OCR + Doubao 图文理解 + 生成 samples
2_build_rag.py         从人工标注 samples 生成 RAG cases 和 SQLite RAG 库
3_predict.py           用 RAG + Doubao 判断互动点，并导出每集 Top-K 复核文件
```

## 0. 安装

```bash
python3.11 -m venv .venv
source .venv/bin/activate
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

`requirements.txt` 是默认本地开发/CPU 依赖，不会安装 NVIDIA CUDA、`paddlepaddle-gpu`
或 PaddleOCR 后端，适合 macOS 或先把 RAG 主流程跑通。

如果需要 OCR：

```bash
pip install -r requirements-ocr-cpu.txt
```

如果是在 Linux x86_64 + NVIDIA GPU 环境跑 ASR/OCR：

```bash
pip install -r requirements-linux-cuda.txt
```

在 `.env` 填：

```bash
ARK_API_KEY=你的apikey
ARK_ENDPOINT_ID=你的ep
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

## 1. 放 seed 短剧

建议第一版 RAG 选 2~3 部完整短剧：

```text
data/raw_videos_seed/
  drama001/
    ep01.mp4
    ep02.mp4
    ...
    ep10.mp4
  drama006/
    ep01.mp4
    ...
    ep10.mp4
```

## 2. 生成待标注 samples

```bash
python 1_prepare_dataset.py \
  --input-dir data/raw_videos_seed \
  --out data/samples/seed_samples_unlabeled.jsonl \
  --work-dir data/work_seed \
  --segment-seconds 10 \
  --frame-count 3 \
  --asr-model-size large-v3 \
  --asr-device cuda \
  --asr-compute-type float16 \
  --ocr-crop-bottom-ratio 0.32 \
  --ocr-min-conf 0.55 \
  --temperature 0
```

关键数字含义：

```text
--segment-seconds 10
每 10 秒切一个片段。短剧节奏快，10 秒通常能覆盖一个小剧情点。
更精细可改 6/8；更快省成本可改 12/15。

--frame-count 3
每段抽 3 张关键帧，通常取片段 25%、50%、75% 附近。
速度优先可改 2；动作互动更细可改 4/5。

--asr-model-size large-v3
faster-whisper 模型。large-v3 准，RTX 4080 Laptop 可以跑。
速度优先可改 medium。

--asr-compute-type float16
GPU 半精度推理，适合 RTX 4080。
CPU 时改 int8。

--ocr-crop-bottom-ratio 0.32
只识别画面底部 32%，适合竖屏短剧底部字幕。
字幕偏低可改 0.25；字幕偏高/双行字幕可改 0.40。

--ocr-min-conf 0.55
OCR 置信度阈值，低于 0.55 的文字丢弃。
字幕清晰可改 0.65；字幕压缩糊可改 0.45。

--temperature 0
Doubao 输出更稳定，适合批量数据处理。
```

这一步会把 **关键帧 + ASR 台词 + 字幕 OCR** 一起喂给 Doubao，避免只看图导致剧情细节丢失。

输出：

```text
data/samples/seed_samples_unlabeled.jsonl
```

## 3. 人工标注

复制一份：

```bash
cp data/samples/seed_samples_unlabeled.jsonl data/samples/seed_samples_labeled_final.jsonl
```

把每条的：

```json
"label": null
```

改成标签。正样本示例：

```json
"label": {
  "source": "human",
  "is_interactive": true,
  "interaction_type": "高光弹幕",
  "trigger_time": 83.5,
  "reason_type": "打脸",
  "requires_visual": false,
  "confidence_label": 5
}
```

负样本示例：

```json
"label": {
  "source": "human",
  "is_interactive": false,
  "interaction_type": "none",
  "trigger_time": null,
  "reason_type": "普通对话",
  "requires_visual": false,
  "confidence_label": 5
}
```

## 4. 构建 RAG

```bash
python 2_build_rag.py \
  --samples data/samples/seed_samples_labeled_final.jsonl \
  --cases data/rag/rag_cases_v1.jsonl \
  --db data/rag/rag_cases_v1.sqlite
```

输出：

```text
data/rag/rag_cases_v1.jsonl
data/rag/rag_cases_v1.sqlite
```

## 5. 用 RAG 预测其他短剧

先用 `1_prepare_dataset.py` 处理训练集或全量集，例如：

```bash
python 1_prepare_dataset.py \
  --input-dir data/raw_videos_train \
  --out data/samples/train_samples_unlabeled.jsonl \
  --work-dir data/work_train \
  --segment-seconds 10 \
  --frame-count 3
```

然后预测：

```bash
python 3_predict.py \
  --samples data/samples/train_samples_unlabeled.jsonl \
  --rag-db data/rag/rag_cases_v1.sqlite \
  --out data/predictions/train_predictions_v1.jsonl \
  --review-out data/review/train_review_topk_v1.jsonl \
  --rag-top-k 8 \
  --top-highlight 5 \
  --top-action 3 \
  --top-branch 2
```

数字含义：

```text
--rag-top-k 8
每条样本检索 8 条相似案例给 Doubao 参考。太少不稳，太多 prompt 长。

--top-highlight 5
每集导出置信度最高的 5 个高光弹幕候选给人工复核。

--top-action 3
每集导出 3 个动作互动候选。

--top-branch 2
每集导出 2 个分支创建候选。分支创建较难，第一版不要给太多。
```

## 三个脚本之间的关系

```text
视频
  ↓
1_prepare_dataset.py
  ↓
seed_samples_unlabeled.jsonl
  ↓ 人工加 label
seed_samples_labeled_final.jsonl
  ↓
2_build_rag.py
  ↓
rag_cases_v1.sqlite
  ↓
3_predict.py
  ↓
predictions.jsonl + review_topk.jsonl
```

## 依赖补充说明

如果你之前安装时报 `nvidia-cublas-cu12`、`paddlepaddle-gpu` 或 `ModuleNotFoundError`，
先按默认依赖重新安装：

```bash
pip install -r requirements.txt
```

默认依赖不安装 OCR 后端，这是为了避免 macOS/Python 版本不支持 PaddlePaddle wheel 时
整个安装失败。需要 OCR 时再安装：

```bash
pip install -r requirements-ocr-cpu.txt
```

如果你想让 OCR 也走 GPU，请看 `README_GPU_OCR.md`。

ASR 推荐使用 GPU：

```bash
python 1_prepare_dataset.py --asr-device cuda --asr-compute-type float16
```
