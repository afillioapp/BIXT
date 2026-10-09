#!/usr/bin/env python3
"""Real-receipt accuracy: your own phone photos -> the app's pipeline -> fields.

    python tests/evaluate_real.py --init    # write a truth.json skeleton
    python tests/evaluate_real.py           # score your photos
    python tests/evaluate_real.py --dump IMG_0007.jpg   # see every OCR line

This exists because tests/evaluate.py scores the *rendered* corpus from
make_corpus.py — synthetic receipts that were drawn, not photographed. Those
measure the parser against clean glyphs. Real phone photos bring glare, fold
creases, thermal fade and a camera that is never quite square to the paper,
and nothing in this repo has ever measured those.

Two things make this faithful to production rather than optimistic:

  * It reproduces the browser's compression first (lib/image.js) — the server
    never sees your 4MB original, it sees a ~200KB re-encoded JPEG. Scoring
    the original would flatter the pipeline on exactly the detail that JPEG
    throws away: thin thermal digits.
  * It runs the same four steps as bx_ocr.pipeline.extract, the function
    pages/api/extract.js reaches through the OCR service.

Read-only: it opens images and prints a report. It deploys nothing, writes no
application code, and needs no network.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from bx_ocr.categories import CATEGORIES  # noqa: E402
from bx_ocr.layout import group_into_lines  # noqa: E402
from bx_ocr.parser import amounts_in, parse_receipt  # noqa: E402
from bx_ocr.pipeline import preprocess  # noqa: E402

# The merchant comparison is OCR-tolerant on purpose (see tests/evaluate.py);
# reuse it rather than inventing a second standard for the same question.
try:
    from tests.evaluate import place_ok
except ImportError:  # when tests/ itself is what's on sys.path
    from evaluate import place_ok

IMG_DIR = os.path.join(HERE, "real_receipts")
TRUTH = os.path.join(IMG_DIR, "truth.json")

FIELDS = ["date", "place", "total", "hst", "currency", "category"]
MONEY_FIELDS = {"total", "hst"}
RESULT_KEY = {  # truth field -> key in the parser's contract
    "date": "date", "place": "place", "total": "total", "hst": "hst",
    "currency": "currency", "category": "category_suggestion",
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
HEIC_EXTS = {".heic", ".heif"}

MISSING_DEPS = """
Cannot load the OCR engine: {err}

The parser tests need nothing, but reading a real photo needs the recognition
stack. From the repo root, with Python 3.12 (your system python3 is too old
for these pinned wheels):

    python3.12 -m venv .venv
    source .venv/bin/activate
    pip install -r ocr-service/requirements.txt

