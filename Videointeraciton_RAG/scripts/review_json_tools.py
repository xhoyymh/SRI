#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convert review samples between JSONL and editable pretty JSON."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.rag import attach_final_output, compact_review_row


def read_rows(path: str):
    p = Path(path)
    if p.suffix.lower() == ".json":
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("rows") or data.get("samples") or []
        if not isinstance(data, list):
            raise ValueError("JSON input must be an array, or an object with rows/samples.")
        return data
    rows = []
    with p.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def refresh(rows, compact: bool):
    out = []
    for row in rows:
        if compact:
            out.append(compact_review_row(row, "label"))
        else:
            attach_final_output(row, "label")
            out.append(row)
    return out


def write_json(rows, path: str):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(rows, path: str):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["to-json", "to-jsonl", "compact"])
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--no-refresh-final", action="store_true")
    args = ap.parse_args()

    rows = read_rows(args.input)
    if not args.no_refresh_final:
        rows = refresh(rows, compact=args.mode == "compact")
    elif args.mode == "compact":
        rows = [compact_review_row(row, "label") for row in rows]

    if args.mode == "to-json":
        write_json(rows, args.output)
    else:
        write_jsonl(rows, args.output)
    print(f"{args.mode}: {args.input} -> {args.output}; rows={len(rows)}")


if __name__ == "__main__":
    main()
