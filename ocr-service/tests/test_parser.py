"""Parser tests. No OCR engine needed — these feed text straight in.

A failure here is a parsing bug. Recognition quality is measured separately
by tests/evaluate.py against rendered receipt images.
"""
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from bx_ocr.categories import CATEGORIES, categorize  # noqa: E402
from bx_ocr.layout import group_into_lines  # noqa: E402
from bx_ocr.parser import TextLine, amounts_in, parse_receipt  # noqa: E402

TODAY = date(2026, 9, 19)


def lines(*texts):
    """Stacks text into plausible receipt geometry."""
    return [TextLine(text=t, x0=0, y0=i * 30, x1=400, y1=i * 30 + 20)
            for i, t in enumerate(texts)]


def parse(*texts):
    return parse_receipt(lines(*texts), today=TODAY).as_contract()


# ------------------------------------------------------------------ amounts

@pytest.mark.parametrize("text,expected", [
    ("TOTAL  12.43", [12.43]),
    ("PRICE/L       1.583", []),          # 3 decimals is a unit price
    ("LITRES       48.210", []),
    ("HST 13%        1.43", [1.43]),      # the rate is not an amount
    ("TVQ 9.975%     8.58", [8.58]),
    ("SUBTOTAL   1,234.56", [1234.56]),
    ("DISCOUNT      -5.00", [-5.00]),
    ("TOTAL         $31.86", [31.86]),
    ("TIME 08:14 AM", []),
    ("HST l2.43", [12.43]),          # repaired digits beat the substring
    ("TOTAL S.99", [5.99]),
    ("TOTAL BOSS.SO", []),           # letters are not money
    ("Table BIB.SS", []),
    ("ORDER ID.SS", []),
    ("POSTAL M5B 2H1", []),
])
def test_amount_detection(text, expected):
    assert [a.value for a in amounts_in(text)] == expected


# ------------------------------------------------------------------- totals

def test_total_prefers_settled_figure_over_pre_tip_amount():
    r = parse("SUBTOTAL 114.07", "HST 14.83", "AMOUNT 128.90", "TIP 17.10",
              "TOTAL 146.00")
    assert r["total"] == "146.00"


def test_total_ignores_subtotal_and_change():
    r = parse("SUBTOTAL 11.00", "HST 13% 1.43", "TOTAL 12.43",
              "CASH 20.00", "CHANGE 7.57")
    assert r["total"] == "12.43"


@pytest.mark.parametrize("label", [
    "GRAND TOTAL", "TOTAL DUE", "BALANCE DUE", "AMOUNT DUE", "Amount charged",
])
def test_total_wordings(label):
    r = parse("SUBTOTAL 100.00", "HST 13.00", f"{label} 113.00")
    assert r["total"] == "113.00"


def test_department_totals_lose_to_the_final_total_due():
    r = parse("Grocery Dept", "Bread 3.49", "TOTAL 13.77", "Office Dept",
              "Pens 6.49", "TOTAL 19.73", "Subtotal 33.50", "HST 13% 4.36",
              "TOTAL DUE 37.86")
    assert r["total"] == "37.86"


# ---------------------------------------------------------------------- tax

def test_tax_label_glued_to_rate():
    assert parse("SUBTOTAL 11.00", "HST13%  1.43", "TOTAL 12.43")["hst"] == "1.43"


def test_gst_and_pst_are_summed():
    r = parse("SUBTOTAL 200.00", "GST 5% 10.00", "PST 7% 13.99", "TOTAL 223.99")
    assert r["hst"] == "23.99"


def test_quebec_tps_tvq_summed():
    r = parse("Sous-total 16.75", "TPS 5% 0.84", "TVQ 9.975% 1.67", "TOTAL 19.26")
    assert r["hst"] == "2.51"


def test_tvq_misread_as_tvo_still_counts():
    """Q is read as O often enough that dropping the line loses real tax."""
    r = parse("Sous-total 16.75", "TPS 5% 0.84", "TVO 9.9759 1.67", "TOTAL 19.26")
    assert r["hst"] == "2.51"


def test_registration_number_is_not_tax():
    r = parse("GST/HST# 10429 3679 RT0001", "SUBTOTAL 11.00", "HST 1.43",
              "TOTAL 12.43")
    assert r["hst"] == "1.43"


def test_billable_line_mentioning_hst_is_not_tax():
    """An accountant billing for "HST Filing" is charging a fee, not tax."""
    r = parse("Corporate Tax Return Prep 850.00", "HST Filing Assistance 150.00",
              "Subtotal 1325.00", "HST 13% 172.25", "AMOUNT DUE 1497.25")
    assert r["hst"] == "172.25"


def test_municipal_accommodation_tax_is_added():
    r = parse("Subtotal 640.50", "HST 13% 83.27",
              "Municipal Accommodation Tax 4% 25.62", "TOTAL 749.39")
    assert r["hst"] == "108.89"


