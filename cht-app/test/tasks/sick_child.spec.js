const { expect } = require('chai');
const TestRunner = require('cht-conf-test-harness');
const { LEVELS } = require('../../priority');
const harness = new TestRunner();

const TODAY = '2026-09-28';
const FOLLOW_UP = 'task.sick_child.follow_up.title';
const RAISE = 'task.referral.raise.title';
const SMC_CATCH_UP = 'task.smc.catch_up.title';
const SMC_ADHERENCE = 'task.smc.adherence.title';
const SMC_NEXT = 'task.smc.next_cycle.title';

const child = (id, dateOfBirth) => ({
  _id: id, type: 'person', name: id, patient_id: id, date_of_birth: dateOfBirth, reported_date: 1700000000000,
  parent: { _id: 'patient_parent_id', parent: { _id: 'chw_area_id', parent: { _id: 'district_id' } } },
});
const TWO_YEARS = child('child_2y', '2024-09-01');
const EIGHT_MONTHS = child('child_8m', '2026-01-15');
const ONE_MONTH = child('child_1m', '2026-08-20');

// Builds page answers for sick_child, following the form's relevance rules. The age page is
// skipped because every test child has a date of birth.
const sickChild = ({ ageMonths = 24, fever = null, cough = null, diarrhoea = null, blood = 'no',
  convulsions = 'no', unableToDrink = 'no', vomits = 'no', sleepy = 'no', indrawing = 'no',
  swelling = 'no', muac = 'green', rdt = 'positive', breaths = '30' } = {}) => {
  const problems = [];
  problems.push(fever === null ? 'no' : 'yes');
  if (fever !== null) { problems.push(String(fever)); }
  problems.push(cough === null ? 'no' : 'yes');
  if (cough !== null) { problems.push(String(cough)); }
  problems.push(diarrhoea === null ? 'no' : 'yes');
  if (diarrhoea !== null) { problems.push(String(diarrhoea), blood); }

  const danger = [convulsions, unableToDrink, vomits, sleepy];
  if (cough !== null) { danger.push(indrawing); }
  danger.push(swelling);
  if (ageMonths >= 6) { danger.push(muac); }

  const tests = [];
  if (fever !== null) { tests.push(rdt); }
  if (cough !== null) { tests.push(breaths); }

  return tests.length ? [problems, danger, tests, []] : [problems, danger, []];
};

const assess = async (subject, options) => {
  harness.subject = subject._id;
  const result = await harness.fillForm('sick_child', ...sickChild(options));
  expect(result.errors).to.be.empty;
  const f = result.report.fields;
  return { severity: f.r_severity, reasons: f.r_reasons ? f.r_reasons.split(' ') : [], treatments: f.r_treatments ? f.r_treatments.split(' ') : [] };
};

