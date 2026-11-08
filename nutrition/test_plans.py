"""Tests for plan building and the nutritionist approval gate, on the real prepared data."""
import json
import shutil
from datetime import date

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


TODAY = date(2026, 10, 1)
HEADER = "food_id,price_region,season,ghs_per_kg,collected_on,source\n"


def plan_by_id(workdir, plan_id):
    return next(p for p in plans(workdir)["plans"] if p["id"] == plan_id)


def write_fresh_local_prices(workdir, plan, collected_on="2026-09-28"):
    """Volunteer prices for every food the plan could use, at today's WFP-derived level."""
    table = json.loads((workdir / "data" / "food_table.json").read_text(encoding="utf-8"))
    by_id = {f["id"]: f for f in table["foods"]}
    rows = []
    for food_id in plan["price_sources"]:
        seasonal = by_id[food_id]["price"]["per_100g"][plan["price_region"]]["seasons"][plan["season"]]
        rows.append(f"{food_id},{plan['price_region']},{plan['season']},{seasonal['ghs'] * 10},{collected_on},volunteer\n")
    (workdir / "data" / "local_prices.csv").write_text(HEADER + "".join(rows), encoding="utf-8")


def test_a_plan_on_2023_wfp_prices_cannot_be_approved(workdir):
    build_plans.build()
    path = workdir / "plans" / "plans.json"
    plan = plan_by_id(workdir, "northern-lean-12_23m")
    assert plan["oldest_price_date"] == "2023-07-15"
    with pytest.raises(SystemExit, match="days old"):
        approve.approve("northern-lean-12_23m", "A. Nutritionist, RD", plans_path=path, today=TODAY)
    assert plan_by_id(workdir, "northern-lean-12_23m")["status"] == "draft"


def test_approval_needs_a_name_and_survives_a_rebuild_only_if_the_plan_is_unchanged(workdir):
    build_plans.build()
    write_fresh_local_prices(workdir, plan_by_id(workdir, "northern-lean-12_23m"))
    build_plans.build()
    path = workdir / "plans" / "plans.json"
    assert plan_by_id(workdir, "northern-lean-12_23m")["oldest_price_date"] == "2026-09-28"
    with pytest.raises(SystemExit):
        approve.approve("northern-lean-12_23m", "  ", plans_path=path, today=TODAY)
    approve.approve("northern-lean-12_23m", "A. Nutritionist, RD", plans_path=path, today=TODAY)

    build_plans.build()
    kept = plan_by_id(workdir, "northern-lean-12_23m")
    assert kept["status"] == "approved"
    assert kept["approved_by"] == "A. Nutritionist, RD"

    # A new, much lower cowpea price changes the plan, so the approval must lapse.
    csv_path = workdir / "data" / "local_prices.csv"
    with csv_path.open("a", encoding="utf-8") as fh:
        fh.write("cowpea,NORTHERN,lean,0.5,2026-09-29,volunteer\ncowpea,NORTHERN,lean,0.5,2026-09-29,volunteer\n")
    build_plans.build()
    assert plan_by_id(workdir, "northern-lean-12_23m")["status"] == "draft"


@pytest.mark.parametrize("row, message", [
    ("cowpee,NORTHERN,lean,5,2026-09-28,v", "unknown food_id"),
    ("cowpea,NORTH,lean,5,2026-09-28,v", "unknown price_region"),
    ("cowpea,NORTHERN,rainy,5,2026-09-28,v", "unknown season"),
    ("cowpea,NORTHERN,lean,0,2026-09-28,v", "positive number"),
    ("cowpea,NORTHERN,lean,five,2026-09-28,v", "positive number"),
    ("cowpea,NORTHERN,lean,5,28/09/2026,v", "YYYY-MM-DD"),
    ("cowpea,NORTHERN,lean,5,2099-01-01,v", "in the future"),
])
def test_a_bad_volunteer_price_row_stops_the_build_with_its_line_number(workdir, row, message):
    (workdir / "data" / "local_prices.csv").write_text(HEADER + row + "\n", encoding="utf-8")
    with pytest.raises(SystemExit, match=f"line 2: .*{message}"):
        build_plans.build()


def test_what_if_does_not_crash_when_no_plan_is_feasible():
    table = {"foods": [], "unpriced": [{"id": "unpriced_x", "label": "X", "max_g": {"12_23m": 10},
                                        "per_100g_as_bought": {"energy_kcal": 10, "iron_mg": 1}}]}
    targets = {"energy_tolerance": 0.1,
               "age_groups": {"12_23m": {"rni": {"iron_mg": 5}, "energy_kcal": 550}}}
    out = build_plans.what_if(table, targets, local={})
    assert out["12_23m"]["base"] == {"iron_mg": 0.0}
    assert out["12_23m"]["each"][0]["gain"] == {"iron_mg": 0.0}


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
