#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Turn prediction JSONL rows into compact review JSON initialized from prediction."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.rag import compact_review_row


def read_jsonl(path: str):
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def prediction_to_label(prediction):
    label = dict(prediction or {})
    label.pop("model", None)
    label["source"] = "doubao_prediction"
    label["human_reviewed"] = False
    return label


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="predictions.jsonl or review_topk.jsonl")
    ap.add_argument("--output", required=True, help="editable review JSON")
    args = ap.parse_args()

    rows = []
    for row in read_jsonl(args.input):
        prediction = row.get("prediction") or {}
        if not prediction:
            continue
        row["label"] = prediction_to_label(prediction)
        row["label_need_review"] = True
        rows.append(compact_review_row(row, "label"))

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"review json: {args.output}; rows={len(rows)}")


if __name__ == "__main__":
    main()
