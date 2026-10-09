#!/usr/bin/env python3
"""Freeze the tuning/holdout split before any accuracy number exists.

    python tests/make_split.py            # create the split, or append new files
    python tests/make_split.py --verify   # check it without writing anything

Why this is a separate script run at a separate time: once you know which
receipts fail, every choice about which ones to measure on is contaminated.
Assigning sides from a hash of the filename, before a single receipt has been
scored, is what makes the holdout number mean anything. The assignment depends
on nothing but the filename — not on field values, not on a score, not on the
order files were added, and not on when this runs.

The split is created ONCE. On later runs this script keeps every existing
assignment untouched and only places newly added files, so topping up the
corpus can never quietly reshuffle a receipt from holdout into tuning.

It writes filtered truth files that the existing evaluator reads through its
own --truth flag; tests/evaluate_real.py is not modified or wrapped.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.join(HERE, "real_receipts")

# Part of the hash input, and recorded in split.json. Changing it would produce
# a different split, which is exactly what must never happen silently — so it
# is a constant here and a stored value there, and the two are compared.
SALT = "bx-receipt-holdout-v1"

RULE = ("sha256(salt + filename), new files placed in hash order into whichever "
        "side currently has fewer; existing assignments are never changed")


def rank_key(filename: str) -> str:
    return hashlib.sha256((SALT + filename).encode("utf-8")).hexdigest()


def assign(filenames: list[str], existing: dict[str, str]) -> tuple[dict[str, str], list[str]]:
    """Returns (assignments, newly placed files). Existing entries are kept as-is."""
    out = dict(existing)
    counts = {"tuning": 0, "holdout": 0}
    for side in out.values():
        if side in counts:
            counts[side] += 1

    new = sorted((f for f in filenames if f not in out), key=rank_key)
    for name in new:
        # Greedy balance toward 50/50. Deterministic because the walk order is
        # the hash order, not the order the files appeared in the folder.
        side = "tuning" if counts["tuning"] <= counts["holdout"] else "holdout"
        out[name] = side
        counts[side] += 1
    return out, new


def read_truth(truth_path: str) -> list[dict]:
    if not os.path.exists(truth_path):
        raise SystemExit(
            f"No {truth_path}\n\n"
            "Add your photos to tests/real_receipts/, then:\n"
            "    python tests/evaluate_real.py --init\n"
            "and fill in what you can read. Run this script after that."
        )
    with open(truth_path) as fh:
        truth = json.load(fh)
    if not isinstance(truth, list) or not truth:
        raise SystemExit(f"{truth_path} must be a non-empty JSON list.")
    for rec in truth:
        if not isinstance(rec, dict) or not rec.get("file"):
            raise SystemExit(f'Every entry needs a "file" key: {rec!r}')
    return truth


def write_json(path: str, obj) -> None:
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=2)
        fh.write("\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="Create or extend the tuning/holdout split.")
    ap.add_argument("--dir", default=DEFAULT_DIR, help="folder holding truth.json")
    ap.add_argument("--verify", action="store_true",
                    help="report the split without writing anything")
    args = ap.parse_args()

    truth_path = os.path.join(args.dir, "truth.json")
    split_path = os.path.join(args.dir, "split.json")
    truth = read_truth(truth_path)
    files = [rec["file"] for rec in truth]

    existing: dict[str, str] = {}
    created_on = None
    if os.path.exists(split_path):
        with open(split_path) as fh:
            prior = json.load(fh)
        existing = dict(prior.get("assignments") or {})
        created_on = prior.get("created")
        if prior.get("salt") and prior["salt"] != SALT:
            raise SystemExit(
                f"{split_path} was built with salt {prior['salt']!r} but this script "
                f"uses {SALT!r}.\nRe-splitting would invalidate every number you have "
                "measured so far. Restore the original script or the original "
                "split.json — do not overwrite it."
            )

    if args.verify:
        if not existing:
            print(f"No split yet. Run: python tests/make_split.py --dir {args.dir}")
            return 1
        missing = [f for f in files if f not in existing]
        orphans = [f for f in existing if f not in files]
        t = sum(1 for f in files if existing.get(f) == "tuning")
        h = sum(1 for f in files if existing.get(f) == "holdout")
        print(f"split.json created {created_on}, salt {SALT}")
        print(f"  tuning {t} | holdout {h} | unassigned {len(missing)}")
        if missing:
            print(f"  not yet placed: {', '.join(missing[:10])}")
            print("  run without --verify to place them")
        if orphans:
            print(f"  assigned but no longer in truth.json: {', '.join(orphans[:10])}")
        return 0 if not missing else 1

    assignments, new = assign(files, existing)

    if existing:
        print(f"split.json already exists (created {created_on}) — NOT re-splitting.")
        print(f"  kept {len(existing)} existing assignment(s) exactly as they were")
        if new:
            print(f"  placed {len(new)} newly added file(s):")
            for name in new:
                print(f"    {name:36s} -> {assignments[name]}")
        else:
            print("  no new files to place; nothing changed")
    else:
        print(f"Created the split for {len(new)} receipt(s).")

    write_json(split_path, {
        "salt": SALT,
        "created": created_on or datetime.date.today().isoformat(),
        "last_appended": datetime.date.today().isoformat(),
        "rule": RULE,
        "warning": "Do not edit or delete this file. Re-splitting invalidates "
                   "every accuracy number measured against it.",
        "assignments": dict(sorted(assignments.items())),
    })

    by_side = {"tuning": [], "holdout": []}
    for rec in truth:
        by_side[assignments[rec["file"]]].append(rec)

    for side, records in by_side.items():
        path = os.path.join(args.dir, f"truth.{side}.json")
        write_json(path, records)
        print(f"  wrote {os.path.basename(path)}  ({len(records)} receipts)")

    n_hold = len(by_side["holdout"])
    print(f"\n  tuning  {len(by_side['tuning'])} receipts  <- diagnose and tune against these only")
    print(f"  holdout {n_hold} receipts  <- score ONCE, at the end")
    if n_hold:
        print(f"\n  Reality check: with {n_hold} holdout receipts, one miss on a field is "
              f"{100 * (n_hold - 1) / n_hold:.0f}%")
        print(f"  and two misses is {100 * (n_hold - 2) / n_hold:.0f}%. That cannot prove a 95% bar.")
        print("  It is a smoke test for gross failure, not a measurement.")
    # Print the command relative to ocr-service/ when the folder is inside the
    # project, which is the normal case; an absolute path otherwise.
    tuning_path = os.path.join(args.dir, "truth.tuning.json")
    shown = os.path.relpath(tuning_path, os.path.dirname(HERE))
    if shown.startswith(".."):
        shown = tuning_path
    print(f"\n  python tests/evaluate_real.py --truth {shown}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
