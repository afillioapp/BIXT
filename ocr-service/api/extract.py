"""Vercel Python Function: POST a receipt image, get BX receipt fields back.

This service is private. It is called only by the app's own
pages/api/extract.js, which has already checked the caller's Firebase token
and rate limit, and which proves it is us with a shared secret. Nothing here
calls a paid API — recognition is local PP-OCRv4 ONNX inference on CPU.
"""
import base64
import binascii
import hmac
import json
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bx_ocr.categories import CATEGORIES  # noqa: E402
from bx_ocr.pipeline import empty_result, extract  # noqa: E402

# The app uploads ~200KB JPEGs; this is generous headroom, not a target.
MAX_IMAGE_BASE64_CHARS = 7 * 1024 * 1024
MAX_BODY_BYTES = 12 * 1024 * 1024


def _authorized(headers) -> bool:
    """Constant-time check of the shared secret.

    An unset secret fails closed: a misconfigured deploy must not silently
    become an open OCR endpoint.
    """
    expected = os.environ.get("OCR_SHARED_SECRET") or ""
    presented = headers.get("x-bx-ocr-secret") or ""
    if not expected or not presented:
        return False
    return hmac.compare_digest(expected, presented)


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Lets a deploy be smoke-tested without sending an image.
        self._send(200, {"ok": True, "engine": "rapidocr", "categories": CATEGORIES})

    def do_POST(self):
        started = time.time()
        try:
            if not _authorized(self.headers):
                return self._send(401, {"error": "Unauthorized"})

            try:
                length = int(self.headers.get("content-length") or 0)
            except ValueError:
                return self._send(400, {"error": "Bad Content-Length"})
            if length <= 0:
                return self._send(400, {"error": "Missing body"})
            if length > MAX_BODY_BYTES:
                return self._send(413, {"error": "Image is too large."})

            try:
                payload = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, UnicodeDecodeError):
                return self._send(400, {"error": "Body must be JSON"})

            image_b64 = payload.get("imageBase64")
            if not image_b64 or not isinstance(image_b64, str):
                return self._send(400, {"error": "Missing imageBase64"})
            if len(image_b64) > MAX_IMAGE_BASE64_CHARS:
                return self._send(413, {"error": "Image is too large."})

            # Tolerate a data: URL prefix, which some callers include.
            if "," in image_b64[:64] and image_b64.lstrip().startswith("data:"):
                image_b64 = image_b64.split(",", 1)[1]

            try:
                raw = base64.b64decode(image_b64, validate=False)
            except (binascii.Error, ValueError):
                return self._send(400, {"error": "imageBase64 is not valid base64"})
            if not raw:
                return self._send(400, {"error": "Empty image"})

            try:
                result = extract(raw)
            except Exception:
                # A photo we cannot read is an expected outcome, not a crash:
                # hand back blank fields so the user can still type them in.
                print("extract failed:\n" + traceback.format_exc(), file=sys.stderr)
                result = empty_result("unreadable-image")

            result["ms"] = int((time.time() - started) * 1000)
            return self._send(200, {"result": result, "categories": CATEGORIES})

        except Exception:
            print("handler failed:\n" + traceback.format_exc(), file=sys.stderr)
            return self._send(500, {"error": "Could not read the receipt."})

    def log_message(self, fmt, *args):  # keep function logs quiet
        pass
