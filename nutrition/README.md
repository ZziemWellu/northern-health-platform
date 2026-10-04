# Module 3 nutrition engine

Builds feeding plans for breastfed children aged 6 to 23 months: the cheapest mix of local foods
that gets each nutrient as close to its daily need as local foods allow, per price region, season
and age group. A nutritionist approves each plan before the CHT app shows it.

> **Not for use with families until a nutritionist has reviewed** `data/targets.json`,
> `data/foods.json` (portion limits) and each plan in `plans/REVIEW.md`.

## How it works

1. `prepare.py` joins nutrient values from the FAO/INFOODS West African Food Composition Table 2019
   to WFP northern market prices (to July 2023), per 100 g as bought. It checks every price series:
   a food whose retail price contradicts its wholesale price (units or data problem) is not used.
2. `optimiser.py` solves three linear programmes: lift the worst-covered nutrient first, then the
   rest, then minimise cost at that level. Nutrients still under 70% of the RNI are reported as
   problem nutrients.
3. `build_plans.py` writes `plans/plans.json` (all drafts) and `plans/REVIEW.md`, including a
   "which prices to collect first" table.
4. `approve.py <plan-id> --by "Name, role"` approves one plan. A rebuild keeps an approval only
   while that plan is unchanged.
5. `cht-app/tools/build_nutrition_forms.py` puts approved plans, and only those, into the CHT
   feeding counselling form.

**Review workflow for the nutritionist:**

```bash
python review_pack.py                                        # writes plans/REVIEW_PACK.md
python record_decision.py <plan-id> approve --by "Name, role"
python record_decision.py <plan-id> approve_with_changes --by "Name, role" --changes "..."
python record_decision.py <plan-id> reject --by "Name, role" --changes "reason"
python record_decision.py --list
```

Decisions are logged in `plans/decisions.json`, which a rebuild does not touch. Only `approve`
changes a plan. The drafted referral and supplementation wording names no product or dose; the
reviewer confirms it against the current GHS protocol.

```bash
pip install openpyxl scipy pytest
python prepare.py        # downloads sources into .cache/ on first run
python build_plans.py
python -m pytest -q
```

## What the first plans show

With only the prices that pass the check (grains, gari, yam, plantain, cowpea), vitamin A and
calcium stay under 20% of need and zinc under 50% in every plan. Adding orange-fleshed sweet
potato, chicken liver and moringa leaves (not yet priced) would close the vitamin A gap; leaves lift
calcium. Iron and zinc stay short even with every local food, in line with Optifood studies in
northern Ghana, so plans point to the GHS protocol for supplements or micronutrient powders.

## Known limits

- **Prices:** WFP's northern series end in July 2023 (before 2023-24 price changes) and fail the
  consistency check for eggs, chicken, fish, soybean, tomato, garden egg and onion. The CHT
  `market_prices` form collects real prices; export them to `data/local_prices.csv`.
- **Targets:** FAO/WHO 2004 RNIs, read from the document; energy from complementary food
  (200/300/550 kcal) not yet confirmed from the primary WHO/PAHO source. Breast milk's contribution
  is not subtracted, so percentages understate the child's true total.
- **Portions** are planning assumptions until replaced by local intake data.
- **Savannah and North East** use Northern Region prices (no WFP market of their own).

## Sources

- FAO/INFOODS Food Composition Table for Western Africa 2019: https://www.fao.org/fileadmin/user_upload/faoweb/2020/WAFCT_2019.xlsx
- WFP food prices for Ghana (HDX): https://data.humdata.org/dataset/wfp-food-prices-for-ghana
- FAO/WHO Vitamin and mineral requirements in human nutrition, 2nd ed. (2004): https://www.fao.org/3/y2809e/y2809e.pdf
- de Jager, Giller & Brouwer 2018, Food and nutrient gaps in rural Northern Ghana, PLOS ONE (PMC6136797)
- Vossenaar et al. 2016, Optifood in northern Kenya, Public Health Nutrition
