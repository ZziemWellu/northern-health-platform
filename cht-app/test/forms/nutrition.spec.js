const { expect } = require('chai');
const TestRunner = require('cht-conf-test-harness');
const harness = new TestRunner();

// Module 3. No plan is nutritionist-approved yet (nutrition/plans/plans.json is all drafts), so the
// counselling form must fall back to standard GHS counselling; tools/test_build_nutrition_forms.py
// checks that approved plans are shown and drafts never are.
const TODAY = '2026-09-28';
const child = {
  _id: 'child_14m', type: 'person', name: 'child_14m', patient_id: 'child_14m', date_of_birth: '2025-07-20',
  reported_date: 1700000000000, parent: { _id: 'patient_parent_id', parent: { _id: 'chw_area_id', parent: { _id: 'district_id' } } },
};

describe('Module 3: local-food nutrition forms', () => {
  before(async () => { return await harness.start(); });
  after(async () => { return await harness.stop(); });
  beforeEach(async () => {
    await harness.clear();
    await harness.setNow(TODAY);
    harness.pushMockedDoc(child);
    harness.subject = child._id;
  });
  afterEach(() => { expect(harness.consoleErrors).to.be.empty; });

  it('works out age group, season and plan id, and records dietary diversity', async () => {
    const result = await harness.fillForm('feeding_counselling',
      ['upper_east'], ['breast_milk,grains_roots,pulses_nuts,vita_fruit_veg,other_fruit_veg'], []);
    expect(result.errors).to.be.empty;
    const f = result.report.fields;
    expect(f.r_age_group).to.equal('12_23m');
    expect(f.r_season).to.equal('lean'); // September counts as lean season
    expect(f.r_plan_id).to.equal('upper_east-lean-12_23m');
    expect(f.r_mdd_score).to.equal('5');
    expect(f.r_mdd_met).to.equal('yes');
    expect(f.r_plan_shown).to.equal(''); // no approved plan yet
  });

  it('marks fewer than 5 food groups as below the minimum', async () => {
    const result = await harness.fillForm('feeding_counselling', ['northern'], ['breast_milk,grains_roots'], []);
    expect(result.report.fields.r_mdd_met).to.equal('no');
  });

  it('turns a weighed market price into cedis per kilogram, and skips foods not sold today', async () => {
    const pages = [['upper_east', 'Bolgatanga']];
    pages.push(['30', '5000']);           // white maize: GHS 30 for 5 kg
    for (let i = 0; i < 24; i++) { pages.push([]); }
    const result = await harness.fillForm('market_prices', ...pages);
    expect(result.errors).to.be.empty;
    expect(result.report.fields.data.__maize_white).to.equal('6');
    expect(result.report.fields.data.__millet).to.equal('');
  });
});
