#!/usr/bin/env python3
"""Validate feed.json before publishing. Exits non-zero on any error.

Usage: python3 scripts/validate.py [path/to/feed.json]
"""
import json
import re
import sys

REGIONS = {"eu", "uk", "us", "global"}
STAGES = {"proposal", "consultation", "rulemaking", "agreed", "adopted", "in_force", "stalled"}
QUALITIES = {"primary", "secondary", "lower"}
DATE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")
FULL_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_UPDATES = 160

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def check_links(where, links):
    if not links:
        err(f"{where}: needs at least one source link")
        return
    for i, l in enumerate(links):
        if not l.get("label"):
            err(f"{where}: link {i} missing label")
        url = l.get("url", "")
        if not url.startswith("https://"):
            err(f"{where}: link {i} must be https ({url!r})")
        if l.get("quality") not in QUALITIES:
            err(f"{where}: link {i} quality must be one of {sorted(QUALITIES)}")
    if not any(l.get("quality") == "primary" for l in links):
        warnings.append(f"{where}: no primary source link")


def main(path):
    with open(path, encoding="utf-8") as fh:
        feed = json.load(fh)

    for key in ("schema_version", "generated_at", "regions", "sources", "trackers", "updates", "upcoming"):
        if key not in feed:
            err(f"top level: missing '{key}'")
    if errors:
        return

    if {r["id"] for r in feed["regions"]} != REGIONS:
        err("regions: must be exactly eu, uk, us, global")

    tracker_ids = set()
    for t in feed["trackers"]:
        w = f"tracker {t.get('id')}"
        if t.get("id") in tracker_ids:
            err(f"{w}: duplicate id")
        tracker_ids.add(t.get("id"))
        for k in ("name", "short", "stage_label", "summary", "next", "updated"):
            if not t.get(k):
                err(f"{w}: missing {k}")
        if t.get("region") not in REGIONS:
            err(f"{w}: bad region")
        if t.get("stage") not in STAGES:
            err(f"{w}: bad stage {t.get('stage')!r}")
        for s in t.get("timeline", []):
            if not DATE.match(str(s.get("date", ""))):
                err(f"{w}: bad timeline date {s.get('date')!r}")
        check_links(w, t.get("links"))

    ids = set()
    for u in feed["updates"]:
        w = f"update {u.get('id')}"
        if u.get("id") in ids:
            err(f"{w}: duplicate id")
        ids.add(u.get("id"))
        for k in ("authority", "type", "title", "summary"):
            if not u.get(k):
                err(f"{w}: missing {k}")
        if u.get("region") not in REGIONS:
            err(f"{w}: bad region")
        for k in ("date", "added"):
            if not FULL_DATE.match(str(u.get(k, ""))):
                err(f"{w}: {k} must be YYYY-MM-DD")
        if u.get("tracker") not in (None, *tracker_ids):
            err(f"{w}: tracker {u.get('tracker')!r} does not exist")
        check_links(w, u.get("links"))
    if len(feed["updates"]) > MAX_UPDATES:
        err(f"updates: {len(feed['updates'])} items; trim to {MAX_UPDATES} (drop the oldest)")

    for e in feed["upcoming"]:
        w = f"upcoming {e.get('title')!r}"
        if not FULL_DATE.match(str(e.get("date", ""))):
            err(f"{w}: date must be YYYY-MM-DD")
        if e.get("region") not in REGIONS:
            err(f"{w}: bad region")
        if e.get("tracker") not in (None, *tracker_ids):
            err(f"{w}: unknown tracker")

    for s in feed["sources"]:
        if s.get("status") not in ("checked", "unreachable"):
            err(f"source {s.get('id')}: status must be checked or unreachable")


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else "feed.json"
    try:
        main(p)
    except (OSError, json.JSONDecodeError) as exc:
        err(f"could not read {p}: {exc}")
    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"{'FAILED' if errors else 'OK'} — {len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)
