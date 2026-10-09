"""Generates a ground-truth corpus of Canadian-style receipt images.

Renders thermal-printer-ish receipts with PIL, then produces degraded
"phone photo" variants (skew, blur, JPEG artifacts, uneven lighting).
Each image has a matching ground-truth record in truth.json.

Ground truth fields mirror the BX contract: date, place, total, hst, currency,
category. 'hst' means "the tax amount BX stores" = sum of all sales taxes.
"""
import json, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

random.seed(7)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
os.makedirs(OUT, exist_ok=True)

MONO = "/System/Library/Fonts/Supplemental/Courier New.ttf"
MONO_B = "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"
SANS_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

# Each receipt: lines are (text, style) where style in
# b=bold big header, h=bold, n=normal, s=small, c=centered normal, sep=separator
RECEIPTS = [
    dict(
        id="01_tim_hortons", font=MONO, width=560,
        truth=dict(date="2026-03-04", place="Tim Hortons", total="12.43", hst="1.43", currency="CAD", category="Coffee & Drinks"),
        lines=[
            ("TIM HORTONS", "b"), ("#4412 - 220 YONGE ST", "c"), ("TORONTO ON M5B 2H1", "c"),
            ("", "n"), ("GST/HST# 10429 3679 RT0001", "s"), ("", "n"),
            ("MAR 04, 2026          08:14 AM", "n"), ("ORDER #  A-0417", "n"), ("", "sep"),
            ("2 LARGE DOUBLE DOUBLE     4.58", "n"),
            ("1 FARMERS BREAKFAST       5.99", "n"),
            ("1 TIMBIT                  0.43", "n"), ("", "sep"),
            ("SUBTOTAL                 11.00", "n"),
            ("HST 13%                   1.43", "n"),
            ("TOTAL                    12.43", "h"), ("", "n"),
            ("DEBIT                    12.43", "n"), ("CHANGE                    0.00", "n"),
            ("", "n"), ("THANK YOU - MERCI", "c"),
        ]),
    dict(
        id="02_esso_fuel", font=MONO, width=540,
        truth=dict(date="2026-02-17", place="Esso", total="86.22", hst="9.92", currency="CAD", category="Fuel"),
        lines=[
            ("ESSO", "b"), ("CIRCLE K #2291", "c"), ("1450 DUNDAS ST E", "c"), ("MISSISSAUGA, ON", "c"),
            ("", "sep"), ("02/17/2026   17:42:09", "n"), ("PUMP  04", "n"), ("", "sep"),
            ("REGULAR UNLEADED", "n"),
            ("LITRES       48.210", "n"),
            ("PRICE/L       1.583", "n"),
            ("FUEL SALE     76.30", "n"), ("", "sep"),
            ("SUBTOTAL      76.30", "n"),
            ("HST @13%       9.92", "n"),
            ("TOTAL         86.22", "h"), ("", "n"),
            ("VISA ************4417", "n"), ("APPROVED - 00 THANK YOU", "s"),
        ]),
    dict(
        id="03_staples_office", font=MONO, width=580,
        truth=dict(date="2026-01-09", place="Staples", total="214.70", hst="24.70", currency="CAD", category="Office & Supplies"),
        lines=[
            ("STAPLES", "b"), ("Store 0142  Ottawa ON", "c"), ("613-555-0142", "c"), ("", "sep"),
            ("2026-01-09  14:03", "n"), ("Trans 0142-018-4471", "s"), ("", "sep"),
            ("HP 64XL BLACK INK       49.99", "n"),
            ("HP 64XL TRI-COLOUR      54.99", "n"),
            ("COPY PAPER 10RM CASE    64.99", "n"),
            ("STAPLER HEAVY DUTY      19.99", "n"),
            ("FILE FOLDERS LEGAL      12.49", "n"),
            ("PENS BALLPOINT 12PK      6.99", "n"),
            ("USB-C HUB 7 PORT        34.99", "n"), ("", "sep"),
            ("ITEMS  7", "s"),
            ("SUBTOTAL               190.00", "n"),
            ("HST                     24.70", "n"),
            ("TOTAL                  214.70", "h"),
            ("MASTERCARD             214.70", "n"),
        ]),
    dict(
        id="04_montreal_qst", font=MONO, width=560,
        truth=dict(date="2026-04-22", place="Restaurant Chez Delphine", total="98.72", hst="12.87", currency="CAD", category="Dining & Meals"),
        lines=[
            ("RESTAURANT CHEZ DELPHINE", "b"), ("1234 RUE SAINT-DENIS", "c"), ("MONTREAL QC H2X 3K2", "c"),
            ("", "sep"), ("22/04/2026   19:51", "n"), ("TABLE 12   SERVEUR: MARC", "n"), ("", "sep"),
            ("2 TARTARE DE BOEUF     38.00", "n"),
            ("1 MOULES FRITES        24.00", "n"),
            ("2 VERRE VIN ROUGE      23.85", "n"), ("", "sep"),
            ("SOUS-TOTAL             85.85", "n"),
            ("TPS 5%                  4.29", "n"),
            ("TVQ 9.975%              8.58", "n"),
            ("TOTAL                  98.72", "h"), ("", "n"),
            ("POURBOIRE/TIP _________", "n"),
            ("TPS# 80123 4567 RT0001", "s"), ("TVQ# 1012345678 TQ0001", "s"),
        ]),
    dict(
        id="05_uber_digital", font=SANS, width=620,
        truth=dict(date="2026-05-30", place="Uber", total="27.45", hst="3.16", currency="CAD", category="Ground Transport"),
        lines=[
            ("Uber", "b"), ("", "n"), ("Thanks for riding, Alireza", "c"), ("", "n"),
            ("May 30, 2026", "n"), ("", "sep"),
            ("Trip fare                  21.40", "n"),
            ("Booking fee                 2.89", "n"),
            ("", "sep"),
            ("Subtotal                   24.29", "n"),
            ("HST                         3.16", "n"),
            ("Amount charged             27.45", "h"), ("", "n"),
            ("Visa ....8821", "n"),
            ("UBER CANADA INC. GST/HST 85623 1447 RT0001", "s"),
        ]),
    dict(
        id="06_hotel_folio", font=MONO, width=620,
        truth=dict(date="2026-06-11", place="Delta Hotels Toronto", total="512.36", hst="58.06", currency="CAD", category="Accommodation"),
        lines=[
            ("DELTA HOTELS TORONTO", "b"), ("75 LOWER SIMCOE ST", "c"), ("TORONTO ON M5J 3A6", "c"),
            ("", "sep"), ("GUEST FOLIO", "c"), ("ARRIVE 06/09/2026  DEPART 06/11/2026", "s"),
            ("ROOM 1408   FOLIO 88213", "s"), ("", "sep"),
            ("06/09 ROOM CHARGE        209.00", "n"),
            ("06/09 DESTINATION FEE      3.50", "n"),
            ("06/10 ROOM CHARGE        209.00", "n"),
            ("06/10 DESTINATION FEE      3.50", "n"),
            ("06/10 PARKING             29.30", "n"), ("", "sep"),
            ("SUBTOTAL                 454.30", "n"),
            ("HST 13%                   58.06", "n"),
            ("BALANCE DUE              512.36", "h"), ("", "n"),
            ("AMEX XXXX-XXXXX-31004", "n"), ("PAID IN FULL  06/11/2026", "n"),
        ]),
    dict(
        id="07_walmart_long", font=MONO, width=580,
        truth=dict(date="2026-02-28", place="Walmart", total="63.41", hst="2.47", currency="CAD", category="Office & Supplies"),
        lines=[
            ("Walmart", "b"), ("Supercentre #3106", "c"), ("BARRIE ON", "c"), ("", "sep"),
            ("02/28/26  11:22:41  ST#3106 OP#0021", "s"), ("", "sep"),
            ("GV WATER 24PK    3.97 N", "n"),
            ("BANANAS 1.42KG   2.11 N", "n"),
            ("MILK 4L          5.49 N", "n"),
            ("PAPER TOWEL 6    9.97 H", "n"),
            ("DISH SOAP        4.47 H", "n"),
            ("BREAD WW         3.27 N", "n"),
            ("EGGS LARGE 18    6.97 N", "n"),
            ("COFFEE 930G     13.97 N", "n"),
            ("GARBAGE BAGS     8.97 H", "n"),
            ("CHEESE BLOCK     4.97 N", "n"), ("", "sep"),
            ("SUBTOTAL        60.94", "n"),
            ("HST 13%          2.47", "n"),
            ("TOTAL           63.41", "h"),
            ("DEBIT TEND      63.41", "n"),
            ("# ITEMS SOLD 10", "s"),
        ]),
    dict(
        id="08_faint_cafe", font=MONO, width=460, faint=True,
        truth=dict(date="2026-07-15", place="Balzac's Coffee Roasters", total="9.04", hst="1.04", currency="CAD", category="Coffee & Drinks"),
        lines=[
            ("BALZAC'S COFFEE ROASTERS", "h"), ("DISTILLERY DISTRICT", "c"), ("", "sep"),
            ("JUL 15 2026  09:33", "n"), ("", "sep"),
            ("1 LATTE LG        5.25", "n"),
            ("1 ALMOND CROIS    2.75", "n"), ("", "sep"),
            ("SUBTOTAL          8.00", "n"),
            ("HST               1.04", "n"),
            ("AMOUNT DUE        9.04", "h"),
            ("CASH             10.00", "n"),
            ("CHANGE            0.96", "n"),
        ]),
    dict(
        id="09_us_dollars", font=MONO, width=540,
        truth=dict(date="2026-03-19", place="Shake Shack", total="31.86", hst="2.61", currency="USD", category="Dining & Meals"),
        lines=[
            ("SHAKE SHACK", "b"), ("691 8TH AVE", "c"), ("NEW YORK, NY 10036", "c"), ("", "sep"),
            ("03/19/2026  12:47 PM", "n"), ("CHECK 2041", "n"), ("", "sep"),
            ("2 SHACKBURGER    $17.90", "n"),
            ("1 FRIES           $4.19", "n"),
            ("2 LEMONADE        $7.16", "n"), ("", "sep"),
            ("SUBTOTAL         $29.25", "n"),
            ("TAX               $2.61", "n"),
            ("TOTAL            $31.86", "h"),
            ("VISA             $31.86", "n"),
        ]),
    dict(
        id="10_tip_ambiguous", font=MONO, width=560,
        truth=dict(date="2026-05-02", place="The Keg Steakhouse", total="146.00", hst="14.83", currency="CAD", category="Dining & Meals"),
        lines=[
            ("THE KEG STEAKHOUSE + BAR", "b"), ("YORK STREET", "c"), ("TORONTO ON", "c"), ("", "sep"),
            ("MAY 2, 2026   20:14", "n"), ("SERVER: JEN   TBL 41", "n"), ("", "sep"),
            ("PRIME RIB 12OZ     52.00", "n"),
            ("SIRLOIN 8OZ        44.00", "n"),
            ("CAESAR SALAD       13.00", "n"),
            ("MALBEC BTL         35.00", "n"), ("", "sep"),
            ("SUBTOTAL          114.07", "n"),
            ("HST                14.83", "n"),
            ("AMOUNT             128.90", "n"),
            ("TIP                17.10", "n"),
            ("TOTAL             146.00", "h"), ("", "n"),
            ("VISA  ****2210", "n"), ("APPROVED", "s"),
        ]),
    dict(
        id="11_grand_total_wording", font=MONO, width=560,
        truth=dict(date="2026-08-06", place="Canada Computers", total="1129.99", hst="129.99", currency="CAD", category="Software & Tech"),
        lines=[
            ("CANADA COMPUTERS & ELECTRONICS", "h"), ("3555 DON MILLS RD", "c"), ("NORTH YORK ON", "c"), ("", "sep"),
            ("INVOICE  CC-884120", "n"), ("DATE: 06-AUG-2026", "n"), ("", "sep"),
            ("DELL U2723QE MONITOR   749.00", "n"),
            ("LOGITECH MX KEYS       129.00", "n"),
            ("DOCK THUNDERBOLT 4     122.00", "n"), ("", "sep"),
            ("MERCHANDISE           1000.00", "n"),
            ("H.S.T. (13%)           129.99", "n"),
            ("GRAND TOTAL           1129.99", "h"),
            ("PAID - MASTERCARD", "n"),
        ]),
    dict(
        id="12_no_tax_line", font=MONO, width=520,
        truth=dict(date="2026-09-01", place="Green Cab", total="34.00", hst="0", currency="CAD", category="Ground Transport"),
        lines=[
            ("GREEN CAB", "b"), ("OTTAWA TAXI CO-OP", "c"), ("", "sep"),
            ("SEP 01 2026   07:18", "n"), ("CAB 214   DRIVER 8821", "n"), ("", "sep"),
            ("FROM: OTTAWA AIRPORT", "n"),
            ("TO:   DOWNTOWN", "n"),
            ("FARE           30.00", "n"),
            ("TIP             4.00", "n"),
            ("TOTAL          34.00", "h"), ("", "n"),
            ("THANK YOU", "c"),
        ]),
    dict(
        id="13_gst_pst_split", font=MONO, width=560,
        truth=dict(date="2026-04-03", place="Best Buy", total="223.99", hst="23.99", currency="CAD", category="Software & Tech"),
        lines=[
            ("BEST BUY", "b"), ("STORE 977  BURNABY BC", "c"), ("", "sep"),
            ("APR 3, 2026  16:20", "n"), ("", "sep"),
            ("SANDISK 2TB SSD      179.99", "n"),
            ("HDMI 2.1 CABLE        20.01", "n"), ("", "sep"),
            ("SUBTOTAL             200.00", "n"),
            ("GST 5%                10.00", "n"),
            ("PST 7%                13.99", "n"),
            ("TOTAL                223.99", "h"),
            ("VISA DEBIT           223.99", "n"),
        ]),
    dict(
        id="14_thermal_narrow", font=MONO, width=420,
        truth=dict(date="2026-06-24", place="Pizza Pizza", total="28.24", hst="3.25", currency="CAD", category="Dining & Meals"),
        lines=[
            ("PIZZA PIZZA", "h"), ("#0412 KING ST W", "c"), ("", "sep"),
            ("24/06/2026 12:05", "n"), ("", "sep"),
            ("1 LG PEPPERONI  18.99", "n"),
            ("1 GARLIC BREAD   5.00", "n"),
            ("1 POP 2L         1.00", "n"), ("", "sep"),
            ("SUB TOTAL       24.99", "n"),
            ("H.S.T.           3.25", "n"),
            ("TOTAL DUE       28.24", "h"),
            ("MC ****1120", "n"),
        ]),
]


