"""Builds data/food_table.json: composition and price of each Module 3 food, per region and season.

Inputs (downloaded into .cache/ on first run, not committed):
- FAO/INFOODS West African Food Composition Table 2019 (WAFCT)
  https://www.fao.org/fileadmin/user_upload/faoweb/2020/WAFCT_2019.xlsx
- WFP food prices for Ghana, Humanitarian Data Exchange
  https://data.humdata.org/dataset/wfp-food-prices-for-ghana

Everything is expressed per 100 g of food AS BOUGHT, so the optimiser's grams are what a caregiver
buys: composition per 100 g edible portion x the WAFCT edible-portion factor.

WFP's northern series end in July 2023 and use pre-2019 regions: "Northern" also covers today's
Savannah and North East, which have no WFP market of their own. Prices are medians over markets and
months. Ghana's 2022-23 inflation means absolute costs are out of date; relative costs (which food is
cheaper per nutrient) matter most for the plans, and the price-collection form replaces them.
"""
import csv
import json
import re
import statistics
import urllib.request
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".cache"
DATA = ROOT / "data"

WAFCT_URL = "https://www.fao.org/fileadmin/user_upload/faoweb/2020/WAFCT_2019.xlsx"
WFP_URL = ("https://data.humdata.org/dataset/626e809c-c4fc-467b-a60c-129acb5e9320/resource/"
           "e877350b-146f-4fa7-8690-db9605eea78c/download/wfp_food_prices_gha.csv")

# WFP admin1 (pre-2019) -> today's regions it stands for.
PRICE_REGIONS = {
    "NORTHERN": ["Northern", "Savannah", "North East"],
    "UPPER EAST": ["Upper East"],
    "UPPER WEST": ["Upper West"],
}
SEASONS = {
    "lean": {"label": "Lean season (June to August)", "months": [6, 7, 8]},
    "post_harvest": {"label": "After harvest (October to December)", "months": [10, 11, 12]},
}


def fetch(url, name):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=300) as r:
            path.write_bytes(r.read())
    return path


def number(value):
    """WAFCT values: '[1.2]' is an estimate (kept), 'tr' is a trace (0), blank is unknown (None)."""
    if value is None:
        return None
    text = str(value).strip().strip("[]").strip()
    if text == "" or text.lower() == "none":
        return None
    if text.lower() == "tr":
        return 0.0
    try:
        return float(text)
    except ValueError:
        return None


def load_composition(codes, nutrient_columns):
    wb = openpyxl.load_workbook(fetch(WAFCT_URL, "WAFCT_2019.xlsx"), read_only=True)
    rows = list(wb["03 NV_sum_39 (per 100g EP)"].iter_rows(values_only=True))
    tags = [str(t).strip() if t else "" for t in rows[2]]
    col = {tag: i for i, tag in enumerate(tags) if tag}
    out = {}
    for r in rows[4:]:
        if r[0] in codes:
            edible = number(r[col["EDIBLE1"]]) or 1.0
            per_edible = {"energy_kcal": number(r[7])}
            estimated = []
            for key, tag in nutrient_columns.items():
                per_edible[key] = number(r[col[tag]])
                if str(r[col[tag]]).startswith("["):
                    estimated.append(key)
            out[r[0]] = {"name": r[1], "edible_factor": edible, "per_100g_edible": per_edible,
                         "estimated_values": estimated}
    missing = set(codes) - set(out)
    if missing:
        raise SystemExit(f"WAFCT codes not found: {sorted(missing)}")
    return out


# Retail should cost a little more than wholesale for the same food, market and month. A series
# whose retail price is below wholesale, or several times it, has a unit or data problem and is not
# used until volunteers collect real prices.
PLAUSIBLE_RETAIL_TO_WHOLESALE = (0.8, 2.5)


def check_price_series(rows, food):
    if food.get("known_price_issue"):
        return {"status": "known_issue", "note": food["known_price_issue"]}
    retail, wholesale = {}, {}
    for r in rows:
        if r["commodity"] != food["wfp_commodity"] or r["currency"] != "GHS":
            continue
        key = (r["market"], r["date"])
        if r["unit"] == "KG" and r["pricetype"] == "Retail":
            retail[key] = float(r["price"])
        bulk = re.fullmatch(r"(\d+) KG", r["unit"])
        if bulk and r["pricetype"] == "Wholesale":
            wholesale[key] = float(r["price"]) / int(bulk.group(1))
    ratios = [retail[k] / wholesale[k] for k in retail if k in wholesale and wholesale[k] > 0]
    if not ratios:
        return {"status": "unchecked", "note": "No wholesale series to compare against."}
    ratio = statistics.median(ratios)
    low, high = PLAUSIBLE_RETAIL_TO_WHOLESALE
    status = "consistent" if low <= ratio <= high else "inconsistent"
    return {"status": status, "median_retail_to_wholesale": round(ratio, 2), "pairs": len(ratios)}


