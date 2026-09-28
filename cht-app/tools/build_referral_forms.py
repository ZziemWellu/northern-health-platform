"""Generates the Module 2 (last-mile follow-up) forms:

- forms/app/referral.xlsx: raise a tracked referral: why, where to (region -> district -> facility,
  from data/northern_facilities.csv), who was present, consent to call the household's decider,
  and a short referral code the receiving facility can confirm.
- forms/app/referral_follow_up.xlsx: did she arrive? If not, why not (feeds Module 6), and does she
  still need care (keeps the loop open).

Deadlines are in days because CHT tasks are scheduled by day. For an emergency the form tells the
nurse to confirm arrival the same day; the task is the safety net the next morning.

Run:  python tools/build_referral_forms.py
then: npx cht --no-check convert-app-forms -- referral referral_follow_up
"""
import csv
import sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from signoff import add_pilot_banner, is_clinical  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FORMS = ROOT / "forms" / "app"
FACILITIES = ROOT / "data" / "northern_facilities.csv"
VERSION = "2026092801"

HEADERS = ["type", "name", "label::en", "required", "relevant", "appearance", "constraint",
           "constraint_message::en", "calculation", "default", "choice_filter"]

REASONS = [
    ("convulsions", "Convulsions (fits)"),
    ("severe_hypertension", "Severe high blood pressure"),
    ("pre_eclampsia_signs", "Signs of pre-eclampsia"),
    ("haemorrhage_after_birth", "Heavy bleeding after birth"),
    ("bleeding_in_pregnancy", "Bleeding in pregnancy"),
    ("sepsis_signs", "Fever with foul discharge (possible sepsis)"),
    ("prolonged_labour", "Prolonged labour"),
    ("fever", "Fever"),
    ("newborn_danger_sign", "Newborn danger sign"),
    ("other", "Other reason"),
]

NOT_ARRIVED_REASONS = [
    ("no_transport", "No transport"),
    ("no_money", "No money for transport or care"),
    ("family_did_not_agree", "Husband or family did not agree"),
    ("felt_better", "She felt better"),
    ("too_far", "Facility too far"),
    ("fear_or_distrust", "Afraid of or distrusts the facility"),
    ("other", "Other"),
]


def row(type_, name, label="", required="", relevant="", appearance="", constraint="",
        constraint_message="", calculation="", default="", choice_filter=""):
    return [type_, name, label, required, relevant, appearance, constraint, constraint_message,
            calculation, default, choice_filter]


def contact_inputs(extra_hidden):
    rows = [
        row("begin group", "inputs", "NO_LABEL", relevant="./source = 'user'", appearance="field-list"),
        row("hidden", "source", "Source", default="user"),
        row("hidden", "source_id", "Source ID"),
    ]
    rows += [row("hidden", name, label) for name, label in extra_hidden]
    rows += [
        row("begin group", "contact", "NO_LABEL"),
        row("string", "_id", "Which woman or baby is this for?", appearance="select-contact type-person"),
        row("hidden", "name", "Name"),
        row("hidden", "patient_id", "Patient ID"),
        row("begin group", "parent", "NO_LABEL"),
        row("hidden", "_id", "Household ID"),
        row("end group", "parent"),
        row("end group", "contact"),
        row("end group", "inputs"),
        row("calculate", "patient_uuid", "NO_LABEL", calculation="../inputs/contact/_id"),
        row("calculate", "patient_name", "NO_LABEL", calculation="../inputs/contact/name"),
    ]
    return rows


def meta_rows():
    return [
        row("begin group", "meta", "NO_LABEL"),
        row("calculate", "__patient_uuid", "NO_LABEL", calculation="../../../inputs/contact/_id"),
        row("calculate", "__household_uuid", "NO_LABEL", calculation="../../../inputs/contact/parent/_id"),
        row("calculate", "__source", "NO_LABEL", calculation="../../../inputs/source"),
        row("calculate", "__source_id", "NO_LABEL", calculation="../../../inputs/source_id"),
        row("end group", "meta"),
    ]


