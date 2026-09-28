"""Tests for plan building and the nutritionist approval gate, on the real prepared data."""
import json
import shutil

import pytest

import approve
import build_plans


@pytest.fixture
def workdir(tmp_path, monkeypatch):
    """Runs build_plans against a copy of the real data in a temporary folder."""
    data = tmp_path / "data"
    shutil.copytree(build_plans.DATA, data)
    monkeypatch.setattr(build_plans, "DATA", data)
    monkeypatch.setattr(build_plans, "PLANS", tmp_path / "plans")
    return tmp_path


def plans(workdir):
    return json.loads((workdir / "plans" / "plans.json").read_text(encoding="utf-8"))


def test_every_plan_starts_as_a_draft(workdir):
    build_plans.build()
    out = plans(workdir)
    assert len(out["plans"]) == 18  # 3 price regions x 2 seasons x 3 age groups
    assert {p["status"] for p in out["plans"]} == {"draft"}


def test_plans_never_use_foods_whose_prices_failed_the_check(workdir):
    build_plans.build()
    for p in plans(workdir)["plans"]:
        assert not {"egg", "chicken", "fish_mackerel", "soybean"} & set(p["grams_per_day"]), p["id"]
        assert p["excluded_foods"]["egg"] == "known_issue"


def test_problem_nutrients_are_reported_and_energy_is_in_the_window(workdir):
    build_plans.build()
    for p in plans(workdir)["plans"]:
        assert p["feasible"]
        # Rounding grams down can shave a few kcal off the lower edge, never add to the upper one.
        assert 0.9 * p["energy_target_kcal"] - 10 <= p["energy_kcal"] <= 1.1 * p["energy_target_kcal"]
        assert p["problem_nutrients"] == [m for m, v in p["adequacy"].items() if v < 0.7]


def test_approval_needs_a_name_and_survives_a_rebuild_only_if_the_plan_is_unchanged(workdir):
    build_plans.build()
    path = workdir / "plans" / "plans.json"
    with pytest.raises(SystemExit):
        approve.approve("northern-lean-12_23m", "  ", plans_path=path)
    approve.approve("northern-lean-12_23m", "A. Nutritionist, RD", plans_path=path)

    build_plans.build()
    kept = next(p for p in plans(workdir)["plans"] if p["id"] == "northern-lean-12_23m")
    assert kept["status"] == "approved"
    assert kept["approved_by"] == "A. Nutritionist, RD"

    # New local prices change the plan, so the approval must lapse.
    (workdir / "data" / "local_prices.csv").write_text(
        "food_id,price_region,season,ghs_per_kg,collected_on,source\n"
        "cowpea,NORTHERN,lean,0.5,2026-09-28,volunteer\n", encoding="utf-8")
    build_plans.build()
    lapsed = next(p for p in plans(workdir)["plans"] if p["id"] == "northern-lean-12_23m")
    assert lapsed["status"] == "draft"


def test_local_prices_make_an_excluded_food_usable(workdir):
    (workdir / "data" / "local_prices.csv").write_text(
        "food_id,price_region,season,ghs_per_kg,collected_on,source\n"
        "egg,UPPER EAST,lean,40,2026-09-28,volunteer\n", encoding="utf-8")
    build_plans.build()
    p = next(p for p in plans(workdir)["plans"] if p["id"] == "upper_east-lean-12_23m")
    assert "egg" not in p["excluded_foods"]
    assert p["price_sources"]["egg"] == "local"


def test_what_if_ranks_unpriced_foods(workdir):
    build_plans.build()
    what_if = plans(workdir)["what_if"]["12_23m"]
    assert what_if["all_together"]["vitamin_a_mcg_rae"] > what_if["base"]["vitamin_a_mcg_rae"]
