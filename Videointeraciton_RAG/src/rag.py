import json
import math
import re
import sqlite3
from typing import Dict, List, Any, Optional

import numpy as np

OUTPUT_SCHEMA_VERSION = "interaction_final_v3"
DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3"
DEFAULT_RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"
EMBEDDING_QUERY_INSTRUCTION = "为这个短剧片段生成表示，用于检索相似互动案例："
INTERACTION_TYPES = {"高光弹幕", "分支创建", "动作互动"}
REVIEW_LABEL_KEYS = [
    "source",
    "human_reviewed",
    "is_interactive",
    "interaction_type",
    "trigger_time",
    "interaction_window",
    "insert_position",
    "branch_mode",
    "branch_point_time",
    "mainline_option",
    "branch_options",
    "action_interaction",
    "highlight_barrage",
    "continuity_safe",
    "must_not_change_main_plot",
    "resume_condition",
    "confidence",
    "reason_type",
    "requires_visual",
    "reason",
]

_EMBEDDING_MODELS = {}
_RERANKER_MODELS = {}


def _as_float(value: Any, default: Any = None) -> Any:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def _round_time(value: Any) -> Any:
    value = _as_float(value)
    return None if value is None else round(value, 3)


def sample_start_time(sample: Dict[str, Any]) -> float:
    segment_time = sample.get("segment_time") if isinstance(sample.get("segment_time"), dict) else {}
    return float(sample.get("start_time", segment_time.get("start_time", 0)) or 0)


def sample_end_time(sample: Dict[str, Any]) -> float:
    segment_time = sample.get("segment_time") if isinstance(sample.get("segment_time"), dict) else {}
    start = sample_start_time(sample)
    return float(sample.get("end_time", segment_time.get("end_time", start)) or start)


def previous_plot(sample: Dict[str, Any]) -> str:
    final_output = sample.get("final_output") if isinstance(sample.get("final_output"), dict) else {}
    return sample.get("previous_context") or sample.get("previous_plot") or final_output.get("previous_plot") or ""


def next_plot(sample: Dict[str, Any]) -> str:
    final_output = sample.get("final_output") if isinstance(sample.get("final_output"), dict) else {}
    return sample.get("next_context") or sample.get("next_plot") or final_output.get("next_plot") or ""


def stable_option_code(text: str, fallback: str) -> str:
    """把中文选项文案压成后端可用的稳定英文/ASCII optionCode。"""
    import hashlib

    raw = str(text or "").strip()
    keep = []
    for ch in raw:
        if ch.isascii() and (ch.isalnum() or ch in ("_", "-")):
            keep.append(ch.lower())
        elif ch.isspace():
            keep.append("_")
    code = "".join(keep).strip("_-")
    while "__" in code:
        code = code.replace("__", "_")
    if code:
        return code[:40]
    digest = hashlib.md5(raw.encode("utf-8")).hexdigest()[:6] if raw else "000000"
    return f"{fallback}_{digest}"


def normalize_window(window: Any, sample: Dict[str, Any], interaction_type: str, trigger_time: Any) -> Any:
    start_seg = sample_start_time(sample)
    end_seg = sample_end_time(sample)
    segment_duration = max(0.001, end_seg - start_seg)
    start = end = None
    if isinstance(window, dict):
        start = _as_float(window.get("start"))
        end = _as_float(window.get("end"))
    if start is None or end is None:
        trigger = _as_float(trigger_time)
        if trigger is None:
            return None
        default_duration = min(
            4.0 if interaction_type == "高光弹幕" else 6.0 if interaction_type == "分支创建" else 8.0,
            segment_duration,
        )
        start = trigger
        end = min(end_seg, start + default_duration)
        if end <= start:
            start = max(start_seg, trigger - default_duration)
            end = trigger
    start = max(start_seg, min(float(start), end_seg))
    end = max(start_seg, min(float(end), end_seg))
    if end <= start:
        return None
    return {"start": round(start, 3), "end": round(end, 3), "duration": round(end - start, 3)}


def _empty_judgement(source: str, raw: Dict[str, Any], human_reviewed: bool = False) -> Dict[str, Any]:
    return {
        "source": source,
        "human_reviewed": bool(human_reviewed),
        "is_interactive": False,
        "interaction_type": "none",
        "trigger_time": None,
        "interaction_window": None,
        "insert_position": None,
        "branch_mode": None,
        "branch_point_time": None,
        "mainline_option": "",
        "branch_options": [],
        "action_interaction": {},
        "highlight_barrage": {},
        "continuity_safe": False,
        "must_not_change_main_plot": True,
        "resume_condition": "",
        "confidence": float(raw.get("confidence", 0) or 0),
        "reason_type": raw.get("reason_type", "none") or "none",
        "requires_visual": bool(raw.get("requires_visual", False)),
        "reason": raw.get("reason", "") or "模型判断为非互动片段",
    }


