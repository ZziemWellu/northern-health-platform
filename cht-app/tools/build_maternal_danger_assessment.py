"""Generates forms/app/maternal_danger_assessment.xlsx (Module 1: maternal danger signs, nurse level).

The rules run inside the form, so they work offline, and every rule that fires shows its reason
with the measured value. A woman can have several at once; all are shown (MAMA-AI's API stopped at
the first match).

Ported from MAMA-AI's check_hard_rules, with three deliberate changes, all toward catching more
women (more sensitive), not fewer:
  1. Severe hypertension (>= 160 systolic OR >= 110 diastolic) flags on its own. MAMA-AI required a
     severe headache as well and ignored diastolic pressure.
  2. Prolonged labour (>= 12 hours) flags on its own. MAMA-AI also required abdominal pain >= 8/10.
  3. Every rule is evaluated; all matches are reported.

CLINICAL SIGN-OFF REQUIRED: every threshold below is interim and WHO-based. It must be confirmed
against GHS's national safe-motherhood protocol by the project's clinical advisor before field use.
Drug treatment is deliberately NOT in this form: pre-referral drugs and doses come only from the
GHS protocol once signed off.

Run:  python tools/build_maternal_danger_assessment.py
then: npx cht --no-check convert-app-forms -- maternal_danger_assessment
"""
from pathlib import Path

import sys

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from signoff import add_pilot_banner  # noqa: E402

FORM_ID = "maternal_danger_assessment"
OUT = Path(__file__).resolve().parent.parent / "forms" / "app" / f"{FORM_ID}.xlsx"

HAS_FEVER = "(${temperature} >= 38 or ${fever_reported} = 'yes')"
PRE_ECLAMPSIA_SYMPTOM = "(${severe_headache} = 'yes' or ${blurred_vision} = 'yes' or ${epigastric_pain} = 'yes')"

# (code, XPath condition, severity, reason shown to the nurse)
RULES = [
    ("convulsions", "${convulsions} = 'yes'", "emergency",
     "Convulsions (fits): possible eclampsia."),
    ("severe_hypertension", "${systolic_bp} >= 160 or ${diastolic_bp} >= 110", "emergency",
     "Blood pressure ${systolic_bp}/${diastolic_bp} is at or above 160/110: severe hypertension."),
    ("pre_eclampsia_signs",
     f"(${{systolic_bp}} >= 140 or ${{diastolic_bp}} >= 90) and {PRE_ECLAMPSIA_SYMPTOM}", "emergency",
     "Blood pressure ${systolic_bp}/${diastolic_bp} is at or above 140/90 with headache, blurred vision or upper belly pain: possible pre-eclampsia."),
    ("haemorrhage_after_birth", "${stage} = 'after_birth' and ${bleeding_ml} > 500", "emergency",
     "Blood loss of about ${bleeding_ml} mL after birth is over 500 mL: postpartum haemorrhage."),
    ("bleeding_in_pregnancy", "${stage} = 'pregnant' and ${vaginal_bleeding} = 'yes'", "emergency",
     "Vaginal bleeding during pregnancy."),
    ("sepsis_signs", f"{HAS_FEVER} and ${{foul_discharge}} = 'yes'", "emergency",
     "Fever with foul-smelling discharge: possible sepsis."),
    ("prolonged_labour", "${stage} = 'labour' and ${labour_hours} >= 12", "urgent",
     "Labour for ${labour_hours} hours (12 or more): prolonged labour."),
    ("fever", f"{HAS_FEVER} and ${{foul_discharge}} != 'yes'", "urgent",
     "Fever (${temperature} C, or reported): needs assessment today."),
]

HEADERS = ["type", "name", "label::en", "required", "relevant", "appearance", "constraint",
           "constraint_message::en", "calculation", "default"]


def row(type_, name, label="", required="", relevant="", appearance="", constraint="",
        constraint_message="", calculation="", default=""):
    return [type_, name, label, required, relevant, appearance, constraint, constraint_message,
            calculation, default]


