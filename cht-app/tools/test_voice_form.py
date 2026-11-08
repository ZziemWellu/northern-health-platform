import json
import subprocess
from pathlib import Path

import openpyxl

import build_voice_forms

ROOT = Path(__file__).resolve().parents[2]
FORM = ROOT / "cht-app" / "forms" / "app" / "voice_question.xlsx"


def _survey_rows():
    ws = openpyxl.load_workbook(FORM)["survey"]
    return [r for r in ws.iter_rows(values_only=True)]


def test_replies_json_matches_intents_js():
    js = subprocess.run(
        ["node", "-e", "const {REPLIES}=require('./voice/intents');console.log(JSON.stringify(REPLIES))"],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    exported = json.loads((ROOT / "voice" / "replies.json").read_text(encoding="utf-8"))["replies"]
    assert json.loads(js) == exported


def test_every_topic_has_the_english_reply_and_an_interpret_note_but_no_draft():
    rows = _survey_rows()
    for intent, _ in build_voice_forms.TOPICS:
        assert any(r[1] == f"en_{intent}" for r in rows), intent
        note = next(r for r in rows if r[1] == f"interpret_{intent}")
        assert "word for word" in note[2]
        assert "${preferred_language} != 'en'" in note[4]
    # Unchecked drafts (the first Twi wording) must never reach the form.
    assert not any(r[1] and r[1].startswith("tw_") for r in rows)
    assert not any(r[2] and "first draft" in str(r[2]) for r in rows)


def test_replies_json_holds_only_checked_translations():
    js = subprocess.run(
        ["node", "-e", "console.log(JSON.stringify(require('./voice/export_replies').exportReplies()))"],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    exported = json.loads((ROOT / "voice" / "replies.json").read_text(encoding="utf-8"))
    assert json.loads(js) == exported, "run: node voice/export_replies.js"


def test_the_form_knows_whose_question_it_is_and_her_languages():
    rows = _survey_rows()
    names = [r[1] for r in rows]
    for field in ("inputs", "_id", "preferred_language", "other_languages"):
        assert field in names, field


def test_audio_is_only_recorded_with_consent():
    rows = _survey_rows()
    audio = next(r for r in rows if r[1] == "question_audio")
    assert audio[0] == "audio"
    assert audio[4] == "${consent} = 'yes'"


def test_an_emergency_topic_tells_the_chw_to_assess_and_refer_now():
    rows = _survey_rows()
    note = next(r for r in rows if r[1] == "emergency_action")
    assert note[4] == "${topic} = 'emergency'"
    assert "Maternal danger assessment" in note[2] and "Sick child assessment" in note[2]


def test_the_pilot_warning_is_on_the_form_until_module_4_is_signed_off():
    rows = _survey_rows()
    assert any(r[1] == "pilot_warning" for r in rows)


def test_no_reply_gives_a_dose_or_diagnosis():
    rows = _survey_rows()
    for r in rows:
        if r[1] and str(r[1]).startswith(("en_", "tw_")):
            assert "dose" not in str(r[2]).lower()
            assert "diagnos" not in str(r[2]).lower()
