"""Turns OCR output into the structured receipt fields BX stores.

Engine-agnostic on purpose: the input is a list of TextLine records, so the
OCR engine underneath can be swapped without touching any of this.

Output mirrors the field names the old Claude endpoint returned, so the
HTTP contract with pages/capture.js does not change.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import List, Optional, Sequence

from .categories import categorize


@dataclass
class TextLine:
    """One line of recognized text, optionally with its position on the page."""
    text: str
    x0: float = 0.0
    y0: float = 0.0
    x1: float = 0.0
    y1: float = 0.0
    conf: float = 1.0
    angle: float = 0.0  # baseline tilt in radians, when the detector reports it

    @property
    def height(self) -> float:
        return max(0.0, self.y1 - self.y0)

    @property
    def mid_y(self) -> float:
        return (self.y0 + self.y1) / 2


# ---------------------------------------------------------------- numbers --

# Digits an OCR engine most often mistakes for letters. Only applied inside a
# token that already looks like an amount, never to free text.
_DIGIT_FIXES = str.maketrans({"O": "0", "o": "0", "D": "0", "l": "1", "I": "1",
                              "|": "1", "!": "1", "S": "5", "s": "5", "B": "8",
                              "Z": "2", "z": "2", "b": "6", "G": "6"})

# An amount is 1-3 digits, optional thousands groups, then exactly two
# decimals. The trailing lookahead rejects 3-decimal values (a per-litre fuel
# price like 1.583) and percentages (9.975%).
_AMOUNT_RE = re.compile(
    r"(?<![\d.,])(?P<sign>-)?(?P<cur>[$]|CAD|USD|US\$)?\s{0,2}"
    r"(?P<num>\d{1,3}(?:[,  ]\d{3})+\.\d{2}|\d+\.\d{2})"
    r"(?![\d%])"
)
# Same thing for OCR output where letters crept into the digits (l2.43, S.99).
_DIRTY_AMOUNT_RE = re.compile(
    r"(?<![\w.,])(?P<sign>-)?(?P<cur>[$])?\s{0,2}"
    r"(?P<num>[\dOoIlSsBZzDb|!G]{1,7}[.,][\dOoIlSsBZzDb|!G]{2})"
    r"(?![\d%])"
)
# French/European decimal comma, used only when nothing else matched.
_COMMA_AMOUNT_RE = re.compile(r"(?<![\d.,])(?P<sign>-)?(?P<num>\d{1,6},\d{2})(?![\d%])")


@dataclass
class Amount:
    value: float
    start: int  # character offset in the line, so we can tell label from figure
    raw: str


def _looks_numeric(raw: str) -> bool:
    """Guards the letter-repair path below.

    Repairing O->0 and S->5 recovers a smudged "S.99", but applied to a word
    it invents money: "BOSS.SO" would become 8055.50. Require the token to be
    mostly digits already before trusting the repair.
    """
    digits = sum(c.isdigit() for c in raw)
    letters = sum(c.isalpha() for c in raw)
    return digits >= 1 and digits >= letters


def _to_float(raw: str) -> Optional[float]:
    cleaned = raw.translate(_DIGIT_FIXES)
    cleaned = cleaned.replace(",", "").replace(" ", "").replace(" ", "")
    if cleaned.count(".") > 1:  # "1.234.56" -> thousands dot
        head, _, tail = cleaned.rpartition(".")
        cleaned = head.replace(".", "") + "." + tail
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return None


def amounts_in(text: str) -> List[Amount]:
    """Every money-looking value on a line, in reading order.

    The three patterns overlap by design, so candidates are resolved longest
    first: in "HST l2.43" the repaired "l2.43" (12.43) must win over the
    clean "2.43" sitting inside it, or the line reports the wrong money.
    """
    candidates = []
    for rx in (_AMOUNT_RE, _DIRTY_AMOUNT_RE, _COMMA_AMOUNT_RE):
        for m in rx.finditer(text):
            raw = m.group("num")
            if rx is _DIRTY_AMOUNT_RE and not _looks_numeric(raw):
                continue
            if rx is _COMMA_AMOUNT_RE:
                raw = raw.replace(",", ".")
            val = _to_float(raw)
            if val is None:
                continue
            if m.group("sign") == "-":
                val = -val
            span = m.span("num")
            candidates.append((span, val, m.group(0).strip()))

    candidates.sort(key=lambda c: (-(c[0][1] - c[0][0]), c[0][0]))
    kept: List[tuple] = []
    for span, val, raw in candidates:
        if any(span[0] < k[0][1] and k[0][0] < span[1] for k in kept):
            continue
        kept.append((span, val, raw))

    kept.sort(key=lambda k: k[0][0])
    return [Amount(value=v, start=sp[0], raw=r) for sp, v, r in kept]


def last_amount(text: str) -> Optional[Amount]:
    """The figure on a receipt line is the rightmost one ("HST 13%  1.43")."""
    found = amounts_in(text)
    return found[-1] if found else None


# ----------------------------------------------------------------- totals --

_NOT_TOTAL = re.compile(
    r"sub\s*-?\s*total|sous[-\s]?total|total\s*(tax|taxes|savings|saved|discount|items?|qty)\b"
    r"|items?\s+sold|# ?items|total\s+number|change\b|tip\b|pourboire|gratuit|tender(ed)?\b"
    r"|cash\b|you\s+saved|points|loyalty|round(ing)?\b|includ",
    re.I,
)
# Strongest wording first; the tier decides ties, not the order on the page.
_TOTAL_TIERS = [
    (1, re.compile(r"grand\s*total|total\s*due|total\s*paid|balance\s*due|amount\s*due|amount\s*charged"
                   r"|total\s*a?\s*payer|montant\s*du", re.I)),
    (2, re.compile(r"\btotals?(?![a-z])|\bt[.\s]?o[.\s]?t[.\s]?a[.\s]?l(?![a-z])", re.I)),
    (3, re.compile(r"\bbalance\b|\bamount\b|\bdue\b|\bpaid\b|\bcharged\b", re.I)),
]


def find_total(lines: Sequence[TextLine]) -> tuple[Optional[float], float, Optional[str]]:
    """Returns (total, confidence, evidence line)."""
    candidates = []  # (tier, index, value, text)
    for i, ln in enumerate(lines):
        text = ln.text
        if _NOT_TOTAL.search(text):
            continue
        for tier, rx in _TOTAL_TIERS:
            if not rx.search(text):
                continue
            amt = last_amount(text)
            if amt and amt.value >= 0:
                candidates.append((tier, i, amt.value, text))
            break

    if candidates:
        best_tier = min(c[0] for c in candidates)
        tiered = [c for c in candidates if c[0] == best_tier]
        # Among equally-worded lines the largest wins: on a restaurant bill
        # "AMOUNT 128.90 / TIP / TOTAL 146.00" the settled figure is the big one.
        chosen = max(tiered, key=lambda c: (c[2], c[1]))
        conf = {1: 0.95, 2: 0.9, 3: 0.6}[best_tier]
        if len(tiered) > 1 and len({c[2] for c in tiered}) > 1:
            conf -= 0.1
        return chosen[2], conf, chosen[3]

    # Nothing labelled: fall back to the largest amount in the bottom half,
    # which is where the settled figure lives on almost every layout.
    tail = lines[len(lines) // 2:] or lines
    pool = [a.value for ln in tail for a in amounts_in(ln.text) if a.value > 0]
    if pool:
        return max(pool), 0.35, None
    return None, 0.0, None


# ------------------------------------------------------------------- tax ---

_TAX_ID = re.compile(r"(gst|hst|tps|tvq|qst|tax)\s*(id|no|num|#|:)?\s*#|\bR[TP]\d{4}\b"
                     r"|\b\d{9}\s*R[TP]\b|registration", re.I)
_TOTAL_TAX = re.compile(r"total\s+tax(es)?|taxes?\s+total|total\s+des\s+taxes", re.I)
# OCR frequently glues the rate onto the label ("HST13%"), so these end on a
# letter-lookahead rather than \b, which would not match before a digit.
_TAX_LINE = re.compile(
    r"\bh\.?s\.?t\.?(?![a-z])|\bg\.?s\.?t\.?(?![a-z])|\bp\.?s\.?t\.?(?![a-z])"
    r"|\bq\.?s\.?t\.?(?![a-z])|\bt\.?p\.?s\.?(?![a-z])|\bt\.?v\.?[qo0]\.?(?![a-z])"
    r"|\bt\.?v\.?h\.?(?![a-z])|\bt\.?v\.?a\.?(?![a-z])|\bsales\s*tax|\bvat(?![a-z])|\btaxe?s?(?![a-z])",
    re.I,
)


# Words allowed to appear in a tax label besides the tax name itself.
_TAX_WORDS = re.compile(
    r"municipal|accommodation|lodging|occupancy|tourism|environmental|room|city|local"
    r"|state|provincial|federal|harmonized|combined|sales|goods|services|liquor"
    r"|taxes|taxe|tax|tps|tv[qo0a]|tvh|vat|gst|hst|pst|qst|incl(uded|usive)?"
    r"|and|et|de[sl]?|la|du",
    re.I,
)


def _is_tax_label(text: str, amount_start: int) -> bool:
    """True when the words before the figure are only tax words.

    "HST 13%" and "Municipal Accommodation Tax 4%" qualify; a billable line
    like "HST Filing Assistance" does not, even though it says HST.
    """
    label = text[:amount_start]
    residue = _TAX_WORDS.sub("", label)
    return not re.search(r"[A-Za-z]{3,}", residue)


# "TOTAL INCLUDES HST OF 3.39" states the tax without a tax-labelled line.
_TAX_INCLUSIVE = re.compile(r"includ\w*|\bincl\.?\b|\binclusive\b", re.I)


def find_tax(lines: Sequence[TextLine], total: Optional[float]
             ) -> tuple[float, float, List[str], bool]:
    """Sums the sales-tax lines.

    Returns (tax, confidence, evidence, saw_tax_line). The last flag separates
    "this receipt charged no tax" from "we could not find the tax line" —
    identical 0.00 values, very different meanings for the user's books.
    """
    explicit_total_tax: Optional[tuple[float, str]] = None
    parts: List[tuple[float, str]] = []
    saw_tax_line = False

    for ln in lines:
        text = ln.text
        if not _TAX_LINE.search(text):
            continue
        if _TAX_ID.search(text):  # "GST/HST# 10429 3679 RT0001"
            continue
        saw_tax_line = True
        amt = last_amount(text)
        if not amt or amt.value <= 0:
            continue
        if not (_is_tax_label(text, amt.start) or _TAX_INCLUSIVE.search(text)):
            continue
        # A tax line's figure never exceeds the bill itself.
        if total and amt.value >= total:
            continue
        if _TOTAL_TAX.search(text):
            explicit_total_tax = (amt.value, text)
        else:
            parts.append((amt.value, text))

    if explicit_total_tax:
        return explicit_total_tax[0], 0.9, [explicit_total_tax[1]], saw_tax_line
    if not parts:
        return 0.0, (0.5 if saw_tax_line else 0.3), [], saw_tax_line

    # De-duplicate: the same figure printed twice (e.g. an HST line repeated in
    # a summary block) must not be counted twice.
    uniq: List[tuple[float, str]] = []
    for value, text in parts:
        if not any(abs(value - v) < 0.005 and t.strip() == text.strip() for v, t in uniq):
            uniq.append((value, text))

    tax = round(sum(v for v, _ in uniq), 2)
    conf = 0.9 if len(uniq) == 1 else 0.8

    # Sanity: sales tax in Canada tops out near 15%, so anything past ~25% of
    # the bill means we summed something that was not a tax.
    if total and total > 0 and tax > total * 0.25:
        biggest = max(uniq, key=lambda p: p[0])
        if biggest[0] <= total * 0.25:
            return biggest[0], 0.5, [biggest[1]], saw_tax_line
        return 0.0, 0.2, [], saw_tax_line
    return tax, conf, [t for _, t in uniq], saw_tax_line


# ------------------------------------------------------------------ date ---

_MONTHS: dict[str, int] = {}
for _i, _names in enumerate([
    ("jan", "janv", "janu"), ("feb", "febr", "fevr", "fev", "f\u00e9vr", "f\u00e9v"),
    ("mar", "mars", "marc"), ("apr", "avr", "avri"), ("may", "mai"),
    ("jun", "june", "juin"), ("jul", "july", "juil"), ("aug", "augu", "aout", "ao\u00fbt"),
    ("sep", "sept"), ("oct", "octo"), ("nov", "nove"), ("dec", "dece", "d\u00e9c"),
], 1):
    for _n in _names:
        _MONTHS[_n] = _i

_ISO_RE = re.compile(r"\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b")
_NUM_RE = re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b")
_TXT_RE = re.compile(
    r"\b(\d{1,2})\s*[-\s]?\s*([A-Za-zéû]{3,9})\.?\s*[-,\s]?\s*(20\d{2}|\d{2})(?!\d)|"
    r"\b([A-Za-zéû]{3,9})\.?\s*(\d{1,2})\s*,?\s*(20\d{2})(?!\d)"
)
# Lines whose date is the one that matters, or one to ignore outright.
_DATE_PREFERRED = re.compile(r"\bpaid\b|settled|depart|check\s*-?\s*out|invoice\s*date|\bdate\b\s*:", re.I)
_DATE_IGNORED = re.compile(r"exp(iry|ires|\.)?\b|valid\s*(thru|until)|best\s*before|arrive|check\s*-?\s*in", re.I)


def _build(y: int, m: int, d: int, today: date) -> Optional[date]:
    if y < 100:
        y += 2000
    if not (1 <= m <= 12) or not (1 <= d <= 31) or not (2000 <= y <= today.year + 1):
        return None
    try:
        made = date(y, m, d)
    except ValueError:
        return None
    # Receipts are not written in the future; a small clock skew is tolerated.
    if made > today + timedelta(days=2):
        return None
    return made


_TIME_GLUE = re.compile(r"(?<=\d)(\d{1,2}:\d{2}(?::\d{2})?)")


def _dates_in(text: str, today: date) -> List[tuple[date, float, Optional[date]]]:
    """Every parseable date on a line: (date, confidence, alternative).

    `alternative` is the other plausible reading of an ambiguous numeric date
    — "02/06" is both 6 Feb and 2 Jun and nothing on the receipt settles it.
    Carrying it lets the review step offer a one-tap correction instead of
    silently committing to a coin flip.
    """
    text = _TIME_GLUE.sub(r" \1", text)
    out: List[tuple[date, float, Optional[date]]] = []

    for m in _ISO_RE.finditer(text):
        d = _build(int(m.group(1)), int(m.group(2)), int(m.group(3)), today)
        if d:
            out.append((d, 0.95, None))

    for m in _TXT_RE.finditer(text):
        if m.group(2):  # "15 JUL 2026" / "06-AUG-2026"
            mon = _MONTHS.get(m.group(2)[:4].lower()) or _MONTHS.get(m.group(2)[:3].lower())
            if mon:
                d = _build(int(m.group(3)), mon, int(m.group(1)), today)
                if d:
                    out.append((d, 0.95, None))
        elif m.group(4):  # "MAR 04, 2026"
            mon = _MONTHS.get(m.group(4)[:4].lower()) or _MONTHS.get(m.group(4)[:3].lower())
            if mon:
                d = _build(int(m.group(6)), mon, int(m.group(5)), today)
                if d:
                    out.append((d, 0.95, None))

    for m in _NUM_RE.finditer(text):
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        mdy = _build(y, a, b, today)   # North American POS default
        dmy = _build(y, b, a, today)   # the rest of the world, and much of QC
        if a > 12 and dmy:
            out.append((dmy, 0.9, None))
        elif b > 12 and mdy:
            out.append((mdy, 0.9, None))
        elif mdy and dmy:
            # Both readings are valid. Offer the other one rather than hide it.
            out.append((mdy, 0.55, dmy if dmy != mdy else None))
        elif mdy or dmy:
            out.append(((mdy or dmy), 0.8, None))
    return out


def find_date(lines: Sequence[TextLine], today: Optional[date] = None
              ) -> tuple[Optional[date], float, Optional[date]]:
    """Returns (date, confidence, alternative reading)."""
    today = today or date.today()
    preferred: List[tuple[date, float, Optional[date]]] = []
    ordinary: List[tuple[date, float, Optional[date], int]] = []

    for i, ln in enumerate(lines):
        if _DATE_IGNORED.search(ln.text):
            continue
        found = _dates_in(ln.text, today)
        if not found:
            continue
        if _DATE_PREFERRED.search(ln.text):
            preferred.extend(found)
        else:
            ordinary.extend((d, c, alt, i) for d, c, alt in found)

    if preferred:
        best = max(preferred, key=lambda p: p[1])
        return best[0], min(0.95, best[1]), best[2]
    if ordinary:
        # First date in reading order: receipt headers carry the sale date,
        # while anything further down tends to be a reprint or card footer.
        best = min(ordinary, key=lambda p: (p[3], -p[1]))
        return best[0], best[1], best[2]
    return None, 0.0, None


# -------------------------------------------------------------- merchant ---

_MERCHANT_NOISE = re.compile(
    r"\d{3}[-.\s]\d{3}[-.\s]\d{4}"                      # phone
    r"|[A-Z]\d[A-Z]\s?\d[A-Z]\d"                        # CA postal code, glued or not
    r"|\b(?:ST|AVE|AVENUE|RD|ROAD|BLVD|DR|DRIVE|HWY|WAY|STREET|RUE|SUITE|UNIT|PLAZA|MALL)\b"
    r"|\b(?:ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b\s*[A-Z]?\d"
    r"|receipt|invoice|customer\s+copy|merchant\s+copy|welcome|thank\s*you|thanks"
    r"|\bgst\b|\bhst\b|\btps\b|\btvq\b|\btel\b|\bfax\b|www\.|http|\.com|order\s*#"
    r"|table\b|server\b|serveur"
    r"|cashier|caissier|terminal|trans(action)?\b|store\s*#?\d|folio|guest\b"
    r"|^\s*#|^\s*\d|\bno\.?\s*\d+|^\s*[\[\(<].*[\]\)>]\s*$|\blogo\b|\bcustomer\s*copy\b",
    re.I,
)
_ACRONYMS = {"BMO", "TD", "RBC", "CIBC", "LCBO", "KFC", "A&W", "IGA", "HMV", "UPS",
             "IKEA", "PC", "NY", "USA", "ATM", "BBQ", "LNG", "II", "III"}


def _respace(name: str) -> str:
    """Restores spaces the detector dropped, using capitalisation as the cue."""
    out = re.sub(r"(?<=[a-z])(?=[A-Z][a-z])", " ", name)
    out = re.sub(r"\s*&\s*", " & ", out)
    out = re.sub(r"(?<=[A-Za-z])(?=\d{4}(?!\d))", " ", out)
    return re.sub(r"\s{2,}", " ", out).strip()


def _titlecase(name: str) -> str:
    if not name.isupper():
        return name
    out = re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), name)
    out = re.sub(r"'(\w)", lambda m: "'" + m.group(1).lower(), out)
    return " ".join(w.upper() if w.upper() in _ACRONYMS else w for w in out.split(" "))


def find_merchant(lines: Sequence[TextLine]) -> tuple[Optional[str], float]:
    head = [ln for ln in lines[:9] if ln.text.strip()]
    if not head:
        return None, 0.0

    tallest = max((ln.height for ln in head), default=0.0)
    best: Optional[tuple[float, str]] = None

    for i, ln in enumerate(head):
        text = ln.text.strip(" .*-_=|")
        letters = sum(c.isalpha() for c in text)
        if len(text) < 3 or letters < 3:
            continue
        if letters / max(1, len(text)) < 0.55:
            continue
        if amounts_in(text):
            continue
        if _MERCHANT_NOISE.search(text):
            continue
        score = 3.0 - i * 0.55                       # earlier lines win
        if tallest > 0:
            score += 2.2 * (ln.height / tallest)     # the big header wins harder
        if text.isupper():
            score += 0.25
        if best is None or score > best[0]:
            best = (score, text)

    if best is None:
        # Everything was filtered out: take the first line with letters rather
        # than return nothing, and say so with a low confidence.
        for ln in head:
            if sum(c.isalpha() for c in ln.text) >= 3:
                return _titlecase(re.sub(r"\s+", " ", ln.text.strip())), 0.3
        return None, 0.0

    name = _respace(re.sub(r"\s{2,}", " ", best[1]).strip())
    name = re.sub(r"\s*#\s*\d+.*$", "", name).strip()
    conf = 0.85 if best[0] > 3.5 else 0.6
    return _titlecase(name), conf


# -------------------------------------------------------------- currency ---

_US_HINT = re.compile(r"\bUSD\b|\bUS\$|\b(NY|CA|TX|FL|WA|IL|MA|NV|AZ|GA|NJ|PA|OH|MI|NC|VA)\b\s*\d{5}\b")
_CA_HINT = re.compile(r"\bCAD\b|\bHST\b|\bGST\b|\bQST\b|\bTPS\b|\bTVQ\b|\bPST\b"
                      r"|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b(ON|QC|BC|AB|MB|SK|NS|NB)\b")
_EUR_HINT = re.compile(r"€|\bEUR\b")
_GBP_HINT = re.compile(r"£|\bGBP\b")


def find_currency(lines: Sequence[TextLine], default: str = "CAD") -> tuple[str, float]:
    blob = "\n".join(ln.text for ln in lines)
    if _EUR_HINT.search(blob):
        return "EUR", 0.8
    if _GBP_HINT.search(blob):
        return "GBP", 0.8
    ca, us = len(_CA_HINT.findall(blob)), len(_US_HINT.findall(blob))
    if us and not ca:
        return "USD", 0.8
    if ca:
        return "CAD", 0.85
    return default, 0.4


# ----------------------------------------------------------------- notes ---

_ITEM_COUNT_RE = re.compile(r"(?:#\s*)?items?(?:\s+sold)?\s*[:\-]?\s*(\d{1,3})\b|"
                            r"\b(\d{1,3})\s+items?\b", re.I)
_SUMMARY_START = re.compile(r"sub\s*-?\s*total|sous[-\s]?total|merchandise|\btotal\b", re.I)


def count_items(lines: Sequence[TextLine]) -> int:
    for ln in lines:
        m = _ITEM_COUNT_RE.search(ln.text)
        if m:
            n = m.group(1) or m.group(2)
            if n and 0 < int(n) < 500:
                return int(n)
    n = 0
    for ln in lines:
        if _SUMMARY_START.search(ln.text):
            break
        text = ln.text.strip()
        if len(text) < 4 or not amounts_in(text):
            continue
        if sum(c.isalpha() for c in text) < 3:
            continue
        if _TAX_LINE.search(text) or _DATE_PREFERRED.search(text):
            continue
        if _dates_in(text, date.today()):
            continue
        n += 1
    return n


# ----------------------------------------------------------------- parse ---

@dataclass
class ParseResult:
    date: str = ""
    place: str = ""
    total: str = ""
    hst: str = ""
    currency: str = "CAD"
    date_alternative: str = ""
    category_suggestion: str = "Other"
    notes: str = ""
    confidence: dict = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)

    def as_contract(self) -> dict:
        return {
            "date": self.date,
            "place": self.place,
            "total": self.total,
            "hst": self.hst,
            "currency": self.currency,
            "date_alternative": self.date_alternative,
            "category_suggestion": self.category_suggestion,
            "notes": self.notes,
            "confidence": self.confidence,
            "warnings": self.warnings,
        }


def _category_context(lines: Sequence[TextLine]) -> List[str]:
    """Lines the category vote may consider.

    Summary and payment rows carry no signal about what was bought, and
    their wording ("TOTAL", "VISA") would otherwise drown out the item
    lines on a long receipt.
    """
    skip = re.compile(r"sub\s*-?\s*total|sous[-\s]?total|^\s*total|grand\s*total"
                      r"|balance|amount\s*due|\bvisa\b|\bmastercard\b|\bamex\b"
                      r"|\bdebit\b|\bcredit\b|\bcash\b|\bchange\b|\bapproved\b"
                      r"|\btender|\bcard\b|\bauth\b|thank\s*you|\bmerci\b", re.I)
    return [ln.text for ln in lines if not skip.search(ln.text)]


def _money(v: Optional[float]) -> str:
    return "" if v is None else f"{v:.2f}"


def parse_receipt(lines: Sequence[TextLine], today: Optional[date] = None) -> ParseResult:
    """OCR lines in, BX receipt fields out. Never raises on bad input."""
    lines = [ln for ln in lines if ln.text and ln.text.strip()]
    lines = [TextLine(text=_respace(ln.text), x0=ln.x0, y0=ln.y0, x1=ln.x1,
                      y1=ln.y1, conf=ln.conf, angle=ln.angle) for ln in lines]
    res = ParseResult()
    if not lines:
        res.warnings.append("no-text")
        res.confidence = {"overall": 0.0, "place": 0.0, "total": 0.0,
                          "hst": 0.0, "date": 0.0}
        return res

    total, total_conf, _ = find_total(lines)
    tax, tax_conf, _tax_evidence, saw_tax_line = find_tax(lines, total)
    when, date_conf, date_alt = find_date(lines, today)
    place, place_conf = find_merchant(lines)
    currency, _cur_conf = find_currency(lines)

    # Cross-check: subtotal + tax should land on the total. When it does, both
    # figures are almost certainly right; when it does not, say so.
    subtotal = None
    for ln in lines:
        if re.search(r"sub\s*-?\s*total|sous[-\s]?total|merchandise", ln.text, re.I):
            amt = last_amount(ln.text)
            if amt:
                subtotal = amt.value
    if subtotal is not None and total is not None:
        if abs((subtotal + tax) - total) <= 0.02:
            total_conf = min(0.99, total_conf + 0.05)
            tax_conf = min(0.99, tax_conf + 0.05)
        elif total < subtotal:
            res.warnings.append("total-below-subtotal")
            total_conf -= 0.25

    if total is not None and tax > total:
        tax, tax_conf = 0.0, 0.2
        res.warnings.append("tax-exceeded-total")

    res.date = (when or (today or date.today())).isoformat()
    if not when:
        date_conf = 0.15
    res.place = place or ""
    res.total = _money(total)
    res.hst = _money(tax) if total is not None else ""
    res.currency = currency
    res.category_suggestion = categorize(place or "", _category_context(lines))

    n_items = count_items(lines)
    res.notes = f"{n_items} items" if n_items > 1 else ("1 item" if n_items == 1 else "")

    if not saw_tax_line:
        res.warnings.append("no-tax-found")
    if not res.total:
        res.warnings.append("no-total")
    if not when:
        res.warnings.append("no-date")
    if date_alt:
        res.date_alternative = date_alt.isoformat()
        res.warnings.append("date-ambiguous")
    if not res.place:
        res.warnings.append("no-merchant")

    core = [max(0.0, total_conf), max(0.0, place_conf), max(0.0, date_conf)]
    res.confidence = {
        "place": round(max(0.0, place_conf), 2),
        "total": round(max(0.0, min(1.0, total_conf)), 2),
        "hst": round(max(0.0, min(1.0, tax_conf)), 2),
        "date": round(max(0.0, date_conf), 2),
        "overall": round(sum(core) / len(core), 2),
    }
    return res
