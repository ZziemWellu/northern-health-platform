"""Builds data/northern_facilities.csv: public and faith-based health facilities in Ghana's five
northern regions, with their current (post-2019) region and district.

Why not MAMA-AI's facility list: it is OpenStreetMap-derived and has only 51 entries north of 8°N,
including an eye clinic, a "consulting room" and duplicates, and it misses the main referral
hospitals (Tamale Teaching, Bolgatanga Regional). Sending a woman in an emergency to the wrong
place is dangerous, so Module 2 uses an official public-sector list instead.

Sources (downloaded by this script, not committed):
- Facilities: "Health Facilities in Sub-Saharan Africa" (Maina et al., WHO / KEMRI-Wellcome), HDX:
  https://data.humdata.org/dataset/health-facilities-in-sub-saharan-africa
  Public (MoH) and faith-based facilities, geocoded; uses pre-2019 regions.
- Regions (16, 2021): geoBoundaries GHA ADM1, OpenStreetMap, CC BY-SA 2.0.
- Districts (260, 2019): geoBoundaries GHA ADM2, USAID Ghana HPNO / Ghana Statistical Service, CC BY 4.0.

Known limits: the facility list predates 2019 and excludes private facilities. It does not yet record
which facilities offer caesarean section or blood transfusion: the can_do_c_section and
has_blood_bank columns exist so that data has somewhere to go, but every row defaults to "unknown"
here. Confirmed values come only from facility_corrections.csv, filled in from the Regional Health
Directorates - never guessed. Module 2's referral form warns on every emergency referral that
capability isn't yet verified, precisely because these columns are "unknown" for all 277 facilities
today.

Run: python tools/build_facilities.py
"""
import csv
import io
import json
import urllib.request
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "northern_facilities.csv"
CORRECTIONS = ROOT / "data" / "facility_corrections.csv"  # hand-verified fixes to source errors
CACHE = ROOT / ".cache"

FACILITIES_URL = ("https://data.humdata.org/dataset/eb1ba830-9464-43c8-9370-28cee0c99f5d/resource/"
                  "758d5c17-88f4-42b2-9d4b-4bfe32d4acf7/download/sub-saharan_health_facilities.xlsx")
ADM1_URL = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/GHA/ADM1/geoBoundaries-GHA-ADM1.geojson"
ADM2_URL = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/GHA/ADM2/geoBoundaries-GHA-ADM2.geojson"

OLD_NORTHERN_REGIONS = {"Northern", "Upper East", "Upper West"}
NORTHERN_REGIONS = {"Northern", "Savannah", "North East", "Upper East", "Upper West"}

# Facility types a woman can be referred to. CHPS compounds are where referrals start, not end.
LEVELS = {
    "Teaching Hospital": 1,
    "Regional Hospital": 2,
    "Municipal Hospital": 3,
    "District Hospital": 3,
    "Hospital": 3,
    "Polyclinic": 4,
    "Health Centre": 5,
    "Clinic": 6,
}


def fetch(url, name):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=300) as r:
            path.write_bytes(r.read())
    return path


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_geometry(x, y, geom):
    polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for rings in polygons:
        if point_in_ring(x, y, rings[0]) and not any(point_in_ring(x, y, hole) for hole in rings[1:]):
            return True
    return False


def load_areas(path):
    features = json.loads(path.read_text(encoding="utf-8"))["features"]
    areas = []
    for f in features:
        coords = f["geometry"]["coordinates"]
        flat = [pt for poly in (coords if f["geometry"]["type"] == "MultiPolygon" else [coords]) for pt in poly[0]]
        xs, ys = [p[0] for p in flat], [p[1] for p in flat]
        areas.append((f["properties"]["shapeName"], (min(xs), min(ys), max(xs), max(ys)), f["geometry"]))
    return areas


def locate(x, y, areas):
    for name, (x0, y0, x1, y1), geom in areas:
        if x0 <= x <= x1 and y0 <= y <= y1 and point_in_geometry(x, y, geom):
            return name
    return None


def normalise_region(name):
    return (name or "").replace(" Region", "").replace("Northeast", "North East").strip()


def slug(text):
    return "".join(c if c.isalnum() else "_" for c in text.lower()).strip("_").replace("__", "_")


def build():
    regions = load_areas(fetch(ADM1_URL, "gha_adm1.geojson"))
    districts = load_areas(fetch(ADM2_URL, "gha_adm2.geojson"))
    wb = openpyxl.load_workbook(fetch(FACILITIES_URL, "ssa_health_facilities.xlsx"), read_only=True)

    out, seen, unplaced = [], set(), 0
    for country, old_region, name, ftype, owner, lat, lon, _ in list(wb.active.iter_rows(values_only=True))[1:]:
        if country != "Ghana" or old_region not in OLD_NORTHERN_REGIONS or ftype not in LEVELS:
            continue
        region = normalise_region(locate(lon, lat, regions))
        if region not in NORTHERN_REGIONS:
            unplaced += 1
            continue
        name = " ".join(name.split())
        key = (name.lower(), round(lat, 3), round(lon, 3))
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "id": slug(f"{name}_{region}"),
            "name": name,
            "type": ftype,
            "level": LEVELS[ftype],
            "ownership": owner,
            "region": region,
            "district": " ".join((locate(lon, lat, districts) or "").split()),
            "latitude": round(lat, 5),
            "longitude": round(lon, 5),
            # Unverified until a correction row says otherwise - never guessed from facility type.
            "can_do_c_section": "unknown",
            "has_blood_bank": "unknown",
        })

    corrections = {row["name"]: row for row in csv.DictReader(CORRECTIONS.open(encoding="utf-8"))}
    for r in out:
        fix = corrections.get(r["name"])
        if fix:
            r.update(region=fix["region"], district=fix["district"],
                     latitude=float(fix["latitude"]), longitude=float(fix["longitude"]))
            r["id"] = slug(f"{r['name']}_{r['region']}")
            # Optional columns: only a Regional Health Directorate's confirmation should set these,
            # so a correction row without them leaves the "unknown" default untouched.
            if fix.get("can_do_c_section"):
                r["can_do_c_section"] = fix["can_do_c_section"]
            if fix.get("has_blood_bank"):
                r["has_blood_bank"] = fix["has_blood_bank"]
    missing = set(corrections) - {r["name"] for r in out}
    if missing:
        raise SystemExit(f"corrections for facilities not in the source: {sorted(missing)}")

    out.sort(key=lambda r: (r["region"], r["district"], r["level"], r["name"], r["latitude"]))

    # Same-named facilities in one region are different places (different coordinates); give each
    # a unique, stable id by adding its district, then a counter if still needed.
    counts = {}
    for r in out:
        counts[r["id"]] = counts.get(r["id"], 0) + 1
    used = set()
    for r in out:
        if counts[r["id"]] > 1:
            r["id"] = slug(f"{r['name']}_{r['district']}")
        base, n = r["id"], 2
        while r["id"] in used:
            r["id"] = f"{base}_{n}"
            n += 1
        used.add(r["id"])

    OUT.parent.mkdir(exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    print(f"wrote {len(out)} facilities to {OUT} ({unplaced} outside the five northern regions skipped)")


if __name__ == "__main__":
    build()
