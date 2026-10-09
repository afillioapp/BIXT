# BX OCR service

Reads a receipt photo and returns the fields BX stores. Local PP-OCRv4 ONNX
inference on CPU — no AI/LLM API is called, so a scan costs nothing per use.

    bytes -> preprocess -> RapidOCR -> line grouping -> parser -> fields

## Why this is a separate Vercel project

Vercel routes `/api/*` to Next.js in the main project, so a Python function
cannot live beside `pages/api/`. This deploys as its own project (no
framework) with **Root Directory = `ocr-service`**, which has no such
conflict. `pages/api/extract.js` in the main app calls it.

## Deploy

1. New Vercel project from this repo, Root Directory `ocr-service`,
   Framework Preset **Other**.
2. Set `OCR_SHARED_SECRET` (any long random string) on this project.
3. Set the same value, plus `OCR_SERVICE_URL`, on the **main** BX project.

`GET /api/extract` returns `{ok:true}` for a smoke test. `POST` takes
`{imageBase64, mediaType}` with an `x-bx-ocr-secret` header.

## Size budget

Vercel's function limit is 250MB uncompressed but **500MB for Python**
(vercel.com/docs/functions/limitations). These pinned deps measure **352MB**
unzipped for linux/x86_64 — about 30% headroom. opencv is 181MB of that, so
if a future dependency bump breaks the ceiling, swapping in
`opencv-python-headless` saves ~38MB, and `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`
raises the limit to 5GB. The PP-OCRv4 models (~15MB) ship inside the wheel,
so nothing is downloaded at runtime and the service works with no egress.

## Layout

| file | role |
|---|---|
| `api/extract.py` | HTTP handler, auth, limits |
| `bx_ocr/engine.py` | OCR engine adapter (swappable) |
| `bx_ocr/layout.py` | detection boxes -> deskewed lines |
| `bx_ocr/parser.py` | lines -> date/place/total/tax |
| `bx_ocr/categories.py` | the 12 v1 categories + rules |

`CATEGORIES` must stay identical to the list in `pages/api/extract.js`.

## Tests

    pip install -r requirements.txt pytest
    pytest ocr-service/tests -q          # parser tests, no OCR needed
    python ocr-service/tests/make_corpus.py   # renders the image corpus
    python ocr-service/tests/evaluate.py <truth.json>   # end-to-end accuracy
