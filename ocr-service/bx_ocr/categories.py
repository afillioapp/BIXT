"""The v1 expense categories, and the rules that pick one.

CATEGORIES must stay identical to the list in pages/api/extract.js — those
strings are written into users' expense sheets and are treated as schema.
"""
from __future__ import annotations

import re
from typing import Sequence

CATEGORIES = [
    "Dining & Meals",
    "Coffee & Drinks",
    "Travel",
    "Ground Transport",
    "Fuel",
    "Accommodation",
    "Office & Supplies",
    "Software & Tech",
    "Marketing",
    "Professional Services",
    "Meetings & Events",
    "Groceries",
    "Rent & Utilities",
    "Bank Transfers & Payments",
    "Cash Withdrawal",
    "Other",
]

# Ordered most-specific first: a gas station that also sells coffee is Fuel,
# and a hotel restaurant charge is Accommodation.
_RULES: list[tuple[str, re.Pattern]] = [
    # Added 2026-10-30, mirroring lib/categories.js. Bank slips first: an ATM
    # slip is a cash withdrawal, any other bank slip a transfer or payment.
    ("Cash Withdrawal", re.compile(r"\batm\b|\bwithdrawal\b|\bcash (?:back|advance)\b|\babm\b", re.I)),
    ("Bank Transfers & Payments", re.compile(
        r"\btd canada trust\b|\bcibc\b|\brbc\b|\broyal bank\b|\bbmo\b|\bscotiabank\b|\btangerine\b"
        r"|\bdesjardins\b|\bnational bank\b|\be-?transfer\b|\binterac e-?transfer\b|\bbill payment\b"
        r"|\btransfer (?:to|from)\b|\bdeposit\b", re.I)),
    ("Rent & Utilities", re.compile(
        r"\brent\b|\bhydro\b|\benbridge\b|\butilit(?:y|ies)\b|\brogers\b|\bbell canada\b|\btelus\b"
        r"|\bfido\b|\bkoodo\b|\bfreedom mobile\b|\binternet\b", re.I)),
    ("Groceries", re.compile(
        r"\bgrocer(?:y|ies)\b|\bsupermarket\b|\bpars food\b|\bwhole foods\b|\bloblaws?\b|\bno frills\b"
        r"|\bfood basics\b|\bsobeys\b|\bfreshco\b|\bfarm boy\b|\blongo'?s\b|\bfortinos\b|\bsuperstore\b", re.I)),
    ("Fuel", re.compile(
        r"\besso\b|\bshell\b|petro[-\s]?can|\bultramar\b|\bhusky\b|\bchevron\b|\bmobil\b"
        r"|\bpioneer\b|\bcanadian tire gas\b|\bcostco gas\b|\bgas bar\b|\bfuel\b"
        r"|unleaded|\bdiesel\b|litres?\s*@|price\s*/\s*l\b|\bpump\s*\d", re.I)),
    ("Accommodation", re.compile(
        r"\bhotel\b|\bhotels\b|\bmotel\b|\binn\b|\bsuites\b|\bresort\b|\blodge\b|\bhostel\b"
        r"|marriott|hilton|hyatt|fairmont|sheraton|westin|\bdelta hotels\b|holiday inn"
        r"|best western|airbnb|\bvrbo\b|room charge|guest folio|night\(s\)\s*@", re.I)),
    ("Travel", re.compile(
        r"air canada|westjet|porter airlines|\bairlines?\b|\bairways\b|\bflight\b|\bvia rail\b"
        r"|\bamtrak\b|boarding pass|\bbaggage\b|departure\s+tax|\bairfare\b", re.I)),
    ("Ground Transport", re.compile(
        r"\buber\b|\blyft\b|\btaxi\b|\bcab\b|\blimo\b|\bttc\b|\bgo transit\b|\bpresto\b"
        r"|\bmetro\s*(?:pass|card|station|transit|line)\b|\bstm\b|\boc transpo\b|\btranslink\b|\bparking\b|\bimpark\b|\bgreen p\b"
        r"|\bcar\s?share\b|communauto|\bzipcar\b|trip fare|\btoll\b|\b407 etr\b", re.I)),
    ("Coffee & Drinks", re.compile(
        r"tim hortons|starbucks|second cup|\bbalzac|country style|coffee|\bcafe\b|caf[ée]"
        r"|espresso|\blatte\b|\bcappuccino\b|tea\s+house|juice bar|\bbubble tea\b"
        r"|\bdoughnut|\bdonut", re.I)),
    ("Software & Tech", re.compile(
        r"best buy|canada computers|apple store|\bapple\.com\b|memory express|newegg"
        r"|\bmicrosoft\b|\badobe\b|\bgoogle\b\s*(workspace|cloud)|\baws\b|amazon web"
        r"|\bgithub\b|\bfigma\b|\bnotion\b|\bslack\b|\bzoom\b|\bdropbox\b|\bopenai\b"
        r"|\banthropic\b|subscription|\bsaas\b|\bsoftware\b|\blicen[cs]e\b|\bssd\b|\bmonitor\b"
        r"|\blaptop\b|\bkeyboard\b|\bhdmi\b|\busb\b", re.I)),
    ("Office & Supplies", re.compile(
        r"\bstaples\b|\bwalmart\b|\bcostco\b|\bdollarama\b|home depot|\blowes\b|\brona\b"
        r"|canadian tire|\bamazon\b|\bindigo\b|office\s+supplies|\bprinter\b|\bink\b|\btoner\b"
        r"|copy paper|\bstapler\b|file folders|\benvelopes?\b|\bpens?\b|\bpaper\b", re.I)),
    ("Meetings & Events", re.compile(
        r"\bconference\b|\bsummit\b|\bexpo\b|\bseminar\b|\bworkshop\b|\bticket(s|master)?\b"
        r"|\beventbrite\b|\bmeetup\b|\bregistration fee\b|\bbanquet\b|\bcatering\b"
        r"|meeting room|boardroom|\battendee\b|\bconference\s*pass\b|\bdelegate\b|\bconvention\b|\btrade\s*show\b", re.I)),
    ("Marketing", re.compile(
        r"\bfacebook ads?\b|\bmeta ads?\b|google ads|\badwords\b|linkedin ads|\bmailchimp\b"
        r"|\bhootsuite\b|\bcanva\b|\bvistaprint\b|\bmoo\.com\b|business cards|\bsignage\b"
        r"|\bbrochure|\bflyers?\b|\badvertis", re.I)),
    ("Professional Services", re.compile(
        r"\blaw\b|\blawyer\b|\blegal\b|\bnotary\b|\bnotaire\b|\baccountants?\b|\baccounting\b"
        r"|chartered professional|\bbarrister\b|\bsolicitor\b"
        r"|\bbookkeep|\bcpa\b|\bconsult(ing|ant)\b|\bagency\b|\bretainer\b|professional fees"
        r"|\binsurance\b|\bbroker\b", re.I)),
    ("Dining & Meals", re.compile(
        r"\brestaurant\b|\bsteakhouse\b|\bbistro\b|\bgrill\b|\bpub\b|\btavern\b|\bpizza"
        r"|\bsushi\b|\bburger\b|\bdeli\b|\bbakery\b|\bkitchen\b|\bdiner\b|\beatery\b"
        r"|\bbar\b|\bbrasserie\b|\bpizzeria\b|the keg|swiss chalet|boston pizza|mcdonald"
        r"|\bsubway\b|\bwendy|\bharvey|\bkfc\b|shake shack|\bchipotle\b|\bnando|\bthai\b"
        r"|\bramen\b|\bserveur\b|\btable\s*\d|\bentr[ée]e\b|\bappetizer\b|\bdessert\b"
        r"|\bpourboire\b|\btartare\b|\bmoules\b|\bbeer\b|\bpint\b|\bnachos\b|\bwings\b"
        r"|\bserver\s*[:#]|\btable\s*[:#]?\s*\d|\bbrass\s*tap\b", re.I)),
]


