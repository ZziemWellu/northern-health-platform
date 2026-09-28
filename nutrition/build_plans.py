"""Builds draft feeding plans (plans/plans.json) and a review sheet for the nutritionist (plans/REVIEW.md).

One plan per price region x season x age group. Every plan starts as "draft"; only plans a named
nutritionist approves (approve.py) are exported to the CHT app. Local prices collected by volunteers
(data/local_prices.csv, from the CHT market-price form) override WFP prices and make a food usable
even if its WFP series failed the consistency check.

data/local_prices.csv columns: food_id, price_region (NORTHERN | UPPER EAST | UPPER WEST), season
(lean | post_harvest), ghs_per_kg, collected_on (YYYY-MM-DD), source
"""
import csv
import json
import statistics
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # embedded Pythons don't add the script dir

from optimiser import Food, optimise  # noqa: E402

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
PLANS = ROOT / "plans"


def load_local_prices():
    path = DATA / "local_prices.csv"
    if not path.exists():
        return {}
    grouped = {}
    for r in csv.DictReader(path.open(encoding="utf-8")):
        grouped.setdefault((r["food_id"], r["price_region"], r["season"]), []).append(float(r["ghs_per_kg"]))
    return {k: statistics.median(v) / 10 for k, v in grouped.items()}  # GHS per 100 g


def price_for(item, region, season, local):
    local_price = local.get((item["id"], region, season))
    if local_price is not None:
        return local_price, "local"
    if not item["price"]["usable"]:
        return None, item["price"]["check"]["status"]
    seasonal = item["price"]["per_100g"][region]["seasons"][season]
    return (seasonal["ghs"], "wfp") if seasonal else (None, "no_price_in_season")