describe('Module 7: sick child at home and malaria prevention', () => {
  before(async () => { return await harness.start(); });
  after(async () => { return await harness.stop(); });
  beforeEach(async () => {
    await harness.clear();
    await harness.setNow(TODAY);
    harness.pushMockedDoc(TWO_YEARS, EIGHT_MONTHS, ONE_MONTH);
  });
  afterEach(() => { expect(harness.consoleErrors).to.be.empty; });

  describe('home treatment', () => {
    it('fever with a positive RDT is malaria: treat at home and check on day 3', async () => {
      const r = await assess(TWO_YEARS, { fever: 2, rdt: 'positive' });
      expect(r.severity).to.equal('none');
      expect(r.treatments).to.deep.equal(['malaria']);
      expect(await harness.getTasks({ title: RAISE })).to.be.empty;

      await harness.flush(2);
      const [task] = await harness.getTasks({ title: FOLLOW_UP });
      expect(task.emission.priority).to.equal(LEVELS.SICK_CHILD_FOLLOW_UP);
      await harness.loadAction(task);
      expect((await harness.fillForm(['better', 'no', 'yes'], [])).errors).to.be.empty;
      expect(await harness.getTasks({ title: FOLLOW_UP })).to.be.empty;
    });

    it('fast breathing depends on age: 40 per minute at 24 months, 50 at 8 months', async () => {
      expect((await assess(TWO_YEARS, { cough: 3, breaths: '40' })).treatments).to.deep.equal(['pneumonia']);
      await harness.clear(); harness.pushMockedDoc(TWO_YEARS, EIGHT_MONTHS);
      expect((await assess(TWO_YEARS, { cough: 3, breaths: '39' })).treatments).to.be.empty;
      await harness.clear(); harness.pushMockedDoc(TWO_YEARS, EIGHT_MONTHS);
      expect((await assess(EIGHT_MONTHS, { ageMonths: 8, cough: 3, breaths: '50' })).treatments).to.deep.equal(['pneumonia']);
      await harness.clear(); harness.pushMockedDoc(TWO_YEARS, EIGHT_MONTHS);
      expect((await assess(EIGHT_MONTHS, { ageMonths: 8, cough: 3, breaths: '49' })).treatments).to.be.empty;
    });

    it('diarrhoea under 14 days without blood gets ORS and zinc; yellow MUAC gets nutrition referral', async () => {
      const r = await assess(TWO_YEARS, { diarrhoea: 3, muac: 'yellow' });
      expect(r.treatments).to.have.members(['diarrhoea', 'yellow_muac']);
      expect(r.severity).to.equal('none');
    });

    it('a child who is not better on day 3 is referred', async () => {
      await assess(TWO_YEARS, { fever: 2 });
      await harness.flush(3);
      const [task] = await harness.getTasks({ title: FOLLOW_UP });
      await harness.loadAction(task);
      const result = await harness.fillForm(['same', 'no', 'yes'], []);
      expect(result.report.fields.r_severity).to.equal('urgent');
      expect(await harness.getTasks({ title: RAISE })).to.have.property('length', 1);
    });
  });

  describe('danger signs: refer, never treat at home', () => {
    it('chest indrawing is an emergency that tops the list with "raise referral"', async () => {
      const r = await assess(TWO_YEARS, { cough: 2, indrawing: 'yes', breaths: '55' });
      expect(r.severity).to.equal('emergency');
      expect(r.reasons).to.deep.equal(['chest_indrawing']);
      expect(r.treatments).to.be.empty;
      const [raise] = await harness.getTasks({ title: RAISE });
      expect(raise.emission.priority).to.equal(LEVELS.RAISE_REFERRAL);
      expect(await harness.getTasks({ title: FOLLOW_UP })).to.be.empty;
    });

    it('long illness is a danger sign: fever 7 days, cough 21 days, diarrhoea 14 days', async () => {
      expect((await assess(TWO_YEARS, { fever: 7 })).reasons).to.include('fever_7_days');
      await harness.clear(); harness.pushMockedDoc(TWO_YEARS);
      expect((await assess(TWO_YEARS, { cough: 21 })).reasons).to.include('cough_21_days');
      await harness.clear(); harness.pushMockedDoc(TWO_YEARS);
      expect((await assess(TWO_YEARS, { diarrhoea: 14 })).reasons).to.include('diarrhoea_14_days');
      await harness.clear(); harness.pushMockedDoc(TWO_YEARS);
      expect((await assess(TWO_YEARS, { fever: 6 })).reasons).to.be.empty;
    });

    it('blood in the stool, red MUAC and swollen feet are each a danger sign', async () => {
      expect((await assess(TWO_YEARS, { diarrhoea: 2, blood: 'yes' })).reasons).to.include('blood_in_stool');
      await harness.clear(); harness.pushMockedDoc(TWO_YEARS);
      const r = await assess(TWO_YEARS, { muac: 'red', swelling: 'yes' });
      expect(r.reasons).to.have.members(['red_muac', 'swelling_both_feet']);
    });

    it('a sick baby under 2 months is always referred', async () => {
      const r = await assess(ONE_MONTH, { ageMonths: 1, fever: 1 });
      expect(r.severity).to.equal('emergency');
      expect(r.reasons).to.include('young_infant');
    });

    it('fever with no malaria test available is urgent: it cannot be treated as malaria', async () => {
      const r = await assess(TWO_YEARS, { fever: 2, rdt: 'not_done' });
      expect(r.severity).to.equal('urgent');
      expect(r.reasons).to.deep.equal(['fever_no_rdt']);
      expect(r.treatments).to.be.empty;
      expect(await harness.getTasks({ title: RAISE })).to.have.property('length', 1);
    });
  });

  describe('seasonal malaria chemoprevention', () => {
    const dose = (cycle, given, extra) => [[cycle, given, extra], []];

    it('a given dose schedules the home-dose check (day 3) and the next cycle (day 28)', async () => {
      harness.subject = TWO_YEARS._id;
      expect((await harness.fillForm('smc_dose', ...dose('1', 'yes', 'yes'))).errors).to.be.empty;
      await harness.flush(2);
      const [check] = await harness.getTasks({ title: SMC_ADHERENCE });
      expect(check.emission.priority).to.equal(LEVELS.SMC_ADHERENCE);
      await harness.loadAction(check);
      expect((await harness.fillForm(['yes', 'yes', 'no'], [])).errors).to.be.empty;
      expect(await harness.getTasks({ title: SMC_ADHERENCE })).to.be.empty;

      const [target] = await harness.getTargets({ type: 'smc-doses-complete' });
      expect(target.value).to.include({ pass: 1, total: 1 });

      await harness.flush(23);
      expect(await harness.getTasks({ title: SMC_NEXT })).to.have.property('length', 1);
    });

    it('no next cycle after cycle 4', async () => {
      harness.subject = TWO_YEARS._id;
      await harness.fillForm('smc_dose', ...dose('4', 'yes', 'yes'));
      await harness.flush(26);
      expect(await harness.getTasks({ title: SMC_NEXT })).to.be.empty;
    });

    it('a child not at home gets a catch-up visit tomorrow, ranked above routine visits', async () => {
      harness.subject = TWO_YEARS._id;
      expect((await harness.fillForm('smc_dose', ...dose('2', 'no', 'absent'))).errors).to.be.empty;
      await harness.flush(1);
      const [task] = await harness.getTasks({ title: SMC_CATCH_UP });
      expect(task.emission.priority).to.equal(LEVELS.SMC_CATCH_UP);
      await harness.loadAction(task);
      expect((await harness.fillForm(...dose('2', 'yes', 'yes'))).errors).to.be.empty;
      expect(await harness.getTasks({ title: SMC_CATCH_UP })).to.be.empty;
    });

    it('a refusal is recorded but does not create a catch-up visit', async () => {
      harness.subject = TWO_YEARS._id;
      await harness.fillForm('smc_dose', ...dose('2', 'no', 'refused'));
      await harness.flush(1);
      expect(await harness.getTasks({ title: SMC_CATCH_UP })).to.be.empty;
    });
  });
});
