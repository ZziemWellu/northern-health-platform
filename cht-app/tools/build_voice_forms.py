"""Generates the voice_question form: the CHW asks the caregiver's question, records it if she agrees,
and the app shows the approved reply for the topic, offline: in English, and in the woman's own language
when a second native speaker has checked that translation (shared/languages). Unchecked drafts never
appear; instead the CHW is told to interpret the English word for word.

Why the CHW picks the topic: speech matching runs on the server (voice/respond.js with Whisper.cpp),
and the phone cannot run it offline. So the phone works without a network: the CHW chooses the
topic from the list, and the approved reply appears at once. The recording is kept for later
transcription, and only with the caregiver's consent.

The reply texts come from voice/replies.json, which voice/export_replies.js writes from voice/intents.js
and the checked translations in shared/languages/translations.

Run:  python tools/build_voice_forms.py
then: npx cht --no-check convert-app-forms -- voice_question
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # embedded Pythons don't add the script dir

from build_referral_forms import meta_rows, row, save, yes_no  # noqa: E402


def inputs_rows():
    """The woman the form is opened for, with the languages on her profile."""
    return [
        row("begin group", "inputs", "NO_LABEL", relevant="./source = 'user'", appearance="field-list"),
        row("hidden", "source", "Source", default="user"),
        row("hidden", "source_id", "Source ID"),
        row("begin group", "contact", "NO_LABEL"),
        row("string", "_id", "Whose question is this?", appearance="select-contact type-person"),
        row("hidden", "name", "Name"),
        row("hidden", "preferred_language", "Language"),
        row("hidden", "other_languages", "Other languages"),
        row("begin group", "parent", "NO_LABEL"),
        row("hidden", "_id", "Household ID"),
        row("end group", "parent"),
        row("end group", "contact"),
        row("end group", "inputs"),
    ]


def her_languages(code):
    return f"(${{preferred_language}} = '{code}' or selected(${{other_languages}}, '{code}'))"

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

    rows = inputs_rows() + [
        row("begin group", "consent_group", "Her question", appearance="field-list"),
        row("note", "consent_note", "Ask her first. Record only if she agrees. If she says no, choose the topic and go on."),
        row("select_one yes_no", "consent", "Does she agree to a short voice recording of her question?", required="yes"),
        row("audio", "question_audio", "Record her question (she speaks, you hold the phone)", required="no",
            relevant="${consent} = 'yes'"),
        row("select_one topic", "topic", "What is her question about?", required="yes"),
        row("end group", "consent_group"),
        row("begin group", "reply", "Reply to give her", appearance="field-list"),
    ]
    translations = data.get("translations", {})
    for intent, _ in TOPICS:
        reply = replies[intent]
        shown = f"${{topic}} = '{intent}'"
        rows.append(row("note", f"en_{intent}", reply["en"], relevant=shown))
        usable = sorted(code for code, t in translations.items() if intent in t)
        for code in usable:
            rows.append(row("note", f"{code}_{intent}", f"{translations[code]['_name']}: {translations[code][intent]}",
                            relevant=f"{shown} and {her_languages(code)}"))
        # No checked translation in any language she understands: say so, rather than show a draft.
        has_one = " or ".join(her_languages(c) for c in usable) or "false()"
        rows.append(row("note", f"interpret_{intent}",
                        "There is no checked translation in her language yet. Give the English reply, "
                        "interpreting it word for word. Do not add to it or change it.",
                        relevant=f"{shown} and ${{preferred_language}} != 'en' and not({has_one})"))
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