def normalize_judgement(
    raw: Dict[str, Any],
    sample: Dict[str, Any],
    source: str = "model",
    human_reviewed: bool = False,
) -> Dict[str, Any]:
    """把模型/人工标签归一成判断字段；最终 JSONL 结构由 build_final_output 生成。"""
    raw = raw or {}
    interaction_type = raw.get("interaction_type", "none")
    if interaction_type not in INTERACTION_TYPES:
        return _empty_judgement(source, raw, human_reviewed)

    start = sample_start_time(sample)
    end = sample_end_time(sample)
    trigger = _round_time(raw.get("trigger_time"))
    if trigger is not None:
        trigger = round(max(start, min(trigger, end)), 3)
    window = normalize_window(raw.get("interaction_window"), sample, interaction_type, trigger)
    if trigger is None or window is None:
        empty = _empty_judgement(source, raw, human_reviewed)
        empty["reason"] = raw.get("reason", "") or "缺少合法触发时间或互动持续窗口，按非互动处理"
        return empty

    default_position = {"高光弹幕": "overlay", "分支创建": "before_decision", "动作互动": "during_action"}[interaction_type]
    judgement = {
        "source": source,
        "human_reviewed": bool(human_reviewed),
        "is_interactive": True,
        "interaction_type": interaction_type,
        "trigger_time": trigger,
        "interaction_window": window,
        "insert_position": raw.get("insert_position") or default_position,
        "branch_mode": raw.get("branch_mode") if interaction_type == "分支创建" else None,
        "branch_point_time": _round_time(raw.get("branch_point_time")) if interaction_type == "分支创建" else None,
        "mainline_option": raw.get("mainline_option", "") if interaction_type == "分支创建" else "",
        "branch_options": raw.get("branch_options") if isinstance(raw.get("branch_options"), list) else [],
        "action_interaction": raw.get("action_interaction") if isinstance(raw.get("action_interaction"), dict) else {},
        "highlight_barrage": raw.get("highlight_barrage") if isinstance(raw.get("highlight_barrage"), dict) else {},
        "continuity_safe": bool(raw.get("continuity_safe", True)),
        "must_not_change_main_plot": True,
        "resume_condition": raw.get("resume_condition", "") or (
            "弹幕/特效覆盖结束后继续播放原视频，不改变剧情"
            if interaction_type == "高光弹幕"
            else "互动结束后必须无缝接回原视频后续剧情，不改变人物关系、动作结果和主线信息"
        ),
        "confidence": float(raw.get("confidence", 0) or 0),
        "reason_type": raw.get("reason_type", "") or interaction_type,
        "requires_visual": bool(raw.get("requires_visual", False)),
        "reason": raw.get("reason", "") or "",
    }
    if interaction_type == "分支创建":
        judgement["branch_mode"] = judgement["branch_mode"] or "trial_and_error"
        judgement["branch_point_time"] = judgement["branch_point_time"] if judgement["branch_point_time"] is not None else trigger
    return judgement


def _current_plot(sample: Dict[str, Any]) -> str:
    return (
        sample.get("dialogue_summary")
        or sample.get("dialogue")
        or sample.get("visual_caption")
        or sample.get("action_caption")
        or ""
    )


def compact_review_row(row: Dict[str, Any], judgement_key: str = "label") -> Dict[str, Any]:
    """保留人工审核需要的信息，去掉抽帧路径、RAG特征等调试字段。"""
    attach_final_output(row, judgement_key)
    label = row.get("label") or {}
    compact_label = {key: label.get(key) for key in REVIEW_LABEL_KEYS if key in label}
    return {
        "sample_id": row.get("sample_id"),
        "drama_id": row.get("drama_id"),
        "episode_id": row.get("episode_id"),
        "segment_id": row.get("segment_id"),
        "segment_time": {
            "start_time": sample_start_time(row),
            "end_time": sample_end_time(row),
        },
        "contact_sheet_path": row.get("contact_sheet_path"),
        "dialogue": row.get("dialogue", ""),
        "subtitle_ocr_text": row.get("subtitle_ocr_text", ""),
        "visual_caption": row.get("visual_caption", ""),
        "action_caption": row.get("action_caption", ""),
        "emotion_caption": row.get("emotion_caption", ""),
        "dialogue_summary": row.get("dialogue_summary", ""),
        "previous_plot": previous_plot(row),
        "next_plot": next_plot(row),
        "label_need_review": row.get("label_need_review", True),
        "label": compact_label,
        "final_output": row.get("final_output"),
    }


