"""The feeding counselling form must show approved plans only, never drafts."""
import json
import sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_nutrition_forms  # noqa: E402


def survey_rows(xlsx):
    return list(openpyxl.load_workbook(xlsx)["survey"].iter_rows(values_only=True))


def fake_plan(status, **extra):
    return {"id": "northern-lean-12_23m", "price_region": "NORTHERN", "season": "lean", "age_group": "12_23m",
            "feasible": True, "status": status, "grams_per_day": {"millet": 40, "cowpea": 30},
            "foods": {"millet": "Pearl millet", "cowpea": "Cowpea"}, "problem_nutrients": ["zinc_mg"], **extra}


def build_with(tmp_path, monkeypatch, plans):
    plans_path = tmp_path / "plans.json"
    plans_path.write_text(json.dumps({"plans": plans}), encoding="utf-8")
    saved = {}
    monkeypatch.setattr(build_nutrition_forms, "save", lambda name, title, rows, choices: saved.update(rows=rows))
    build_nutrition_forms.build_feeding_counselling(plans_path)
    return saved["rows"]


def test_draft_plans_are_never_shown(tmp_path, monkeypatch):
    rows = build_with(tmp_path, monkeypatch, [fake_plan("draft")])
    assert not any(r[1].startswith("plan_") for r in rows)
    assert any(r[1] == "no_approved_plan" and r[4].endswith("true()") is False for r in rows) or \
        any(r[1] == "no_approved_plan" for r in rows)


def test_approved_plan_shows_foods_gaps_and_approver(tmp_path, monkeypatch):
    rows = build_with(tmp_path, monkeypatch, [fake_plan("approved", approved_by="A. Nutritionist", approved_on="2026-09-28")])
    note = next(r for r in rows if r[1] == "plan_northern_lean_12_23m")
    assert "Pearl millet 40 g" in note[2]
    assert "zinc" in note[2]
    assert "A. Nutritionist" in note[2]
    assert note[4] == "${r_plan_id} = 'northern-lean-12_23m'"
