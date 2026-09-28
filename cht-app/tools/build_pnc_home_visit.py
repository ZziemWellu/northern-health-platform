"""Generates forms/app/pnc_home_visit.xlsx (Module 1: routine newborn home visit, day 1/3/7).

The XLSForm is generated from this script so the form is reviewable as code and reproducible.
Run:  python tools/build_pnc_home_visit.py   then   npx cht --no-check convert-app-forms -- pnc_home_visit

CLINICAL SIGN-OFF REQUIRED: the danger-sign lists mirror the reference CHT delivery and PNC forms
(themselves WHO-based). They must be replaced or confirmed against GHS's national postnatal protocol
by the project's clinical advisor before any field use.
"""
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / "forms" / "app" / "pnc_home_visit.xlsx"

BABY_SIGNS = [
    ("convulsion", "Convulsions"),
    ("difficulty_feeding", "Not feeding well or unable to feed"),
    ("fever", "Fever (feels hot)"),
    ("blue_skin", "Feels cold or blue skin"),
    ("drowsy", "Drowsy, unconscious, or moves only when stimulated"),
    ("stiff", "Body stiffness"),
    ("vomit", "Vomits everything"),
    ("yellow_skin", "Yellow skin, especially palms or soles"),
    ("infected_umbilical_cord", "Umbilical cord red, swollen or with pus"),
]

MOTHER_SIGNS = [
    ("vaginal_bleeding", "Heavy vaginal bleeding"),
    ("fever", "Fever"),
    ("severe_headache", "Severe headache or blurred vision"),
    ("convulsion", "Convulsions"),
    ("vaginal_discharge", "Foul-smelling vaginal discharge"),
]

SURVEY_HEADERS = ["type", "name", "label::en", "required", "relevant", "appearance", "calculation", "default"]


def any_yes(prefix, signs):
    return " or ".join(f"selected({prefix}{name}, 'yes')" for name, _ in signs)


