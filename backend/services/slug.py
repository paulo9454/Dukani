"""Slug utilities — Shopify-style /shop/{slug}."""
from __future__ import annotations

import re


def slugify(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "shop"


def ensure_unique_slug(db, base_slug: str, exclude_id: str | None = None) -> str:
    """Append -1, -2, ... if base_slug already exists."""
    slug = base_slug
    n = 1
    while True:
        q = {"slug": slug}
        if exclude_id:
            q["_id"] = {"$ne": exclude_id}
        if not db.shops.find_one(q):
            return slug
        n += 1
        slug = f"{base_slug}-{n}"
