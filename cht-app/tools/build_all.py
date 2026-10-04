"""Regenerates every platform form from its generator. The reference CHT forms are left alone.

Run from cht-app/: python tools/build_all.py
then:              npx cht --no-check convert-app-forms -- <the forms printed below>
(npm run build-forms does both.)"""
import runpy
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
GENERATORS = [
    "build_pnc_home_visit.py",
    "build_maternal_danger_assessment.py",
    "build_referral_forms.py",
    "build_barrier_forms.py",
    "build_child_forms.py",
    "build_nutrition_forms.py",
    "build_voice_forms.py",
]
FORMS = ["pnc_home_visit", "maternal_danger_assessment", "referral", "referral_follow_up", "barrier_screen",
         "birth_plan", "sick_child", "sick_child_follow_up", "smc_dose", "smc_adherence",
         "feeding_counselling", "market_prices", "voice_question"]

if __name__ == "__main__":
    sys.path.insert(0, str(TOOLS))
    for g in GENERATORS:
        runpy.run_path(str(TOOLS / g), run_name="__main__")
    print(" ".join(FORMS))
