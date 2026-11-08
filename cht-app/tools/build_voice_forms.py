"""Generates the voice_question form: the CHW asks the caregiver's question, records it if she agrees,
and the app shows the approved reply for the topic, offline, in English and Twi.

Why the CHW picks the topic: speech matching runs on the server (voice/respond.js with Whisper.cpp),
and the phone cannot run it offline. So the phone works without a network: the CHW chooses the
topic from the list, and the approved reply appears at once. The recording is kept for later
transcription, and only with the caregiver's consent.

The reply texts come from voice/replies.json, which is exported from voice/intents.js. Twi wording is a
first draft and is marked as such until a Twi speaker from the district checks it.

Run:  python tools/build_voice_forms.py
then: npx cht --no-check convert-app-forms -- voice_question
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # embedded Pythons don't add the script dir

from build_referral_forms import meta_rows, row, save, yes_no  # noqa: E402

REPLIES_PATH = Path(__file__).resolve().parents[2] / "voice" / "replies.json"

TOPICS = [
    ("emergency", "Danger sign or emergency"),
    ("visit_date", "When to come to the clinic"),
    ("transport", "Getting to the facility"),
    ("feeding", "Feeding her baby"),
    ("unknown", "Something else"),
]


def build_voice_question():
    data = json.loads(REPLIES_PATH.read_text(encoding="utf-8"))
    replies = data["replies"]

    choices = yes_no()
    choices += [{"list_name": "topic", "name": n, "label::en": l} for n, l in TOPICS]

    rows = [
        row("begin group", "consent_group", "Her question", appearance="field-list"),
        row("note", "consent_note", "Ask her first. Record only if she agrees. If she says no, choose the topic and go on."),
        row("select_one yes_no", "consent", "Does she agree to a short voice recording of her question?", required="yes"),
        row("audio", "question_audio", "Record her question (she speaks, you hold the phone)", required="no",
            relevant="${consent} = 'yes'"),
        row("select_one topic", "topic", "What is her question about?", required="yes"),
        row("end group", "consent_group"),
        row("begin group", "reply", "Reply to give her", appearance="field-list"),
    ]
    for intent, _ in TOPICS:
        reply = replies[intent]
        rows.append(row("note", f"en_{intent}", reply["en"], relevant=f"${{topic}} = '{intent}'"))
        rows.append(row("note", f"tw_{intent}",
                        "Twi (first draft, not yet checked by a Twi speaker): " + reply["tw"],
                        relevant=f"${{topic}} = '{intent}'"))
    rows += [
        # The reply tells the caregiver to go now; the CHW must also act. Without this, choosing
        # "emergency" showed a reply and created nothing for the CHW to do.
        row("note", "emergency_action",
            "Danger sign: after giving the reply, do the Maternal danger assessment for her now "
            "(or the Sick child assessment for a child), and refer as it says.",
            relevant="${topic} = 'emergency'"),
        row("note", "pilot_reply_note", "These replies are PILOT wording. Give only what is written here. "
            "Do not add advice, doses or diagnoses."),
        row("end group", "reply"),
        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__topic", "NO_LABEL", calculation="${topic}"),
        row("calculate", "__has_audio", "NO_LABEL", calculation="if(${question_audio} != '', 'yes', 'no')"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("voice_question", "Caregiver question (voice)", rows, choices)


PROPERTIES = {
    "icon": "icon-pregnancy",
    "title": "Caregiver question (voice)",
    "context": {
        "person": True,
        "place": False,
        # Same women-of-reproductive-age context as barrier_screen; caregivers of young children are mostly women.
        "expression": "contact.type === 'person' && summary.alive && !summary.muted && (!contact.sex || contact.sex === 'female') && (!contact.date_of_birth || (ageInYears(contact) >= 10 && ageInYears(contact) <= 55)) && user._id != contact._id",
    },
}


def write_properties():
    text = json.dumps(PROPERTIES, indent=4)
    (Path(__file__).resolve().parents[1] / "forms" / "app" / "voice_question.properties.json").write_text(
        text + "\n", encoding="utf-8")


if __name__ == "__main__":
    build_voice_question()
    write_properties()
