"""Generates the Module 7 (sick child at home and prevention) forms:

- sick_child: guided assessment of a child under 5 with fever, cough or diarrhoea. Every danger
  sign sends the child to Module 2's "raise referral"; otherwise the form names the home treatment
  and schedules a day-3 follow-up. Each classification shows its reason.
- sick_child_follow_up: day-3 check. Not better, or a new danger sign, means referral.
- smc_dose: seasonal malaria chemoprevention: the day-1 dose given by the volunteer, or why not.
- smc_adherence: were the day-2 and day-3 home doses given?

Classification follows WHO/UNICEF "Caring for the sick child in the community" (iCCM), which
Ghana's community case management builds on. Northern Region evidence (blueprint, Module 7): only
7.4% of malaria cases at CHPS got ACT and 5.6% of diarrhoea cases got ORS or referral.

CLINICAL SIGN-OFF REQUIRED: all thresholds are interim and must be checked against GHS's national
iCCM and SMC guidelines by the clinical advisor. No drug doses appear in these forms: the nurse or
volunteer doses from the national dosing chart. Children under 2 months are not managed here; they
are referred.

Run:  python tools/build_child_forms.py
then: npx cht --no-check convert-app-forms -- sick_child sick_child_follow_up smc_dose smc_adherence
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_referral_forms import meta_rows, row, save, yes_no  # noqa: E402

AGE = "${age_months}"
FAST_BREATHING = f"((({AGE} >= 2 and {AGE} < 12) and ${{breaths_per_minute}} >= 50) or ({AGE} >= 12 and ${{breaths_per_minute}} >= 40))"

# Danger signs: any one means refer urgently. (code, condition, reason shown)
DANGER = [
    ("young_infant", f"{AGE} < 2", "Under 2 months old: sick young infants are always referred."),
    ("convulsions", "${convulsions} = 'yes'", "Convulsions."),
    ("unable_to_drink", "${unable_to_drink} = 'yes'", "Not able to drink or breastfeed."),
    ("vomits_everything", "${vomits_everything} = 'yes'", "Vomits everything."),
    ("very_sleepy", "${very_sleepy} = 'yes'", "Very sleepy or unconscious."),
    ("chest_indrawing", "${chest_indrawing} = 'yes'", "Chest indrawing."),
    ("red_muac", "${muac} = 'red'", "MUAC red (under 115 mm): severe acute malnutrition."),
    ("swelling_both_feet", "${swelling_both_feet} = 'yes'", "Swelling of both feet."),
    ("fever_7_days", "${fever} = 'yes' and ${fever_days} >= 7", "Fever for ${fever_days} days (7 or more)."),
    ("cough_21_days", "${cough} = 'yes' and ${cough_days} >= 21", "Cough for ${cough_days} days (21 or more)."),
    ("diarrhoea_14_days", "${diarrhoea} = 'yes' and ${diarrhoea_days} >= 14", "Diarrhoea for ${diarrhoea_days} days (14 or more)."),
    ("blood_in_stool", "${diarrhoea} = 'yes' and ${blood_in_stool} = 'yes'", "Blood in the stool."),
]

# Home treatment, only when there is no danger sign. (code, condition, what to do)
TREAT = [
    ("malaria", "${fever} = 'yes' and ${rdt} = 'positive'",
     "Malaria (fever, RDT positive): give ACT by age from the national dosing chart."),
    ("pneumonia", f"${{cough}} = 'yes' and {FAST_BREATHING}",
     "Fast breathing (${breaths_per_minute} per minute): give oral amoxicillin from the national dosing chart."),
    ("diarrhoea", "${diarrhoea} = 'yes'", "Diarrhoea: give ORS and zinc from the national dosing chart."),
    ("yellow_muac", "${muac} = 'yellow'", "MUAC yellow (115 to 124 mm): counsel on feeding and refer to the nutrition programme."),
]


def any_of(codes, prefix):
    return " or ".join(f"${{{prefix}{c}}} = 'yes'" for c in codes)


def codes_string(codes, prefix):
    return "normalize-space(concat(" + ", ' ', ".join(f"if(${{{prefix}{c}}} = 'yes', '{c}', '')" for c in codes) + "))"


def child_inputs(extra_hidden=()):
    rows = [
        row("begin group", "inputs", "NO_LABEL", relevant="./source = 'user'", appearance="field-list"),
        row("hidden", "source", "Source", default="user"),
        row("hidden", "source_id", "Source ID"),
        *[row("hidden", n, l) for n, l in extra_hidden],
        row("begin group", "contact", "NO_LABEL"),
        row("string", "_id", "Which child is this for?", appearance="select-contact type-person"),
        row("hidden", "name", "Name"),
        row("hidden", "patient_id", "Patient ID"),
        row("hidden", "date_of_birth", "Date of birth"),
        row("begin group", "parent", "NO_LABEL"),
        row("hidden", "_id", "Household ID"),
        row("end group", "parent"),
        row("end group", "contact"),
        row("end group", "inputs"),
        row("calculate", "patient_uuid", "NO_LABEL", calculation="../inputs/contact/_id"),
        row("calculate", "patient_name", "NO_LABEL", calculation="../inputs/contact/name"),
        row("calculate", "dob", "NO_LABEL", calculation="../inputs/contact/date_of_birth"),
    ]
    return rows


def age_rows():
    return [
        row("begin group", "age", "Age", appearance="field-list"),
        row("integer", "age_months_entered", "Child's age in months", required="yes", relevant="${dob} = ''",
            constraint=". >= 0 and . <= 59", constraint_message="This assessment is for children under 5 (0 to 59 months)."),
        row("end group", "age"),
        row("calculate", "age_months", "NO_LABEL",
            calculation="if(${dob} != '', floor(difference-in-months(${dob}, today())), ${age_months_entered})"),
    ]


def build_sick_child():
    choices = yes_no()
    choices += [{"list_name": "rdt", "name": n, "label::en": l} for n, l in [
        ("positive", "Positive"), ("negative", "Negative"), ("not_done", "Not done (no test available)")]]
    choices += [{"list_name": "muac", "name": n, "label::en": l} for n, l in [
        ("green", "Green (125 mm or more)"), ("yellow", "Yellow (115 to 124 mm)"), ("red", "Red (under 115 mm)")]]

    rows = child_inputs() + age_rows()
    rows += [
        row("begin group", "problems", "What is wrong", appearance="field-list"),
        row("select_one yes_no", "fever", "Fever now or in the last 3 days?", required="yes"),
        row("integer", "fever_days", "For how many days?", required="yes", relevant="${fever} = 'yes'",
            constraint=". >= 0 and . <= 60", constraint_message="Enter 0 to 60 days."),
        row("select_one yes_no", "cough", "Cough?", required="yes"),
        row("integer", "cough_days", "For how many days?", required="yes", relevant="${cough} = 'yes'",
            constraint=". >= 0 and . <= 120", constraint_message="Enter 0 to 120 days."),
        row("select_one yes_no", "diarrhoea", "Diarrhoea (3 or more loose stools in a day)?", required="yes"),
        row("integer", "diarrhoea_days", "For how many days?", required="yes", relevant="${diarrhoea} = 'yes'",
            constraint=". >= 0 and . <= 60", constraint_message="Enter 0 to 60 days."),
        row("select_one yes_no", "blood_in_stool", "Blood in the stool?", required="yes", relevant="${diarrhoea} = 'yes'"),
        row("end group", "problems"),

        row("begin group", "danger", "Danger signs", appearance="field-list"),
        row("select_one yes_no", "convulsions", "Convulsions?", required="yes"),
        row("select_one yes_no", "unable_to_drink", "Not able to drink or breastfeed?", required="yes"),
        row("select_one yes_no", "vomits_everything", "Vomits everything?", required="yes"),
        row("select_one yes_no", "very_sleepy", "Very sleepy or unconscious?", required="yes"),
        row("select_one yes_no", "chest_indrawing", "Chest indrawing?", required="yes", relevant="${cough} = 'yes'"),
        row("select_one yes_no", "swelling_both_feet", "Swelling of both feet?", required="yes"),
        row("select_one muac", "muac", "MUAC colour", required="yes", relevant=f"{AGE} >= 6"),
        row("end group", "danger"),

        row("begin group", "tests", "Tests", appearance="field-list"),
        row("select_one rdt", "rdt", "Malaria rapid test (RDT) result", required="yes", relevant="${fever} = 'yes'"),
        row("integer", "breaths_per_minute", "Breaths counted in one full minute", required="yes",
            relevant="${cough} = 'yes'", constraint=". >= 10 and . <= 120", constraint_message="Enter 10 to 120."),
        row("end group", "tests"),
    ]
    for code, condition, _ in DANGER:
        rows.append(row("calculate", f"d_{code}", "NO_LABEL", calculation=f"if({condition}, 'yes', 'no')"))
    rows.append(row("calculate", "r_danger", "NO_LABEL",
                    calculation=f"if({any_of([c for c, _, _ in DANGER], 'd_')}, 'yes', 'no')"))
    for code, condition, _ in TREAT:
        rows.append(row("calculate", f"t_{code}", "NO_LABEL",
                        calculation=f"if(${{r_danger}} = 'no' and ({condition}), 'yes', 'no')"))
    rows += [
        row("calculate", "r_no_rdt", "NO_LABEL",
            calculation="if(${r_danger} = 'no' and ${fever} = 'yes' and ${rdt} = 'not_done', 'yes', 'no')"),
        row("calculate", "r_severity", "NO_LABEL",
            calculation="if(${r_danger} = 'yes', 'emergency', if(${r_no_rdt} = 'yes', 'urgent', 'none'))"),
        row("calculate", "r_reasons", "NO_LABEL", calculation=(
            f"if(${{r_danger}} = 'yes', {codes_string([c for c, _, _ in DANGER], 'd_')}, "
            "if(${r_no_rdt} = 'yes', 'fever_no_rdt', ''))")),
        row("calculate", "r_treatments", "NO_LABEL", calculation=codes_string([c for c, _, _ in TREAT], "t_")),
        row("calculate", "t_sick_child_follow_up", "NO_LABEL",
            calculation="if(${r_danger} = 'no' and ${r_treatments} != '', 'yes', 'no')"),

        row("begin group", "result", "What to do", appearance="field-list"),
        row("note", "refer_note", "REFER NOW. Give the first dose of pre-referral treatment if the national chart says so, and raise the referral.",
            relevant="${r_danger} = 'yes'"),
    ]
    for code, _, reason in DANGER:
        rows.append(row("note", f"why_{code}", f"- {reason}", relevant=f"${{d_{code}}} = 'yes'"))
    rows.append(row("note", "no_rdt_note",
                    "Fever but no malaria test: malaria cannot be confirmed. Send the child to the CHPS compound today.",
                    relevant="${r_no_rdt} = 'yes'"))
    for code, _, action in TREAT:
        rows.append(row("note", f"do_{code}", f"- {action}", relevant=f"${{t_{code}}} = 'yes'"))
    rows += [
        row("note", "follow_up_note", "Visit again in 3 days. Tell the caregiver to come back at once if the child cannot drink, gets worse, or has a new danger sign.",
            relevant="${t_sick_child_follow_up} = 'yes'"),
        row("note", "nothing_note", "No danger sign and nothing to treat at home. Advise the caregiver on the danger signs.",
            relevant="${r_danger} = 'no' and ${r_no_rdt} = 'no' and ${r_treatments} = ''"),
        row("end group", "result"),
        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__age_months", "NO_LABEL", calculation="${age_months}"),
        row("calculate", "__severity", "NO_LABEL", calculation="${r_severity}"),
        row("calculate", "__danger_signs", "NO_LABEL", calculation="${r_reasons}"),
        row("calculate", "__treatments", "NO_LABEL", calculation="${r_treatments}"),
        row("calculate", "__rdt", "NO_LABEL", calculation="${rdt}"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("sick_child", "Sick child assessment", rows, choices)


def build_sick_child_follow_up():
    choices = yes_no()
    choices += [{"list_name": "progress", "name": n, "label::en": l} for n, l in [
        ("better", "Better"), ("same", "The same"), ("worse", "Worse")]]
    rows = child_inputs([("treatments", "Treatments given")])
    rows += [
        row("begin group", "check", "Day-3 check", appearance="field-list"),
        row("note", "treatments_note", "Treatments given at the first visit: ${treatments}", relevant="${treatments} != ''"),
        row("select_one progress", "progress", "How is the child now?", required="yes"),
        row("select_one yes_no", "danger_now", "Any danger sign now (convulsions, cannot drink, vomits everything, very sleepy, chest indrawing)?", required="yes"),
        row("select_one yes_no", "treatment_completed", "Is the treatment being taken as advised?", required="yes"),
        row("end group", "check"),
        row("calculate", "r_severity", "NO_LABEL",
            calculation="if(${danger_now} = 'yes', 'emergency', if(${progress} != 'better', 'urgent', 'none'))"),
        row("calculate", "r_reasons", "NO_LABEL",
            calculation="if(${danger_now} = 'yes', 'danger_sign_at_follow_up', if(${progress} != 'better', 'not_better_at_day_3', ''))"),
        row("begin group", "result", "What to do", appearance="field-list"),
        row("note", "refer_now", "REFER NOW: a danger sign at the follow-up visit.", relevant="${r_severity} = 'emergency'"),
        row("note", "refer_today", "Not better after 3 days: refer to the CHPS compound or health centre today.", relevant="${r_severity} = 'urgent'"),
        row("note", "adherence_note", "Help the caregiver finish the full treatment.", relevant="${treatment_completed} = 'no'"),
        row("note", "well_note", "The child is better. Remind the caregiver to finish the treatment.", relevant="${r_severity} = 'none'"),
        row("end group", "result"),
        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__progress", "NO_LABEL", calculation="${progress}"),
        row("calculate", "__severity", "NO_LABEL", calculation="${r_severity}"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("sick_child_follow_up", "Sick child follow-up", rows, choices)


def build_smc_dose():
    choices = yes_no()
    choices += [{"list_name": "cycles", "name": str(n), "label::en": f"Cycle {n}"} for n in range(1, 5)]
    choices += [{"list_name": "not_given", "name": n, "label::en": l} for n, l in [
        ("absent", "Child or caregiver not at home"), ("refused", "Caregiver refused"),
        ("sick", "Child sick today (assess first)"), ("other", "Other")]]
    rows = child_inputs([("cycle_due", "Cycle due")]) + age_rows()
    rows += [
        row("begin group", "dose", "SMC dose", appearance="field-list"),
        row("note", "not_eligible", "SMC is for children 3 to 59 months. Do not give.", relevant=f"{AGE} < 3"),
        row("select_one cycles", "cycle", "Which cycle is this?", required="yes", relevant=f"{AGE} >= 3",
            default=""),
        row("select_one yes_no", "day1_given", "Was the day-1 dose given and swallowed under your observation?",
            required="yes", relevant=f"{AGE} >= 3"),
        row("select_one not_given", "not_given_reason", "Why was it not given?", required="yes",
            relevant="${day1_given} = 'no'"),
        row("select_one yes_no", "home_doses_explained",
            "Did you give the caregiver the day-2 and day-3 doses and explain when to give them?",
            required="yes", relevant="${day1_given} = 'yes'"),
        row("end group", "dose"),
        row("calculate", "r_catch_up", "NO_LABEL",
            calculation="if(${not_given_reason} = 'absent', 'yes', 'no')"),
        row("begin group", "result", "Next step", appearance="field-list"),
        row("note", "catch_up_note", "Not at home: a catch-up visit is scheduled for tomorrow.", relevant="${r_catch_up} = 'yes'"),
        row("note", "sick_note", "Assess the sick child first with the sick child form.", relevant="${not_given_reason} = 'sick'"),
        row("note", "given_note", "You will be reminded in 2 days to check the home doses.", relevant="${day1_given} = 'yes'"),
        row("end group", "result"),
        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__cycle", "NO_LABEL", calculation="${cycle}"),
        row("calculate", "__day1_given", "NO_LABEL", calculation="${day1_given}"),
        row("calculate", "__not_given_reason", "NO_LABEL", calculation="${not_given_reason}"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("smc_dose", "SMC dose", rows, choices)


def build_smc_adherence():
    choices = yes_no()
    rows = child_inputs([("cycle", "Cycle")])
    rows += [
        row("begin group", "doses", "Home doses", appearance="field-list"),
        row("select_one yes_no", "day2_given", "Was the day-2 dose given?", required="yes"),
        row("select_one yes_no", "day3_given", "Was the day-3 dose given?", required="yes"),
        row("select_one yes_no", "sick_since", "Has the child had fever or been sick since the first dose?", required="yes"),
        row("end group", "doses"),
        row("calculate", "r_complete", "NO_LABEL",
            calculation="if(${day2_given} = 'yes' and ${day3_given} = 'yes', 'yes', 'no')"),
        row("begin group", "result", "Next step", appearance="field-list"),
        row("note", "complete_note", "All three doses taken for this cycle.", relevant="${r_complete} = 'yes'"),
        row("note", "incomplete_note", "Doses were missed. Explain why all three matter; record this for the supervisor.",
            relevant="${r_complete} = 'no'"),
        row("note", "sick_note", "The child has been sick: assess with the sick child form now.", relevant="${sick_since} = 'yes'"),
        row("end group", "result"),
        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__complete", "NO_LABEL", calculation="${r_complete}"),
        row("calculate", "__cycle", "NO_LABEL", calculation="../../inputs/cycle"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("smc_adherence", "SMC home doses check", rows, choices)


if __name__ == "__main__":
    build_sick_child()
    build_sick_child_follow_up()
    build_smc_dose()
    build_smc_adherence()