def save(name, title, rows, choices):
    if is_clinical(name):
        rows = add_pilot_banner(name, rows, lambda n, label: row("note", n, label))
    wb = openpyxl.Workbook()
    survey = wb.active
    survey.title = "survey"
    survey.append(HEADERS)
    for r in rows:
        survey.append(r)
    sheet = wb.create_sheet("choices")
    extra = sorted({k for c in choices for k in c if k not in ("list_name", "name", "label::en")})
    sheet.append(["list_name", "name", "label::en", *extra])
    for c in choices:
        sheet.append([c["list_name"], c["name"], c["label::en"], *[c.get(k, "") for k in extra]])
    settings = wb.create_sheet("settings")
    settings.append(["form_title", "form_id", "version", "style", "path", "default_language"])
    settings.append([title, name, VERSION, "pages", "data", "en"])
    path = FORMS / f"{name}.xlsx"
    wb.save(path)
    print(f"wrote {path}")


def yes_no():
    return [{"list_name": "yes_no", "name": "yes", "label::en": "Yes"},
            {"list_name": "yes_no", "name": "no", "label::en": "No"}]


def facility_choices():
    """Region -> district -> facility cascading choice lists (shared with the birth plan form)."""
    facilities = list(csv.DictReader(FACILITIES.open(encoding="utf-8")))
    district_key = lambda f: "".join(c if c.isalnum() else "_" for c in f["district"].lower())
    choices = []
    for region in sorted({f["region"] for f in facilities}):
        choices.append({"list_name": "regions", "name": region.lower().replace(" ", "_"), "label::en": region})
    for key, (district, region) in sorted({district_key(f): (f["district"], f["region"]) for f in facilities}.items()):
        choices.append({"list_name": "districts", "name": key, "label::en": district,
                        "region": region.lower().replace(" ", "_")})
    for f in facilities:
        choices.append({"list_name": "facilities", "name": f["id"], "label::en": f"{f['name']} ({f['type']})",
                        "district": district_key(f), "region": f["region"].lower().replace(" ", "_"),
                        "level": f["level"]})
    choices.append({"list_name": "facilities", "name": "other", "label::en": "Another facility (type its name)",
                    "district": "any", "region": "any", "level": "0"})
    return choices


def facility_picker(prefix, question):
    """Survey rows for picking a facility; the chosen name ends up in ${<prefix>_name}."""
    return [
        row("select_one regions", f"{prefix}_region", "Region of the facility", required="yes"),
        row("select_one districts", f"{prefix}_district", "District", required="yes", choice_filter=f"region=${{{prefix}_region}}"),
        row("select_one facilities", f"{prefix}_facility", question, required="yes",
            choice_filter=f"district=${{{prefix}_district}} or district='any'"),
        row("string", f"{prefix}_other_name", "Name of the facility", required="yes",
            relevant=f"${{{prefix}_facility}} = 'other'"),
        row("calculate", f"{prefix}_name", "NO_LABEL",
            calculation=f"if(${{{prefix}_facility}} = 'other', ${{{prefix}_other_name}}, jr:choice-name(${{{prefix}_facility}}, '${{{prefix}_facility}}'))"),
    ]


