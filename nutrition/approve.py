"""Records a nutritionist's approval of one feeding plan. Only approved plans reach the CHT app.

Usage: python approve.py <plan-id> --by "Name, role"      e.g. northern-lean-12_23m
Rebuilding plans keeps an approval only while the plan is unchanged; a changed plan returns to draft.
"""
import argparse
import json
from datetime import date
from pathlib import Path

PLANS = Path(__file__).resolve().parent / "plans" / "plans.json"


def approve(plan_id, by, plans_path=PLANS):
    data = json.loads(plans_path.read_text(encoding="utf-8"))
    plan = next((p for p in data["plans"] if p["id"] == plan_id), None)
    if plan is None:
        raise SystemExit(f"no plan with id {plan_id}")
    if not plan["feasible"]:
        raise SystemExit(f"{plan_id} is not feasible and cannot be approved")
    if not by.strip():
        raise SystemExit("an approval needs the reviewer's name")
    plan.update(status="approved", approved_by=by.strip(), approved_on=date.today().isoformat())
    plans_path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    return plan


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("plan_id")
    parser.add_argument("--by", required=True)
    args = parser.parse_args()
    approve(args.plan_id, args.by)
    print(f"approved {args.plan_id}")
