"""OCR engine adapters.

Everything downstream consumes TextLine records, so the engine here can be
replaced without touching layout.py or parser.py. RapidOCR is the default:
it bundles PP-OCRv4 ONNX models, needs no system binaries, runs on CPU, and
keeps working on skewed, blurry phone photos where Tesseract drops the tax
line entirely.
"""
from __future__ import annotations

import io
import math
from typing import List, Optional

from .parser import TextLine

# Loading the models costs ~0.1s and a few hundred MB, so a warm instance
# keeps one engine for the life of the process.
_ENGINE = None


class RapidOcrEngine:
    name = "rapidocr"

    def __init__(self):
        from rapidocr_onnxruntime import RapidOCR
        self._ocr = RapidOCR()

    def read(self, image) -> List[TextLine]:
        import numpy as np
        result, _elapsed = self._ocr(np.array(image))
        out: List[TextLine] = []
        for item in result or []:
            box, text, conf = item[0], item[1], item[2]
            xs = [float(p[0]) for p in box]
            ys = [float(p[1]) for p in box]
            # The quad is rotation-aware; its top edge gives the baseline tilt,
            # which is what lets a hand-held photo be grouped into real lines.
            (tlx, tly), (trx, try_) = box[0], box[1]
            angle = math.atan2(float(try_) - float(tly), float(trx) - float(tlx))
            if abs(angle) > math.radians(30):
                angle = 0.0
            out.append(TextLine(text=text, x0=min(xs), y0=min(ys), x1=max(xs),
                                y1=max(ys), conf=float(conf), angle=angle))
        return out


def get_engine():
    """The process-wide engine, built on first use."""
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = RapidOcrEngine()
    return _ENGINE