def _highlight_defaults(judgement: Dict[str, Any]) -> Dict[str, Any]:
    detail = judgement.get("highlight_barrage") or {}
    reason_type = str(detail.get("emotion_point") or judgement.get("reason_type") or "爽点")
    mapping = [
        (("搞笑", "笑", "喜剧"), ("funny", "笑出鹅叫", "FUNNY", "bubble")),
        (("甜", "心动", "暧昧"), ("sweet", "甜", "SWEET", "float")),
        (("名场面", "震惊", "高能"), ("famous_scene", "名场面", "FAMOUS", "bubble")),
        (("反转", "转折"), ("famous_scene", "名场面", "TWIST", "bubble")),
        (("爽", "打脸", "反击"), ("cool", "爽", "COOL", "float")),
    ]
    option_code, label, emotion_type, effect = "cool", "爽", "COOL", "float"
    for keys, values in mapping:
        if any(k in reason_type for k in keys):
            option_code, label, emotion_type, effect = values
            break
    option_code = detail.get("optionCode") or detail.get("option_code") or option_code
    label = detail.get("label") or label
    effect = detail.get("effect") or effect
    emotion_type = detail.get("emotionType") or detail.get("emotion_type") or emotion_type
    return {
        "emotion_point": reason_type,
        "componentType": detail.get("componentType") or detail.get("component_type") or "emotion_button",
        "optionCode": option_code,
        "label": label,
        "effect": effect,
        "highlightType": "高光弹幕",
        "emotionType": emotion_type,
        "interactionConfig": {
            "componentType": "emotion_button",
            "buttons": [{"optionCode": option_code, "label": label, "effect": effect}],
        },
    }


def _branch_creation(judgement: Dict[str, Any]) -> Dict[str, Any]:
    branch_point = judgement.get("branch_point_time") or judgement.get("trigger_time")
    options = []
    raw_options = judgement.get("branch_options") or []
    for idx, opt in enumerate(raw_options):
        if not isinstance(opt, dict):
            continue
        label = opt.get("label") or opt.get("option") or ("主线选择" if opt.get("is_mainline") else "试错选择")
        branch_outcome = str(opt.get("branchOutcome") or opt.get("branch_outcome") or "").upper()
        is_mainline = bool(opt.get("is_mainline")) or branch_outcome == "MAINLINE"
        code = opt.get("optionCode") or opt.get("option_code") or stable_option_code(
            label, "mainline" if is_mainline else f"trial_{idx + 1}"
        )
        if is_mainline:
            options.append(
                {
                    "optionCode": code,
                    "label": label,
                    "branchOutcome": "MAINLINE",
                    "generationMode": None,
                    "generationId": None,
                    "retryTime": None,
                    "returnBehavior": opt.get("return_behavior") or "continue_mainline",
                    "creation": "主线正确选择不切换视频，关闭选择层后继续播放原片。",
                    "outcome": opt.get("outcome") or "继续原剧情",
                }
            )
        else:
            options.append(
                {
                    "optionCode": code,
                    "label": label,
                    "branchOutcome": "TRIAL",
                    "generationMode": opt.get("generationMode") or opt.get("generation_mode") or "PREGEN",
                    "generationId": opt.get("generationId") or opt.get("generation_id"),
                    "retryTime": opt.get("retryTime") or opt.get("retry_time") or branch_point,
                    "targetDuration": opt.get("targetDuration") or opt.get("target_duration"),
                    "videoGenerationPrompt": opt.get("videoGenerationPrompt") or opt.get("video_generation_prompt"),
                    "returnBehavior": opt.get("return_behavior") or "return_to_branch_point",
                    "aigcInsertIntent": opt.get("aigc_insert_intent") or "生成错误选择导致失败/危机的短视频",
                    "badOutcome": opt.get("bad_outcome") or opt.get("outcome") or "",
                    "provesMainlineBy": opt.get("proves_mainline_by") or "",
                }
            )
    if not any(o.get("branchOutcome") == "MAINLINE" for o in options):
        main_label = judgement.get("mainline_option") or "继续主线"
        options.append(
            {
                "optionCode": stable_option_code(main_label, "mainline"),
                "label": main_label,
                "branchOutcome": "MAINLINE",
                "generationMode": None,
                "generationId": None,
                "retryTime": None,
                "returnBehavior": "continue_mainline",
                "creation": "主线正确选择不切换视频，关闭选择层后继续播放原片。",
                "outcome": "继续原剧情",
            }
        )
    return {
        "componentType": "branch_choice",
        "branchMode": judgement.get("branch_mode") or "trial_and_error",
        "branchPointTime": branch_point,
        "options": options,
        "creationNotes": "先为 TRIAL/PREGEN 选项生成并导入 aiStories，拿到 generationId 后写入 highlights:batch；MAINLINE 选项不需要 generationId。",
    }


def _action_interaction(judgement: Dict[str, Any]) -> Dict[str, Any]:
    action = judgement.get("action_interaction") or {}
    return {
        "componentType": action.get("componentType") or action.get("component_type") or "action_button",
        "userAction": action.get("user_action") or action.get("userAction") or "点击触发动作增强",
        "targetDuration": action.get("targetDuration") or action.get("target_duration"),
        "videoGenerationPrompt": action.get("videoGenerationPrompt") or action.get("video_generation_prompt"),
        "aigcVideoRequirement": action.get("aigc_insert_intent") or action.get("aigcVideoRequirement") or "",
        "enhancedProcess": action.get("enhanced_process") or action.get("enhancedProcess") or "",
        "originalResultToPreserve": action.get("original_result_to_preserve")
        or action.get("originalResultToPreserve")
        or "保持原片动作结果和主线剧情不变",
    }


