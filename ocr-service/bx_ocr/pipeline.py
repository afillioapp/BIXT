"""Receipt image in, BX receipt fields out.

    bytes -> preprocess -> OCR -> line grouping -> parse -> contract dict

The returned dict matches what pages/api/extract.js has always sent to the
app, so the browser sees no change.
"""
from __future__ import annotations

import io
from datetime import date
from typing import Optional

from .categories import CATEGORIES
from .layout import group_into_lines
from .parser import ParseResult, parse_receipt

# The app compresses to this before upload; anything larger is downscaled here
# so an oversized import cannot blow up memory or inference time.
MAX_EDGE = 1600


def preprocess(image_bytes: bytes):
    """Decodes to an upright RGB image at a sane size."""
    from PIL import Image, ImageOps
    img = Image.open(io.BytesIO(image_bytes))
    # Phone photos carry their rotation in EXIF rather than in the pixels.
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    longest = max(img.size)
    if longest > MAX_EDGE:
        scale = MAX_EDGE / longest
        img = img.resize((max(1, round(img.width * scale)),
                          max(1, round(img.height * scale))), Image.LANCZOS)
    return img


def extract(image_bytes: bytes, today: Optional[date] = None) -> dict:
    """Full pipeline. Raises only on an unreadable image."""
    from .engine import get_engine
    image = preprocess(image_bytes)
    boxes = get_engine().read(image)
    lines = group_into_lines(boxes)
    result = parse_receipt(lines, today=today)
    return result.as_contract()


def empty_result(reason: str) -> dict:
    """A well-formed result for an image nothing could be read from.

    The app shows its editable review form either way, so a blank-but-valid
    payload lets the user type the receipt in by hand instead of hitting a
    dead end.
    """
    res = ParseResult()
    res.warnings = [reason]
    res.confidence = {"overall": 0.0, "place": 0.0, "total": 0.0,
                      "hst": 0.0, "date": 0.0}
    return res.as_contract()