def build():
    targets = json.loads((DATA / "targets.json").read_text(encoding="utf-8"))
    table = json.loads((DATA / "food_table.json").read_text(encoding="utf-8"))
    unpriced = json.loads((DATA / "foods.json").read_text(encoding="utf-8"))["unpriced_foods"]
    local = load_local_prices()
    existing = {}
    if (PLANS / "plans.json").exists():
        existing = {p["id"]: p for p in json.loads((PLANS / "plans.json").read_text(encoding="utf-8"))["plans"]}

    plans = []
    for region, covers in table["regions"].items():
        for season, season_spec in table["seasons"].items():
            for age, spec in targets["age_groups"].items():
                foods, excluded, price_sources = [], {}, {}
                for item in table["foods"]:
                    cost, source = price_for(item, region, season, local)
                    if cost is None:
                        excluded[item["id"]] = source
                        continue
                    price_sources[item["id"]] = source
                    foods.append(Food(id=item["id"], label=item["label"],
                                      nutrients={m: item["per_100g_as_bought"].get(m) for m in spec["rni"]},
                                      energy_kcal=item["per_100g_as_bought"]["energy_kcal"] or 0,
                                      cost_per_100g=cost, max_g=item["max_g"][age]))
                result = optimise(foods, spec["rni"], spec["energy_kcal"], targets["energy_tolerance"],
                                  targets["adequacy_threshold"])
                plan_id = f"{region.lower().replace(' ', '_')}-{season}-{age}"
                content = {
                    "id": plan_id,
                    "price_region": region,
                    "regions": covers,
                    "season": season,
                    "season_label": season_spec["label"],
                    "age_group": age,
                    "age_label": spec["label"],
                    "feasible": result.feasible,
                    "reason": result.reason,
                    "grams_per_day": result.grams,
                    "foods": {i["id"]: i["label"] for i in table["foods"] if i["id"] in result.grams},
                    "cost_ghs_per_day": result.cost_ghs,
                    "energy_kcal": result.energy_kcal,
                    "energy_target_kcal": spec["energy_kcal"],
                    "adequacy": result.adequacy,
                    "problem_nutrients": result.problem_nutrients,
                    "unknown_values": result.unknown_values,
                    "price_sources": price_sources,
                    "excluded_foods": excluded,
                }
                previous = existing.get(plan_id)
                # An approval only survives a rebuild if the plan itself did not change.
                if previous and previous.get("status") == "approved" and \
                        {k: previous.get(k) for k in content} == content:
                    content.update({k: previous[k] for k in ("status", "approved_by", "approved_on")})
                else:
                    content["status"] = "draft"
                plans.append(content)

    PLANS.mkdir(exist_ok=True)
    out = {"built_on": date.today().isoformat(), "unpriced_foods": unpriced, "plans": plans,
           "what_if": what_if(table, targets, local)}
    (PLANS / "plans.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    write_review(out, targets)
    print(f"wrote {len(plans)} plans ({sum(p['status'] == 'approved' for p in plans)} approved)")


def what_if(table, targets, local, region="NORTHERN", season="lean"):
    """Nutrition only, ignoring cost: how far could each unpriced food lift the gaps if it were
    priced? Tells volunteers and the nutritionist which prices to collect first."""
    results = {}
    for age, spec in targets["age_groups"].items():
        def as_food(item, cost):
            return Food(id=item["id"], label=item["label"],
                        nutrients={m: item["per_100g_as_bought"].get(m) for m in spec["rni"]},
                        energy_kcal=item["per_100g_as_bought"]["energy_kcal"] or 0,
                        cost_per_100g=cost, max_g=item["max_g"][age])
        priced = [as_food(i, 0.0) for i in table["foods"] if price_for(i, region, season, local)[0] is not None]
        base = optimise(priced, spec["rni"], spec["energy_kcal"], targets["energy_tolerance"])
        rows = []
        for extra in table.get("unpriced", []):
            plan = optimise(priced + [as_food(extra, 0.0)], spec["rni"], spec["energy_kcal"], targets["energy_tolerance"])
            gains = {m: round(plan.adequacy[m] - base.adequacy[m], 3) for m in spec["rni"]}
            rows.append({"food": extra["label"], "grams": plan.grams.get(extra["id"], 0), "gain": gains})
        everything = optimise(priced + [as_food(e, 0.0) for e in table.get("unpriced", [])],
                              spec["rni"], spec["energy_kcal"], targets["energy_tolerance"])
        results[age] = {"base": base.adequacy, "each": rows, "all_together": everything.adequacy}
    return results


def write_review(out, targets):
    labels = {k: v["label"] for k, v in targets["nutrients"].items()}
    lines = ["# Feeding plans for nutritionist review", "",
             "Generated by `build_plans.py`. Each plan is a DRAFT until approved with `approve.py`.",
             "Percentages are what these foods alone supply against the full daily RNI; breast milk adds more.",
             f"A nutrient under {int(targets['adequacy_threshold'] * 100)}% is a problem nutrient: local foods at these prices cannot cover it.", ""]
    for p in out["plans"]:
        lines.append(f"## {p['id']} ({p['status']})")
        lines.append(f"{p['age_label']}, {p['season_label']}, {', '.join(p['regions'])}")
        if not p["feasible"]:
            lines += [f"Not feasible: {p['reason']}", ""]
            continue
        lines.append(f"Energy {p['energy_kcal']} of {p['energy_target_kcal']} kcal; cost GHS {p['cost_ghs_per_day']:.2f} per day (WFP prices to July 2023).")
        lines.append("")
        lines += [f"- {p['foods'][f]}: {g} g" for f, g in p["grams_per_day"].items()]
        lines.append("")
        lines.append("| Nutrient | % of RNI |")
        lines.append("| --- | --- |")
        lines += [f"| {labels[m]} | {round(v * 100)}%{' (problem)' if m in p['problem_nutrients'] else ''} |"
                  for m, v in p["adequacy"].items()]
        lines.append("")
        if p["excluded_foods"]:
            lines.append("Excluded (price problem): " + ", ".join(f"{k} ({v})" for k, v in p["excluded_foods"].items()))
            lines.append("")
    lines.append("## Which prices to collect first")
    lines.append("Nutrition only, ignoring cost, Northern price region: best adequacy with today's usable foods, then with each")
    lines.append("unpriced food added (percentage points gained), then with all of them. Collect prices for the foods")
    lines.append("that close the biggest gaps first.")
    lines.append("")
    for age, res in out["what_if"].items():
        label = targets["age_groups"][age]["label"]
        lines.append(f"### {label}")
        lines.append("| Food | g/day | " + " | ".join(labels[m] for m in res["base"]) + " |")
        lines.append("| --- | --- | " + " | ".join("---" for _ in res["base"]) + " |")
        lines.append("| Today's usable foods | | " + " | ".join(f"{round(v * 100)}%" for v in res["base"].values()) + " |")
        for r in sorted(res["each"], key=lambda r: -sum(r["gain"].values())):
            lines.append(f"| + {r['food']} | {r['grams']} | " + " | ".join(f"{g * 100:+.0f}" for g in r["gain"].values()) + " |")
        lines.append("| All of them | | " + " | ".join(f"{round(v * 100)}%" for v in res["all_together"].values()) + " |")
        lines.append("")
    lines.append("## Nutrient-dense local foods with no price yet")
    lines += [f"- {u['label']}: {u['why_it_matters']}" for u in out["unpriced_foods"]]
    (PLANS / "REVIEW.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