def build_next_action(judgement: Dict[str, Any]) -> Dict[str, Any]:
    interaction_type = judgement.get("interaction_type")
    return {
        "type": interaction_type,
        "branch_creation": _branch_creation(judgement) if interaction_type == "分支创建" else None,
        "action_interaction": _action_interaction(judgement) if interaction_type == "动作互动" else None,
        "highlight_barrage": _highlight_defaults(judgement) if interaction_type == "高光弹幕" else None,
    }


def build_final_output(sample: Dict[str, Any], judgement: Dict[str, Any]) -> Dict[str, Any]:
    human_reviewed = bool(judgement.get("human_reviewed") or judgement.get("source") == "human")
    interaction_type = judgement.get("interaction_type") or "none"
    reason = judgement.get("reason") or "模型判断为非互动片段"
    if not judgement.get("is_interactive") or judgement.get("interaction_type") not in INTERACTION_TYPES:
        return {
            "human_reviewed": human_reviewed,
            "is_interactive": False,
            "interaction_type": interaction_type,
            "confidence": None,
            "timing": None,
            "interaction_reason": reason,
            "interaction_plan": None,
            "previous_plot": previous_plot(sample),
            "next_plot": next_plot(sample),
        }
    window = judgement.get("interaction_window") or {}
    return {
        "human_reviewed": human_reviewed,
        "is_interactive": True,
        "interaction_type": judgement.get("interaction_type"),
        "confidence": judgement.get("confidence"),
        "timing": {
            "start_time": window.get("start"),
            "end_time": window.get("end"),
            "duration": window.get("duration"),
        },
        "interaction_reason": reason,
        "interaction_plan": build_next_action(judgement),
        "previous_plot": previous_plot(sample),
        "next_plot": next_plot(sample),
    }


def attach_final_output(row: Dict[str, Any], judgement_key: str = "prediction") -> Dict[str, Any]:
    judgement = row.get(judgement_key) or row.get("label") or {}
    final_output = build_final_output(row, judgement)
    row["final_output"] = final_output
    for stale_key in (
        "human_reviewed",
        "is_interactive",
        "interaction_type",
        "confidence",
        "timing",
        "interaction_reason",
        "interaction_plan",
        "previous_plot",
        "next_plot",
        "plot_context",
        "next_action",
    ):
        row.pop(stale_key, None)
    return row


def _embedding_key(model_name: str, device: Optional[str]) -> str:
    return f"{model_name}::{device or 'auto'}"


def _load_embedding_model(model_name: str, device: Optional[str] = None):
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        raise RuntimeError(
            "缺少 embedding 依赖。请先安装 requirements.txt，或至少安装 sentence-transformers 和 torch。"
        ) from exc

    key = _embedding_key(model_name, device)
    if key not in _EMBEDDING_MODELS:
        kwargs = {"device": device} if device else {}
        _EMBEDDING_MODELS[key] = SentenceTransformer(model_name, **kwargs)
    return _EMBEDDING_MODELS[key]


def _load_reranker_model(model_name: str, device: Optional[str] = None):
    try:
        from FlagEmbedding import FlagReranker
    except ImportError as exc:
        raise RuntimeError("缺少 BGE reranker 依赖。请先安装 requirements.txt，或至少安装 FlagEmbedding 和 torch。") from exc

    key = _embedding_key(model_name, device)
    if key not in _RERANKER_MODELS:
        kwargs = {"use_fp16": True}
        if device:
            kwargs["devices"] = [device]
        try:
            _RERANKER_MODELS[key] = FlagReranker(model_name, **kwargs)
        except TypeError:
            kwargs.pop("devices", None)
            _RERANKER_MODELS[key] = FlagReranker(model_name, **kwargs)
    return _RERANKER_MODELS[key]


def _as_embedding_matrix(values: Any) -> np.ndarray:
    matrix = np.asarray(values, dtype=np.float32)
    if matrix.ndim == 1:
        matrix = matrix.reshape(1, -1)
    return matrix


def embed_texts(
    texts: List[str],
    model_name: str = DEFAULT_EMBEDDING_MODEL,
    device: Optional[str] = None,
    batch_size: int = 32,
    is_query: bool = False,
    show_progress_bar: bool = False,
) -> np.ndarray:
    if not texts:
        return np.zeros((0, 0), dtype=np.float32)
    model = _load_embedding_model(model_name, device)
    inputs = [f"{EMBEDDING_QUERY_INSTRUCTION}{text}" if is_query else text for text in texts]
    vectors = model.encode(
        inputs,
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=show_progress_bar,
    )
    return _as_embedding_matrix(vectors)


