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


def test_every_topic_has_english_and_twi_replies_on_the_form():
    rows = _survey_rows()
    for intent, _ in build_voice_forms.TOPICS:
        assert any(r[1] == f"en_{intent}" for r in rows), intent
        twi = [r for r in rows if r[1] == f"tw_{intent}"]
        assert twi and "first draft" in twi[0][2], intent


def test_audio_is_only_recorded_with_consent():
    rows = _survey_rows()
    audio = next(r for r in rows if r[1] == "question_audio")
    assert audio[0] == "audio"
    assert audio[4] == "${consent} = 'yes'"


def test_the_pilot_warning_is_on_the_form_until_module_4_is_signed_off():
    rows = _survey_rows()
    assert any(r[1] == "pilot_warning" for r in rows)


def test_no_reply_gives_a_dose_or_diagnosis():
    rows = _survey_rows()
    for r in rows:
        if r[1] and str(r[1]).startswith(("en_", "tw_")):
            assert "dose" not in str(r[2]).lower()
            assert "diagnos" not in str(r[2]).lower()