def _flex(rx: re.Pattern) -> re.Pattern:
    """Re-compiles a rule so every literal space also matches no space at all.

    The detector drops inter-word spaces often enough ("BESTBUY",
    "CANADACOMPUTERS") that exact phrases would otherwise miss.
    """
    return re.compile(rx.pattern.replace(" ", r"\s*"), rx.flags)


_RULES = [(name, _flex(rx)) for name, rx in _RULES]

# The detector sometimes returns a header with every space gone
# ("MILANOPIZZERIA"), which no \b-anchored rule can match. These drop the
# word boundaries so the name can still be recognised. Only used as a
# fallback, and only on matches long enough to be unambiguous — without the
# length floor, "inn" would match "Winners".
_RULES_LOOSE = [(name, re.compile(rx.pattern.replace(r"\b", ""), rx.flags))
                for name, rx in _RULES]
_LOOSE_MIN_CHARS = 5


def categorize(place: str, lines: Sequence[str] = ()) -> str:
    """Best-fit category from the merchant name, else a vote over the body.

    The merchant name decides on its own when it matches: a coffee shop that
    prints the word "parking" further down is still a coffee shop.

    Failing that, every line gets one vote for its most specific matching
    rule and the category with the most lines wins. Voting rather than
    first-match matters on mixed receipts — a grocery run that includes one
    bag of coffee should not be filed under Coffee & Drinks when four other
    lines are office supplies.
    """
    name = (place or "").strip()
    if name:
        for category, rx in _RULES:
            if rx.search(name):
                return category

    if name:
        for category, rx in _RULES_LOOSE:
            m = rx.search(name)
            if m and len(m.group(0)) >= _LOOSE_MIN_CHARS:
                return category

    order = {category: i for i, (category, _) in enumerate(_RULES)}
    votes: dict[str, int] = {}
    for line in lines:
        if not line or not line.strip():
            continue
        for category, rx in _RULES:
            if rx.search(line):
                votes[category] = votes.get(category, 0) + 1
                break
    if votes:
        # Ties go to the more specific rule, which is the earlier one.
        return min(votes, key=lambda c: (-votes[c], order[c]))
    return "Other"