def build_rag_db(
    cases_path: str,
    db_path: str,
    embedding_model: str = DEFAULT_EMBEDDING_MODEL,
    embedding_device: Optional[str] = None,
    embedding_batch_size: int = 32,
    build_embeddings: bool = True,
) -> None:
    """把 rag_cases.jsonl 建成 SQLite RAG 库，并写入 embedding 向量索引。"""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS rag_cases")
    cur.execute("DROP TABLE IF EXISTS rag_cases_fts")
    cur.execute("DROP TABLE IF EXISTS rag_case_embeddings")
    cur.execute("DROP TABLE IF EXISTS rag_meta")
    cur.execute("CREATE TABLE rag_cases(case_id TEXT PRIMARY KEY, text TEXT, metadata TEXT)")
    cur.execute("CREATE VIRTUAL TABLE rag_cases_fts USING fts5(case_id, text)")
    cur.execute("CREATE TABLE rag_case_embeddings(case_id TEXT PRIMARY KEY, dim INTEGER, embedding BLOB)")
    cur.execute("CREATE TABLE rag_meta(key TEXT PRIMARY KEY, value TEXT)")

    cases = []
    with open(cases_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            x = json.loads(line)
            cases.append(x)
            cur.execute(
                "INSERT OR REPLACE INTO rag_cases(case_id, text, metadata) VALUES (?, ?, ?)",
                (x["case_id"], x["text"], json.dumps(x.get("metadata", {}), ensure_ascii=False)),
            )
            cur.execute(
                "INSERT INTO rag_cases_fts(case_id, text) VALUES (?, ?)",
                (x["case_id"], x["text"]),
            )
    if build_embeddings and cases:
        embeddings = embed_texts(
            [c["text"] for c in cases],
            model_name=embedding_model,
            device=embedding_device,
            batch_size=embedding_batch_size,
            is_query=False,
            show_progress_bar=True,
        )
        for case, vector in zip(cases, embeddings):
            vector = np.asarray(vector, dtype=np.float32)
            cur.execute(
                "INSERT OR REPLACE INTO rag_case_embeddings(case_id, dim, embedding) VALUES (?, ?, ?)",
                (case["case_id"], int(vector.shape[0]), vector.tobytes()),
            )
        cur.execute("INSERT OR REPLACE INTO rag_meta(key, value) VALUES (?, ?)", ("embedding_model", embedding_model))
        cur.execute(
            "INSERT OR REPLACE INTO rag_meta(key, value) VALUES (?, ?)",
            ("embedding_dim", str(int(embeddings.shape[1]))),
        )
    cur.execute("INSERT OR REPLACE INTO rag_meta(key, value) VALUES (?, ?)", ("case_count", str(len(cases))))
    conn.commit()
    conn.close()


def make_query(sample: Dict[str, Any]) -> str:
    fields = [
        previous_plot(sample),
        sample.get("dialogue", ""),
        sample.get("subtitle_ocr_text", ""),
        sample.get("visual_caption", ""),
        sample.get("action_caption", ""),
        sample.get("emotion_caption", ""),
        sample.get("dialogue_summary", ""),
        next_plot(sample),
    ]
    features = sample.get("features") or {}
    fields += features.get("retrieval_keywords", [])
    fields += sample.get("candidate_interaction_types") or []
    return " ".join([str(x) for x in fields if x])


def _normalize_query_text(text: str) -> str:
    return str(text or "").replace("，", " ").replace("。", " ").replace("、", " ").replace("：", " ").replace("；", " ")


def _tokens(text: str) -> set:
    text = _normalize_query_text(text).lower()
    ascii_tokens = re.findall(r"[a-z0-9_+-]+", text)
    cjk = re.findall(r"[\u4e00-\u9fff]", text)
    cjk_bigrams = ["".join(cjk[i : i + 2]) for i in range(max(0, len(cjk) - 1))]
    return set([t for t in ascii_tokens if t] + cjk + cjk_bigrams)


def search_cases(db_path: str, query: str, top_k: int = 8) -> List[Dict[str, Any]]:
    """用 SQLite FTS 召回候选案例。top_k 可以当 recall_k 使用。"""
    query = _normalize_query_text(query)
    tokens = [t for t in query.split() if len(t.strip()) > 0]
    if not tokens:
        return []
    q = " OR ".join(tokens[:30])

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    try:
        rows = cur.execute(
            """
            SELECT c.case_id, c.text, c.metadata, bm25(rag_cases_fts) AS fts_score
            FROM rag_cases_fts f JOIN rag_cases c ON f.case_id = c.case_id
            WHERE rag_cases_fts MATCH ?
            ORDER BY fts_score
            LIMIT ?
            """,
            (q, top_k),
        ).fetchall()
    except sqlite3.OperationalError:
        rows = []
    conn.close()
    return [{"case_id": a, "text": b, "metadata": json.loads(c), "fts_score": d} for a, b, c, d in rows]


def search_cases_by_embedding(
    db_path: str,
    query: str,
    top_k: int = 24,
    embedding_model: str = DEFAULT_EMBEDDING_MODEL,
    embedding_device: Optional[str] = None,
    embedding_batch_size: int = 32,
) -> List[Dict[str, Any]]:
    """用 query embedding 和案例 embedding 余弦相似度召回候选案例。"""
    query = str(query or "").strip()
    if not query:
        return []

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    table_exists = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rag_case_embeddings'"
    ).fetchone()
    if not table_exists:
        conn.close()
        raise RuntimeError("当前 RAG SQLite 没有 embedding 索引，请先用 2_build_rag.py 重新建库。")

    rows = cur.execute(
        """
        SELECT c.case_id, c.text, c.metadata, e.dim, e.embedding
        FROM rag_case_embeddings e
        JOIN rag_cases c ON c.case_id = e.case_id
        """
    ).fetchall()
    conn.close()
    if not rows:
        return []

    query_vector = embed_texts(
        [query],
        model_name=embedding_model,
        device=embedding_device,
        batch_size=embedding_batch_size,
        is_query=True,
        show_progress_bar=False,
    )[0]
    case_vectors = np.vstack([np.frombuffer(blob, dtype=np.float32, count=int(dim)) for _, _, _, dim, blob in rows])
    scores = case_vectors @ query_vector
    order = np.argsort(-scores)[:top_k]

    cases = []
    for rank, idx in enumerate(order, start=1):
        case_id, text, metadata, _, _ = rows[int(idx)]
        cases.append(
            {
                "case_id": case_id,
                "text": text,
                "metadata": json.loads(metadata),
                "embedding_score": round(float(scores[int(idx)]), 6),
                "recall_rank": rank,
            }
        )
    return cases