def build_referral():
    choices = yes_no()
    choices += [{"list_name": "severities", "name": n, "label::en": l} for n, l in [
        ("emergency", "Emergency: go now"), ("urgent", "Urgent: go today"), ("routine", "Routine: go within a week")]]
    choices += [{"list_name": "reasons", "name": n, "label::en": l} for n, l in REASONS]
    choices += [{"list_name": "present", "name": n, "label::en": l} for n, l in [
        ("husband", "Husband or partner"), ("mother_in_law", "Mother-in-law"),
        ("other_family", "Other family member"), ("none", "No one else")]]
    choices += facility_choices()

    rows = contact_inputs([("source_reasons", "Reasons from the assessment"),
                           ("source_severity", "Severity from the assessment")])
    rows += [
        row("begin group", "why", "Why refer", appearance="field-list"),
        row("select_one severities", "severity", "How urgent is this referral?", required="yes"),
        row("note", "reasons_from_assessment", "Reasons from the danger assessment: ${source_reasons}",
            relevant="${source_reasons} != ''"),
        row("select_multiple reasons", "reasons", "Why is she being referred?", required="yes",
            relevant="${source_reasons} = ''"),
        row("string", "other_reason", "Describe the reason", required="yes",
            relevant="selected(${reasons}, 'other')"),
        row("end group", "why"),

        # An emergency goes to a hospital: many northern districts have none, so an emergency lists
        # the region's hospitals (levels 1-3: teaching, regional, district, municipal, other hospital)
        # instead of the district's clinics. Urgent and routine referrals use the district list.
        row("begin group", "destination", "Where to", appearance="field-list"),
        row("select_one regions", "dest_region", "Region of the receiving facility", required="yes"),
        row("note", "emergency_hospitals_note",
            "Emergency: only hospitals in this region are listed. Choose a clinic or health centre only through 'Another facility', and only if it can manage this emergency.",
            relevant="${r_severity} = 'emergency'"),
        row("select_one districts", "dest_district", "District", required="yes", choice_filter="region=${dest_region}",
            relevant="${r_severity} != 'emergency'"),
        row("select_one facilities", "dest_facility", "Receiving facility", required="yes",
            choice_filter="(${r_severity} = 'emergency' and region=${dest_region} and level <= 3) or "
                          "(${r_severity} != 'emergency' and district=${dest_district}) or district='any'"),
        row("string", "dest_other_name", "Name of the facility", required="yes",
            relevant="${dest_facility} = 'other'"),
        row("end group", "destination"),

        row("begin group", "people", "Who was there", appearance="field-list"),
        row("select_multiple present", "present", "Who else was present when you advised the referral?", required="yes",
            constraint="not(selected(., 'none') and count-selected(.) > 1)",
            constraint_message="'No one else' cannot be combined with other answers."),
        row("select_one yes_no", "decider_present", "Was the person who decides on money and transport present?", required="yes"),
        row("select_one yes_no", "consent_call_decider",
            "Does she agree that we call that person to explain why she must go? (Only if she says yes.)",
            required="yes", relevant="${decider_present} = 'no'"),
        row("string", "decider_phone", "That person's phone number", required="yes",
            relevant="${consent_call_decider} = 'yes'",
            constraint="regex(., '^0[0-9]{9}$')", constraint_message="Enter a 10-digit Ghana number starting with 0."),
        row("end group", "people"),

        row("calculate", "referral_code", "NO_LABEL", calculation="once(concat('R', substr(uuid(), 0, 6)))"),
        row("calculate", "r_severity", "NO_LABEL",
            calculation="if(${source_severity} = 'emergency' and ${severity} != 'emergency', 'emergency', ${severity})"),
        row("calculate", "r_reasons", "NO_LABEL",
            calculation="if(${source_reasons} != '', ${source_reasons}, ${reasons})"),
        row("calculate", "r_deadline_days", "NO_LABEL",
            calculation="if(${r_severity} = 'emergency', 1, if(${r_severity} = 'urgent', 2, 7))"),
        row("calculate", "r_destination_name", "NO_LABEL",
            calculation="if(${dest_facility} = 'other', ${dest_other_name}, jr:choice-name(${dest_facility}, '${dest_facility}'))"),
        row("calculate", "t_referral_follow_up", "NO_LABEL", calculation="'yes'"),

        row("begin group", "summary", "Referral", appearance="field-list"),
        row("note", "code_note", "Referral code: ${referral_code}. Write it on her referral slip and give it to the receiving facility."),
        row("note", "destination_note", "Destination: ${r_destination_name}"),
        row("note", "emergency_note", "EMERGENCY: call the facility or her family today to confirm she arrived.",
            relevant="${r_severity} = 'emergency'"),
        row("note", "deadline_note", "Arrival must be confirmed within ${r_deadline_days} day(s). A follow-up task will remind you."),
        row("note", "decider_note", "The decider was not present and she did not agree to a call. Encourage her to take this slip home and talk it through tonight.",
            relevant="${decider_present} = 'no' and ${consent_call_decider} = 'no'"),
        row("end group", "summary"),

        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__referral_code", "NO_LABEL", calculation="${referral_code}"),
        row("calculate", "__severity", "NO_LABEL", calculation="${r_severity}"),
        row("calculate", "__reasons", "NO_LABEL", calculation="${r_reasons}"),
        row("calculate", "__destination_id", "NO_LABEL", calculation="${dest_facility}"),
        row("calculate", "__destination_name", "NO_LABEL", calculation="${r_destination_name}"),
        row("calculate", "__deadline_days", "NO_LABEL", calculation="${r_deadline_days}"),
        row("calculate", "__decider_present", "NO_LABEL", calculation="${decider_present}"),
        row("calculate", "__consent_call_decider", "NO_LABEL", calculation="${consent_call_decider}"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("referral", "Referral", rows, choices)


def build_follow_up():
    choices = yes_no()
    choices += [{"list_name": "arrival", "name": n, "label::en": l} for n, l in [
        ("yes", "Yes, she arrived"), ("not_yet", "Not yet, but she is still going"),
        ("no", "No, she did not go"), ("unknown", "Could not find out")]]
    choices += [{"list_name": "confirmers", "name": n, "label::en": l} for n, l in [
        ("facility", "The facility confirmed (call, SMS or code)"), ("family", "She or her family told me"),
        ("seen", "I saw her at the facility")]]
    choices += [{"list_name": "outcomes", "name": n, "label::en": l} for n, l in [
        ("treated_home", "Treated and back home"), ("admitted", "Admitted"),
        ("referred_on", "Referred on to another facility"), ("died", "Died"), ("unknown", "Not known yet")]]
    choices += [{"list_name": "not_arrived", "name": n, "label::en": l} for n, l in NOT_ARRIVED_REASONS]

    rows = contact_inputs([("referral_uuid", "Referral report ID"), ("referral_code", "Referral code"),
                           ("destination_name", "Destination")])
    rows += [
        row("begin group", "arrival", "Did she arrive?", appearance="field-list"),
        row("note", "referral_note", "Referral ${referral_code} to ${destination_name}",
            relevant="../../inputs/referral_code != ''"),
        row("select_one arrival", "arrived", "Did she reach the facility?", required="yes"),
        row("select_one confirmers", "confirmed_by", "How do you know?", required="yes", relevant="${arrived} = 'yes'"),
        row("select_one outcomes", "outcome", "What happened there?", required="yes", relevant="${arrived} = 'yes'"),
        row("select_multiple not_arrived", "not_arrived_reasons", "Why did she not go?", required="yes",
            relevant="${arrived} = 'no'"),
        row("select_one yes_no", "still_needs_care", "Does she still need to be seen?", required="yes",
            relevant="${arrived} = 'no' or ${arrived} = 'unknown'"),
        row("end group", "arrival"),
        row("calculate", "r_loop_open", "NO_LABEL",
            calculation="if(${arrived} = 'not_yet' or ${still_needs_care} = 'yes', 'yes', 'no')"),
        row("calculate", "t_referral_follow_up", "NO_LABEL", calculation="${r_loop_open}"),
        row("begin group", "summary", "Next step", appearance="field-list"),
        row("note", "closed_note", "Referral closed.", relevant="${r_loop_open} = 'no'"),
        row("note", "open_note", "Referral still open. You will be reminded tomorrow. Consider the barriers she named: transport, money or family.",
            relevant="${r_loop_open} = 'yes'"),
        row("end group", "summary"),
        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__referral_uuid", "NO_LABEL", calculation="../../inputs/referral_uuid"),
        row("calculate", "__arrived", "NO_LABEL", calculation="${arrived}"),
        row("calculate", "__outcome", "NO_LABEL", calculation="${outcome}"),
        row("calculate", "__not_arrived_reasons", "NO_LABEL", calculation="${not_arrived_reasons}"),
        row("calculate", "__loop_open", "NO_LABEL", calculation="${r_loop_open}"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("referral_follow_up", "Referral follow-up", rows, choices)


PROPERTIES = {
    # A referral can be raised from anyone's profile (woman or child), not only from a task.
    "referral": {"icon": "icon-follow-up", "title": "Referral", "context": {
        "person": True, "place": False,
        "expression": "contact.type === 'person' && summary.alive && user._id != contact._id"}},
    # A follow-up only makes sense for a specific referral, so it opens only from its task.
    "referral_follow_up": {"icon": "icon-follow-up", "title": "Referral follow-up",
                           "context": {"person": False, "place": False}},
}


def write_properties():
    import json
    for name, props in PROPERTIES.items():
        text = json.dumps(props, indent=4)
        (FORMS / f"{name}.properties.json").write_text(text + chr(10), encoding="utf-8")


if __name__ == "__main__":
    build_referral()
    build_follow_up()
    write_properties()
