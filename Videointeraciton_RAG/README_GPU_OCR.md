# GPU OCR 安装说明

`requirements.txt` 现在只包含默认本地开发/CPU 主流程依赖，不会安装 PaddleOCR 后端。
这是为了避免 macOS 或过新的 Python 版本因为 PaddlePaddle wheel 不可用而安装失败。

如果你只需要 CPU OCR，并且当前平台支持 PaddlePaddle wheel，可以安装：

```bash
pip install -r requirements-ocr-cpu.txt
```

如果你希望 PaddleOCR 用 GPU，需要安装 Linux CUDA 依赖，或先卸载 CPU 版 Paddle，再安装与你 CUDA 版本匹配的 `paddlepaddle-gpu`。

## 推荐策略

你的 RTX 4080 Laptop 最应该先给 ASR 用：

```bash
python 1_prepare_dataset.py --asr-device cuda --asr-compute-type float16
```

OCR 只裁底部字幕区域，CPU 也能跑。只有当 OCR 明显成为瓶颈时，再折腾 GPU OCR。

## GPU OCR 大致步骤

推荐在 Linux x86_64 + NVIDIA GPU 环境直接安装 CUDA 依赖：

```bash
pip install -r requirements-linux-cuda.txt
```

如果你已经装过 CPU 版 Paddle，需要先清理：

```bash
pip uninstall -y paddlepaddle paddlepaddle-gpu
```

然后根据你本机 CUDA 版本，到 PaddlePaddle 官方安装页选择对应命令安装 `paddlepaddle-gpu`，
或重新执行：

```bash
pip install -r requirements-linux-cuda.txt
```

安装后，运行时加：

```bash
python 1_prepare_dataset.py --ocr-gpu
```

如果 `--ocr-gpu` 报 CUDA / cuDNN / paddle 相关错误，先去掉 `--ocr-gpu`，让 OCR 走 CPU，整个 pipeline 仍然可用。