def _type_hints(sample: Dict[str, Any]) -> set:
    text = " ".join(
        [
            str(sample.get("dialogue", "")),
            str(sample.get("visual_caption", "")),
            str(sample.get("action_caption", "")),
            str(sample.get("emotion_caption", "")),
            str(sample.get("dialogue_summary", "")),
        ]
    )
    hints = set(sample.get("candidate_interaction_types") or [])
    if any(k in text for k in ["追", "跑", "逃", "打", "救", "开车", "冲", "抢", "破门", "搜证"]):
        hints.add("动作互动")
    if any(k in text for k in ["选择", "是否", "进不进", "去不去", "留下", "独自", "叫上", "决定"]):
        hints.add("分支创建")
    if any(k in text for k in ["爽", "打脸", "反转", "搞笑", "甜", "震惊", "名场面", "社死"]):
        hints.add("高光弹幕")
    return hints


def _case_interaction_type(case: Dict[str, Any]) -> str:
    meta = case.get("metadata") or {}
    return meta.get("interaction_type") or "none"


def _case_is_positive(case: Dict[str, Any]) -> bool:
    meta = case.get("metadata") or {}
    return bool(meta.get("is_interactive")) and _case_interaction_type(case) in INTERACTION_TYPES


def _case_quality_score(case: Dict[str, Any]) -> float:
    meta = case.get("metadata") or {}
    score = 0.0
    if meta.get("human_reviewed"):
        score += 0.12
    elif meta.get("label_source") == "doubao_prediction":
        score -= 0.08
    if _case_is_positive(case):
        score += 0.04
    elif _case_interaction_type(case) == "none":
        score -= 0.02
    confidence = _as_float(meta.get("confidence_label"))
    if confidence is None:
        final_output = meta.get("final_output") if isinstance(meta.get("final_output"), dict) else {}
        confidence = _as_float(final_output.get("confidence"))
    if confidence is not None:
        score += max(0.0, min(float(confidence), 1.0)) * 0.03
    return score


def _balance_case_mix(
    ranked: List[Dict[str, Any]],
    top_k: int,
    max_none_cases: int = 3,
    min_positive_cases: int = 2,
) -> List[Dict[str, Any]]:
    """Keep prompt examples useful: enough positive cases, limited none cases."""
    if top_k <= 0:
        return []
    max_none_cases = max(0, min(max_none_cases, top_k))
    min_positive_cases = max(0, min(min_positive_cases, top_k))

    selected = []
    selected_ids = set()
    skipped_none = []
    none_count = 0
    for case in ranked:
        if len(selected) >= top_k:
            break
        case_id = case.get("case_id")
        if case_id in selected_ids:
            continue
        if _case_interaction_type(case) == "none" and none_count >= max_none_cases:
            skipped_none.append(case)
            continue
        selected.append(case)
        selected_ids.add(case_id)
        if _case_interaction_type(case) == "none":
            none_count += 1

    positives = [case for case in ranked if _case_is_positive(case) and case.get("case_id") not in selected_ids]
    selected_positive_count = sum(1 for case in selected if _case_is_positive(case))
    while selected_positive_count < min_positive_cases and positives:
        candidate = positives.pop(0)
        replace_idx = next(
            (idx for idx in range(len(selected) - 1, -1, -1) if _case_interaction_type(selected[idx]) == "none"),
            None,
        )
        if replace_idx is None:
            break
        selected_ids.discard(selected[replace_idx].get("case_id"))
        selected[replace_idx] = candidate
        selected_ids.add(candidate.get("case_id"))
        selected_positive_count += 1

    for case in skipped_none:
        if len(selected) >= top_k:
            break
        case_id = case.get("case_id")
        if case_id not in selected_ids:
            selected.append(case)
            selected_ids.add(case_id)

    selected.sort(key=lambda x: x.get("rerank_score", x.get("embedding_score", 0)), reverse=True)
    for rank, case in enumerate(selected, start=1):
        case["selection_rank"] = rank
    return selected[:top_k]


