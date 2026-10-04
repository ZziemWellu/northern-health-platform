"""Writes the nutritionist's review pack: one section per feeding plan, each with a decision block.

The pack is a DRAFT for the reviewer. Nothing in it is approved by the person who wrote it. The
reviewer records one decision per plan with record_decision.py (approve, approve with changes, or
reject). Drafted referral and supplementation wording is labelled as a draft to be confirmed against
the current GHS protocol; it names no product, dose or frequency.

Usage: python review_pack.py      writes plans/REVIEW_PACK.md
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLANS = HERE / "plans" / "plans.json"
PACK = HERE / "plans" / "REVIEW_PACK.md"

NUTRIENT_NAMES = {
    "iron_mg": "Iron",
    "zinc_mg": "Zinc",
    "calcium_mg": "Calcium",
    "vitamin_a_mcg_rae": "Vitamin A",
    "vitamin_c_mg": "Vitamin C",
}

# Drafted wording for the family and the CHW, for each problem nutrient. Each line is a DRAFT.
# No product, dose, or frequency: those come from the GHS protocol, chosen by the reviewer.
REFERRAL_DRAFT = {
    "iron_mg": "Iron: local foods at these prices cannot give enough iron. Refer the child to the health facility for the GHS protocol on iron supplements or micronutrient powders.",
    "zinc_mg": "Zinc: local foods at these prices cannot give enough zinc. Refer the child to the health facility for the GHS protocol on zinc or micronutrient powders.",
    "calcium_mg": "Calcium: local foods at these prices cannot give enough calcium. Ask the facility nutrition officer what to add (for example leafy greens or dairy, where the family can get them).",
    "vitamin_a_mcg_rae": "Vitamin A: local foods at these prices cannot give enough vitamin A. Ask the facility nutrition officer about vitamin A rich foods the family can grow or buy, and about the GHS vitamin A protocol.",
    "vitamin_c_mg": "Vitamin C: the plan falls short on vitamin C. Ask the CHW for fruit or leaves the family can add.",
}

REVIEW_QUESTIONS = [
    "Is the energy target right for this age group (200, 300 or 550 kcal from complementary food)?",
    "Are the portions (grams per day) realistic for a child at this age, and for a family to prepare?",
    "Is the list of excluded foods right, and do the reasons still hold? (Prices were not consistent or data was unreliable.)",
    "Is the referral and supplementation wording correct under the current GHS protocol? Which product and route should the CHW name?",
    "Is the price region and season split right for this plan (for example, Savannah and North East use Northern prices)?",
]


def _pct(v):
    return f"{round(v * 100)}%"


def plan_section(plan):
    lines = [f"## {plan['id']}", "", "**Status: DRAFT. Not approved.**", "",
             f"{plan['age_label']}, {plan['season_label']}, {plan['price_region'].title()} "
             f"({', '.join(plan['regions'])})",
             f"Energy {plan['energy_kcal']} of {plan['energy_target_kcal']} kcal; cost GHS {plan['cost_ghs_per_day']:.2f} per day.",
             "", "Foods per day (besides breast milk):", ""]
    for f, g in plan["grams_per_day"].items():
        lines.append(f"- {plan['foods'][f]}: {g} g")
    lines += ["", "| Nutrient | % of daily need from these foods |", "| --- | --- |"]
    for key, name in NUTRIENT_NAMES.items():
        if key in plan["adequacy"]:
            flag = " (problem)" if key in plan["problem_nutrients"] else ""
            lines.append(f"| {name} | {_pct(plan['adequacy'][key])}{flag} |")
    if plan["problem_nutrients"]:
        lines += ["", "**Drafted wording for problem nutrients (to confirm or change):**", ""]
        for key in plan["problem_nutrients"]:
            if key in REFERRAL_DRAFT:
                lines.append(f"- {REFERRAL_DRAFT[key]}")
    lines += ["", "**Reviewer decision** (the reviewer fills this in; the drafter does not):", "",
              "- [ ] Approve as drafted",
              "- [ ] Approve with changes (list them below)",
              "- [ ] Reject (give the reason below)",
              "", "Changes or reason:", "", "_______________________________________________",
              "", "Reviewer name and role: ______________________  Date: ____________", ""]
    return lines


def build_pack(plans_path=PLANS):
    data = json.loads(plans_path.read_text(encoding="utf-8"))
    plans = data["plans"]
    out = [
        "# Feeding plans for the nutritionist's review",
        "",
        "Written for: the nutritionist or dietitian reviewing the plans, and the Regional Director of Health.",
        "",
        "Nothing in this pack is approved. Each plan is a draft until the reviewer records a decision with "
        "`record_decision.py`. The CHT app shows only approved plans.",
        "",
        f"Plans in this pack: {len(plans)}. Status now: {sum(p['status'] == 'approved' for p in plans)} approved.",
        "",
        "## Questions for the reviewer", "",
    ]
    out += [f"{i}. {q}" for i, q in enumerate(REVIEW_QUESTIONS, 1)]
    out += ["", "## Decision guide", "",
            "- **Approve as drafted**: the plan is right for families in this region, season and age group.",
            "- **Approve with changes**: write the change. The plan stays a draft until the changed plan is rebuilt and approved again.",
            "- **Reject**: the plan must not reach families. The app will keep giving standard GHS counselling for it.", ""]
    for plan in plans:
        out += plan_section(plan)
    return "\n".join(out)


if __name__ == "__main__":
    PACK.write_text(build_pack(), encoding="utf-8")
    print(f"wrote {PACK}")
