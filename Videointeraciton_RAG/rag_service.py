#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RAG 服务入口：接收后端分析任务，跑现有 RAG 流水线并回调后端。

启动：
  python rag_service.py --host 0.0.0.0 --port 8091

后端配置：
  RAG_BASE_URL=http://localhost:8091
"""
import argparse
import base64
import json
import mimetypes
import os
import re
import shutil
import sqlite3
import sys
import subprocess
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = ROOT / "data" / "runtime" / "tasks"
LOG_PATH = RUNTIME_ROOT.parent / "rag_service.log"
TASK_TTL_SECONDS = int(os.getenv("RAG_TASK_TTL_SECONDS", "21600"))


def safe_log(message: str) -> None:
    try:
        print(message, flush=True)
    except Exception:
        pass
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(message + "\n")
    except Exception:
        pass


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def post_json(url: str, data: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    request_headers = {"Content-Type": "application/json"}
    if headers:
        request_headers.update(headers)
    req = urllib.request.Request(
        url,
        data=payload,
        headers=request_headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8")
        return json.loads(text) if text else {}


def update_status(task: Dict[str, Any], status: str, stage: str, progress: int, message: str, error: str = "") -> None:
    base = task["callbackBaseUrl"].rstrip("/")
    post_json(
        f"{base}/analysis-tasks/{task['taskId']}/status",
        {
            "callbackToken": task["callbackToken"],
            "status": status,
            "stage": stage,
            "progress": progress,
            "message": message,
            "errorMessage": error or None,
        },
    )


def safe_name(text: str, fallback: str) -> str:
    text = text or fallback
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", text).strip("._-")
    return safe or fallback


def safe_path_part(text: str, fallback: str) -> str:
    text = str(text or fallback).strip()
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", text).strip(" ._")
    return text or fallback


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def cleanup_stale_task_dirs() -> None:
    now = time.time()
    if not RUNTIME_ROOT.exists():
        return
    for child in RUNTIME_ROOT.iterdir():
        try:
            if child.is_dir() and now - child.stat().st_mtime > TASK_TTL_SECONDS:
                shutil.rmtree(child, ignore_errors=True)
        except Exception:
            pass


def prepare_videos(task: Dict[str, Any], input_dir: Path, work_dir: Path) -> Dict[str, int]:
    drama = safe_path_part(task.get("dramaTitle") or "uploaded_drama", "uploaded_drama")
    drama_dir = input_dir / drama
    drama_dir.mkdir(parents=True, exist_ok=True)
    episode_map = build_episode_map(task)
    videos = task.get("videos") or []
    if not videos:
        raise RuntimeError("RAG task has no videos. Expected videos[].cosUrl from backend video_asset table.")
    for video in videos:
        if not video.get("episodeId"):
            raise RuntimeError(f"RAG task video is missing episodeId: {video}")
        source_url = video.get("downloadUrl") or video.get("cosUrl")
        if not source_url:
            raise RuntimeError(f"RAG task video is missing downloadUrl/cosUrl: {video}")
        episode_id = int(video["episodeId"])
        episode_no = int(video.get("episodeNo") or len(episode_map) + 1)
        ext = Path(urllib.parse.urlparse(video.get("cosUrl") or source_url).path).suffix or ".mp4"
        stem = f"第{episode_no}集"
        out = drama_dir / f"{stem}{ext}"
        if not out.exists():
            safe_log(
                f"[rag_service] downloading source mp4 episode={episode_no} "
                f"asset={video.get('assetId')} cos_key={video.get('cosKey')}"
            )
            urllib.request.urlretrieve(source_url, out)
            safe_log(f"[rag_service] downloaded source mp4 to {out}")
        register_episode_aliases(episode_map, episode_no, episode_id, stem)
    return episode_map


def register_episode_aliases(episode_map: Dict[str, int], episode_no: int, episode_id: int, stem: str = "") -> None:
    aliases = [
        str(stem or ""),
        f"第{episode_no}集",
        f"第{episode_no:02d}集",
        f"episode{episode_no}",
        f"episode{episode_no:02d}",
        f"ep{episode_no}",
        f"ep{episode_no:02d}",
        f"ep{episode_no:02d}_id{episode_id}",
        str(episode_id),
    ]
    for alias in aliases:
        if alias:
            episode_map[alias] = episode_id


def build_episode_map(task: Dict[str, Any]) -> Dict[str, int]:
    episode_map: Dict[str, int] = {}
    for video in task.get("videos") or []:
        if not video.get("episodeId"):
            continue
        episode_id = int(video["episodeId"])
        episode_no = int(video.get("episodeNo") or len(episode_map) + 1)
        stem = Path(str(video.get("originalFileName") or f"第{episode_no}集")).stem
        register_episode_aliases(episode_map, episode_no, episode_id, stem)
    return episode_map


def run_pipeline(task: Dict[str, Any], work_dir: Path, input_dir: Path) -> Dict[str, Path]:
    env = os.environ.copy()
    python_bin = sys.executable or "python"
    ark = task.get("ark") or {}
    env["ARK_API_KEY"] = ark.get("judgeApiKey") or ""
    env["ARK_ENDPOINT_ID"] = ark.get("judgeEndpointId") or ""
    env["ARK_BASE_URL"] = ark.get("baseUrl") or "https://ark.cn-beijing.volces.com/api/v3"

    samples = work_dir / "samples.jsonl"
    predictions = work_dir / "predictions.jsonl"
    final_outputs = work_dir / "final_outputs.jsonl"
    video_tasks = work_dir / "video_generation_tasks.jsonl"
    review = work_dir / "review_topk.jsonl"
    prep_work = work_dir / "prepare"
    rag_db = default_rag_db_path()

    prepare_cmd = [
        python_bin,
        str(ROOT / "1_prepare_dataset.py"),
        "--input-dir",
        str(input_dir),
        "--out",
        str(samples),
        "--work-dir",
        str(prep_work),
        "--segment-seconds",
        os.getenv("RAG_SEGMENT_SECONDS", "30"),
        "--frame-count",
        os.getenv("RAG_FRAME_COUNT", "9"),
        "--batch-segments",
        os.getenv("RAG_BATCH_SEGMENTS", "3"),
        "--sheet-columns",
        "3",
        "--temperature",
        "0",
    ]
    if os.getenv("RAG_SKIP_OCR", "0") == "1":
        prepare_cmd.append("--skip-ocr")
    if os.getenv("RAG_ENABLE_ASR", "0") != "1":
        prepare_cmd.append("--skip-asr")

    predict_cmd = [
        python_bin,
        str(ROOT / "3_predict.py"),
        "--samples",
        str(samples),
        "--rag-db",
        str(rag_db),
        "--out",
        str(predictions),
        "--final-out",
        str(final_outputs),
        "--video-tasks-out",
        str(video_tasks),
        "--review-out",
        str(review),
        "--retrieval-mode",
        os.getenv("RAG_RETRIEVAL_MODE", "fts"),
        "--rerank-mode",
        os.getenv("RAG_RERANK_MODE", "rules"),
        "--rag-max-none",
        os.getenv("RAG_MAX_NONE_CASES", "3"),
        "--rag-min-positive",
        os.getenv("RAG_MIN_POSITIVE_CASES", "2"),
        "--temperature",
        "0",
    ]

    subprocess.run(prepare_cmd, cwd=str(ROOT), env=env, check=True)
    update_status(task, "RUNNING", "prepare", 55, "视频抽帧完成，正在判断互动点")
    subprocess.run(predict_cmd, cwd=str(ROOT), env=env, check=True)
    update_status(task, "RUNNING", "generation", 78, "互动点判断完成，正在生成素材")
    return {
        "predictions": predictions,
        "final_outputs": final_outputs,
        "video_tasks": video_tasks,
        "prepare_work": prep_work,
    }


def default_rag_db_path() -> Path:
    return Path(os.getenv("RAG_DB", str(ROOT / "data" / "rag" / "rag_cases_all_human_plus_auto.sqlite")))


def _segment_sort_key(row: Dict[str, Any]) -> int:
    seg = str(row.get("segment_id") or "")
    m = re.search(r"(\d+)$", seg)
    return int(m.group(1)) if m else 0


def _final_output_from_metadata(meta: Dict[str, Any]) -> Dict[str, Any]:
    final = meta.get("final_output")
    if isinstance(final, dict):
        return dict(final)
    if not meta.get("is_interactive"):
        return {
            "human_reviewed": bool(meta.get("human_reviewed")),
            "is_interactive": False,
            "interaction_type": "none",
            "confidence": None,
            "timing": None,
            "interaction_reason": meta.get("reason") or "RAG 库既有判断为无互动点",
            "interaction_plan": None,
            "previous_plot": "",
            "next_plot": "",
        }
    window = meta.get("interaction_window") or {}
    return {
        "human_reviewed": bool(meta.get("human_reviewed")),
        "is_interactive": True,
        "interaction_type": meta.get("interaction_type"),
        "confidence": meta.get("confidence_label") or meta.get("confidence"),
        "timing": {
            "start_time": window.get("start"),
            "end_time": window.get("end"),
            "duration": window.get("duration"),
        },
        "interaction_reason": meta.get("reason") or "",
        "interaction_plan": None,
        "previous_plot": "",
        "next_plot": "",
    }


def try_write_exact_rag_outputs(task: Dict[str, Any], work_dir: Path, episode_map: Dict[str, int]) -> Optional[Dict[str, Path]]:
    """同剧同集已在 RAG 库中有判断时，直接复用库里的 final_output，避免相似案例把剧情带偏。"""
    rag_db = default_rag_db_path()
    drama_title = str(task.get("dramaTitle") or "").strip()
    videos = task.get("videos") or []
    if not drama_title or not videos or not rag_db.exists():
        return None

    expected_episodes = {f"第{int(v.get('episodeNo') or 0)}集" for v in videos if v.get("episodeNo")}
    expected_episodes = {x for x in expected_episodes if x != "第0集"}
    if not expected_episodes:
        return None

    by_episode: Dict[str, List[Dict[str, Any]]] = {ep: [] for ep in expected_episodes}
    conn = sqlite3.connect(str(rag_db))
    try:
        for case_id, metadata_text in conn.execute("SELECT case_id, metadata FROM rag_cases"):
            try:
                meta = json.loads(metadata_text or "{}")
            except json.JSONDecodeError:
                continue
            if meta.get("drama_id") != drama_title:
                continue
            episode_name = str(meta.get("episode_id") or "")
            if episode_name not in by_episode:
                continue
            item = dict(meta)
            item["case_id"] = case_id
            by_episode[episode_name].append(item)
    finally:
        conn.close()

    if any(not rows for rows in by_episode.values()):
        missing = [ep for ep, rows in by_episode.items() if not rows]
        safe_log(f"[rag_service] exact RAG cases not found for drama={drama_title} episodes={missing}; fallback to live analysis")
        return None

    finals: List[Dict[str, Any]] = []
    predictions: List[Dict[str, Any]] = []
    for episode_name in sorted(by_episode.keys(), key=lambda x: int(re.search(r"\d+", x).group(0)) if re.search(r"\d+", x) else 0):
        for meta in sorted(by_episode[episode_name], key=_segment_sort_key):
            sample_id = meta.get("sample_id") or meta.get("case_id") or f"{drama_title}_{episode_name}_{meta.get('segment_id')}"
            final = _final_output_from_metadata(meta)
            finals.append(final)
            predictions.append(
                {
                    "sample_id": sample_id,
                    "drama_id": drama_title,
                    "episode_id": episode_name,
                    "segment_id": meta.get("segment_id"),
                    "contact_sheet_path": meta.get("contact_sheet_path"),
                }
            )
            if episode_name not in episode_map:
                m = re.search(r"\d+", episode_name)
                if m:
                    episode_no = int(m.group(0))
                    for video in videos:
                        if int(video.get("episodeNo") or -1) == episode_no and video.get("episodeId"):
                            register_episode_aliases(episode_map, episode_no, int(video["episodeId"]), episode_name)
                            break

    output_dir = work_dir / "exact_rag"
    final_outputs = output_dir / "final_outputs.jsonl"
    predictions_path = output_dir / "predictions.jsonl"
    video_tasks = output_dir / "video_generation_tasks.jsonl"
    output_dir.mkdir(parents=True, exist_ok=True)
    final_outputs.write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in finals), encoding="utf-8")
    predictions_path.write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in predictions), encoding="utf-8")
    video_tasks.write_text("", encoding="utf-8")
    safe_log(
        f"[rag_service] using exact RAG cases drama={drama_title} "
        f"episodes={sorted(expected_episodes)} rows={len(finals)} db={rag_db}"
    )
    return {"predictions": predictions_path, "final_outputs": final_outputs, "video_tasks": video_tasks, "prepare_work": output_dir}


def episode_id_from_row(row: Dict[str, Any], episode_map: Dict[str, int]) -> Optional[int]:
    raw = str(row.get("episode_id") or "")
    if raw in episode_map:
        return episode_map[raw]
    m = re.search(r"id(\d+)", raw)
    return int(m.group(1)) if m else None


def first_contact_sheet(predictions: List[Dict[str, Any]], sample_id: str) -> Optional[Path]:
    for row in predictions:
        if row.get("sample_id") == sample_id and row.get("contact_sheet_path"):
            p = Path(row["contact_sheet_path"])
            if p.exists():
                return p
    return None


def request_generated_asset(task: Dict[str, Any], file_path: Path, asset_type: str, episode_id: int) -> Dict[str, Any]:
    base = task["callbackBaseUrl"].rstrip("/")
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    body = {
        "callbackToken": task["callbackToken"],
        "episodeId": episode_id,
        "assetType": asset_type,
        "fileName": file_path.name,
        "contentType": content_type,
        "fileSize": file_path.stat().st_size,
    }
    resp = post_json(f"{base}/analysis-tasks/{task['taskId']}/assets", body)
    return resp.get("data") or resp


def upload_file_to_cos(upload_info: Dict[str, Any], file_path: Path) -> None:
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    headers = dict(upload_info.get("headers") or {})
    headers.setdefault("Content-Type", content_type)
    req = urllib.request.Request(
        upload_info["uploadUrl"],
        data=file_path.read_bytes(),
        headers=headers,
        method=upload_info.get("uploadMethod") or "PUT",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        if resp.status not in (200, 201, 204):
            raise RuntimeError(f"COS 上传失败：HTTP {resp.status}")


def build_image_seq(task: Dict[str, Any], episode_id: int, title: str, prompt: str, source_image: Optional[Path], out_dir: Path) -> Dict[str, Any]:
    images: List[str] = []
    if source_image and source_image.exists():
        image_info = request_generated_asset(task, source_image, "GENERATED_IMAGE", episode_id)
        upload_file_to_cos(image_info, source_image)
        images.append(image_info["cosUrl"])
    manifest = {
        "type": "IMAGE_SEQ",
        "title": title,
        "prompt": prompt,
        "intervalMs": 1600,
        "images": images,
    }
    manifest_path = out_dir / f"manifest-{safe_name(title, 'story')}.json"
    write_json(manifest_path, manifest)
    manifest_info = request_generated_asset(task, manifest_path, "GENERATED_MANIFEST", episode_id)
    upload_file_to_cos(manifest_info, manifest_path)
    return {"contentType": "IMAGE_SEQ", "contentUrl": manifest_info["cosUrl"], "assetId": manifest_info.get("assetId")}


def _response_payload(resp: Dict[str, Any]) -> Dict[str, Any]:
    data = resp.get("data")
    return data if isinstance(data, dict) else resp


def _write_base64_video(payload: Dict[str, Any], out_file: Path) -> Optional[Path]:
    encoded = payload.get("videoBase64") or payload.get("base64") or payload.get("fileBase64")
    if not encoded:
        return None
    if "," in encoded and encoded.lstrip().startswith("data:"):
        encoded = encoded.split(",", 1)[1]
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_bytes(base64.b64decode(encoded))
    return out_file


def safe_json_loads(text: str) -> Dict[str, Any]:
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


def call_ark_json(
    task: Dict[str, Any],
    messages: List[Dict[str, Any]],
    temperature: float = 0.2,
    max_tokens: int = 900,
) -> Dict[str, Any]:
    ark = task.get("ark") or {}
    api_key = ark.get("judgeApiKey")
    endpoint_id = ark.get("judgeEndpointId")
    if not api_key or not endpoint_id:
        raise RuntimeError("缺少判断模型 apiKey 或 endpointId，无法改写视频生成 prompt")
    base_url = (ark.get("baseUrl") or "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
    body = {
        "model": endpoint_id,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    content = (((payload.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    return safe_json_loads(content)


def has_generation_config(task: Dict[str, Any]) -> bool:
    ark = task.get("ark") or {}
    return bool(ark.get("hasGenerationKey") and ark.get("generationApiKey"))


def generate_video_with_adapter(
    task: Dict[str, Any],
    episode_id: int,
    title: str,
    prompt: str,
    target_duration: Any,
    out_dir: Path,
) -> Optional[Dict[str, Any]]:
    """通过可配置视频生成适配器生成 VIDEO。

    适配器地址通过 RAG_VIDEO_GENERATION_URL 配置，请求会带用户输入的火山方舟生成 key/endpointId。
    适配器可以返回 data.videoUrl/contentUrl/downloadUrl/fileUrl，或 data.videoBase64/base64。
    RAG 服务会再上传到 COS，保证最终 contentUrl 指向本项目 COS。
    """
    ark = task.get("ark") or {}
    if not ark.get("hasGenerationKey") or not ark.get("generationApiKey"):
        return None
    adapter_url = os.getenv("RAG_VIDEO_GENERATION_URL", "").strip()
    if not adapter_url:
        return None

    body = {
        "taskId": task.get("taskId"),
        "episodeId": episode_id,
        "title": title,
        "prompt": prompt,
        "targetDuration": target_duration,
        "apiKey": ark.get("generationApiKey"),
        "endpointId": ark.get("generationEndpointId") or ark.get("endpointId"),
        "baseUrl": ark.get("baseUrl") or "https://ark.cn-beijing.volces.com/api/v3",
    }
    headers = {"Authorization": f"Bearer {ark.get('generationApiKey')}"}
    resp = _response_payload(post_json(adapter_url, body, headers=headers))

    video_path = out_dir / f"video-{safe_name(title, 'story')}.mp4"
    source_url = resp.get("videoUrl") or resp.get("contentUrl") or resp.get("downloadUrl") or resp.get("fileUrl")
    if source_url:
        urllib.request.urlretrieve(source_url, video_path)
    else:
        written = _write_base64_video(resp, video_path)
        if written is None:
            return None

    video_info = request_generated_asset(task, video_path, "GENERATED_VIDEO", episode_id)
    upload_file_to_cos(video_info, video_path)
    return {"contentType": "VIDEO", "contentUrl": video_info["cosUrl"], "assetId": video_info.get("assetId")}


def build_generated_story_asset(
    task: Dict[str, Any],
    episode_id: int,
    title: str,
    prompt: str,
    target_duration: Any,
    source_image: Optional[Path],
    out_dir: Path,
) -> Dict[str, Any]:
    requires_video = has_generation_config(task)
    try:
        video_asset = generate_video_with_adapter(task, episode_id, title, prompt, target_duration, out_dir)
        if video_asset:
            return video_asset
    except Exception as exc:
        if requires_video:
            raise RuntimeError(f"视频生成失败：{exc}") from exc
        print(f"[rag_service] 视频生成失败，降级 IMAGE_SEQ：{exc}")
    if requires_video:
        if not os.getenv("RAG_VIDEO_GENERATION_URL", "").strip():
            raise RuntimeError("已填写视频生成 API Key，但 RAG_VIDEO_GENERATION_URL 未配置")
        raise RuntimeError("视频生成适配器未返回 videoUrl/contentUrl/downloadUrl/fileUrl 或 base64")
    return build_image_seq(task, episode_id, title, prompt, source_image, out_dir)


def first_present(*values: Any, default: Any = None) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return default


def as_number(value: Any, fallback: Optional[float] = None) -> Optional[float]:
    try:
        if value is None or value == "":
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def second_int(value: Any, fallback: int = 0) -> int:
    number = as_number(value, float(fallback))
    if number is None:
        return fallback
    return max(0, int(round(number)))


def short_text(value: Any, fallback: str, limit: int = 120) -> str:
    text = str(value or fallback or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def normalize_interaction_type(row: Dict[str, Any], plan: Dict[str, Any]) -> str:
    raw = first_present(row.get("interaction_type"), plan.get("type"), default="none")
    value = str(raw or "none").strip()
    aliases = {
        "highlight": "高光弹幕",
        "highlight_barrage": "高光弹幕",
        "emotion_button": "高光弹幕",
        "barrage": "高光弹幕",
        "branch": "分支创建",
        "branch_choice": "分支创建",
        "branch_creation": "分支创建",
        "action": "动作互动",
        "action_button": "动作互动",
        "action_interaction": "动作互动",
    }
    if value in ("高光弹幕", "分支创建", "动作互动", "none"):
        return value
    lower = value.lower()
    if lower in aliases:
        return aliases[lower]
    if "高光" in value or "弹幕" in value:
        return "高光弹幕"
    if "分支" in value or "选择" in value:
        return "分支创建"
    if "动作" in value:
        return "动作互动"
    return "none"


def backend_highlight_type(interaction_type: str, plan: Optional[Dict[str, Any]] = None) -> str:
    if interaction_type == "分支创建":
        return "BRANCH"
    if interaction_type == "动作互动":
        return "ACTION"
    if interaction_type != "高光弹幕":
        return "NONE"

    plan = plan or {}
    barrage = plan.get("highlight_barrage") if isinstance(plan.get("highlight_barrage"), dict) else {}
    allowed = {"COOL", "FUNNY", "TWIST", "SWEET", "FAMOUS"}
    aliases = {
        "cool": "COOL",
        "爽": "COOL",
        "高光": "COOL",
        "高光弹幕": "COOL",
        "highlight": "COOL",
        "funny": "FUNNY",
        "笑": "FUNNY",
        "搞笑": "FUNNY",
        "twist": "TWIST",
        "反转": "TWIST",
        "sweet": "SWEET",
        "甜": "SWEET",
        "甜宠": "SWEET",
        "famous": "FAMOUS",
        "名场面": "FAMOUS",
    }
    for raw in (
        barrage.get("emotionType"),
        barrage.get("highlightType"),
        barrage.get("highlight_type"),
        barrage.get("optionCode"),
        barrage.get("emotion_point"),
    ):
        if raw is None:
            continue
        text = str(raw).strip()
        upper = text.upper()
        if upper in allowed:
            return upper
        lowered = text.lower()
        if lowered in aliases:
            return aliases[lowered]
        if text in aliases:
            return aliases[text]
    return "COOL"


def normalize_timing(row: Dict[str, Any], interaction_type: str) -> Dict[str, int]:
    timing = row.get("timing") if isinstance(row.get("timing"), dict) else {}
    window = row.get("interaction_window") if isinstance(row.get("interaction_window"), dict) else {}
    source = row.get("source_timing") if isinstance(row.get("source_timing"), dict) else {}
    default_duration = 4 if interaction_type == "高光弹幕" else 6
    trigger = first_present(row.get("trigger_time"), timing.get("trigger_time"), window.get("start"), source.get("start_time"), 0)
    start = first_present(timing.get("start_time"), timing.get("start"), window.get("start"), source.get("start_time"), trigger)
    end = first_present(timing.get("end_time"), timing.get("end"), window.get("end"), source.get("end_time"))
    duration = first_present(timing.get("duration"), window.get("duration"), source.get("duration"), default_duration)
    start_s = second_int(start, 0)
    if end is None or end == "":
        end_s = start_s + max(1, second_int(duration, default_duration))
    else:
        end_s = second_int(end, start_s + default_duration)
    if end_s <= start_s:
        end_s = start_s + max(1, second_int(duration, default_duration))
    return {"start": start_s, "end": end_s, "duration": max(1, end_s - start_s)}


def generation_task_for(
    gen_by_sample: Dict[str, List[Dict[str, Any]]],
    sample_id: Any,
    option_code: Optional[str] = None,
    task_type: Optional[str] = None,
) -> Dict[str, Any]:
    candidates = gen_by_sample.get(sample_id) or []
    for item in candidates:
        if option_code and item.get("optionCode") != option_code:
            continue
        if task_type and item.get("task_type") != task_type:
            continue
        return item
    if option_code:
        for item in candidates:
            if item.get("optionCode") == option_code:
                return item
    return candidates[0] if candidates else {}


def compose_branch_prompt(row: Dict[str, Any], option: Dict[str, Any], target_duration: Any, retry_time: int) -> str:
    label = option.get("label") or option.get("option") or "试错选择"
    bad = first_present(option.get("badOutcome"), option.get("bad_outcome"), option.get("outcome"), "错误选择导致失败或陷入危机")
    return (
        f"生成一个短剧试错分支视频，时长约 {target_duration or 6} 秒。"
        f"用户选择“{label}”后，展示不良后果：{bad}。"
        f"片段氛围和原剧一致，结尾必须能回到 {retry_time} 秒的分支选择点重新选择。"
        "不要改变主线人物关系、关键道具归属、剧情真相或最终结果。"
        f"原片上下文：{row.get('interaction_reason') or ''}"
    )


def compose_action_prompt(row: Dict[str, Any], action: Dict[str, Any], target_duration: Any) -> str:
    user_action = first_present(action.get("userAction"), action.get("user_action"), action.get("actionLabel"), "点击助力")
    enhanced = first_present(action.get("enhancedProcess"), action.get("enhanced_process"), action.get("aigcVideoRequirement"), "强化当前动作过程")
    preserve = first_present(
        action.get("originalResultToPreserve"),
        action.get("original_result_to_preserve"),
        "保持原片动作结果和主线剧情不变",
    )
    return (
        f"生成一个短剧动作增强视频，时长约 {target_duration or 6} 秒。"
        f"用户操作：{user_action}。视频内容：{enhanced}。"
        f"必须保持不变的原片结果：{preserve}。"
        "结尾要无缝接回原片，不要改变人物关系、胜负结果、关键道具归属或剧情真相。"
        f"原片上下文：{row.get('interaction_reason') or ''}"
    )


def compact_prompt_context(row: Dict[str, Any]) -> str:
    parts = [
        f"判断原因：{row.get('interaction_reason') or ''}",
        f"前文：{row.get('previous_plot') or ''}",
        f"后文：{row.get('next_plot') or ''}",
    ]
    text = "\n".join(p for p in parts if not p.endswith("："))
    return text[:1400]


def refine_branch_video_prompt(
    task: Dict[str, Any],
    row: Dict[str, Any],
    option: Dict[str, Any],
    draft_prompt: str,
    target_duration: Any,
    retry_time: int,
) -> str:
    label = first_present(option.get("label"), option.get("option"), "试错选择")
    bad = first_present(option.get("badOutcome"), option.get("bad_outcome"), option.get("outcome"), "错误选择导致失败或陷入危机")
    system = (
        "你是短剧视频生成提示词编剧，只输出合法 JSON。"
        "你要把互动点判断结果改写成可直接交给视频生成模型的中文 prompt。"
    )
    user = f"""
