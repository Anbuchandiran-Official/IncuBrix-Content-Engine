#!/usr/bin/env python3
"""Turn one text source into ten deterministic, scheduler-ready social drafts."""
from __future__ import annotations

import argparse
import csv
import hashlib
import re
import time
from pathlib import Path

PLANS = [
    ("LinkedIn", "Text post", "The useful idea hiding in this source"),
    ("LinkedIn", "Document carousel", "A practical sequence to try"),
    ("LinkedIn", "Question post", "A question this source helps answer"),
    ("Instagram", "Carousel", "A saveable step-by-step explainer"),
    ("Instagram", "Reel script", "A 30-second visual explanation"),
    ("Instagram", "Story sequence", "Three frames: problem, tip, question"),
    ("YouTube Shorts", "Short video script", "One takeaway, shown clearly"),
    ("YouTube Shorts", "Short video script", "A common mistake and a correction"),
    ("X", "Thread", "A concise thread of useful points"),
    ("Reddit", "Discussion prompt", "A transparent, non-promotional discussion"),
]
FIELDS = ["asset_id", "platform", "format", "hook", "draft", "source_digest", "status"]


def sentences(text: str) -> list[str]:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"!\[[^]]*\]\([^)]*\)|\[[^]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"[#>*_`]+", " ", text)
    chunks = re.split(r"(?<=[.!?])\s+|\n+", text)
    result = []
    for chunk in chunks:
        item = re.sub(r"\s+", " ", chunk).strip(" -\t")
        if len(item) >= 35 and item not in result:
            result.append(item)
    return result


def build_rows(source: str, digest: str) -> list[dict[str, str]]:
    ideas = sentences(source)
    if not ideas:
        raise ValueError("No usable sentences found; provide a longer text input.")
    rows = []
    for index, (platform, fmt, angle) in enumerate(PLANS):
        idea = ideas[index % len(ideas)]
        asset_id = "ENG-" + hashlib.sha256(f"{digest}:{index}".encode()).hexdigest()[:10].upper()
        hook = idea[:115].rstrip(" .") + ("…" if len(idea) > 115 else "")
        draft = f"{angle}: {idea}\n\nAdapt this draft to the native format, verify it against the original source, add accessibility text, and finish with one relevant question or action."
        rows.append(dict(asset_id=asset_id, platform=platform, format=fmt, hook=hook,
                         draft=draft, source_digest=digest, status="Draft — human review required"))
    return rows


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: dict[str, dict[str, str]] = {}
    if path.exists():
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for old in csv.DictReader(handle):
                if old.get("asset_id"):
                    existing[old["asset_id"]] = old
    # Deterministic IDs make a refresh idempotent; generated rows replace prior drafts with same IDs.
    existing.update({row["asset_id"]: row for row in rows})
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(existing.values())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="UTF-8 blog, transcript, or source text")
    parser.add_argument("--out", default=Path("output"), type=Path, help="Output directory")
    args = parser.parse_args()
    started = time.perf_counter()
    try:
        source = args.input.read_text(encoding="utf-8-sig")
        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
        rows = build_rows(source, digest)
        write_csv(args.out / "assets.csv", rows)
        # Calendar view is scheduler-friendly, but deliberately has no fabricated date or slot.
        with (args.out / "assets.csv").open(encoding="utf-8", newline="") as handle:
            all_rows = list(csv.DictReader(handle))
        with (args.out / "calendar.csv").open("w", encoding="utf-8", newline="") as handle:
            fields = ["asset_id", "platform", "format", "hook", "draft", "status", "scheduled_at"]
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for row in all_rows:
                writer.writerow({**{key: row.get(key, "") for key in fields}, "scheduled_at": ""})
        print(f"Generated/refreshed {len(rows)} drafts from {args.input}; {len(all_rows)} unique assets in {args.out}.")
        print(f"Runtime: {time.perf_counter() - started:.3f}s; external API cost: $0 (local deterministic workflow).")
        return 0
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
