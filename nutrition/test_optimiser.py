"""Tests for the Module 3 optimiser, on small made-up foods where the right answer is known."""
import pytest

from optimiser import Food, optimise

RNI = {"iron_mg": 10.0, "vitamin_a_mcg_rae": 400.0}


def food(id_, energy, iron, vit_a, cost, max_g=500):
    return Food(id=id_, label=id_, nutrients={"iron_mg": iron, "vitamin_a_mcg_rae": vit_a},
                energy_kcal=energy, cost_per_100g=cost, max_g=max_g)


def test_picks_the_cheaper_of_two_equivalent_foods():
    plan = optimise([food("dear", 300, 5, 200, cost=2.0), food("cheap", 300, 5, 200, cost=1.0)],
                    RNI, energy_kcal=600)
    assert plan.feasible
    assert set(plan.grams) == {"cheap"}
    assert plan.adequacy["iron_mg"] == pytest.approx(1.0, abs=0.02)


def test_prefers_nutrition_over_cost_then_minimises_cost():
    # "cheap" has no vitamin A; the plan must still add enough "leaf" to cover it.
    plan = optimise([food("cheap", 350, 5, 0, cost=0.5), food("leaf", 60, 3, 800, cost=1.5, max_g=100)],
                    RNI, energy_kcal=350)
    assert plan.grams["leaf"] >= 50
    assert plan.adequacy["vitamin_a_mcg_rae"] >= 0.99
    assert plan.problem_nutrients == []


def test_lifts_the_worst_nutrient_first_rather_than_chasing_easy_ones():
    # "vit_a_easy" pushes vitamin A to 100% cheaply but gives no iron; "balanced" gives both, more
    # modestly. Summing adequacies would take the easy vitamin A; a balanced plan must lift iron.
    easy = Food(id="vit_a_easy", label="e", nutrients={"iron_mg": 0, "vitamin_a_mcg_rae": 800},
                energy_kcal=100, cost_per_100g=0.1, max_g=300)
    balanced = Food(id="balanced", label="b", nutrients={"iron_mg": 4, "vitamin_a_mcg_rae": 150},
                    energy_kcal=100, cost_per_100g=0.1, max_g=300)
    # Only ~100 kcal (about 100 g) fits: summing adequacies picks "vit_a_easy" (100% + 0%), leaving
    # iron at zero; lifting the worst nutrient first picks "balanced" (about 40% + 40%).
    plan = optimise([easy, balanced], RNI, energy_kcal=100)
    worst = min(plan.adequacy.values())
    assert worst >= 0.35, plan.adequacy


def test_reports_problem_nutrients_instead_of_hiding_them():
    plan = optimise([food("staple", 350, 2, 0, cost=0.5)], RNI, energy_kcal=350)
    assert plan.feasible
    assert set(plan.problem_nutrients) == {"iron_mg", "vitamin_a_mcg_rae"}
    assert plan.adequacy["vitamin_a_mcg_rae"] == 0


def test_respects_portion_limits_and_energy_window():
    plan = optimise([food("a", 100, 5, 100, cost=1, max_g=150), food("b", 100, 5, 100, cost=1, max_g=150)],
                    RNI, energy_kcal=250, energy_tolerance=0.1)
    assert all(g <= 150 for g in plan.grams.values())
    assert 225 <= plan.energy_kcal <= 275


def test_infeasible_when_energy_cannot_be_reached():
    plan = optimise([food("watery", 20, 1, 10, cost=1, max_g=100)], RNI, energy_kcal=550)
    assert not plan.feasible
    assert "energy" in plan.reason


def test_unknown_values_count_as_zero_and_are_listed():
    mystery = Food(id="mystery", label="m", nutrients={"iron_mg": 20, "vitamin_a_mcg_rae": None},
                   energy_kcal=350, cost_per_100g=0.1, max_g=200)
    plan = optimise([mystery], RNI, energy_kcal=350)
    assert plan.unknown_values == {"mystery": ["vitamin_a_mcg_rae"]}
    assert "vitamin_a_mcg_rae" in plan.problem_nutrients


def test_no_foods():
    assert optimise([], RNI, energy_kcal=200).feasible is False


def test_a_zero_or_missing_rni_is_refused_instead_of_dividing_by_zero():
    import pytest
    from optimiser import optimise
    with pytest.raises(ValueError, match="RNI"):
        optimise([], {"iron_mg": 0}, 200)
    with pytest.raises(ValueError, match="RNI"):
        optimise([], {"iron_mg": None}, 200)
    with pytest.raises(ValueError, match="energy"):
        optimise([], {"iron_mg": 5}, 0)
