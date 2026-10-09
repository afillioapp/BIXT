# Real receipt photos

Put your own receipt photos **in this folder** — 20-30 is enough to tell
whether the OCR is good enough to deploy.

The rendered corpus from `make_corpus.py` measures the parser against clean
drawn glyphs. This folder measures the whole thing against glare, fold
creases, thermal fade and a camera that is never square to the paper. Only
the second number tells you whether BX works.

## 1. Add photos

    ocr-service/tests/real_receipts/
      IMG_0001.jpg
      IMG_0002.jpg
      ...

`.jpg`, `.jpeg`, `.png` and `.webp` work. **iPhone `.heic` files do not** —
the pipeline cannot open them, and production never sees one anyway (the
browser re-encodes to JPEG before upload). Convert them in place first:

    cd ocr-service/tests/real_receipts && sips -s format jpeg *.heic --out .

Shoot them the way a user would: handheld, whatever the lighting is. Do not
crop, straighten or retouch them — that quietly tests a receipt nobody will
ever submit. Include the bad ones. A crumpled gas receipt that fails is more
useful to you right now than ten clean ones that pass.

## 2. Generate the truth skeleton

From `ocr-service/`:

    python tests/evaluate_real.py --init

That writes `truth.json` with every filename already filled in, so you only
type what you read off the paper:

```json
[
  {
    "file": "IMG_0001.jpg",
    "date": "2026-09-15",
    "place": "Tim Hortons",
    "total": "12.43",
    "hst": "1.43",
    "currency": "CAD",
    "category": "Coffee & Drinks"
  }
]
```

Rules, all of them:

- `date` — `YYYY-MM-DD`, the date printed on the receipt.
- `place` — the merchant as a human would say it. The comparison is
  OCR-tolerant, so "Tim Hortons" matches "TIM HORTONS #4412".
- `total` — the amount actually settled, as a string. No `$`.
- `hst` — **the total of every sales tax on the receipt** (HST, or GST+PST,
  or TPS+TVQ added together). Write `"0.00"` for a genuinely tax-free
  receipt; that is a real result worth scoring.
- `currency` — `CAD`, `USD`, `EUR`, `GBP`. Pre-filled as `CAD`.
- `category` — one of the 12 official names, copied exactly from
  `bx_ocr/categories.py`. A typo here can never match, and the script warns
  you about it before spending minutes on OCR.

**A field left as `""` is skipped, not counted wrong.** So you can label just
`total` and `hst` on all 25 receipts first — those are the two that decide
whether this ships — and fill in the rest later.

`truth.example.json` in this folder is a filled-in sample to copy the shape
from.

## 3. Run it

    python tests/evaluate_real.py

See `../../README.md` for what the report means.

## Privacy

`.gitignore` here keeps your photos **and** `truth.json` out of git, since
both hold real merchant names, dates and amounts. `tests/` is also in
`.vercelignore`, so none of it is ever deployed. If you decide the labels are
worth versioning: `git add -f truth.json`.

## Tuning and holdout — read this before you tune anything

The split is created once, from a hash of each filename, **before** any
receipt has been scored. That is the whole point: once you know which receipts
fail, any later choice about which ones to measure on is contaminated, and the
accuracy number stops meaning anything.

    python tests/make_split.py            # create it, or place newly added files
    python tests/make_split.py --verify    # check it, writing nothing

That writes `split.json` (the assignment, never edit it) plus
`truth.tuning.json` and `truth.holdout.json`, which the evaluator reads
through its existing `--truth` flag:

    python tests/evaluate_real.py --truth tests/real_receipts/truth.tuning.json
    python tests/evaluate_real.py --truth tests/real_receipts/truth.holdout.json

The rules:

- **Only the TUNING set** may be used to diagnose failures or justify a change
  to the parser. Run it as often as you like.
- **The HOLDOUT set is scored at most ONCE**, at the end, and that number is
  what decides deploy / don't deploy.
- **If the holdout ever guides a parser change, it is burned.** Not "slightly
  weakened" — burned. You then need fresh labelled receipts to get an honest
  number again, because the old ones have leaked into the tuning loop.
- Adding more photos later is fine. `make_split.py` keeps every existing
  assignment exactly as it is and only places the new files, so topping up the
  corpus can never reshuffle a receipt from holdout into tuning.

### What a 15-receipt holdout can and cannot tell you

It cannot prove a 95% bar. With 15 receipts, one miss on a field is **93%**
and two misses is **87%** — so the difference between "ships" and "doesn't"
is a single receipt, which is noise, not signal. The true accuracy consistent
with 15/15 correct runs roughly from 80% upward.

Treat the holdout as a **smoke test for gross failure**: it reliably catches
"this is broken" (5 misses out of 15 is not bad luck). It cannot distinguish
92% from 97%. Do not over-read one number, and do not tune against it to make
it look better — that trades the only honest signal you have for a nicer
figure.

If you want a number that actually supports a 95% claim, that needs on the
order of 100+ labelled receipts. Decide whether you want that *after* the
smoke test says the approach is alive.
