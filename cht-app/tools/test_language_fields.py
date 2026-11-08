import json
import re
from pathlib import Path

import openpyxl

import build_language_fields as blf

ROOT = Path(__file__).resolve().parents[2]
CONTACT = ROOT / "cht-app" / "forms" / "contact"
REGISTRY = json.loads((ROOT / "shared" / "languages" / "languages.json").read_text(encoding="utf-8"))["languages"]


def test_every_registry_language_is_a_choice_on_both_person_forms():
    for name in ("person-create", "person-edit"):
        xml = (CONTACT / f"{name}.xml").read_text(encoding="utf-8")
        choices = set(re.findall(r"<name>([^<]+)</name>", xml.split("<instance id=\"language\">")[1].split("</instance>")[0]))
        assert choices == set(REGISTRY) | {"other"}, name


def test_the_pilot_language_is_first_and_english_and_other_are_last():
    codes = [c for c, _ in blf.language_choices()]
    assert codes[0] == "dag"
    assert codes[-2:] == ["en", "other"]


def test_the_fields_sit_after_the_phone_numbers_and_the_language_is_required():
    for name in ("person-create", "person-edit"):
        ws = openpyxl.load_workbook(CONTACT / f"{name}.xlsx")["survey"]
        head = [c.value for c in ws[1]]
        rows = [dict(zip(head, r)) for r in ws.iter_rows(min_row=2, values_only=True)]
        names = [r["name"] for r in rows]
        i = names.index("phone_alternate")
        assert names[i + 1:i + 4] == list(blf.FIELDS), name
        assert rows[i + 1]["required"] == "yes"
        xml = (CONTACT / f"{name}.xml").read_text(encoding="utf-8")
        assert '<bind nodeset="/data/person/preferred_language" type="string" required="true()"/>' in xml


def test_the_profile_names_map_matches_the_registry():
    text = (ROOT / "cht-app" / "language-names.js").read_text(encoding="utf-8")
    mapped = dict(re.findall(r"^  (\w+): '((?:[^'\\]|\\.)*)',$", text, re.M))
    assert mapped == {c: l for c, l in blf.language_choices() if c != "other"}
