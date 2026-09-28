"""Adds a PILOT warning to the first page of every form whose module has no clinical sign-off in
clinical_signoff.json (repo root). Used by every form generator through add_pilot_banner()."""
import json
from pathlib import Path

SIGNOFF = Path(__file__).resolve().parents[2] / "clinical_signoff.json"
SKIP_GROUPS = {"inputs", "contact", "parent"}
BANNER = ("PILOT BUILD - NOT FOR PATIENT CARE. This module's clinical content has not yet been approved "
          "by a GHS clinical advisor. Use only for training and testing.")


def is_clinical(form_id, path=SIGNOFF):
    return form_id in json.loads(path.read_text(encoding="utf-8"))["forms"]


def module_approved(form_id, path=SIGNOFF):
    data = json.loads(path.read_text(encoding="utf-8"))
    module = data["forms"].get(form_id)
    if module is None:
        raise SystemExit(f"{form_id} is not listed in clinical_signoff.json 'forms'")
    entry = data["modules"][module]
    return bool(entry["approved"] and entry["by"] and entry["on"])


def add_pilot_banner(form_id, rows, make_note, path=SIGNOFF):
    """rows: survey rows as lists (type, name, ...). make_note(name, label) builds a note row.
    Inserts the banner as the first question of the first visible page, unless signed off."""
    if module_approved(form_id, path):
        return rows
    depth_skip = 0
    for i, r in enumerate(rows):
        kind, name = r[0], r[1]
        if kind == "begin group" and name in SKIP_GROUPS:
            depth_skip += 1
        elif kind == "end group" and name in SKIP_GROUPS:
            depth_skip -= 1
        elif kind == "begin group" and depth_skip == 0:
            return rows[:i + 1] + [make_note("pilot_warning", BANNER)] + rows[i + 1:]
    raise SystemExit(f"{form_id}: no visible page to put the pilot warning on")
