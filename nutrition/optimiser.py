"""Module 3 optimiser: the cheapest mix of local foods that gets a young child's complementary diet as
close as local foods allow to each nutrient's daily need.

Three linear programmes (the Optifood idea, solved with SciPy's HiGHS), all with energy inside the
age group's window and every food within its portion limit:

1a. Lift the worst-covered nutrient as far as possible (maximin), so no nutrient is sacrificed for
    one that is easy to raise.
1b. Then raise the others, each capped at 100% of the RNI, without dropping any below that level.
2.  Cheapest: minimise cost while holding every nutrient at the level stage 1 reached.

Nutrients still under the adequacy threshold (70% of RNI, as in de Jager et al. 2018) are reported
as problem nutrients: local foods at these prices cannot supply them, and the plan says so instead of
pretending. Unknown composition values count as zero and are listed.
"""
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import linprog

HOLD_TOLERANCE = 0.005  # stage 2 may lose at most half a percentage point of adequacy per nutrient


@dataclass
class Food:
    id: str
    label: str
    nutrients: dict          # per 100 g as bought; None = unknown
    energy_kcal: float       # per 100 g as bought
    cost_per_100g: float     # GHS
    max_g: float


@dataclass
class Plan:
    feasible: bool
    grams: dict = field(default_factory=dict)
    cost_ghs: float = 0.0
    energy_kcal: float = 0.0
    adequacy: dict = field(default_factory=dict)    # nutrient -> fraction of RNI supplied (uncapped)
    problem_nutrients: list = field(default_factory=list)
    unknown_values: dict = field(default_factory=dict)  # food id -> nutrients counted as zero
    reason: str = ""


def optimise(foods, rni, energy_kcal, energy_tolerance=0.1, adequacy_threshold=0.7):
    nutrients = list(rni)
    n, k = len(foods), len(nutrients)
    if n == 0:
        return Plan(feasible=False, reason="No foods with usable prices.")

    comp = np.array([[f.nutrients.get(m) or 0.0 for m in nutrients] for f in foods])  # n x k, per 100 g
    energy = np.array([f.energy_kcal for f in foods])
    cost = np.array([f.cost_per_100g for f in foods])
    upper = [f.max_g / 100 for f in foods]
    rni_vec = np.array([rni[m] for m in nutrients])

    # Variables: x (n foods, in units of 100 g) then s (k nutrient adequacies, 0..1).
    lo, hi = (1 - energy_tolerance) * energy_kcal, (1 + energy_tolerance) * energy_kcal
    a_ub = [np.concatenate([energy, np.zeros(k)]), np.concatenate([-energy, np.zeros(k)])]
    b_ub = [hi, -lo]
    for j in range(k):  # s_j * RNI_j <= supply_j
        row = np.concatenate([-comp[:, j], np.zeros(k)])
        row[n + j] = rni_vec[j]
        a_ub.append(row)
        b_ub.append(0.0)
    bounds = [(0, u) for u in upper] + [(0, 1)] * k

    # Stage 1a: lift the worst-covered nutrient as far as possible (maximise t with t <= every s_j).
    # One extra variable t at the end.
    a_ub_t = [np.concatenate([r, [0.0]]) for r in a_ub]
    for j in range(k):
        row = np.zeros(n + k + 1)
        row[-1] = 1.0
        row[n + j] = -1.0
        a_ub_t.append(row)
    b_ub_t = b_ub + [0.0] * k
    worst = linprog(c=np.concatenate([np.zeros(n + k), [-1.0]]), A_ub=np.array(a_ub_t), b_ub=np.array(b_ub_t),
                    bounds=bounds + [(0, 1)], method="highs")
    if worst.status != 0:
        return Plan(feasible=False, reason="These foods cannot reach the energy target within the portion limits.")
    floor = max(0.0, worst.x[-1] - HOLD_TOLERANCE)

    # Stage 1b: then raise the others as far as possible without dropping any below that floor.
    lifted_bounds = [(0, u) for u in upper] + [(floor, 1)] * k
    best = linprog(c=np.concatenate([np.zeros(n), -np.ones(k)]), A_ub=np.array(a_ub), b_ub=np.array(b_ub),
                   bounds=lifted_bounds, method="highs")
    if best.status != 0:
        return Plan(feasible=False, reason="These foods cannot reach the energy target within the portion limits.")
    reached = best.x[n:]

    hold_bounds = [(0, u) for u in upper] + [(max(0.0, reached[j] - HOLD_TOLERANCE), 1) for j in range(k)]
    cheapest = linprog(c=np.concatenate([cost, np.zeros(k)]), A_ub=np.array(a_ub), b_ub=np.array(b_ub),
                       bounds=hold_bounds, method="highs")
    x = (cheapest.x if cheapest.status == 0 else best.x)[:n]

    # Round DOWN to whole grams: rounding up could push energy or a portion past its limit.
    grams = {f.id: int(np.floor(float(v) * 100 + 1e-6)) for f, v in zip(foods, x) if v * 100 >= 1}
    x_rounded = np.array([grams.get(f.id, 0) / 100 for f in foods])
    supply = x_rounded @ comp
    adequacy = {m: round(float(supply[j] / rni_vec[j]), 3) for j, m in enumerate(nutrients)}
    used = [f for f in foods if f.id in grams]
    return Plan(
        feasible=True,
        grams=grams,
        cost_ghs=round(float(x_rounded @ cost), 2),
        energy_kcal=round(float(x_rounded @ energy)),
        adequacy=adequacy,
        problem_nutrients=[m for m in nutrients if adequacy[m] < adequacy_threshold],
        unknown_values={f.id: [m for m in nutrients if f.nutrients.get(m) is None] for f in used
                        if any(f.nutrients.get(m) is None for m in nutrients)},
    )
