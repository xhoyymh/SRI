#!/usr/bin/env python3
"""
Prepare Chinese-named drama videos for COS import, upload them with normalized
object keys, and optionally register them in the backend and start RAG.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import hmac
import http.client
import json
import mimetypes
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_BUCKET = "short-drama-1308237976"
DEFAULT_REGION = "ap-guangzhou"
DEFAULT_DOMAIN = "https://short-drama-1308237976.cos.ap-guangzhou.myqcloud.com"
DEFAULT_SECRET_ID = os.environ.get("COS_SECRET_ID", "")
DEFAULT_SECRET_KEY = os.environ.get("COS_SECRET_KEY", "")
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv"}


def main() -> int:
    args = parse_args()
    source_dir = Path(args.source_dir).resolve()
    if not source_dir.is_dir():
        raise SystemExit(f"source dir not found: {source_dir}")

    drama_title = args.drama_title.strip()
    slug = args.slug or safe_slug(drama_title)
    batch_tag = args.batch_tag or time.strftime("batch_%Y%m%d_%H%M%S")
    staging_dir = Path(args.staging_dir).resolve() / slug / batch_tag
    manifest_path = Path(args.manifest).resolve() if args.manifest else Path("data/cos-import-manifests") / f"{slug}-{batch_tag}.json"
    manifest_path = manifest_path.resolve()

    items = build_manifest_items(
        source_dir=source_dir,
        staging_dir=staging_dir,
        drama_title=drama_title,
        slug=slug,
        batch_tag=batch_tag,
        bucket=args.bucket,
        region=args.region,
        domain=args.domain,
        cos_prefix=args.cos_prefix,
    )
    copy_to_staging(items)
    write_manifest(manifest_path, drama_title, slug, batch_tag, args.bucket, args.region, args.domain, items)
    write_csv(manifest_path.with_suffix(".csv"), items)

    if args.upload:
        for item in items:
            put_cos_object(
                bucket=args.bucket,
                region=args.region,
                secret_id=args.secret_id,
                secret_key=args.secret_key,
                cos_key=item["cosKey"],
                file_path=Path(item["stagingPath"]),
                content_type=item["contentType"],
            )
            item["uploaded"] = True
        write_manifest(manifest_path, drama_title, slug, batch_tag, args.bucket, args.region, args.domain, items)
        write_csv(manifest_path.with_suffix(".csv"), items)

    import_result = None
    if args.import_backend:
        import_result = post_json(
            args.backend_url.rstrip("/") + "/uploads/cos-imports",
            {
                "dramaTitle": drama_title,
                "videos": [
                    {
                        "dramaNo": item["dramaNo"],
                        "dramaCode": item["dramaCode"],
                        "originalFolderName": item["originalFolderName"],
                        "episodeNo": item["episodeNo"],
                        "originalFileName": item["originalFileName"],
                        "normalizedFileName": item["normalizedFileName"],
                        "backendKey": item["backendKey"],
                        "cosKey": item["cosKey"],
                        "cosUrl": item["cosUrl"],
                        "fileSize": item["fileSize"],
                        "contentType": item["contentType"],
                    }
                    for item in items
                ],
            },
        )
        print(json.dumps({"cosImport": import_result}, ensure_ascii=False, indent=2))

    if args.start_rag:
        if not import_result:
            raise SystemExit("--start-rag requires --import-backend in the same run")
        if not args.judge_api_key or not args.judge_endpoint_id:
            raise SystemExit("--start-rag requires --judge-api-key and --judge-endpoint-id")
        task = post_json(
            args.backend_url.rstrip("/") + "/analysis-tasks/start",
            {
                "assetIds": import_result["assetIds"],
                "judgeApiKey": args.judge_api_key,
                "judgeEndpointId": args.judge_endpoint_id,
                "generationApiKey": args.generation_api_key or "",
            },
        )
        print(json.dumps({"analysisTask": task}, ensure_ascii=False, indent=2))

    print(f"manifest: {manifest_path}")
    print(f"csv: {manifest_path.with_suffix('.csv')}")
    print(f"staging: {staging_dir}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize, upload, and import COS drama videos.")
    parser.add_argument("--source-dir", required=True, help="Directory containing original Chinese-named videos.")
    parser.add_argument("--drama-title", required=True, help="Drama title to create/update in backend.")
    parser.add_argument("--slug", help="ASCII drama slug used in COS keys. Defaults to a safe generated slug.")
    parser.add_argument("--batch-tag", help="ASCII batch segment used in COS keys. Defaults to current timestamp.")
    parser.add_argument("--staging-dir", default="data/cos-import-staging", help="Root folder for normalized video copies.")
    parser.add_argument("--manifest", help="Output manifest JSON path.")
    parser.add_argument("--cos-prefix", help="Override COS prefix. Defaults to uploads/{dramaCode or slug}.")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--domain", default=DEFAULT_DOMAIN)
    parser.add_argument("--secret-id", default=DEFAULT_SECRET_ID)
    parser.add_argument("--secret-key", default=DEFAULT_SECRET_KEY)
    parser.add_argument("--upload", action="store_true", help="Upload staged files to COS.")
    parser.add_argument("--backend-url", default="http://localhost:8080/api/v1")
    parser.add_argument("--import-backend", action="store_true", help="Call POST /uploads/cos-imports after preparing/uploading.")
    parser.add_argument("--start-rag", action="store_true", help="Call POST /analysis-tasks/start after backend import.")
    parser.add_argument("--judge-api-key")
    parser.add_argument("--judge-endpoint-id")
    parser.add_argument("--generation-api-key")
    return parser.parse_args()


def build_manifest_items(source_dir: Path, staging_dir: Path, drama_title: str, slug: str, batch_tag: str,
                         bucket: str, region: str, domain: str, cos_prefix: str | None) -> list[dict]:
    files = [p for p in source_dir.iterdir() if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS]
    if not files:
        raise SystemExit(f"no video files found in {source_dir}")

    episode_candidates = [(infer_episode_no(path.name), path) for path in files]
    episode_candidates.sort(key=lambda pair: (pair[0] is None, pair[0] or natural_sort_key(pair[1].name), natural_sort_key(pair[1].name)))

    used = set()
    items = []
    for index, (detected_no, path) in enumerate(episode_candidates, start=1):
        episode_no = detected_no or index
        if episode_no in used:
            raise SystemExit(f"duplicate episode number {episode_no}: {path.name}")
        used.add(episode_no)
        ext = path.suffix.lower() or ".mp4"
        drama_no = infer_drama_no(path.name)
        drama_code = f"episode{drama_no:02d}" if drama_no else None
        normalized = path.name if is_backend_video_name(path.name) else f"episode{episode_no:02d}{ext}"
        staging_path = staging_dir / normalized
        prefix = cos_prefix.strip("/") if cos_prefix else f"uploads/{drama_code or slug}"
        cos_key = f"{prefix}/{normalized}"
        cos_url = domain.rstrip("/") + "/" + quote_path(cos_key)
        content_type = mimetypes.guess_type(path.name)[0] or "video/mp4"
        items.append({
            "dramaTitle": drama_title,
            "dramaNo": drama_no,
            "dramaCode": drama_code,
            "originalFolderName": source_dir.name,
            "episodeNo": episode_no,
            "originalFileName": path.name,
            "normalizedFileName": normalized,
            "backendKey": f"video/{drama_code}/{normalized}" if drama_code else "",
            "originalPath": str(path.resolve()),
            "stagingPath": str(staging_path.resolve()),
            "cosKey": cos_key,
            "cosUrl": cos_url,
            "fileSize": path.stat().st_size,
            "contentType": content_type,
            "uploaded": False,
        })
    return items


def copy_to_staging(items: list[dict]) -> None:
    for item in items:
        src = Path(item["originalPath"])
        dst = Path(item["stagingPath"])
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists() or dst.stat().st_size != src.stat().st_size:
            shutil.copy2(src, dst)


def write_manifest(path: Path, drama_title: str, slug: str, batch_tag: str,
                   bucket: str, region: str, domain: str, items: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "dramaTitle": drama_title,
        "dramaSlug": slug,
        "batchTag": batch_tag,
        "bucket": bucket,
        "region": region,
        "domain": domain,
        "videos": items,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(path: Path, items: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "dramaTitle", "dramaNo", "dramaCode", "originalFolderName", "episodeNo",
        "originalFileName", "normalizedFileName", "backendKey", "originalPath",
        "stagingPath", "cosKey", "cosUrl", "fileSize", "contentType", "uploaded",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=fields)
        writer.writeheader()
        for item in items:
            writer.writerow({field: item.get(field, "") for field in fields})


def put_cos_object(bucket: str, region: str, secret_id: str, secret_key: str,
                   cos_key: str, file_path: Path, content_type: str) -> None:
    host = f"{bucket}.cos.{region}.myqcloud.com"
    encoded_path = "/" + quote_path(cos_key)
    signed_query = build_cos_auth_query("PUT", encoded_path, host, secret_id, secret_key)
    headers = {
        "Host": host,
        "Content-Type": content_type or "video/mp4",
        "Content-Length": str(file_path.stat().st_size),
    }
    print(f"uploading {file_path.name} -> {cos_key}")
    conn = http.client.HTTPSConnection(host, timeout=600)
    try:
        with file_path.open("rb") as fp:
            conn.request("PUT", encoded_path + "?" + signed_query, body=fp, headers=headers)
            response = conn.getresponse()
            body = response.read().decode("utf-8", errors="ignore")
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"COS upload failed HTTP {response.status}: {body[:500]}")
    finally:
        conn.close()


def build_cos_auth_query(method: str, encoded_path: str, host: str, secret_id: str, secret_key: str) -> str:
    now = int(time.time())
    expire = now + 3600
    key_time = f"{now};{expire}"
    http_string = f"{method.lower()}\n{encoded_path}\n\nhost={url_encode(host)}\n"
    string_to_sign = f"sha1\n{key_time}\n{sha1_hex(http_string)}\n"
    sign_key = hmac_sha1_hex(secret_key, key_time)
    signature = hmac_sha1_hex(sign_key, string_to_sign)
    return "&".join([
        "q-sign-algorithm=sha1",
        "q-ak=" + url_encode(secret_id),
        "q-sign-time=" + url_encode(key_time),
        "q-key-time=" + url_encode(key_time),
        "q-header-list=host",
        "q-url-param-list=",
        "q-signature=" + signature,
    ])


def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = json.loads(response.read().decode("utf-8"))
    if body.get("code") != 0:
        raise RuntimeError(f"backend request failed: {body}")
    return body.get("data")


def infer_episode_no(name: str) -> int | None:
    patterns = [
        r"(?i)^episode\d{1,4}[_\-](\d{1,4})",
        r"第\s*(\d{1,4})\s*集",
        r"(?i)ep(?:isode)?[_\-\s]*(\d{1,4})",
        r"(?i)episode[_\-\s]*(\d{1,4})",
        r"(^|[^\d])(\d{1,4})([^\d]|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, name)
        if match:
            raw = match.group(2) if match.lastindex and match.lastindex >= 2 and match.group(2) else match.group(1)
            value = int(raw)
            if value > 0:
                return value
    return None


def infer_drama_no(name: str) -> int | None:
    match = re.search(r"(?i)^episode(\d{1,4})[_\-]\d{1,4}", name)
    if not match:
        return None
    value = int(match.group(1))
    return value if value > 0 else None


def is_backend_video_name(name: str) -> bool:
    return re.match(r"(?i)^episode\d{1,4}[_\-]\d{1,4}\.[^.]+$", name) is not None


def natural_sort_key(text: str):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", text)]


def safe_slug(text: str) -> str:
    base = text.strip() or "drama"
    ascii_slug = re.sub(r"_+", "_", "".join(ch if (ord(ch) < 128 and (ch.isalnum() or ch in "-_")) else "_" for ch in base))
    ascii_slug = ascii_slug.strip("_")
    if ascii_slug:
        return ascii_slug
    return "drama_" + hashlib.sha1(base.encode("utf-8")).hexdigest()[:8]


def quote_path(path: str) -> str:
    return "/".join(urllib.parse.quote(segment, safe="-_.~") for segment in path.split("/"))


def url_encode(value: str) -> str:
    return urllib.parse.quote(value or "", safe="-_.~")


def sha1_hex(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


def hmac_sha1_hex(key: str, value: str) -> str:
    return hmac.new(key.encode("utf-8"), value.encode("utf-8"), hashlib.sha1).hexdigest()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