def test_tax_included_wording():
    r = parse("2 Craft Beer 16.00", "TOTAL INCLUDES HST OF 3.39", "TOTAL 29.50")
    assert r["total"] == "29.50"
    assert r["hst"] == "3.39"


def test_no_tax_line_yields_zero():
    r = parse("FARE 30.00", "TIP 4.00", "TOTAL 34.00")
    assert r["hst"] == "0.00"
    assert r["total"] == "34.00"


def test_unfound_tax_is_flagged_differently_from_a_genuine_zero():
    """Both read 0.00; only one of them means the receipt charged no tax."""
    missing = parse("FARE 30.00", "TOTAL 34.00")
    genuine = parse("FARE 30.00", "HST 0.00", "TOTAL 30.00")
    assert "no-tax-found" in missing["warnings"]
    assert "no-tax-found" not in genuine["warnings"]


def test_euro_vat_is_recognised():
    r = parse("Boulangerie", "Sous-total 248.00", "TVA 20% 52.00", "TOTAL 300.00")
    assert r["hst"] == "52.00"


def test_zero_total_receipt_can_be_read():
    r = parse("COMPED MEAL", "SUBTOTAL 0.00", "TOTAL DUE 0.00")
    assert r["total"] == "0.00"


def test_glued_merchant_still_categorises():
    assert parse("MILANOPIZZERIA", "TOTAL 20.00")["category_suggestion"] == "Dining & Meals"
    assert parse("Winners", "TOTAL 20.00")["category_suggestion"] != "Accommodation"


def test_tax_larger_than_total_is_rejected():
    r = parse("TOTAL 12.43", "TAX 9999.00")
    assert r["hst"] == "0.00"


# --------------------------------------------------------------------- date

@pytest.mark.parametrize("text,expected", [
    ("2026-01-09  14:03", "2026-01-09"),
    ("MAR 04, 2026", "2026-03-04"),
    ("MAR04,2026", "2026-03-04"),          # detector drops the spaces
    ("JUL152026  09:33", "2026-07-15"),
    ("06-AUG-2026", "2026-08-06"),
    ("02/17/2026", "2026-02-17"),          # day > 12 forces MM/DD
    ("24/06/2026", "2026-06-24"),          # day > 12 forces DD/MM
    ("02/28/26  11:22:41", "2026-02-28"),
    ("14 mars 2026", "2026-03-14"),        # French month
    ("Facture 22/04/2026", "2026-04-22"),
])
def test_dates(text, expected):
    assert parse("SHOP", text, "TOTAL 10.00")["date"] == expected


def test_ambiguous_numeric_date_offers_the_other_reading():
    """02/06 is both 6 Feb and 2 Jun; nothing on the receipt settles it, so
    the review step must be able to offer the alternative."""
    r = parse("SHOP", "02/06/2026", "TOTAL 10.00")
    assert r["date"] == "2026-02-06"
    assert r["date_alternative"] == "2026-06-02"
    assert "date-ambiguous" in r["warnings"]
    assert r["confidence"]["date"] < 0.6


@pytest.mark.parametrize("text", ["24/06/2026", "02/17/2026", "MAR 04, 2026",
                                  "2026-01-09"])
def test_unambiguous_dates_offer_no_alternative(text):
    r = parse("SHOP", text, "TOTAL 10.00")
    assert r["date_alternative"] == ""
    assert "date-ambiguous" not in r["warnings"]


def test_alternative_is_a_real_swap_of_day_and_month():
    r = parse("SHOP", "05/04/2026", "TOTAL 10.00")
    chosen, alt = r["date"], r["date_alternative"]
    assert chosen.split("-")[1] == alt.split("-")[2]
    assert chosen.split("-")[2] == alt.split("-")[1]


def test_future_date_is_rejected():
    r = parse("SHOP", "01/01/2099", "TOTAL 10.00")
    assert r["date"] != "2099-01-01"


def test_checkout_date_wins_over_arrival():
    r = parse("HOTEL", "ARRIVE 06/09/2026", "DEPART 06/11/2026",
              "TOTAL 512.36", "PAID IN FULL 06/11/2026")
    assert r["date"] == "2026-06-11"


def test_missing_date_falls_back_to_today_and_flags_it():
    """An empty date would block the save; the review step can correct today."""
    r = parse("MEGAMART", "Bread 3.49", "TOTAL DUE 37.86")
    assert r["date"] == TODAY.isoformat()
    assert "no-date" in r["warnings"]
    assert r["confidence"]["date"] < 0.3


# ----------------------------------------------------------------- merchant

def test_merchant_is_the_header_not_the_address():
    r = parse("TIM HORTONS", "#4412 - 220 YONGE ST", "TORONTO ON M5B 2H1",
              "TOTAL 12.43")
    assert r["place"] == "Tim Hortons"