请为“分支创建”的 TRIAL 试错分支改写视频生成 prompt。

要求：
1. 只输出 JSON：{{"videoGenerationPrompt":"..."}}
2. videoGenerationPrompt 约 300 个中文字符。
3. 必须具体说明：谁、在什么场景、做了什么错误选择、镜头怎么表现、导致什么坏结果、为什么证明主线选择更合理。
4. 必须说明结尾回到 {retry_time} 秒的分支选择点重新选择。
5. 不能永久改变主线人物关系、关键道具、剧情真相、最终结果。
6. 不要写“根据判断原因”“该片段”等分析口吻，要写给视频生成模型看的画面描述。

互动上下文：
{compact_prompt_context(row)}

用户试错选择：{label}
坏结果：{bad}
目标时长：{target_duration or 6} 秒
已有草稿：{draft_prompt}
""".strip()
    result = call_ark_json(task, [{"role": "system", "content": system}, {"role": "user", "content": user}])
    prompt = str(result.get("videoGenerationPrompt") or result.get("prompt") or "").strip()
    if len(prompt) < 80:
        raise RuntimeError("判断模型返回的视频生成 prompt 过短或为空")
    return prompt


def refine_action_video_prompt(
    task: Dict[str, Any],
    row: Dict[str, Any],
    action: Dict[str, Any],
    draft_prompt: str,
    target_duration: Any,
) -> str:
    user_action = first_present(action.get("userAction"), action.get("user_action"), action.get("actionLabel"), "点击助力")
    enhanced = first_present(action.get("enhancedProcess"), action.get("enhanced_process"), action.get("aigcVideoRequirement"), "强化当前动作过程")
    preserve = first_present(
        action.get("originalResultToPreserve"),
        action.get("original_result_to_preserve"),
        "保持原片动作结果和主线剧情不变",
    )
    system = (
        "你是短剧视频生成提示词编剧，只输出合法 JSON。"
        "你要把动作互动判断结果改写成可直接交给视频生成模型的中文 prompt。"
    )
    user = f"""