def load_prices(foods):
    rows = [r for r in csv.DictReader(fetch(WFP_URL, "wfp_food_prices_gha.csv").open(encoding="utf-8"))
            if r["admin1"] in PRICE_REGIONS and r["date"][:1].isdigit()]
    prices = {}
    for food in foods:
        per_kg = []
        for r in rows:
            if r["commodity"] != food["wfp_commodity"] or r["currency"] != "GHS":
                continue
            if food["id"] == "egg":
                if r["unit"] != "30 pcs":
                    continue
                value = float(r["price"]) / 30 / food["grams_per_unit"] * 1000
            elif r["unit"] == "KG" and r["pricetype"] == "Retail":
                value = float(r["price"])
            else:
                continue
            per_kg.append((r["admin1"], r["date"], value, r["market"]))
        if not per_kg:
            raise SystemExit(f"no northern retail prices for {food['id']}")
        latest = max(d for _, d, _, _ in per_kg)
        check = check_price_series(rows, food)
        prices[food["id"]] = {"latest_price_date": latest, "check": check,
                              "usable": check["status"] in ("consistent", "unchecked"), "per_100g": {}}
        for admin1 in PRICE_REGIONS:
            regional = [(d, v) for a, d, v, _ in per_kg if a == admin1] or [(d, v) for _, d, v, _ in per_kg]
            fallback = not any(a == admin1 for a, _, _, _ in per_kg)
            by_season = {}
            for season, spec in SEASONS.items():
                in_season = [(d, v) for d, v in regional if int(d[5:7]) in spec["months"]]
                last_year = max((d[:4] for d, _ in in_season), default=None)
                values = [v for d, v in in_season if d[:4] == last_year]
                by_season[season] = {"ghs": round(statistics.median(values) / 10, 4), "year": last_year,
                                     "observations": len(values)} if values else None
            prices[food["id"]]["per_100g"][admin1] = {"seasons": by_season, "regional_fallback": fallback}
    return prices


def build():
    targets = json.loads((DATA / "targets.json").read_text(encoding="utf-8"))
    foods = json.loads((DATA / "foods.json").read_text(encoding="utf-8"))["foods"]
    columns = {k: v["wafct_column"] for k, v in targets["nutrients"].items()}
    unpriced = [u for u in json.loads((DATA / "foods.json").read_text(encoding="utf-8"))["unpriced_foods"]
                if u.get("wafct") and u.get("max_g")]
    composition = load_composition({f["wafct"] for f in foods} | {u["wafct"] for u in unpriced}, columns)
    prices = load_prices(foods)

    table = []
    for f in foods:
        comp = composition[f["wafct"]]
        factor = comp["edible_factor"]
        per_bought = {k: (None if v is None else round(v * factor, 4)) for k, v in comp["per_100g_edible"].items()}
        table.append({
            **{k: f[k] for k in ("id", "label", "group", "max_g")},
            "wafct": {"code": f["wafct"], "name": comp["name"], "edible_factor": factor,
                      "estimated_values": comp["estimated_values"]},
            "per_100g_as_bought": per_bought,
            "unknown_nutrients": [k for k, v in per_bought.items() if v is None],
            "price": prices[f["id"]],
            **({"price_unit_note": f["price_unit_note"]} if "price_unit_note" in f else {}),
        })
    unpriced_table = []
    for u in unpriced:
        comp = composition[u["wafct"]]
        unpriced_table.append({
            "id": "unpriced_" + u["wafct"], "label": u["label"], "max_g": u["max_g"],
            "wafct": {"code": u["wafct"], "name": comp["name"], "edible_factor": comp["edible_factor"]},
            "per_100g_as_bought": {k: (None if v is None else round(v * comp["edible_factor"], 4))
                                   for k, v in comp["per_100g_edible"].items()},
        })
    out = {"regions": PRICE_REGIONS, "seasons": SEASONS, "foods": table, "unpriced": unpriced_table}
    (DATA / "food_table.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(table)} foods to data/food_table.json")


if __name__ == "__main__":
    build()
