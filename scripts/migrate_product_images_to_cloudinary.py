#!/usr/bin/env python3
"""Safely migrate existing Dukani product images to Cloudinary.

Default mode is a read-only dry run. Use --apply to upload recoverable images
and update MongoDB. Original image references are copied to legacy_image and
source files are never deleted.

Remote HTTP(S) images are skipped unless --allow-remote is supplied.
Required environment: MONGO_URL, DB_NAME, CLOUDINARY_URL.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import mimetypes
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen

from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


def is_cloudinary_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        return parsed.hostname == "res.cloudinary.com" and "/image/upload/" in parsed.path
    except Exception:
        return False


def local_candidates(value: str) -> list[Path]:
    raw = unquote(value.split("?", 1)[0])
    if raw.startswith(("http://", "https://")):
        raw = urlparse(raw).path
    raw = raw.replace("\\", "/")
    candidates = []
    if raw.startswith("/api/static/"):
        raw = raw[len("/api"):]
    if raw.startswith("/static/"):
        candidates.append(ROOT / "backend" / raw.lstrip("/"))
        candidates.append(ROOT / raw.lstrip("/"))
    elif raw.startswith("static/"):
        candidates.append(ROOT / "backend" / raw)
        candidates.append(ROOT / raw)
    elif not raw.startswith("data:"):
        candidates.append(ROOT / "backend" / "static" / raw.lstrip("/"))
    return candidates


def read_image(value: str, allow_remote: bool) -> tuple[bytes, str]:
    if value.startswith("data:"):
        import base64
        header, encoded = value.split(",", 1)
        mime = header[5:].split(";", 1)[0].lower()
        if ";base64" not in header:
            raise ValueError("non-base64 data URI is not supported")
        data = base64.b64decode(encoded, validate=True)
        if mime not in ALLOWED_TYPES:
            raise ValueError(f"unsupported data URI type: {mime}")
        if len(data) > MAX_BYTES:
            raise ValueError("image exceeds 10 MB migration limit")
        return data, mime

    for path in local_candidates(value):
        if path.is_file():
            data = path.read_bytes()
            mime = mimetypes.guess_type(path.name)[0] or ""
            if mime not in ALLOWED_TYPES:
                raise ValueError(f"unsupported local image type: {mime or 'unknown'}")
            if len(data) > MAX_BYTES:
                raise ValueError("image exceeds 10 MB migration limit")
            return data, mime

    if value.startswith(("http://", "https://")):
        if not allow_remote:
            raise ValueError("remote URL skipped (rerun with --allow-remote after review)")
        request = Request(value, headers={"User-Agent": "Dukani-Image-Migration/1.0"})
        with urlopen(request, timeout=20) as response:
            mime = (response.headers.get_content_type() or "").lower()
            data = response.read(MAX_BYTES + 1)
        if mime not in ALLOWED_TYPES:
            raise ValueError(f"unsupported remote image type: {mime}")
        if len(data) > MAX_BYTES:
            raise ValueError("image exceeds 10 MB migration limit")
        return data, mime

    raise FileNotFoundError("no matching local image file found")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="upload images and update MongoDB (default is dry run)")
    parser.add_argument("--allow-remote", action="store_true", help="also fetch existing HTTP(S) image URLs")
    args = parser.parse_args()

    mongo_url = os.getenv("MONGO_URL")
    db_name = os.getenv("DB_NAME")
    cloudinary_url = os.getenv("CLOUDINARY_URL")
    if not mongo_url or not db_name or not cloudinary_url:
        print("ERROR: MONGO_URL, DB_NAME and CLOUDINARY_URL must be set.", file=sys.stderr)
        return 2

    import cloudinary
    from cloudinary import uploader
    cloudinary.config(secure=True)

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=10000)
    db = client[db_name]
    db.command("ping")

    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "scanned": 0,
        "already_cloudinary": 0,
        "would_migrate": 0,
        "migrated": 0,
        "skipped_or_failed": [],
    }

    for product in db.products.find({"image": {"$exists": True, "$nin": [None, ""]}}):
        summary["scanned"] += 1
        product_id = str(product.get("_id", ""))
        old_value = str(product.get("image", "")).strip()

        if is_cloudinary_url(old_value):
            summary["already_cloudinary"] += 1
            continue

        try:
            data, mime = read_image(old_value, args.allow_remote)
            digest = hashlib.sha256(data).hexdigest()[:12]
            safe_id = hashlib.sha256(product_id.encode("utf-8")).hexdigest()[:20]
            folder = f"dukayko/products/{product.get('shop_id', 'unknown')}"
            public_id = f"product-{safe_id}-{digest}"

            if not args.apply:
                summary["would_migrate"] += 1
                print(f"DRY-RUN product={product_id} name={product.get('name', '')!r} source={old_value!r} bytes={len(data)} type={mime}")
                continue

            result = uploader.upload(
                io.BytesIO(data),
                folder=folder,
                public_id=public_id,
                overwrite=True,
                resource_type="image",
                format=mime.split("/", 1)[1].replace("jpeg", "jpg"),
            )
            new_url = result.get("secure_url")
            if not new_url:
                raise RuntimeError("Cloudinary did not return secure_url")

            update = {
                "image": new_url,
                "image_storage": "cloudinary",
                "image_migrated_at": datetime.now(timezone.utc).isoformat(),
            }
            if not product.get("legacy_image"):
                update["legacy_image"] = old_value

            changed = db.products.update_one(
                {"_id": product["_id"], "image": product.get("image")},
                {"$set": update},
            )
            if changed.modified_count != 1:
                raise RuntimeError("product image changed during migration; database update skipped")

            summary["migrated"] += 1
            print(f"MIGRATED product={product_id} name={product.get('name', '')!r} url={new_url}")
        except Exception as exc:
            summary["skipped_or_failed"].append({
                "product_id": product_id,
                "name": product.get("name", ""),
                "image": old_value,
                "reason": str(exc),
            })
            print(f"SKIPPED product={product_id}: {exc}", file=sys.stderr)

    print("\nSUMMARY")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    client.close()
    return 1 if summary["skipped_or_failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