Then re-run this script. Nothing was installed for you.
"""


# ----------------------------------------------------------------- loading --

def find_images(img_dir: str) -> list[str]:
    if not os.path.isdir(img_dir):
        return []
    names = []
    for name in sorted(os.listdir(img_dir)):
        if name.startswith("."):
            continue
        if os.path.splitext(name)[1].lower() in IMAGE_EXTS:
            names.append(name)
    return names


def find_heic(img_dir: str) -> list[str]:
    if not os.path.isdir(img_dir):
        return []
    return sorted(n for n in os.listdir(img_dir)
                  if os.path.splitext(n)[1].lower() in HEIC_EXTS)


def init_truth(img_dir: str, truth_path: str) -> int:
    """Writes a skeleton with every filename already filled in.

    Typing out 25 filenames by hand is the step most likely to go wrong and
    the least worth your time, so the only thing left to do is read the
    numbers off the paper.
    """
    if os.path.exists(truth_path):
        print(f"{truth_path} already exists — not overwriting it.")
        print("Delete it yourself if you want a fresh skeleton.")
        return 1

    images = find_images(img_dir)
    heic = find_heic(img_dir)
    if not images:
        os.makedirs(img_dir, exist_ok=True)
        print(f"No images found in {img_dir}")
        if heic:
            print(f"\nFound {len(heic)} HEIC file(s), which the pipeline cannot open.")
            print("Convert them in place (macOS), then re-run --init:")
            print(f"    cd {img_dir} && sips -s format jpeg *.heic --out .")
        else:
            print("Put your receipt photos there first, then re-run --init.")
        return 1

    skeleton = [{"file": n, "date": "", "place": "", "total": "", "hst": "",
                 "currency": "CAD", "category": ""} for n in images]
    with open(truth_path, "w") as fh:
        json.dump(skeleton, fh, indent=2)
        fh.write("\n")

    print(f"Wrote {truth_path} with {len(skeleton)} entries.")
    print("Fill in what you can read off each receipt. A field left as \"\" is")
    print("skipped, not scored — so you can start with just total and hst.")
    if heic:
        print(f"\nNote: skipped {len(heic)} HEIC file(s) — convert them first:")
        print(f"    cd {img_dir} && sips -s format jpeg *.heic --out .")
    return 0


def load_truth(truth_path: str) -> list[dict]:
    if not os.path.exists(truth_path):
        raise SystemExit(
            f"No {truth_path}\n\n"
            "Put 20-30 receipt photos in tests/real_receipts/, then run:\n"
            "    python tests/evaluate_real.py --init"
        )
    with open(truth_path) as fh:
        try:
            truth = json.load(fh)
        except json.JSONDecodeError as e:
            raise SystemExit(f"{truth_path} is not valid JSON: {e}")
    if not isinstance(truth, list) or not truth:
        raise SystemExit(f"{truth_path} must be a non-empty JSON list.")
    for rec in truth:
        if not isinstance(rec, dict) or not rec.get("file"):
            raise SystemExit(f'Every entry needs a "file" key: {rec!r}')
    return truth


# ------------------------------------------------------------- compression --

def compress_like_app(raw: bytes, max_bytes: int = 200 * 1024,
                      max_dim: int = 1600) -> bytes:
    """Reproduces lib/image.js, so the pipeline sees what production sends.

    The browser draws the photo into a canvas and re-encodes it as JPEG,
    stepping quality down until it fits the budget. Two side effects of that
    are easy to miss and both matter here: the canvas applies the EXIF
    rotation (so we must too, or we hand the pipeline a sideways receipt the
    browser would never have produced), and it strips the EXIF block
    afterwards (so pipeline.preprocess's exif_transpose becomes a no-op, just
    as it is in production).
    """
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")

    if max(img.size) > max_dim:
        scale = max_dim / max(img.size)
        img = img.resize((max(1, round(img.width * scale)),
                          max(1, round(img.height * scale))), Image.LANCZOS)

    quality = 80  # lib/image.js starts at 0.8
    while True:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        data = buf.getvalue()
        if len(data) <= max_bytes or quality <= 30:
            return data
        quality -= 10


# ---------------------------------------------------------------- pipeline --

def build_engine():
    try:
        from bx_ocr.engine import get_engine
        return get_engine()
    except Exception as e:  # ImportError, or an onnxruntime load failure
        raise SystemExit(MISSING_DEPS.format(err=e))


def run_pipeline(raw: bytes, today: date):
    """The same four steps as bx_ocr.pipeline.extract, keeping the lines.

    extract() returns only the finished fields, and a failed total is almost
    never diagnosable without seeing what the recogniser actually read. Keep
    these in step if pipeline.extract ever changes.
    """
    engine = build_engine()
    image = preprocess(raw)
    boxes = engine.read(image)
    lines = group_into_lines(boxes)
    result = parse_receipt(lines, today=today).as_contract()
    return result, lines


# ------------------------------------------------------------- comparators --

def as_float(v) -> float | None:
    if v is None:
        return None
    s = str(v).strip().replace("$", "").replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def money_ok(got, want, tol: float) -> bool:
    g, w = as_float(got), as_float(want)
    if g is None or w is None:
        return False
    return abs(g - w) <= tol


def scored(field: str, rec: dict) -> bool:
    """A field is only scored when the truth file actually states it.

    This is what lets a half-filled truth.json be useful: record the totals
    first, score those, and add dates later.
    """
    v = rec.get(field)
    return v is not None and str(v).strip() != ""


def compare(field: str, got, rec: dict, tol: float) -> bool:
    want = rec[field]
    if field in MONEY_FIELDS:
        return money_ok(got, want, tol)
    if field == "place":
        return place_ok(got, want)
    if field == "currency":
        return str(got).strip().upper() == str(want).strip().upper()
    return str(got).strip() == str(want).strip()


# -------------------------------------------------------------- diagnosis ---

_TOTAL_WORD = re.compile(r"total|balance|amount|due|paid|charged|payer|montant", re.I)
_TAX_WORD = re.compile(r"\bh\.?s\.?t|\bg\.?s\.?t|\bp\.?s\.?t|\bq\.?s\.?t|\btps\b"
                       r"|\btv[qh]\b|\btax|\bvat\b", re.I)
_SUB_WORD = re.compile(r"sub\s*-?\s*total|sous[-\s]?total|merchandise", re.I)


def lines_with_value(lines, value: float, tol: float):
    """Which recognised lines contain this amount, by the parser's own reading.

    Using amounts_in() rather than a string search is the point: it means a
    hit here proves the *pipeline* could see the figure, not merely that the
    digits appear somewhere. That splits "never recognised" from "recognised
    but not chosen", which are different bugs with different fixes.
    """
    hits = []
    for ln in lines:
        for amt in amounts_in(ln.text):
            if abs(amt.value - value) <= tol:
                hits.append(ln)
                break
    return hits


def diagnose(field: str, want, got, lines, result, tol: float):
    """(likely reason, evidence lines). Deliberately a hypothesis, not a verdict."""
    warnings = result.get("warnings") or []
    w = as_float(want)

    if not lines:
        return ("image quality — the recogniser returned no text at all", [])

    if w is None:
        return (f"truth value {want!r} is not a number — check truth.json", [])

    hits = lines_with_value(lines, w, tol)

    if not hits:
        # Nothing in the recognised text carries this figure.
        if field == "hst" and w == 0.0:
            return ("expected no tax; see whether the parser found a tax line "
                    f"at all (warnings: {warnings or 'none'})", [])
        return ("OCR recognition — the figure never appears in the recognised "
                "text, so the parser never had it to choose. Usually glare, "
                "fold creases, thermal fade, or too little resolution after "
                "compression (try --no-compress to test that)", [])

    # The figure was read. So this is a selection, grouping or wording problem.
    labelled = [ln for ln in hits if sum(c.isalpha() for c in ln.text) >= 3]
    if not labelled:
        return ("line grouping — the amount was recognised but arrived with no "
                "label beside it, so no rule could claim it. Check the tilt "
                "handling in layout.py for this photo", hits)

    for ln in labelled:
        if _SUB_WORD.search(ln.text):
            return ("total/subtotal ambiguity — the figure sits on a line the "
                    "parser deliberately excludes as a subtotal", labelled)

    if field == "total":
        for ln in labelled:
            if _TOTAL_WORD.search(ln.text):
                return ("parser selection — the correct line was recognised and "
                        "is total-worded, but another candidate outranked it "
                        "(see the tiers in find_total)", labelled)
        return ("unsupported layout/wording — the figure was recognised but its "
                "label matches no total wording the parser knows", labelled)

    for ln in labelled:
        if _TAX_WORD.search(ln.text):
            return ("parser selection — a tax-worded line carrying this figure "
                    "was recognised but rejected or not summed (see find_tax: "
                    "the tax-label check, the >=total guard, and the 25% "
                    "sanity cap)", labelled)
    return ("unsupported layout/wording — the figure was recognised but no tax "
            "wording was attached to it", labelled)


# ----------------------------------------------------------------- report ---

def main() -> int:
    ap = argparse.ArgumentParser(description="Score the OCR pipeline on real receipt photos.")
    ap.add_argument("--init", action="store_true",
                    help="write a truth.json skeleton from the images present")
    ap.add_argument("--images", default=IMG_DIR, help="folder of receipt photos")
    ap.add_argument("--truth", default=None, help="path to truth.json")
    ap.add_argument("--tol", type=float, default=0.01,
                    help="money tolerance in dollars (default 0.01)")
    ap.add_argument("--today", default=None,
                    help="YYYY-MM-DD treated as today; receipts dated after it "
                         "are rejected as impossible (default: the real today)")
    ap.add_argument("--no-compress", action="store_true",
                    help="skip the browser-side JPEG step and score the originals")
    ap.add_argument("--dump", default=None,
                    help="also print every OCR line for files matching this text")
    ap.add_argument("--json", dest="json_out", default=None,
                    help="write the full per-receipt results to this file")
    args = ap.parse_args()

    truth_path = args.truth or os.path.join(args.images, "truth.json")

    if args.init:
        return init_truth(args.images, truth_path)

    today = date.fromisoformat(args.today) if args.today else date.today()
    truth = load_truth(truth_path)

    # Flag truth typos before spending minutes of OCR on them.
    for rec in truth:
        c = (rec.get("category") or "").strip()
        if c and c not in CATEGORIES:
            print(f"! {rec['file']}: category {c!r} is not one of the 12 official "
                  f"categories — it can never match.")

    present = set(find_images(args.images))
    untruthed = sorted(present - {r["file"] for r in truth})
    heic = find_heic(args.images)

    print(f"\nreal-receipt evaluation | {len(truth)} entries in truth.json")
    print(f"  images     {args.images}")
    print(f"  today      {today.isoformat()} (receipts dated later are rejected)")
    print(f"  money tol  ${args.tol:.2f}")
    print(f"  browser compression  {'OFF (scoring originals)' if args.no_compress else 'ON (~200KB JPEG, like production)'}")

    t0 = time.time()
    build_engine()
    print(f"  engine load {time.time() - t0:.2f}s")

    rows = []
    for rec in truth:
        path = os.path.join(args.images, rec["file"])
        if not os.path.exists(path):
            print(f"  MISSING {rec['file']}")
            continue

        raw = open(path, "rb").read()
        original_kb = len(raw) / 1024

        t_compress = 0.0
        if not args.no_compress:
            tc = time.time()
            try:
                raw = compress_like_app(raw)
            except Exception as e:
                print(f"  UNREADABLE {rec['file']}: {type(e).__name__}: {e}")
                continue
            t_compress = time.time() - tc

        t1 = time.time()
        try:
            result, lines = run_pipeline(raw, today)
            err = None
        except SystemExit:
            raise
        except Exception as e:
            result = {k: "" for k in RESULT_KEY.values()}
            result["warnings"] = [f"crash: {type(e).__name__}"]
            lines, err = [], f"{type(e).__name__}: {e}"
        elapsed = time.time() - t1

        ok = {f: (compare(f, result.get(RESULT_KEY[f], ""), rec, args.tol)
                  if scored(f, rec) else None)
              for f in FIELDS}
        rows.append({"rec": rec, "ok": ok, "result": result, "lines": lines,
                     "err": err, "secs": elapsed, "compress_secs": t_compress,
                     "original_kb": original_kb, "sent_kb": len(raw) / 1024})

        if args.dump and args.dump in rec["file"]:
            print(f"\n--- every OCR line for {rec['file']} ---")
            for ln in lines:
                print(f"  y={ln.y0:7.1f} conf={ln.conf:.2f}  {ln.text}")
            print(f"--- parsed: {json.dumps(result)}\n")

    if not rows:
        raise SystemExit("No images were read — check the filenames in truth.json.")

    # ---- per receipt -------------------------------------------------------
    print(f"\n{'':4}{'receipt':34s} " + " ".join(f"{f[:4]:>4s}" for f in FIELDS) + "   secs")
    for r in rows:
        marks = []
        for f in FIELDS:
            marks.append("   -" if r["ok"][f] is None else ("   ." if r["ok"][f] else "   X"))
        bad = any(v is False for v in r["ok"].values()) or r["err"]
        print(f"{'!!' if bad else '  ':4}{r['rec']['file'][:34]:34s} "
              + " ".join(marks) + f"  {r['secs']:5.2f}"
              + (f"  CRASH {r['err']}" if r["err"] else ""))
    print("   . correct   X wrong   - not stated in truth.json")

    # ---- per field --------------------------------------------------------
    print(f"\n{'field':10s} {'tested':>7s} {'correct':>8s} {'failed':>7s} {'accuracy':>9s}")
    totals_ok = totals_n = 0
    per_field = {}
    for f in FIELDS:
        judged = [r for r in rows if r["ok"][f] is not None]
        good = sum(1 for r in judged if r["ok"][f])
        per_field[f] = (len(judged), good)
        totals_ok += good
        totals_n += len(judged)
        acc = f"{100 * good / len(judged):.0f}%" if judged else "n/a"
        print(f"{f:10s} {len(judged):7d} {good:8d} {len(judged) - good:7d} {acc:>9s}")
    overall = f"{100 * totals_ok / totals_n:.1f}%" if totals_n else "n/a"
    print(f"{'OVERALL':10s} {totals_n:7d} {totals_ok:8d} {totals_n - totals_ok:7d} {overall:>9s}")

    judged_rows = [r for r in rows
                   if any(v is not None for v in r["ok"].values()) and not r["err"]]
    perfect = sum(1 for r in judged_rows
                  if all(v for v in r["ok"].values() if v is not None))
    print(f"\nreceipts with every stated field correct: {perfect}/{len(judged_rows)}")

    # ---- failures by field ------------------------------------------------
    for f in FIELDS:
        fails = [r for r in rows if r["ok"][f] is False]
        if not fails:
            continue
        print(f"\n{f} — {len(fails)} failure(s)")
        for r in fails:
            got = r["result"].get(RESULT_KEY[f], "")
            print(f"  {r['rec']['file']:34s} expected {str(r['rec'][f])!r:24s} got {str(got)!r}")
            if f == "date":
                alt = r["result"].get("date_alternative") or ""
                if alt and alt == str(r["rec"]["date"]).strip():
                    print("      ^ the parser offered this as its alternative reading; "
                          "the review screen shows a one-tap swap for it")

    # ---- the two that matter ----------------------------------------------
    money_fails = [(f, r) for f in ("total", "hst") for r in rows if r["ok"][f] is False]
    if money_fails:
        print("\n" + "=" * 72)
        print("TOTAL / HST FAILURES — the fields that decide whether BX is usable")
        print("=" * 72)
        for f, r in money_fails:
            rec = r["rec"]
            print(f"\n[{f.upper()}]")
            print(f"  Receipt:  {rec['file']}  ({r['original_kb']:.0f}KB original"
                  f" -> {r['sent_kb']:.0f}KB sent)")
            print(f"  Expected: {rec[f]}")
            print(f"  Got:      {r['result'].get(RESULT_KEY[f], '')!r}")
            reason, evidence = diagnose(f, rec[f], r["result"].get(RESULT_KEY[f]),
                                        r["lines"], r["result"], args.tol)
            if evidence:
                print("  OCR text:")
                for ln in evidence[:6]:
                    print(f"      {ln.text}")
            else:
                tail = r["lines"][len(r["lines"]) // 2:][:8]
                print("  OCR text: (figure not found; bottom half of the receipt)")
                for ln in tail:
                    print(f"      {ln.text}")
                if not tail:
                    print("      (nothing was recognised)")
            print(f"  Likely reason: {reason}")
            if r["result"].get("warnings"):
                print(f"  Parser warnings: {', '.join(r['result']['warnings'])}")

    # ---- warnings + timing ------------------------------------------------
    hist: dict[str, int] = {}
    for r in rows:
        for w in r["result"].get("warnings") or []:
            hist[w] = hist.get(w, 0) + 1
    if hist:
        print("\nparser warnings across the set")
        for w, n in sorted(hist.items(), key=lambda kv: -kv[1]):
            print(f"  {n:3d}x {w}")

    secs = [r["secs"] for r in rows]
    comp = [r["compress_secs"] for r in rows if r["compress_secs"]]
    print(f"\nserver-side time per receipt (preprocess + OCR + parse)")
    print(f"  mean {sum(secs) / len(secs):.2f}s | median {sorted(secs)[len(secs) // 2]:.2f}s"
          f" | min {min(secs):.2f}s | max {max(secs):.2f}s")
    slowest = max(rows, key=lambda r: r["secs"])
    print(f"  slowest {slowest['rec']['file']} at {slowest['secs']:.2f}s")
    if comp:
        print(f"  (browser-side compression, which runs on the phone in production:"
              f" mean {sum(comp) / len(comp):.2f}s — not part of the figures above)")

    if untruthed:
        print(f"\n{len(untruthed)} image(s) in the folder are not in truth.json: "
              + ", ".join(untruthed[:8]) + ("..." if len(untruthed) > 8 else ""))
    if heic:
        print(f"\n{len(heic)} HEIC file(s) skipped — the pipeline cannot open them:")
        print(f"    cd {args.images} && sips -s format jpeg *.heic --out .")

    if args.json_out:
        with open(args.json_out, "w") as fh:
            json.dump([{
                "file": r["rec"]["file"], "ok": r["ok"], "result": r["result"],
                "secs": round(r["secs"], 3), "error": r["err"],
                "lines": [ln.text for ln in r["lines"]],
            } for r in rows], fh, indent=2)
        print(f"\nwrote {args.json_out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
