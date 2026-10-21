"""Create editable Markdown source cards from calendar.csv using only stdlib."""
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
with (ROOT / "calendar.csv").open(encoding="utf-8-sig", newline="") as handle:
    rows = list(csv.DictReader(handle))
assets = ROOT / "assets"
assets.mkdir(exist_ok=True)
for row in rows:
    body = f"""# {row['asset_id']} — Day {row['day']} — {row['platform']} / {row['format']}\n
**Status:** Draft. Verify claims, links, rights, final dimensions, and scheduled slot before publishing.\n
## Hook\n
{row['hook']}\n
## Caption / script\n
{row['caption']}\n
## Hashtags\n
{row['hashtags']}\n
## CTA\n
{row['call_to_action']}\n
## Tracking link (replace placeholder)\n
{row['tracking_link']}\n
## Target metric\n
{row['target_metric']}\n
## Production notes\n
Use original or properly licensed media. For video, use a vertical 9:16 canvas, burned-in accurate captions, and a hook in the first two seconds. For carousels/graphics, use readable type and add platform alt text. Do not include unverified IncuBrix product claims.\n"""
    (assets / f"{row['asset_id']}.md").write_text(body, encoding="utf-8")
print(f"Wrote {len(rows)} editable asset source files to {assets}")
