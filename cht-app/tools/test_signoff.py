"""The PILOT warning shows until a module is signed off by a named reviewer, and never later."""
import json
from pathlib import Path

import openpyxl
import pytest

import signoff

FORMS = Path(__file__).resolve().parent.parent / "forms" / "app"
NOTE = lambda n, label: ["note", n, label]
ROWS = [["begin group", "inputs", "NO_LABEL"], ["hidden", "source", "Source"], ["end group", "inputs"],
        ["calculate", "x", "NO_LABEL"], ["begin group", "page1", "Page"], ["integer", "q", "Q"], ["end group", "page1"]]


def register(tmp_path, approved, by="Dr A", on="2026-09-28"):
    path = tmp_path / "signoff.json"
    path.write_text(json.dumps({"modules": {"1": {"approved": approved, "by": by, "on": on}},
                                "forms": {"f": "1"}}), encoding="utf-8")
    return path


def test_warning_goes_on_the_first_visible_page(tmp_path):
    rows = signoff.add_pilot_banner("f", ROWS, NOTE, register(tmp_path, False))
    assert rows[5][:2] == ["note", "pilot_warning"]
    assert rows[4][1] == "page1"


def test_signed_off_module_has_no_warning(tmp_path):
    assert signoff.add_pilot_banner("f", ROWS, NOTE, register(tmp_path, True)) == ROWS


def test_approval_without_a_name_or_date_does_not_count(tmp_path):
    assert signoff.add_pilot_banner("f", ROWS, NOTE, register(tmp_path, True, by=None)) != ROWS
    assert signoff.add_pilot_banner("f", ROWS, NOTE, register(tmp_path, True, on="")) != ROWS


def test_unlisted_form_is_refused(tmp_path):
    with pytest.raises(SystemExit):
        signoff.module_approved("unknown", register(tmp_path, False))


def test_every_clinical_form_built_today_carries_the_warning():
    data = json.loads(signoff.SIGNOFF.read_text(encoding="utf-8"))
    for form_id, module in data["forms"].items():
        names = [r[1] for r in openpyxl.load_workbook(FORMS / f"{form_id}.xlsx")["survey"].iter_rows(values_only=True)]
        expected = not data["modules"][module]["approved"]
        assert ("pilot_warning" in names) == expected, form_id
