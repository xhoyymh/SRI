# 批量拼图版脚本说明

包含两个替换脚本：

- `1_prepare_dataset_batched.py`：批量拼图 + Doubao 第一轮初判 + 预填 label。
- `2_build_rag_batched.py`：从人工复核后的 label 构建 RAG cases 和 SQLite FTS5 库。

## 替换方式

把：

```text
1_prepare_dataset_batched.py
```

复制/重命名为项目根目录：

```text
1_prepare_dataset.py
```

把：

```text
2_build_rag_batched.py
```

复制/重命名为项目根目录：

```text
2_build_rag.py
```

## 第一轮生成待复核数据

PowerShell 一行命令：

```powershell
python 1_prepare_dataset.py --input-dir data/raw_videos_seed --out data/samples/seed_samples_unlabeled.jsonl --work-dir data/work_seed --segment-seconds 10 --frame-count 2 --batch-segments 5 --sheet-columns 4 --asr-model-size medium --asr-device cuda --asr-compute-type float16 --language zh --skip-ocr --temperature 0 --max-tokens 4096
```

输出的每条 sample 里会有：

- `model_initial_label`：Doubao 第一轮初判。
- `label`：默认等于 Doubao 初判，人工直接改这个字段。
- 若是 `高光弹幕` / `分支创建` / `动作互动`，`trigger_time` 应为具体秒数。
- 若是 `none`，`trigger_time` 应为 `null`。

## 人工复核

```powershell
Copy-Item data\samples\seed_samples_unlabeled.jsonl data\samples\seed_samples_labeled_final.jsonl
```

人工修改 `data/samples/seed_samples_labeled_final.jsonl` 中的 `label` 字段。建议确认后把：

```json
"source": "doubao_initial"
```

改成：

```json
"source": "human"
```

## 构建 RAG

普通构建：

```powershell
python 2_build_rag.py --samples data/samples/seed_samples_labeled_final.jsonl --cases data/rag/rag_cases_v1.jsonl --db data/rag/rag_cases_v1.sqlite
```

只收录人工确认过的样本：

```powershell
python 2_build_rag.py --samples data/samples/seed_samples_labeled_final.jsonl --cases data/rag/rag_cases_v1.jsonl --db data/rag/rag_cases_v1.sqlite --require-human
```

严格检查标签：

```powershell
python 2_build_rag.py --samples data/samples/seed_samples_labeled_final.jsonl --cases data/rag/rag_cases_v1.jsonl --db data/rag/rag_cases_v1.sqlite --require-human --strict
```