请为“动作互动”改写视频生成 prompt。

要求：
1. 只输出 JSON：{{"videoGenerationPrompt":"..."}}
2. videoGenerationPrompt 约 300 个中文字符。
3. 必须具体说明：谁、在什么场景、用户触发什么动作、角色做了什么增强动作、镜头怎么表现、动作会带来什么过程效果。
4. 必须说明保持不变的原片结果，并说明结尾如何无缝接回原片。
5. 只能增强动作过程，不能改变营救成败、追逐结果、胜负结果、关键道具归属、人物关系或主线剧情。
6. 不要写“根据判断原因”“该片段”等分析口吻，要写给视频生成模型看的画面描述。

互动上下文：
{compact_prompt_context(row)}

用户操作：{user_action}
增强过程：{enhanced}
必须保持的原片结果：{preserve}
目标时长：{target_duration or 6} 秒
已有草稿：{draft_prompt}
""".strip()
    result = call_ark_json(task, [{"role": "system", "content": system}, {"role": "user", "content": user}])
    prompt = str(result.get("videoGenerationPrompt") or result.get("prompt") or "").strip()
    if len(prompt) < 80:
        raise RuntimeError("判断模型返回的视频生成 prompt 过短或为空")
    return prompt


def convert_results(task: Dict[str, Any], paths: Dict[str, Path], episode_map: Dict[str, int]) -> Dict[str, Any]:
    finals = read_jsonl(paths["final_outputs"])
    predictions = read_jsonl(paths["predictions"])
    gen_tasks = read_jsonl(paths["video_tasks"])
    generation_enabled = has_generation_config(task)
    skipped_without_generation = 0
    gen_by_sample: Dict[str, List[Dict[str, Any]]] = {}
    for item in gen_tasks:
        gen_by_sample.setdefault(item.get("sample_id"), []).append(item)

    highlights: List[Dict[str, Any]] = []
    ai_stories: List[Dict[str, Any]] = []
    generated_dir = paths["final_outputs"].parent / "generated"

    for index, final in enumerate(finals):
        prediction = predictions[index] if index < len(predictions) else {}
        row = dict(final)
        for key in ("sample_id", "drama_id", "episode_id", "segment_id", "contact_sheet_path"):
            if row.get(key) is None and prediction.get(key) is not None:
                row[key] = prediction.get(key)
        if not row.get("is_interactive"):
            continue
        episode_id = episode_id_from_row(row, episode_map)
        if not episode_id:
            continue
        plan = row.get("interaction_plan") if isinstance(row.get("interaction_plan"), dict) else {}
        interaction_type = normalize_interaction_type(row, plan)
        if not generation_enabled and interaction_type in ("分支创建", "动作互动"):
            skipped_without_generation += 1
            continue
        timing = normalize_timing(row, interaction_type)
        start = timing["start"]
        end = timing["end"]

        if interaction_type == "高光弹幕":
            barrage = plan.get("highlight_barrage") or {}
            config = barrage.get("interactionConfig") or {
                "componentType": "emotion_button",
                "buttons": [
                    {
                        "optionCode": barrage.get("optionCode") or "cool",
                        "label": barrage.get("label") or "爽",
                        "effect": barrage.get("effect") or "float",
                    }
                ],
            }
            highlights.append(
                {
                    "episodeId": episode_id,
                    "startTime": start,
                    "endTime": end,
                    "highlightType": backend_highlight_type(interaction_type, plan),
                    "title": short_text(barrage.get("emotion_point") or row.get("interaction_reason"), "高光互动"),
                    "description": row.get("interaction_reason") or "",
                    "confidence": row.get("confidence"),
                    "triggerOnce": 1,
                    "interactionConfig": config,
                }
            )
        elif interaction_type == "分支创建":
            branch = plan.get("branch_creation") or {}
            branch_point = second_int(branch.get("branchPointTime"), start)
            options = []
            for opt in branch.get("options") or []:
                outcome = str(first_present(opt.get("branchOutcome"), opt.get("branch_outcome"), default="")).upper()
                is_mainline = outcome == "MAINLINE" or bool(opt.get("is_mainline"))
                option_code = first_present(opt.get("optionCode"), opt.get("option_code"), "mainline_choice" if is_mainline else "trial_choice")
                label = first_present(opt.get("label"), opt.get("option"), "继续主线" if is_mainline else "试错分支")
                retry_time = second_int(first_present(opt.get("retryTime"), opt.get("retry_time"), branch_point), branch_point)
                target_duration = first_present(opt.get("targetDuration"), opt.get("target_duration"), timing["duration"])
                option = {
                    "optionCode": option_code,
                    "label": label,
                    "branchOutcome": "MAINLINE" if is_mainline else "TRIAL",
                    "generationMode": "MAINLINE" if is_mainline else "PREGEN",
                    "retryTime": None if is_mainline else retry_time,
                    "resumeTime": None if is_mainline else retry_time,
                    "isCorrect": is_mainline,
                    "targetDuration": None if is_mainline else target_duration,
                    "failText": first_present(opt.get("badOutcome"), opt.get("bad_outcome"), ""),
                }
                if not is_mainline:
                    client_ref = f"{row.get('sample_id')}:{option_code}"
                    source_image = first_contact_sheet(predictions, row.get("sample_id"))
                    gen_task = generation_task_for(gen_by_sample, row.get("sample_id"), option_code, "branch_trial_video")
                    prompt = first_present(
                        gen_task.get("video_generation_prompt"),
                        opt.get("videoGenerationPrompt"),
                        opt.get("video_generation_prompt"),
                        compose_branch_prompt(row, opt, target_duration, retry_time),
                    )
                    target_duration = first_present(gen_task.get("target_duration"), target_duration)
                    prompt = refine_branch_video_prompt(task, row, opt, prompt, target_duration, retry_time)
                    story_asset = build_generated_story_asset(
                        task,
                        episode_id,
                        label,
                        prompt,
                        target_duration,
                        source_image,
                        generated_dir,
                    )
                    ai_stories.append(
                        {
                            "clientRef": client_ref,
                            "episodeId": episode_id,
                            "optionCode": option_code,
                            "contentType": story_asset["contentType"],
                            "title": short_text(label, "试错分支"),
                            "prompt": prompt,
                            "content": prompt,
                            "contentUrl": story_asset["contentUrl"],
                            "assetId": story_asset.get("assetId"),
                        }
                    )
                    option["generationClientRef"] = client_ref
                    option["videoGenerationPrompt"] = prompt
                options.append(option)
            highlights.append(
                {
                    "episodeId": episode_id,
                    "startTime": start,
                    "endTime": end,
                    "highlightType": backend_highlight_type(interaction_type, plan),
                    "title": short_text(row.get("interaction_reason"), "剧情选择"),
                    "description": row.get("interaction_reason") or "",
                    "confidence": row.get("confidence"),
                    "triggerOnce": 1,
                    "interactionConfig": {
                        "componentType": "branch_choice",
                        "branchMode": branch.get("branchMode") or "trial_and_error",
                        "branchPointTime": branch_point,
                        "options": options,
                    },
                }
            )
        elif interaction_type == "动作互动":
            action = plan.get("action_interaction") or {}
            client_ref = f"{row.get('sample_id')}:action"
            gen_task = generation_task_for(gen_by_sample, row.get("sample_id"), task_type="action_interaction_video")
            target_duration = first_present(gen_task.get("target_duration"), action.get("targetDuration"), action.get("target_duration"), timing["duration"])
            prompt = first_present(
                gen_task.get("video_generation_prompt"),
                action.get("videoGenerationPrompt"),
                action.get("video_generation_prompt"),
                compose_action_prompt(row, action, target_duration),
            )
            prompt = refine_action_video_prompt(task, row, action, prompt, target_duration)
            source_image = first_contact_sheet(predictions, row.get("sample_id"))
            user_action = first_present(action.get("userAction"), action.get("user_action"), action.get("actionLabel"), "点击助力")
            story_asset = build_generated_story_asset(
                task,
                episode_id,
                user_action,
                prompt,
                target_duration,
                source_image,
                generated_dir,
            )
            ai_stories.append(
                {
                    "clientRef": client_ref,
                    "episodeId": episode_id,
                    "optionCode": "action_boost",
                    "contentType": story_asset["contentType"],
                    "title": short_text(user_action, "动作互动"),
                    "prompt": prompt,
                    "content": prompt,
                    "contentUrl": story_asset["contentUrl"],
                    "assetId": story_asset.get("assetId"),
                }
            )
            highlights.append(
                {
                    "episodeId": episode_id,
                    "startTime": start,
                    "endTime": end,
                    "highlightType": backend_highlight_type(interaction_type, plan),
                    "title": short_text(user_action, "动作互动"),
                    "description": row.get("interaction_reason") or "",
                    "confidence": row.get("confidence"),
                    "triggerOnce": 1,
                    "interactionConfig": {
                        "componentType": "action_button",
                        "optionCode": "action_boost",
                        "label": user_action,
                        "userAction": user_action,
                        "actionLabel": user_action,
                        "generationMode": "PREGEN",
                        "generationClientRef": client_ref,
                        "targetDuration": target_duration,
                        "videoGenerationPrompt": prompt,
                        "resumeTime": end,
                    },
                }
            )
    return {
        "highlights": highlights,
        "aiStories": ai_stories,
        "resultJson": {
            "finalOutputs": finals,
            "videoTasks": gen_tasks,
            "importedHighlights": highlights,
            "importedAiStories": ai_stories,
            "generationEnabled": generation_enabled,
            "skippedWithoutGenerationKey": skipped_without_generation,
        },
    }


def run_task(task: Dict[str, Any]) -> None:
    task_id = task["taskId"]
    work_dir = RUNTIME_ROOT / str(task_id)
    input_dir = work_dir / "input"
    try:
        write_json(work_dir / "task.json", task)
        update_status(task, "RUNNING", "prepare", 15, "正在检查 RAG 库既有判断")
        episode_map = build_episode_map(task)
        paths = try_write_exact_rag_outputs(task, work_dir, episode_map)
        if paths:
            update_status(task, "RUNNING", "import", 80, "命中同剧同集 RAG 库结果，正在导入互动点")
        else:
            update_status(task, "RUNNING", "prepare", 20, "正在准备 RAG 视频")
            episode_map = prepare_videos(task, input_dir, work_dir)
            update_status(task, "RUNNING", "rag", 30, "正在按 30 秒切段、每段 9 帧执行 RAG 判断")
            paths = run_pipeline(task, work_dir, input_dir)
        generation_enabled = has_generation_config(task)
        update_status(
            task,
            "RUNNING",
            "generation" if generation_enabled else "import",
            82,
            "正在改写视频生成 prompt 并生成素材" if generation_enabled else "未填写视频生成 key，仅导入高光弹幕",
        )
        result = convert_results(task, paths, episode_map)
        base = task["callbackBaseUrl"].rstrip("/")
        post_json(
            f"{base}/analysis-tasks/{task_id}/result",
            {
                "callbackToken": task["callbackToken"],
                "status": "SUCCESS",
                "message": "RAG 分析完成" if generation_enabled else "RAG 分析完成，仅导入高光弹幕",
                **result,
            },
        )
    except Exception as exc:
        err = "".join(traceback.format_exception_only(type(exc), exc)).strip()
        try:
            update_status(task, "FAILED", "failed", 100, "RAG 分析失败", err)
        except Exception:
            pass
        safe_log(traceback.format_exc())
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: Dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.rstrip("/") not in ("", "/health"):
            self.send_error(404)
            return
        payload = {
            "code": 0,
            "message": "RAG service is running",
            "endpoints": {
                "startTask": "POST /tasks",
                "health": "GET /health",
            },
        }
        self.send_json(200, payload)

    def do_POST(self):
        path = self.path.rstrip("/")
        if path != "/tasks":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"code": 400, "message": "Invalid Content-Length"})
            return
        raw_body = self.rfile.read(length) if length > 0 else b""
        if not raw_body.strip():
            safe_log(
                "[rag_service] rejected empty /tasks body "
                f"from={self.client_address[0]}:{self.client_address[1]} "
                f"content_length={length} "
                f"content_type={self.headers.get('Content-Type', '')}"
            )
            self.send_json(400, {"code": 400, "message": "Empty JSON body"})
            return
        try:
            task = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            safe_log(
                "[rag_service] rejected invalid /tasks JSON "
                f"from={self.client_address[0]}:{self.client_address[1]} "
                f"content_length={length} "
                f"content_type={self.headers.get('Content-Type', '')} "
                f"body_preview={raw_body[:200]!r} "
                f"error={exc}"
            )
            self.send_json(400, {"code": 400, "message": f"Invalid JSON body: {exc}"})
            return
        if not isinstance(task, dict):
            self.send_json(400, {"code": 400, "message": "JSON body must be an object"})
            return
        threading.Thread(target=run_task, args=(task,), daemon=True).start()
        self.send_json(200, {"code": 0, "message": "accepted", "taskId": task.get("taskId")})

    def log_message(self, fmt, *args):
        safe_log("[rag_service] " + (fmt % args))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8091)
    args = ap.parse_args()
    try:
        cleanup_stale_task_dirs()
        server = ThreadingHTTPServer((args.host, args.port), Handler)
        safe_log(f"RAG service listening on http://{args.host}:{args.port}")
        server.serve_forever()
    except BaseException:
        safe_log(traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