def build():
    rows = [
        row("begin group", "inputs", "NO_LABEL", relevant="./source = 'user'", appearance="field-list"),
        row("hidden", "source", "Source", default="user"),
        row("hidden", "source_id", "Source ID"),
        row("begin group", "contact", "NO_LABEL"),
        row("string", "_id", "Which woman is this assessment for?", appearance="select-contact type-person"),
        row("hidden", "name", "Name"),
        row("hidden", "patient_id", "Patient ID"),
        row("begin group", "parent", "NO_LABEL"),
        row("hidden", "_id", "Household ID"),
        row("end group", "parent"),
        row("end group", "contact"),
        row("end group", "inputs"),
        row("calculate", "patient_uuid", "NO_LABEL", calculation="../inputs/contact/_id"),
        row("calculate", "patient_name", "NO_LABEL", calculation="../inputs/contact/name"),

        row("begin group", "stage_page", "Stage", appearance="field-list"),
        row("select_one stages", "stage", "Where is she in her pregnancy?", required="yes"),
        row("end group", "stage_page"),

        row("begin group", "vitals", "Measurements", appearance="field-list"),
        row("note", "vitals_note", "Leave a measurement empty if you could not take it."),
        row("integer", "systolic_bp", "Blood pressure, top number (systolic)",
            constraint=". >= 50 and . <= 260", constraint_message="Enter a value between 50 and 260."),
        row("integer", "diastolic_bp", "Blood pressure, bottom number (diastolic)",
            constraint=". >= 30 and . <= 160", constraint_message="Enter a value between 30 and 160."),
        row("decimal", "temperature", "Temperature (C)",
            constraint=". >= 34 and . <= 43", constraint_message="Enter a value between 34 and 43."),
        row("end group", "vitals"),

        row("begin group", "symptoms", "Danger signs", appearance="field-list"),
        row("select_one yes_no", "convulsions", "Convulsions (fits) now or since your last visit?", required="yes"),
        row("select_one yes_no", "severe_headache", "Severe headache?", required="yes"),
        row("select_one yes_no", "blurred_vision", "Blurred vision?", required="yes"),
        row("select_one yes_no", "epigastric_pain", "Pain in the upper belly (under the ribs)?", required="yes"),
        row("select_one yes_no", "vaginal_bleeding", "Vaginal bleeding?", required="yes"),
        row("integer", "bleeding_ml", "Estimated blood loss (mL)", relevant="${vaginal_bleeding} = 'yes'",
            constraint=". >= 0 and . <= 5000", constraint_message="Enter a value between 0 and 5000."),
        row("select_one yes_no", "foul_discharge", "Foul-smelling vaginal discharge?", required="yes"),
        row("select_one yes_no", "fever_reported", "Does she feel hot or report fever?", required="yes"),
        row("decimal", "labour_hours", "Hours since labour started", relevant="${stage} = 'labour'",
            constraint=". >= 0 and . <= 96", constraint_message="Enter a value between 0 and 96."),
        row("end group", "symptoms"),
    ]

    # One yes/no calculation per rule, so reports record exactly which rules fired.
    for code, condition, _, _ in RULES:
        rows.append(row("calculate", f"r_{code}", "NO_LABEL", calculation=f"if({condition}, 'yes', 'no')"))

    emergencies = " or ".join(f"${{r_{code}}} = 'yes'" for code, _, sev, _ in RULES if sev == "emergency")
    urgents = " or ".join(f"${{r_{code}}} = 'yes'" for code, _, sev, _ in RULES if sev == "urgent")
    rows += [
        row("calculate", "r_severity", "NO_LABEL",
            calculation=f"if({emergencies}, 'emergency', if({urgents}, 'urgent', 'none'))"),
        row("calculate", "r_reasons", "NO_LABEL",
            calculation="normalize-space(concat(" + ", ' ', ".join(
                f"if(${{r_{code}}} = 'yes', '{code}', '')" for code, _, _, _ in RULES) + "))"),
        row("calculate", "t_maternal_danger_follow_up", "NO_LABEL",
            calculation="if(${r_severity} != 'none', 'yes', 'no')"),
    ]

    rows += [
        row("begin group", "result", "Result", appearance="field-list"),
        row("note", "refer_now", "REFER NOW: emergency. Arrange transport immediately and give pre-referral care per the GHS protocol.",
            relevant="${r_severity} = 'emergency'"),
        row("note", "refer_today", "REFER TODAY: she needs to be seen at a facility today.",
            relevant="${r_severity} = 'urgent'"),
        row("note", "why_note", "Why:", relevant="${r_severity} != 'none'"),
    ]
    for code, _, _, reason in RULES:
        rows.append(row("note", f"why_{code}", f"- {reason}", relevant=f"${{r_{code}}} = 'yes'"))
    rows += [
        row("note", "no_danger", "No danger signs found from these answers. Keep her usual visit schedule and remind her of the danger signs.",
            relevant="${r_severity} = 'none'"),
        row("end group", "result"),

        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__stage", "NO_LABEL", calculation="${stage}"),
        row("calculate", "__severity", "NO_LABEL", calculation="${r_severity}"),
        row("calculate", "__reasons", "NO_LABEL", calculation="${r_reasons}"),
        row("calculate", "__systolic_bp", "NO_LABEL", calculation="${systolic_bp}"),
        row("calculate", "__diastolic_bp", "NO_LABEL", calculation="${diastolic_bp}"),
        row("calculate", "__temperature", "NO_LABEL", calculation="${temperature}"),
        row("begin group", "meta", "NO_LABEL"),
        row("calculate", "__patient_uuid", "NO_LABEL", calculation="../../../inputs/contact/_id"),
        row("calculate", "__household_uuid", "NO_LABEL", calculation="../../../inputs/contact/parent/_id"),
        row("calculate", "__source", "NO_LABEL", calculation="../../../inputs/source"),
        row("end group", "meta"),
        row("end group", "data"),
    ]

    wb = openpyxl.Workbook()
    survey = wb.active
    survey.title = "survey"
    survey.append(HEADERS)
    rows = add_pilot_banner(FORM_ID, rows, lambda n, label: row("note", n, label))
    for r in rows:
        survey.append(r)

    choices = wb.create_sheet("choices")
    choices.append(["list_name", "name", "label::en"])
    for name, label in [("yes", "Yes"), ("no", "No")]:
        choices.append(["yes_no", name, label])
    for name, label in [("pregnant", "Pregnant, not in labour"), ("labour", "In labour"), ("after_birth", "After birth (up to 6 weeks)")]:
        choices.append(["stages", name, label])

    settings = wb.create_sheet("settings")
    settings.append(["form_title", "form_id", "version", "style", "path", "default_language"])
    settings.append(["Maternal danger assessment", FORM_ID, "2026092801", "pages", "data", "en"])

    wb.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    build()
