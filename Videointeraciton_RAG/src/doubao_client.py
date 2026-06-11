import os
import json
import time
import base64
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

ARK_API_KEY = os.getenv("ARK_API_KEY")
ARK_ENDPOINT_ID = os.getenv("ARK_ENDPOINT_ID")
ARK_BASE_URL = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")

if not ARK_API_KEY:
    raise RuntimeError("缺少 ARK_API_KEY，请在 .env 中填写。")
if not ARK_ENDPOINT_ID:
    raise RuntimeError("缺少 ARK_ENDPOINT_ID，请在 .env 中填写你的 ep。")

client = OpenAI(api_key=ARK_API_KEY, base_url=ARK_BASE_URL)


def image_to_data_url(path: str) -> str:
    """把本地图片转成 base64 data URL，便于传给兼容 OpenAI 格式的多模态接口。"""
    p = Path(path)
    mime = "image/jpeg"
    if p.suffix.lower() == ".png":
        mime = "image/png"
    data = base64.b64encode(p.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{data}"


def safe_json_loads(text: str) -> Dict[str, Any]:
    """兼容模型偶尔输出 ```json 包裹的情况。"""
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.startswith("json"):
            text = text[4:].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def call_doubao_json(
    messages: List[Dict[str, Any]],
    temperature: float = 0.0,
    max_tokens: int = 2048,
    retries: int = 3,
) -> Dict[str, Any]:
    """调用 Doubao，并要求返回 JSON。temperature=0 表示尽量稳定、可复现。"""
    last_error: Optional[Exception] = None
    for i in range(retries):
        try:
            resp = client.chat.completions.create(
                model=ARK_ENDPOINT_ID,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = resp.choices[0].message.content
            return safe_json_loads(content)
        except Exception as e:
            last_error = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"Doubao 调用失败，已重试 {retries} 次：{last_error}")
