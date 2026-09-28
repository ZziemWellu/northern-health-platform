"""Generates the Module 6 (hidden barriers) forms:

- forms/app/barrier_screen.xlsx: eight questions early in pregnancy (or the same day a referral
  fails): travel time, transport, NHIS, savings, who decides, phone. Every barrier found comes with
  its own action, so the result is a to-do list, not a score.
- forms/app/birth_plan.xlsx: made with the household's decider, with her consent: where she will
  deliver, a named ride, money set aside, a blood donor. Lists what is still missing.

Evidence (blueprint, Module 6): in Upper East, a phone call plus one home visit made women 28.2
points more likely to prepare a birth plan with their partner (Jakubowski et al. 2024). Free
maternal care still leaves out-of-pocket costs; 22% of women in Kassena-Nankana sold assets
(Dalinjong et al. 2018).

Run:  python tools/build_barrier_forms.py
then: npx cht --no-check convert-app-forms -- barrier_screen birth_plan
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # embedded Pythons don't add the script dir

from build_referral_forms import (contact_inputs, facility_choices, facility_picker, meta_rows, row, save,
                                  yes_no)

GHANA_PHONE = ("regex(., '^0[0-9]{9}$')", "Enter a 10-digit Ghana number starting with 0.")

# (code, XPath condition, what the nurse should do about it)
BARRIERS = [
    ("far", "${travel_time} = '1_2h' or ${travel_time} = 'over_2h'",
     "More than an hour from the delivery facility: discuss a maternity waiting home near term, and arrange transport early."),
    ("no_transport", "${transport} = 'none'",
     "No transport: record a named driver or the community ambulance in her birth plan."),
    ("no_insurance", "${nhis_status} != 'active'",
     "NHIS not active: pregnant women register free of charge. Help her register or renew now (Ghana Card, *929#)."),
    ("no_money", "${money_set_aside} = 'no'",
     "No money set aside: agree a small saving plan in the birth plan, and ask the district social welfare officer about LEAP."),
    ("decider_not_supportive",
     "${decider} != 'herself' and (${decider_supports} = 'no' or ${decider_supports} = 'unsure')",
     "The person who decides may not support a facility birth: with her agreement, involve them in the birth plan."),
    ("no_phone", "${phone_access} = 'none'",
     "No phone in the household: agree whose phone to call in an emergency."),
]


def build_barrier_screen():
    choices = yes_no()
    choices += [{"list_name": "travel", "name": n, "label::en": l} for n, l in [
        ("under_30", "Under 30 minutes"), ("30_60", "30 minutes to 1 hour"), ("1_2h", "1 to 2 hours"),
        ("over_2h", "More than 2 hours")]]
    choices += [{"list_name": "transport", "name": n, "label::en": l} for n, l in [
        ("household", "Household motorbike, tricycle or car"), ("can_hire", "Can hire a motorbike or taxi"),
        ("community_ambulance", "Community or tricycle ambulance"), ("none", "No transport")]]
    choices += [{"list_name": "nhis", "name": n, "label::en": l} for n, l in [
        ("active", "Active"), ("expired", "Expired"), ("never", "Never registered"), ("unknown", "Not sure")]]
    choices += [{"list_name": "decider", "name": n, "label::en": l} for n, l in [
        ("herself", "She decides herself"), ("husband", "Her husband or partner"),
        ("mother_in_law", "Her mother-in-law"), ("household_head", "The household head"), ("other", "Someone else")]]
    choices += [{"list_name": "supports", "name": n, "label::en": l} for n, l in [
        ("yes", "Yes"), ("no", "No"), ("unsure", "Not sure")]]
    choices += [{"list_name": "phone", "name": n, "label::en": l} for n, l in [
        ("own", "She has her own phone"), ("shared", "A shared household phone"), ("none", "No phone")]]

    rows = contact_inputs([("source_reasons", "Reasons a referral failed")])
    rows += [
        row("begin group", "access", "Getting to care", appearance="field-list"),
        row("note", "missed_referral_note", "She did not reach a referral. Reasons given: ${source_reasons}",
            relevant="${source_reasons} != ''"),
        row("select_one travel", "travel_time", "How long does it take her to reach the facility where she plans to deliver?", required="yes"),
        row("select_one transport", "transport", "What transport could she use to get there, day or night?", required="yes"),
        row("end group", "access"),

        row("begin group", "money", "Money and insurance", appearance="field-list"),
        row("select_one nhis", "nhis_status", "Is her NHIS membership active?", required="yes"),
        row("select_one yes_no", "money_set_aside", "Has money been set aside for the birth or an emergency?", required="yes"),
        row("end group", "money"),

        row("begin group", "people", "Who decides", appearance="field-list"),
        row("note", "privacy_note", "Ask these questions privately, only if she is comfortable answering."),
        row("select_one decider", "decider", "Who decides whether she goes to a health facility?", required="yes"),
        row("select_one supports", "decider_supports", "Does that person support her giving birth at a facility?",
            required="yes", relevant="${decider} != 'herself'"),
        row("select_one phone", "phone_access", "Is there a phone she can use in an emergency?", required="yes"),
        row("end group", "people"),
    ]
    for code, condition, _ in BARRIERS:
        rows.append(row("calculate", f"b_{code}", "NO_LABEL", calculation=f"if({condition}, 'yes', 'no')"))
    rows += [
        row("calculate", "r_barriers", "NO_LABEL", calculation="normalize-space(concat(" + ", ' ', ".join(
            f"if(${{b_{code}}} = 'yes', '{code}', '')" for code, _, _ in BARRIERS) + "))"),
        row("calculate", "r_barrier_count", "NO_LABEL",
            calculation=" + ".join(f"if(${{b_{code}}} = 'yes', 1, 0)" for code, _, _ in BARRIERS)),
        row("begin group", "result", "What to do", appearance="field-list"),
        row("note", "none_found", "No barriers found. Make her birth plan before 32 weeks.",
            relevant="${r_barrier_count} = 0"),
    ]
    for code, _, action in BARRIERS:
        rows.append(row("note", f"do_{code}", f"- {action}", relevant=f"${{b_{code}}} = 'yes'"))
    rows += [
        row("end group", "result"),
        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__barriers", "NO_LABEL", calculation="${r_barriers}"),
        row("calculate", "__barrier_count", "NO_LABEL", calculation="${r_barrier_count}"),
        row("calculate", "__nhis_status", "NO_LABEL", calculation="${nhis_status}"),
        row("calculate", "__travel_time", "NO_LABEL", calculation="${travel_time}"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("barrier_screen", "Barrier screen", rows, choices)


def build_birth_plan():
    choices = yes_no() + facility_choices()
    choices += [{"list_name": "ride", "name": n, "label::en": l} for n, l in [
        ("household", "Household vehicle"), ("named_driver", "A named driver (motorbike, tricycle, taxi)"),
        ("community_ambulance", "Community or tricycle ambulance"), ("none_yet", "Not arranged yet")]]
    choices += [{"list_name": "involved", "name": n, "label::en": l} for n, l in [
        ("present", "Present for this plan"), ("by_phone", "Agreed by phone, with her consent"),
        ("not_involved", "Not involved")]]

    rows = contact_inputs([])
    rows += [
        row("begin group", "where", "Where she will give birth", appearance="field-list"),
        *facility_picker("plan", "Facility where she plans to give birth"),
        row("end group", "where"),

        row("begin group", "ride", "Getting there", appearance="field-list"),
        row("select_one ride", "ride_type", "How will she get there, day or night?", required="yes"),
        row("string", "driver_name", "Driver's name", required="yes",
            relevant="${ride_type} = 'named_driver' or ${ride_type} = 'community_ambulance'"),
        row("string", "driver_phone", "Driver's phone", required="yes",
            relevant="${ride_type} = 'named_driver' or ${ride_type} = 'community_ambulance'",
            constraint=GHANA_PHONE[0], constraint_message=GHANA_PHONE[1]),
        row("end group", "ride"),

        row("begin group", "ready", "Money and support", appearance="field-list"),
        row("select_one yes_no", "money_saved", "Has money been set aside?", required="yes"),
        row("integer", "amount_ghs", "About how much (GHS)?", relevant="${money_saved} = 'yes'",
            constraint=". >= 0 and . <= 100000", constraint_message="Enter an amount between 0 and 100,000."),
        row("select_one yes_no", "blood_donor", "Is a possible blood donor named?", required="yes"),
        row("select_one involved", "decider_involved",
            "Was the person who decides involved in this plan? (Only with her agreement.)", required="yes"),
        row("end group", "ready"),

        row("calculate", "m_ride", "NO_LABEL", calculation="if(${ride_type} = 'none_yet', 'yes', 'no')"),
        row("calculate", "m_money", "NO_LABEL", calculation="if(${money_saved} = 'no', 'yes', 'no')"),
        row("calculate", "m_donor", "NO_LABEL", calculation="if(${blood_donor} = 'no', 'yes', 'no')"),
        row("calculate", "m_decider", "NO_LABEL", calculation="if(${decider_involved} = 'not_involved', 'yes', 'no')"),
        row("calculate", "r_missing", "NO_LABEL", calculation="normalize-space(concat("
            "if(${m_ride} = 'yes', 'ride', ''), ' ', if(${m_money} = 'yes', 'money', ''), ' ', "
            "if(${m_donor} = 'yes', 'blood_donor', ''), ' ', if(${m_decider} = 'yes', 'decider', '')))"),
        row("calculate", "r_complete", "NO_LABEL", calculation="if(${r_missing} = '', 'yes', 'no')"),
        row("calculate", "t_birth_plan_incomplete", "NO_LABEL", calculation="if(${r_complete} = 'no', 'yes', 'no')"),

        row("begin group", "summary", "Birth plan", appearance="field-list"),
        row("note", "plan_note", "She plans to give birth at ${plan_name}."),
        row("note", "complete_note", "The birth plan is complete. Remind the family of the danger signs.",
            relevant="${r_complete} = 'yes'"),
        row("note", "missing_note", "Still to arrange (you will be reminded in two weeks):", relevant="${r_complete} = 'no'"),
        row("note", "missing_ride", "- A ride, day or night", relevant="${m_ride} = 'yes'"),
        row("note", "missing_money", "- Money set aside", relevant="${m_money} = 'yes'"),
        row("note", "missing_donor", "- A possible blood donor", relevant="${m_donor} = 'yes'"),
        row("note", "missing_decider", "- The decider's agreement", relevant="${m_decider} = 'yes'"),
        row("end group", "summary"),

        row("begin group", "data", "NO_LABEL", appearance="hidden"),
        row("calculate", "__planned_facility", "NO_LABEL", calculation="${plan_facility}"),
        row("calculate", "__planned_facility_name", "NO_LABEL", calculation="${plan_name}"),
        row("calculate", "__ride_type", "NO_LABEL", calculation="${ride_type}"),
        row("calculate", "__complete", "NO_LABEL", calculation="${r_complete}"),
        row("calculate", "__missing", "NO_LABEL", calculation="${r_missing}"),
        row("calculate", "__decider_involved", "NO_LABEL", calculation="${decider_involved}"),
        *meta_rows(),
        row("end group", "data"),
    ]
    save("birth_plan", "Birth plan", rows, choices)


if __name__ == "__main__":
    build_barrier_screen()
    build_birth_plan()