def rerank_cases(sample: Dict[str, Any], cases: List[Dict[str, Any]], top_k: int = 6) -> List[Dict[str, Any]]:
    """轻量重排：文本相似度 + 类型 hint + 人工/自动样本质量权重。"""
    query_text = make_query(sample)
    query_tokens = _tokens(query_text)
    hints = _type_hints(sample)
    reranked = []
    for idx, case in enumerate(cases):
        case_tokens = _tokens(case.get("text", ""))
        overlap = len(query_tokens & case_tokens)
        denom = math.sqrt(max(1, len(query_tokens)) * max(1, len(case_tokens)))
        token_score = overlap / denom
        meta = case.get("metadata") or {}
        case_type = meta.get("interaction_type")
        type_score = 0.15 if case_type in hints else 0.0
        # FTS5 bm25 越小越好；召回名次稳定时给一点保序分。
        rank_score = max(0.0, 0.1 - idx * 0.005)
        quality_score = _case_quality_score(case)
        score = token_score + type_score + rank_score + quality_score
        item = dict(case)
        item["quality_score"] = round(quality_score, 6)
        item["rerank_score"] = round(score, 6)
        reranked.append(item)
    reranked.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
    return reranked


def rerank_cases_bge(
    sample: Dict[str, Any],
    cases: List[Dict[str, Any]],
    top_k: int = 6,
    reranker_model: str = DEFAULT_RERANKER_MODEL,
    reranker_device: Optional[str] = None,
    reranker_batch_size: int = 16,
) -> List[Dict[str, Any]]:
    """用 BGE reranker 对 embedding 召回候选做精排。"""
    if not cases:
        return []
    query_text = make_query(sample)
    model = _load_reranker_model(reranker_model, reranker_device)
    pairs = [[query_text, case.get("text", "")] for case in cases]
    try:
        scores = model.compute_score(pairs, batch_size=reranker_batch_size, normalize=True)
    except TypeError:
        scores = model.compute_score(pairs, batch_size=reranker_batch_size)
    scores = np.asarray(scores, dtype=np.float32).reshape(-1).tolist()

    reranked = []
    for case, score in zip(cases, scores):
        quality_score = _case_quality_score(case)
        item = dict(case)
        item["raw_rerank_score"] = round(float(score), 6)
        item["quality_score"] = round(quality_score, 6)
        item["rerank_score"] = round(float(score) + quality_score, 6)
        item["rerank_model"] = reranker_model
        reranked.append(item)
    reranked.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
    return reranked


def retrieve_cases(
    db_path: str,
    sample: Dict[str, Any],
    recall_k: int = 24,
    top_k: int = 6,
    retrieval_mode: str = "embedding",
    rerank_mode: str = "bge",
    embedding_model: str = DEFAULT_EMBEDDING_MODEL,
    embedding_device: Optional[str] = None,
    embedding_batch_size: int = 32,
    reranker_model: str = DEFAULT_RERANKER_MODEL,
    reranker_device: Optional[str] = None,
    reranker_batch_size: int = 16,
    max_none_cases: int = 3,
    min_positive_cases: int = 2,
) -> List[Dict[str, Any]]:
    query = make_query(sample)
    if retrieval_mode == "embedding":
        try:
            candidates = search_cases_by_embedding(
                db_path,
                query,
                top_k=max(recall_k, top_k),
                embedding_model=embedding_model,
                embedding_device=embedding_device,
                embedding_batch_size=embedding_batch_size,
            )
        except RuntimeError:
            candidates = []
        if not candidates:
            candidates = search_cases(db_path, query, top_k=max(recall_k, top_k))
            for case in candidates:
                case["retrieval_fallback"] = "fts_no_embedding_candidates"
    elif retrieval_mode == "fts":
        candidates = search_cases(db_path, query, top_k=max(recall_k, top_k))
    else:
        raise ValueError(f"未知 retrieval_mode: {retrieval_mode}")

    if rerank_mode == "bge":
        ranked = rerank_cases_bge(
            sample,
            candidates,
            top_k=top_k,
            reranker_model=reranker_model,
            reranker_device=reranker_device,
            reranker_batch_size=reranker_batch_size,
        )
        return _balance_case_mix(ranked, top_k, max_none_cases, min_positive_cases)
    if rerank_mode == "rules":
        ranked = rerank_cases(sample, candidates, top_k=top_k)
        return _balance_case_mix(ranked, top_k, max_none_cases, min_positive_cases)
    if rerank_mode == "none":
        return _balance_case_mix(candidates, top_k, max_none_cases, min_positive_cases)
    raise ValueError(f"未知 rerank_mode: {rerank_mode}")


