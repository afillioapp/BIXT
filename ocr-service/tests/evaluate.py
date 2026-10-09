"""End-to-end accuracy: real image -> OCR -> layout -> parser -> fields.

    python tests/make_corpus.py                  # render the corpus
    python tests/evaluate.py rapidocr <truth.json> [--dump ID]

Prints per-field accuracy split by clean vs degraded "phone photo" variants.
"""
import json
import os
import re
import sys
import time
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bx_ocr.layout import group_into_lines  # noqa: E402
from bx_ocr.parser import parse_receipt  # noqa: E402

TODAY = date(2026, 9, 19)
FIELDS = ["date", "place", "total", "hst", "currency", "category"]


def norm_place(s):
    return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()


def place_ok(got, want):
    g, w = norm_place(got), norm_place(want)
    if not g:
        return False
    if g == w or g.startswith(w) or w.startswith(g):
        return True
    # OCR-tolerant: same length and at most 2 differing characters.
    if len(g) == len(w) and sum(a != b for a, b in zip(g, w)) <= 2:
        return True
    gw, ww = set(g.split()), set(w.split())
    return bool(gw & ww) and len(gw & ww) >= max(1, min(len(gw), len(ww)) - 1)


def money_ok(got, want):
    try:
        return abs(float(got or "nan") - float(want)) < 0.005
    except ValueError:
        return False


def build_engine(kind):
    if kind == "rapidocr":
        from bx_ocr.engine import RapidOcrEngine
        return RapidOcrEngine()
    raise SystemExit(f"unknown engine {kind}")


def main():
    kind = sys.argv[1]
    truth_path = sys.argv[2]
    dump = None
    if "--dump" in sys.argv:
        dump = sys.argv[sys.argv.index("--dump") + 1]

    truth = json.load(open(truth_path))
    img_dir = os.path.join(os.path.dirname(truth_path), "images")

    t0 = time.time()
    engine = build_engine(kind)
    load_s = time.time() - t0

    by_variant = {}
    rows = []
    times = []

    for rec in truth:
        base = os.path.dirname(os.path.abspath(truth_path))
        path = os.path.join(base, rec["file"])
        if not os.path.exists(path):
            path = os.path.join(img_dir, os.path.basename(rec["file"]))
        if not os.path.exists(path):
            print(f"MISSING {path}")
            continue
        raw = open(path, "rb").read()
        t1 = time.time()
        try:
            from bx_ocr.pipeline import preprocess
            boxes = engine.read(preprocess(raw))
            lines = group_into_lines(boxes)
            res = parse_receipt(lines, today=TODAY).as_contract()
            err = None
        except Exception as e:  # an engine crash must not be silent
            res = {k: "" for k in ["date", "place", "total", "hst", "currency",
                                   "category_suggestion", "notes"]}
            res["confidence"] = {"overall": 0.0}
            lines, err = [], f"{type(e).__name__}: {e}"
        times.append(time.time() - t1)

        ok = {
            "date": res["date"] == rec["date"],
            "place": place_ok(res["place"], rec["place"]),
            "total": money_ok(res["total"], rec["total"]),
            "hst": money_ok(res["hst"], rec["hst"]),
            "currency": res["currency"] == rec["currency"],
            "category": res["category_suggestion"] == rec["category"],
        }
        v = rec["variant"]
        acc = by_variant.setdefault(v, {f: 0 for f in FIELDS})
        acc.setdefault("_n", 0)
        acc["_n"] += 1
        for f in FIELDS:
            acc[f] += ok[f]
        rows.append((rec, ok, res, err))

        if dump and dump in rec["file"]:
            print(f"\n--- RAW OCR LINES for {rec['file']} ({kind}) ---")
            for ln in lines:
                print(f"  y={ln.y0:7.1f} {ln.text}")
            print(f"--- parsed: {json.dumps(res)}\n")

    if not times:
        raise SystemExit("no images were read — check truth.json paths")
    print(f"\n=== {kind} === load {load_s:.2f}s | mean {sum(times)/len(times):.2f}s/img"
          f" | max {max(times):.2f}s")
    for rec, ok, res, err in rows:
        flags = "".join("." if ok[f] else "X" for f in FIELDS)
        if all(ok.values()) and not err:
            continue
        print(f"  {flags}  {rec['file']:36s}" + (f"  !! {err}" if err else ""))
        for f, key in [("date", "date"), ("place", "place"), ("total", "total"),
                       ("hst", "hst"), ("currency", "currency"),
                       ("category", "category_suggestion")]:
            if not ok[f]:
                print(f"         {f:9s} got={str(res[key])[:34]!r:36s} want={rec[f]!r}")

    print("\n  variant   " + "".join(f"{f:>10s}" for f in FIELDS) + f"{'ALL':>10s}")
    grand_ok = grand_n = 0
    for v, acc in sorted(by_variant.items()):
        n = acc["_n"]
        tot = sum(acc[f] for f in FIELDS)
        grand_ok += tot
        grand_n += n * len(FIELDS)
        print(f"  {v:9s} " + "".join(f"{100*acc[f]/n:9.0f}%" for f in FIELDS)
              + f"{100*tot/(n*len(FIELDS)):9.0f}%")
    print(f"  {'OVERALL':9s} " + " " * (9 * len(FIELDS)) + f"{100*grand_ok/max(1,grand_n):9.1f}%")
    # A field is only useful if it is right; count fully-correct receipts too.
    perfect = sum(1 for _, ok, _, err in rows if all(ok.values()) and not err)
    print(f"  fully-correct receipts: {perfect}/{len(rows)}")


if __name__ == "__main__":
    main()
