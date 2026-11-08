import json
import re
from datetime import date

import pytest

from approve import PLANS
from record_decision import record, latest_by_plan
from review_pack import build_pack


def _plan(pid, feasible=True):
    return {
        "id": pid, "age_label": "6 to 8 months", "season_label": "Lean season", "price_region": "NORTHERN",
        "regions": ["Northern"], "feasible": feasible, "status": "draft", "energy_kcal": 217,
        "energy_target_kcal": 200, "cost_ghs_per_day": 1.5, "grams_per_day": {"yam": 59},
        "foods": {"yam": "Yam"}, "adequacy": {"iron_mg": 0.2, "vitamin_c_mg": 0.9},
        "problem_nutrients": ["iron_mg"], "oldest_price_date": date.today().isoformat(),
    }


@pytest.fixture
def files(tmp_path):
    plans = tmp_path / "plans.json"
    plans.write_text(json.dumps({"plans": [_plan("a"), _plan("b", feasible=False)]}), encoding="utf-8")
    return plans, tmp_path / "decisions.json"


def test_no_real_plan_is_approved_by_default():
    data = json.loads(PLANS.read_text(encoding="utf-8"))
    assert all(p["status"] != "approved" for p in data["plans"])


def test_pack_marks_every_plan_as_draft_with_a_blank_decision_block():
    pack = _pack_from({"plans": [_plan("a"), _plan("c")]})
    assert pack.count("**Status: DRAFT. Not approved.**") == 2
    assert pack.count("- [ ] Approve as drafted") == 2
    assert "Iron:" in pack and "problem" in pack


def test_pack_names_no_dose_product_or_frequency(tmp_path):
    pack = _pack_from({"plans": [_plan("a")]})
    assert not re.search(r"\bdose\b|tablet|times a day|\bmg\b", pack, re.I)


def test_approve_decision_approves_only_that_plan(files):
    plans, log = files
    record("a", "approve", "Dr Test, Nutritionist", plans_path=plans, log_path=log)
    data = json.loads(plans.read_text(encoding="utf-8"))
    assert [p["status"] for p in data["plans"]] == ["approved", "draft"]


def test_changes_and_rejects_never_approve(files):
    plans, log = files
    record("a", "approve_with_changes", "Dr Test", changes="less yam", plans_path=plans, log_path=log)
    record("a", "reject", "Dr Test", changes="unsafe portion", plans_path=plans, log_path=log)
    data = json.loads(plans.read_text(encoding="utf-8"))
    assert all(p["status"] == "draft" for p in data["plans"])
    assert latest_by_plan(log)["a"]["decision"] == "reject"


def test_infeasible_plan_cannot_be_approved(files):
    plans, log = files
    with pytest.raises(SystemExit):
        record("b", "approve", "Dr Test", plans_path=plans, log_path=log)


def test_approval_needs_a_name_and_changes_need_a_reason(files):
    plans, log = files
    with pytest.raises(SystemExit):
        record("a", "approve", "  ", plans_path=plans, log_path=log)
    with pytest.raises(SystemExit):
        record("a", "reject", "Dr Test", changes="", plans_path=plans, log_path=log)


def test_unknown_decision_is_refused(files):
    plans, log = files
    with pytest.raises(SystemExit):
        record("a", "maybe", "Dr Test", plans_path=plans, log_path=log)


def _pack_from(data):
    from review_pack import build_pack as bp
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "plans.json"
        p.write_text(json.dumps(data), encoding="utf-8")
        return bp(p)