def test_hotel_is_not_mistaken_for_a_telephone_line():
    r = parse("Harbourview Hotel", "1 Harbour Square, Toronto", "ON M5J 1A6",
              "TOTAL 749.39")
    assert r["place"] == "Harbourview Hotel"


def test_glued_postal_code_is_not_a_merchant():
    r = parse("Harbourview Hotel", "1HarbourSquare,Toronto", "ONM5J1A6",
              "TOTAL 749.39")
    assert "M5J" not in r["place"]


def test_dropped_spaces_are_restored_from_capitals():
    r = parse("StaplesBusinessDepot", "TOTAL 10.00")
    assert r["place"] == "Staples Business Depot"


def test_placeholder_and_copy_banners_are_skipped():
    r = parse("[Logo]", "*** CUSTOMER COPY ***", "Rosie's Diner", "TOTAL 10.00")
    assert r["place"] == "Rosie's Diner"


# --------------------------------------------------------- currency + notes

def test_currency_defaults_to_cad_on_canadian_markers():
    assert parse("SHOP", "HST 1.43", "TOTAL 12.43")["currency"] == "CAD"


def test_us_receipt_reads_as_usd():
    r = parse("SHAKE SHACK", "691 8TH AVE", "NEW YORK, NY 10036",
              "TAX $2.61", "TOTAL $31.86")
    assert r["currency"] == "USD"


# ------------------------------------------------------------------ layout

def test_skewed_rows_keep_their_own_amounts():
    """On a tilted photo the right-hand figures drift down; without skew
    compensation each label steals the next row's amount."""
    slope = 0.07
    boxes = []
    for i, (label, amount) in enumerate(
            [("SUBTOTAL", "11.00"), ("HST 13%", "1.43"), ("TOTAL", "12.43")]):
        y = 100 + i * 40
        boxes.append(TextLine(text=label, x0=10, y0=y, x1=110, y1=y + 24,
                              angle=0.0699))
        ry = y + slope * 500
        boxes.append(TextLine(text=amount, x0=500, y0=ry, x1=600, y1=ry + 24,
                              angle=0.0699))
    grouped = group_into_lines(boxes)
    res = parse_receipt(grouped, today=TODAY).as_contract()
    assert res["total"] == "12.43"
    assert res["hst"] == "1.43"


# --------------------------------------------------------------- categories

@pytest.mark.parametrize("place,expected", [
    ("Tim Hortons", "Coffee & Drinks"),
    ("Esso", "Fuel"),
    ("Uber", "Ground Transport"),
    ("Delta Hotels Toronto", "Accommodation"),
    ("Staples", "Office & Supplies"),
    ("Best Buy", "Software & Tech"),
    ("The Keg Steakhouse", "Dining & Meals"),
    ("Air Canada", "Travel"),
    ("Whitfield & Associates LLP Chartered Professional Accountants",
     "Professional Services"),
    ("Zzz Unknown Shop", "Other"),
])
def test_categories(place, expected):
    assert categorize(place) == expected


def test_one_stray_item_does_not_outvote_the_rest_of_the_basket():
    r = parse("MegaMart Wholesale", "Coffee 930g 13.97", "Bread 3.49",
              "Printer Paper 8.99", "Pens 12pk 6.49", "File Folders 4.25",
              "Subtotal 33.50", "HST 13% 4.36", "TOTAL DUE 37.86")
    assert r["category_suggestion"] == "Office & Supplies"


def test_category_list_matches_the_app():
    """These strings are written into user spreadsheets — they must not drift
    between the Node route and this service."""
    js = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))), "pages", "api", "extract.js")
    if not os.path.exists(js):
        pytest.skip("app source not present")
    block = re.search(r"const CATEGORIES = \[(.*?)\];", open(js).read(), re.S)
    assert block, "CATEGORIES not found in pages/api/extract.js"
    assert re.findall(r'"([^"]+)"', block.group(1)) == CATEGORIES


# ------------------------------------------------------------- robustness

def test_empty_input_does_not_raise():
    r = parse_receipt([], today=TODAY).as_contract()
    assert r["confidence"]["overall"] == 0.0
    assert "no-text" in r["warnings"]


def test_garbage_text_does_not_raise():
    r = parse("!@#$%^&*", "\\\\\\", "     ", "....")
    assert set(["date", "place", "total", "hst", "currency",
                "category_suggestion", "notes"]) <= set(r)


def test_contract_keys_are_stable():
    r = parse("SHOP", "TOTAL 1.00")
    for key in ("date", "place", "total", "hst", "currency",
                "date_alternative", "category_suggestion", "notes"):
        assert key in r, key
        assert isinstance(r[key], str)


def test_subtotal_plus_tax_agreement_raises_confidence():
    good = parse("SUBTOTAL 11.00", "HST 1.43", "TOTAL 12.43")
    bad = parse("SUBTOTAL 11.00", "HST 1.43", "TOTAL 99.99")
    assert good["confidence"]["total"] > bad["confidence"]["total"]