def build():
    rows = [
        ["begin group", "inputs", "NO_LABEL", "", "./source = 'user'", "field-list", "", ""],
        ["hidden", "source", "Source", "", "", "", "", "user"],
        ["hidden", "source_id", "Source ID", "", "", "", "", ""],
        ["hidden", "delivery_uuid", "Delivery Report ID", "", "", "", "", ""],
        ["begin group", "contact", "NO_LABEL", "", "", "", "", ""],
        ["string", "_id", "Which mother is this visit for?", "", "", "select-contact type-person", "", ""],
        ["hidden", "name", "Name", "", "", "", "", ""],
        ["hidden", "patient_id", "Patient ID", "", "", "", "", ""],
        ["begin group", "parent", "NO_LABEL", "", "", "", "", ""],
        ["hidden", "_id", "Household ID", "", "", "", "", ""],
        ["end group", "parent", "", "", "", "", "", ""],
        ["end group", "contact", "", "", "", "", "", ""],
        ["end group", "inputs", "", "", "", "", "", ""],
        ["calculate", "patient_uuid", "NO_LABEL", "", "", "", "../inputs/contact/_id", ""],
        ["calculate", "patient_id", "NO_LABEL", "", "", "", "../inputs/contact/patient_id", ""],
        ["calculate", "patient_name", "NO_LABEL", "", "", "", "../inputs/contact/name", ""],
        # Newborn
        ["begin group", "newborn", "Newborn check", "", "", "field-list", "", ""],
        ["select_one yes_no", "baby_seen", "Did you see and examine the baby today?", "yes", "", "", "", ""],
        ["note", "baby_signs_note", "Check the baby for each of these danger signs.", "", "${baby_seen} = 'yes'", "", "", ""],
    ]
    for name, label in BABY_SIGNS:
        rows.append(["select_one yes_no", name, label, "yes", "${baby_seen} = 'yes'", "", "", ""])
    rows += [
        ["select_one yes_no", "breastfeeding_only", "Is the baby fed only breast milk?", "yes", "${baby_seen} = 'yes'", "", "", ""],
        ["calculate", "r_baby_danger", "NO_LABEL", "", "", "",
         f"if({any_yes('../', BABY_SIGNS)}, 'yes', 'no')", ""],
        ["end group", "newborn", "", "", "", "", "", ""],
        # Mother
        ["begin group", "mother", "Mother check", "", "", "field-list", "", ""],
    ]
    for name, label in MOTHER_SIGNS:
        rows.append(["select_one yes_no", name, label, "yes", "", "", "", ""])
    rows += [
        ["calculate", "r_mother_danger", "NO_LABEL", "", "", "",
         f"if({any_yes('../', MOTHER_SIGNS)}, 'yes', 'no')", ""],
        ["end group", "mother", "", "", "", "", "", ""],
        # Summary
        ["begin group", "summary", "Summary", "", "", "field-list", "", ""],
        ["note", "refer_baby", "REFER THE BABY NOW. A newborn danger sign is present. Help the family go to the nearest facility today.",
         "", "${r_baby_danger} = 'yes'", "", "", ""],
        ["note", "refer_mother", "REFER THE MOTHER NOW. A postnatal danger sign is present.",
         "", "${r_mother_danger} = 'yes'", "", "", ""],
        ["note", "not_seen", "The baby was not seen. A follow-up visit is scheduled for tomorrow.",
         "", "${baby_seen} = 'no'", "", "", ""],
        ["note", "all_well", "No danger signs found. Remind the family of the danger signs and when to come back.",
         "", "${baby_seen} = 'yes' and ${r_baby_danger} = 'no' and ${r_mother_danger} = 'no'", "", "", ""],
        ["end group", "summary", "", "", "", "", "", ""],
        # Task triggers: a danger sign, or a baby not seen, brings the nurse back tomorrow (tasks.js).
        ["calculate", "t_newborn_danger_follow_up", "NO_LABEL", "", "", "",
         "if(${r_baby_danger} = 'yes' or ${r_mother_danger} = 'yes' or ${baby_seen} = 'no', 'yes', 'no')", ""],
        ["begin group", "data", "NO_LABEL", "", "", "hidden", "", ""],
        ["calculate", "__baby_seen", "NO_LABEL", "", "", "", "${baby_seen}", ""],
        ["calculate", "__baby_danger_sign", "NO_LABEL", "", "", "", "${r_baby_danger}", ""],
        ["calculate", "__mother_danger_sign", "NO_LABEL", "", "", "", "${r_mother_danger}", ""],
        ["calculate", "__breastfeeding_only", "NO_LABEL", "", "", "", "${breastfeeding_only}", ""],
        ["begin group", "meta", "NO_LABEL", "", "", "", "", ""],
        ["calculate", "__patient_uuid", "NO_LABEL", "", "", "", "../../../inputs/contact/_id", ""],
        ["calculate", "__household_uuid", "NO_LABEL", "", "", "", "../../../inputs/contact/parent/_id", ""],
        ["calculate", "__source", "NO_LABEL", "", "", "", "../../../inputs/source", ""],
        ["calculate", "__delivery_uuid", "NO_LABEL", "", "", "", "../../../inputs/delivery_uuid", ""],
        ["end group", "meta", "", "", "", "", "", ""],
        ["end group", "data", "", "", "", "", "", ""],
    ]

    wb = openpyxl.Workbook()
    survey = wb.active
    survey.title = "survey"
    survey.append(SURVEY_HEADERS)
    for row in rows:
        survey.append(row)

    choices = wb.create_sheet("choices")
    choices.append(["list_name", "name", "label::en"])
    choices.append(["yes_no", "yes", "Yes"])
    choices.append(["yes_no", "no", "No"])

    settings = wb.create_sheet("settings")
    settings.append(["form_title", "form_id", "version", "style", "path", "default_language"])
    settings.append(["Newborn home visit", "pnc_home_visit", "2026092801", "pages", "data", "en"])

    wb.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    build()
