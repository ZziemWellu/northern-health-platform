import json
import re
import subprocess
import tempfile
from pathlib import Path

import build_showcase as bs

ROOT = Path(__file__).resolve().parents[1]


def _page():
    return bs.build().read_text(encoding="utf-8")


def test_the_unreviewed_banner_is_on_the_page():
    page = _page()
    assert "UNREVIEWED PROTOTYPE" in page
    assert "Not for patient care" in page


def test_no_module_shows_as_approved_while_signoff_is_empty():
    signoff = json.loads((ROOT / "clinical_signoff.json").read_text(encoding="utf-8"))
    assert all(not m["approved"] for m in signoff["modules"].values())
    assert 'class=\'st-ok\'' not in _page()
    assert _page().count("NOT APPROVED") == len(signoff["modules"])


def test_every_feeding_plan_is_labelled_draft():
    plans = json.loads((ROOT / "nutrition" / "plans" / "plans.json").read_text(encoding="utf-8"))["plans"]
    page = _page()
    assert page.count("DRAFT, not approved") == len(plans)
    assert all(p["status"] == "draft" for p in plans)


def test_every_voice_reply_is_labelled_pilot():
    replies = json.loads((ROOT / "voice" / "replies.json").read_text(encoding="utf-8"))["replies"]
    assert page_count("PILOT wording, not approved") == len(replies)


def test_the_page_javascript_parses():
    page = _page()
    script = re.search(r"<script>(.*)</script>", page, re.S).group(1)
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(script)
    result = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def page_count(text):
    return _page().count(text)
