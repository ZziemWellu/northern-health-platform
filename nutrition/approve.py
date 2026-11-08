"""Records a nutritionist's approval of one feeding plan. Only approved plans reach the CHT app.

Usage: python approve.py <plan-id> --by "Name, role"      e.g. northern-lean-12_23m
Rebuilding plans keeps an approval only while the plan is unchanged; a changed plan returns to draft.

The roadmap gate: a plan can only be approved on prices no older than MAX_PRICE_AGE_DAYS. Every WFP
price ends in July 2023, so in practice a plan needs prices collected by volunteers
(data/local_prices.csv, from the CHT market-price form) before it can be approved. A family must not
be told to buy foods at prices that are years out of date.
"""
import argparse
import json
from datetime import date
from pathlib import Path

PLANS = Path(__file__).resolve().parent / "plans" / "plans.json"
MAX_PRICE_AGE_DAYS = 92  # three months


def approve(plan_id, by, plans_path=PLANS, today=None):
    today = today or date.today()
    data = json.loads(plans_path.read_text(encoding="utf-8"))
    plan = next((p for p in data["plans"] if p["id"] == plan_id), None)
    if plan is None:
        raise SystemExit(f"no plan with id {plan_id}")
    if not plan["feasible"]:
        raise SystemExit(f"{plan_id} is not feasible and cannot be approved")
    if not by or not by.strip():
        raise SystemExit("an approval needs the reviewer's name")
    oldest = plan.get("oldest_price_date")
    if not oldest:
        raise SystemExit(f"{plan_id} has no price date; rebuild the plans with build_plans.py")
    age = (today - date.fromisoformat(oldest)).days
    if age > MAX_PRICE_AGE_DAYS:
        raise SystemExit(
            f"{plan_id} uses prices from {oldest} ({age} days old; the limit is {MAX_PRICE_AGE_DAYS}). "
            "Collect local prices with the market-price form, rebuild, then approve.")
    plan.update(status="approved", approved_by=by.strip(), approved_on=today.isoformat())
    plans_path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    return plan


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("plan_id")
    parser.add_argument("--by", required=True)
    args = parser.parse_args()
    approve(args.plan_id, args.by)
    print(f"approved {args.plan_id}")
