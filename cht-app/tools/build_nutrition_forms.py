"""Generates the Module 3 (local-food nutrition) CHT forms:

- market_prices: a volunteer records prices in her market once a month, including nutrient-dense
  foods that have no WFP price (groundnut, dawadawa, leaves, dried fish, oil). Exported prices feed
  nutrition/data/local_prices.csv and the next round of plans.
- feeding_counselling: at a 6-23 month child's visit, shows the NUTRITIONIST-APPROVED plan for her
  price region, season and age group (foods and grams per day, and what local food cannot cover),
  and records the WHO/UNICEF minimum dietary diversity indicator (5 or more of 8 food groups).
  Plans come from nutrition/plans/plans.json; drafts are never shown. With no approved plan, the
  nurse is told to give standard GHS feeding counselling.

Run:  python tools/build_nutrition_forms.py
then: npx cht --no-check convert-app-forms -- market_prices feeding_counselling
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_child_forms import child_inputs  # noqa: E402
from build_referral_forms import meta_rows, row, save, yes_no  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PLANS = ROOT.parent / "nutrition" / "plans" / "plans.json"
FOODS = ROOT.parent / "nutrition" / "data" / "foods.json"

PRICE_REGIONS = [("northern", "NORTHERN", "Northern, Savannah or North East"),
                 ("upper_east", "UPPER EAST", "Upper East"), ("upper_west", "UPPER WEST", "Upper West")]
# Months are mapped to the two priced seasons. Lean runs June to September here (WFP's lean-season
# prices are June to August); every other month uses post-harvest prices. A planning assumption.
LEAN_MONTHS = (6, 7, 8, 9)
NUTRIENT_ADVICE = {
    "iron_mg": "iron",
    "zinc_mg": "zinc",
    "calcium_mg": "calcium",
    "vitamin_a_mcg_rae": "vitamin A",
    "vitamin_c_mg": "vitamin C",
}
# WHO/UNICEF 2021 minimum dietary diversity: 5 or more of these 8 groups in the last day.
MDD_GROUPS = [
    ("breast_milk", "Breast milk"),
    ("grains_roots", "Porridge, tuo zaafi, rice, yam, gari or other grains, roots and tubers"),
    ("pulses_nuts", "Beans, cowpea, soybean, groundnut or dawadawa"),
    ("dairy", "Milk, yoghurt or cheese"),
    ("flesh", "Meat, fish (including dried fish) or liver"),
    ("eggs", "Eggs"),
    ("vita_fruit_veg", "Dark green leaves (baobab, moringa, cowpea leaves), orange sweet potato, pawpaw or mango"),
    ("other_fruit_veg", "Other fruits or vegetables (tomato, garden egg, onion, okra)"),
]


def approved_plans(plans_path=PLANS):
    if not plans_path.exists():
        return []
    return [p for p in json.loads(plans_path.read_text(encoding="utf-8"))["plans"]
            if p.get("status") == "approved" and p["feasible"]]


def plan_note(plan):
    foods = "; ".join(f"{plan['foods'][f]} {g} g" for f, g in plan["grams_per_day"].items())
    text = f"Approved plan for today, a day's food besides breast milk: {foods}."
    if plan["problem_nutrients"]:
        missing = ", ".join(NUTRIENT_ADVICE[m] for m in plan["problem_nutrients"])
        text += (f" Local foods at current prices cannot give enough {missing}: follow the GHS "
                 "protocol for supplements or micronutrient powders.")
    return text + f" (Approved by {plan['approved_by']} on {plan['approved_on']}.)"


def build_feeding_counselling(plans_path=PLANS):
    plans = approved_plans(plans_path)
    choices = yes_no()
    choices += [{"list_name": "price_regions", "name": n, "label::en": l} for n, _, l in PRICE_REGIONS]
    choices += [{"list_name": "mdd_groups", "name": n, "label::en": l} for n, l in MDD_GROUPS]

    rows = child_inputs() + [
        row("calculate", "age_months", "NO_LABEL",
            calculation="if(${dob} != '', floor(difference-in-months(${dob}, today())), '')"),
        row("begin group", "who", "Child and place", appearance="field-list"),
        row("integer", "age_months_entered", "Child's age in months", required="yes", relevant="${dob} = ''",
            constraint=". >= 6 and . <= 23", constraint_message="Feeding plans are for children 6 to 23 months."),
        row("select_one price_regions", "price_region", "Region where the family buys food", required="yes"),
        row("end group", "who"),
        row("calculate", "r_age", "NO_LABEL", calculation="if(${age_months} != '', ${age_months}, ${age_months_entered})"),
        row("calculate", "r_age_group", "NO_LABEL",
            calculation="if(${r_age} >= 6 and ${r_age} <= 8, '6_8m', if(${r_age} >= 9 and ${r_age} <= 11, '9_11m', if(${r_age} >= 12 and ${r_age} <= 23, '12_23m', 'out_of_range')))"),
        row("calculate", "r_month", "NO_LABEL", calculation="number(format-date(today(), '%n'))"),
        row("calculate", "r_season", "NO_LABEL",
            calculation="if(" + " or ".join(f"${{r_month}} = {m}" for m in LEAN_MONTHS) + ", 'lean', 'post_harvest')"),
        row("calculate", "r_plan_id", "NO_LABEL",
            calculation="concat(${price_region}, '-', ${r_season}, '-', ${r_age_group})"),

        row("begin group", "diet", "Yesterday's food", appearance="field-list"),
        row("select_multiple mdd_groups", "mdd", "Yesterday, from morning to night, which did the child eat or drink?",
            required="yes"),
        row("end group", "diet"),
        row("calculate", "r_mdd_score", "NO_LABEL", calculation="count-selected(${mdd})"),
        row("calculate", "r_mdd_met", "NO_LABEL", calculation="if(${r_mdd_score} >= 5, 'yes', 'no')"),

        row("begin group", "advice", "Feeding advice", appearance="field-list"),
        row("note", "out_of_range", "Feeding plans are for children 6 to 23 months.",
            relevant="${r_age_group} = 'out_of_range'"),
        row("note", "mdd_note", "Food groups yesterday: ${r_mdd_score} of 8 (5 or more is the minimum)."),
    ]
    plan_ids = []
    for p in plans:
        region_key = next(n for n, admin1, _ in PRICE_REGIONS if admin1 == p["price_region"])
        pid = f"{region_key}-{p['season']}-{p['age_group']}"
        plan_ids.append(pid)
        rows.append(row("note", f"plan_{pid.replace('-', '_')}", plan_note(p), relevant=f"${{r_plan_id}} = '{pid}'"))
    no_plan = " and ".join(f"${{r_plan_id}} != '{pid}'" for pid in plan_ids) or "true()"
    rows += [
        row("note", "no_approved_plan",
            "No nutritionist-approved local-food plan for this region, season and age yet. Give the standard GHS feeding counselling.",
            relevant=f"${{r_age_group}} != 'out_of_range' and {no_plan}"),
        row("note", "refer_note", "If the child's MUAC is yellow or red, or the child is sick, use the sick child assessment.")
        ,
        row("end group", "advice"),
        row("calculate", "r_plan_shown", "NO_LABEL",
            calculation="if(" + (" or ".join(f"${{r_plan_id}} = '{pid}'" for pid in plan_ids) or "false()") + ", ${r_plan_id}, '')"),
        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__age_group", "NO_LABEL", calculation="${r_age_group}"),
        row("calculate", "__plan_shown", "NO_LABEL", calculation="${r_plan_shown}"),
        row("calculate", "__mdd_score", "NO_LABEL", calculation="${r_mdd_score}"),
        row("calculate", "__mdd_met", "NO_LABEL", calculation="${r_mdd_met}"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("feeding_counselling", "Feeding counselling", rows, choices)


def build_market_prices():
    foods = json.loads(FOODS.read_text(encoding="utf-8"))
    items = [(f["id"], f["label"]) for f in foods["foods"]]
    items += [(("unpriced_" + "".join(c if c.isalnum() else "_" for c in u["label"].lower()))[:40].strip("_"), u["label"])
              for u in foods["unpriced_foods"]]
    choices = yes_no()
    choices += [{"list_name": "price_regions", "name": n, "label::en": l} for n, _, l in PRICE_REGIONS]
    rows = [
        row("begin group", "inputs", "NO_LABEL", relevant="./source = 'user'", appearance="field-list"),
        row("hidden", "source", "Source", default="user"),
        row("end group", "inputs"),
        row("begin group", "market", "Market", appearance="field-list"),
        row("select_one price_regions", "price_region", "Region of the market", required="yes"),
        row("string", "market_name", "Market name (town)", required="yes"),
        row("note", "how_note", "For each food: buy or ask the price of an amount you can weigh, then enter the price and the weight. Leave both empty if the food is not sold today."),
        row("end group", "market"),
    ]
    for fid, label in items:
        rows += [
            row("begin group", f"p_{fid}", label, appearance="field-list"),
            row("decimal", f"{fid}_ghs", f"{label}: price paid (GHS)", constraint=". > 0 and . <= 10000",
                constraint_message="Enter a price in cedis."),
            row("integer", f"{fid}_grams", f"{label}: weight of that amount (grams)", required="yes",
                relevant=f"${{{fid}_ghs}} != ''", constraint=". >= 10 and . <= 100000",
                constraint_message="Enter the weight in grams (10 to 100,000)."),
            row("calculate", f"{fid}_ghs_per_kg", "NO_LABEL",
                calculation=f"if(${{{fid}_ghs}} != '' and ${{{fid}_grams}} > 0, round(${{{fid}_ghs}} div ${{{fid}_grams}} * 1000, 2), '')"),
            row("end group", f"p_{fid}"),
        ]
    rows += [
        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__price_region", "NO_LABEL", calculation="${price_region}"),
        row("calculate", "__market", "NO_LABEL", calculation="${market_name}"),
        *[row("calculate", f"__{fid}", "NO_LABEL", calculation=f"${{{fid}_ghs_per_kg}}") for fid, _ in items],
        row("end group", "data"),
    ]
    save("market_prices", "Market prices", rows, choices)


if __name__ == "__main__":
    build_feeding_counselling()
    build_market_prices()