def render(spec):
    w = spec["width"]
    base_font = spec.get("font", MONO)
    bold_font = MONO_B if base_font == MONO else SANS_B
    sizes = {"b": 34, "h": 24, "n": 20, "c": 19, "s": 15, "sep": 20}
    pad = 28
    line_h = 30
    # measure height
    h = pad * 2 + sum(line_h + (14 if st == "b" else 0) for _, st in spec["lines"])
    img = Image.new("L", (w, h), 252)
    d = ImageDraw.Draw(img)
    y = pad
    for text, st in spec["lines"]:
        if st == "sep":
            d.line([(pad, y + line_h // 2), (w - pad, y + line_h // 2)], fill=140, width=1)
            y += line_h
            continue
        f = ImageFont.truetype(bold_font if st in ("b", "h") else base_font, sizes[st])
        ink = 25 if st in ("b", "h") else 45
        if st in ("b", "c", "h") and st != "h" or st == "b" or st == "c":
            tw = d.textlength(text, font=f)
            x = (w - tw) / 2
        elif st == "h":
            x = pad
        else:
            x = pad
        if st == "h":
            x = pad
        d.text((x, y), text, font=f, fill=ink)
        y += line_h + (14 if st == "b" else 0)
    if spec.get("faint"):
        img = ImageEnhance.Contrast(img).enhance(0.45)
        img = ImageEnhance.Brightness(img).enhance(1.12)
    return img.convert("RGB")


def degrade(img, seed):
    """Approximates a handheld phone photo: skew, blur, uneven light, JPEG."""
    rnd = random.Random(seed)
    im = img.copy()
    # pad so rotation doesn't clip
    bg = Image.new("RGB", (im.width + 120, im.height + 120), (238, 236, 232))
    bg.paste(im, (60, 60))
    im = bg.rotate(rnd.uniform(-4.5, 4.5), resample=Image.BICUBIC, fillcolor=(238, 236, 232), expand=True)
    # uneven lighting: horizontal gradient overlay
    grad = Image.linear_gradient("L").resize(im.size).rotate(rnd.choice([0, 90]))
    im = Image.composite(im, ImageEnhance.Brightness(im).enhance(0.72), grad)
    im = im.filter(ImageFilter.GaussianBlur(rnd.uniform(0.6, 1.3)))
    im = ImageEnhance.Contrast(im).enhance(rnd.uniform(0.82, 0.95))
    return im


def fit_1600(img):
    """Mirrors lib/image.js: long edge <= 1600px, JPEG re-encode."""
    m = max(img.size)
    if m > 1600:
        s = 1600 / m
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    return img


def build():
    """Renders the corpus to disk. Import-safe: nothing runs on import."""
    truth = []
    for spec in RECEIPTS:
        img = render(spec)
        img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)

        clean = fit_1600(img)
        p1 = os.path.join(OUT, f"{spec['id']}_clean.jpg")
        clean.save(p1, "JPEG", quality=72)
        truth.append(dict(file=os.path.basename(p1), variant="clean", **spec["truth"]))

        dirty = fit_1600(degrade(img, spec["id"]))
        p2 = os.path.join(OUT, f"{spec['id']}_photo.jpg")
        dirty.save(p2, "JPEG", quality=58)
        truth.append(dict(file=os.path.basename(p2), variant="photo", **spec["truth"]))

    with open(os.path.join(os.path.dirname(OUT), "truth.json"), "w") as f:
        json.dump(truth, f, indent=2)
    print(f"wrote {len(truth)} images to {OUT}")
    return truth


if __name__ == "__main__":
    build()
