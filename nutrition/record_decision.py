"""Records the nutritionist's decision on one feeding plan in an append-only log.

Decisions go in plans/decisions.json, separate from plans.json, so rebuilding the plans does not erase
them. Only an approval changes plans.json (through approve.py). Changes requested and rejections are
logged, and the plan stays a draft.

Usage:
  python record_decision.py <plan-id> approve --by "Name, role"
  python record_decision.py <plan-id> approve_with_changes --by "Name, role" --changes "Use less yam"
  python record_decision.py <plan-id> reject --by "Name, role" --changes "Reason"
  python record_decision.py --list
"""
import argparse
import json
from datetime import date
from pathlib import Path

from approve import PLANS, approve

LOG = Path(__file__).resolve().parent / "plans" / "decisions.json"
DECISIONS = ("approve", "approve_with_changes", "reject")


def _load_log(log_path):
    if not log_path.exists():
        return {"decisions": []}
    return json.loads(log_path.read_text(encoding="utf-8"))


def record(plan_id, decision, by, changes="", plans_path=PLANS, log_path=LOG, today=None):
    if decision not in DECISIONS:
        raise SystemExit(f"decision must be one of {', '.join(DECISIONS)}")
    if not by or not by.strip():
        raise SystemExit("a decision needs the reviewer's name and role")
    if decision != "approve" and not changes.strip():
        raise SystemExit("changes or a reason are needed for this decision")
    if decision == "approve":
        approve(plan_id, by, plans_path, today=today)  # refuses infeasible or stale-priced plans
    log = _load_log(log_path)
    log["decisions"].append({
        "plan_id": plan_id,
        "decision": decision,
        "by": by.strip(),
        "on": (today or date.today()).isoformat(),
        "changes": changes.strip(),
    })
    log_path.write_text(json.dumps(log, indent=1, ensure_ascii=False), encoding="utf-8")
    return log["decisions"][-1]


def latest_by_plan(log_path=LOG):
    latest = {}
    for d in _load_log(log_path)["decisions"]:
        latest[d["plan_id"]] = d
    return latest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("plan_id", nargs="?")
    parser.add_argument("decision", nargs="?", choices=DECISIONS)
    parser.add_argument("--by", default="")
    parser.add_argument("--changes", default="")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()
    if args.list:
        for pid, d in latest_by_plan().items():
            print(f"{pid}: {d['decision']} by {d['by']} on {d['on']} {d['changes']}")
    else:
        if not args.plan_id or not args.decision:
            parser.error("plan_id and decision are needed")
        d = record(args.plan_id, args.decision, args.by, args.changes)
        print(f"recorded {d['decision']} for {d['plan_id']}")
