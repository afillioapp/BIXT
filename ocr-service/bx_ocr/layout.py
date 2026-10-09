"""Turns scattered OCR detection boxes into readable lines.

Detectors emit one box per text region, so a receipt line like
"HST 13%        1.43" usually arrives as TWO boxes. Anything downstream that
expects "the amount is the rightmost number on the line" only works if the
boxes are regrouped into lines first.
"""
from __future__ import annotations

import math
from statistics import median
from typing import List, Sequence

from .parser import TextLine


def group_into_lines(boxes: Sequence[TextLine], tol: float = 0.6) -> List[TextLine]:
    """Clusters boxes that sit on the same baseline, left to right.

    `tol` is a fraction of the median glyph height: two boxes belong to the
    same line when their vertical centres are closer than that.
    """
    items = [b for b in boxes if b.text and b.text.strip()]
    if not items:
        return []

    heights = [b.height for b in items if b.height > 0]
    unit = median(heights) if heights else 12.0
    threshold = max(4.0, unit * tol)

    # A hand-held photo is always a little rotated, which makes the amounts on
    # the right drift vertically away from their labels on the left. Grouping
    # on raw y then pairs each label with the NEXT row's figure. Compensating
    # for the page tilt first is what keeps "TOTAL" attached to its own amount.
    # Every box votes, including the perfectly horizontal ones: dropping the
    # zeros lets one or two stray quads tilt an upright receipt and split its
    # labels away from their amounts.
    tilts = [b.angle for b in items]
    skew = median(tilts) if tilts else 0.0
    if abs(skew) > math.radians(30):
        skew = 0.0
    slope = math.tan(skew)

    def key(b: TextLine) -> float:
        return b.mid_y - slope * ((b.x0 + b.x1) / 2)

    items.sort(key=lambda b: (key(b), b.x0))
    lines: List[List[TextLine]] = [[items[0]]]

    for box in items[1:]:
        current = lines[-1]
        ref = sum(key(b) for b in current) / len(current)
        if abs(key(box) - ref) <= threshold:
            current.append(box)
        else:
            lines.append([box])

    out: List[TextLine] = []
    for group in lines:
        group.sort(key=lambda b: b.x0)
        text = "  ".join(b.text.strip() for b in group if b.text.strip())
        if not text:
            continue
        out.append(TextLine(
            text=text,
            x0=min(b.x0 for b in group),
            y0=min(b.y0 for b in group),
            x1=max(b.x1 for b in group),
            y1=max(b.y1 for b in group),
            conf=min((b.conf for b in group), default=1.0),
        ))
    return out