def _duration_from_final(final_output: Dict[str, Any], fallback: float = 6.0) -> float:
    timing = final_output.get("timing") or {}
    duration = _as_float(timing.get("duration"), fallback)
    if duration is None or duration <= 0:
        duration = fallback
    return round(float(duration), 3)


def _task_base(row: Dict[str, Any], final_output: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "sample_id": row.get("sample_id"),
        "drama_id": row.get("drama_id"),
        "episode_id": row.get("episode_id"),
        "segment_id": row.get("segment_id"),
        "source_timing": final_output.get("timing"),
        "previous_plot": final_output.get("previous_plot"),
        "next_plot": final_output.get("next_plot"),
        "interaction_reason": final_output.get("interaction_reason"),
    }


def build_video_generation_tasks(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """为分支创建和动作互动生成可交给视频生成 API 的任务描述。"""
    attach_final_output(row, "prediction")
    final_output = row.get("final_output") or {}
    plan = final_output.get("interaction_plan") or {}
    interaction_type = final_output.get("interaction_type")
    tasks = []
    if interaction_type == "分支创建":
        branch = plan.get("branch_creation") or {}
        branch_point = branch.get("branchPointTime")
        for option in branch.get("options") or []:
            if option.get("branchOutcome") != "TRIAL":
                continue
            target_duration = option.get("targetDuration") or _duration_from_final(final_output, 6.0)
            prompt = option.get("videoGenerationPrompt") or (
                f"生成一个短剧试错分支视频，时长约 {target_duration} 秒。"
                f"用户选择“{option.get('label','试错选项')}”后，展示错误选择导致的不良后果：{option.get('badOutcome','失败或陷入危机')}。"
                f"视频要服务于分支试错，结尾必须能回到 {option.get('retryTime', branch_point)} 秒的分支选择点重新选择。"
                "不要改变主线人物关系、关键道具归属、剧情真相或最终结果。"
            )
            task = _task_base(row, final_output)
            task.update(
                {
                    "task_type": "branch_trial_video",
                    "optionCode": option.get("optionCode"),
                    "optionLabel": option.get("label"),
                    "target_duration": target_duration,
                    "retryTime": option.get("retryTime", branch_point),
                    "generationMode": option.get("generationMode") or "PREGEN",
                    "video_generation_prompt": prompt,
                    "bad_outcome": option.get("badOutcome"),
                    "continuity_constraints": [
                        "TRIAL 分支结束后回到分支选择点",
                        "不得永久改变主线剧情",
                        "不得改变后续原片必须保留的结果",
                    ],
                    "after_generation": "生成视频后调用 /admin/ai-stories:batch 导入，拿到 generationId 后写入 branch_choice 的 TRIAL 选项。",
                }
            )
            tasks.append(task)
    elif interaction_type == "动作互动":
        action = plan.get("action_interaction") or {}
        target_duration = action.get("targetDuration") or _duration_from_final(final_output, 6.0)
        prompt = action.get("videoGenerationPrompt") or (
            f"生成一个短剧动作增强视频，时长约 {target_duration} 秒。"
            f"用户操作：{action.get('userAction','点击触发动作增强')}。"
            f"视频内容：{action.get('aigcVideoRequirement','强化当前动作过程')}。"
            f"增强过程：{action.get('enhancedProcess','增强主线动作过程')}。"
            f"必须保持不变的原片结果：{action.get('originalResultToPreserve','主线动作结果和后续剧情不改变')}。"
            "结尾要能无缝接回原片，不要改变人物关系、胜负结果、关键道具归属或剧情真相。"
        )
        task = _task_base(row, final_output)
        task.update(
            {
                "task_type": "action_interaction_video",
                "userAction": action.get("userAction"),
                "target_duration": target_duration,
                "video_generation_prompt": prompt,
                "enhanced_process": action.get("enhancedProcess"),
                "original_result_to_preserve": action.get("originalResultToPreserve"),
                "continuity_constraints": [
                    "只增强动作过程，不改变动作结果",
                    "结束后无缝接回原片",
                    "不得改变主线剧情",
                ],
                "after_generation": "生成视频后作为动作互动素材导入；若后端按 aiStories 管理视频内容，可走 /admin/ai-stories:batch 后再关联对应互动配置。",
            }
        )
        tasks.append(task)
    return tasks



def format_cases(cases: List[Dict[str, Any]]) -> str:
    if not cases:
        return "无相似案例。"
    out = []
    for c in cases:
        out.append(f"case_id: {c['case_id']}\ntext: {c['text']}\nmetadata: {json.dumps(c['metadata'], ensure_ascii=False)}")
    return "\n\n".join(out)
