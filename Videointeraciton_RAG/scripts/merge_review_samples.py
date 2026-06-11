#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Merge human-reviewed sample JSON/JSONL files for rebuilding one RAG database."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.rag import compact_review_row


def read_rows(path: str):
    p = Path(path)
    if p.suffix.lower() == ".json":
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("rows") or data.get("samples") or []
        if not isinstance(data, list):
            raise ValueError(f"{path} must be a JSON array or contain rows/samples.")
        return data
    rows = []
    with p.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def is_human_reviewed(row):
    label = row.get("label") or {}
    return label.get("source") == "human" or label.get("human_reviewed") is True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inputs", nargs="+", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--include-unreviewed", action="store_true")
    args = ap.parse_args()

    merged = {}
    skipped = 0
    for input_path in args.inputs:
        for row in read_rows(input_path):
            sample_id = row.get("sample_id")
            if not sample_id:
                skipped += 1
                continue
            if not args.include_unreviewed and not is_human_reviewed(row):
                skipped += 1
                continue
            row["label_need_review"] = False if is_human_reviewed(row) else row.get("label_need_review", True)
            merged[sample_id] = compact_review_row(row, "label")

    rows = sorted(
        merged.values(),
        key=lambda x: (str(x.get("drama_id")), str(x.get("episode_id")), str(x.get("segment_id")), str(x.get("sample_id"))),
    )
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"merged reviewed samples: {args.output}; rows={len(rows)}; skipped={skipped}")


if __name__ == "__main__":
    main()
