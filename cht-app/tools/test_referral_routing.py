"""An emergency referral may only go to a hospital (levels 1-3) in the chosen region; urgent and
routine referrals use the district's facilities. Tested on the built form, because the CHT test
harness hangs rather than fails when asked to pick a hidden choice."""
import re
from collections import defaultdict
from pathlib import Path

import openpyxl

FORMS = Path(__file__).resolve().parent.parent / "forms" / "app"


def facility_choices():
    ws = openpyxl.load_workbook(FORMS / "referral.xlsx")["choices"]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    return [dict(zip(header, r)) for r in rows[1:] if r[0] == "facilities"]


def test_compiled_form_filters_emergencies_to_regional_hospitals():
    xml = (FORMS / "referral.xml").read_text(encoding="utf-8")
    nodeset = re.search(r"nodeset=\"instance\('facilities'\)/root/item\[(.*?)\]\"", xml).group(1)
    assert "/data/r_severity  = 'emergency' and region= /data/destination/dest_region  and level &lt;= 3" in nodeset
    assert "/data/r_severity  != 'emergency' and district= /data/destination/dest_district" in nodeset


def test_every_region_has_hospitals_for_emergencies_and_none_are_clinics():
    by_region = defaultdict(list)
    for c in facility_choices():
        if c["name"] != "other" and int(c["level"]) <= 3:
            by_region[c["region"]].append(c["label::en"])
    assert set(by_region) == {"northern", "savannah", "north_east", "upper_east", "upper_west"}
    for region, labels in by_region.items():
        assert labels, region
        assert not any("(Health Centre)" in l or "(Clinic)" in l for l in labels), region


def test_urgent_referrals_still_list_district_health_centres():
    bolga = [c["label::en"] for c in facility_choices() if c["district"] == "bolgatanga_municipal"]
    assert "Bolga Health Centre (Health Centre)" in bolga
