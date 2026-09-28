const { expect } = require('chai');
const TestRunner = require('cht-conf-test-harness');
const { LEVELS, REASONS } = require('../../priority');
const harness = new TestRunner();

const RAISE = 'task.referral.raise.title';
const CONFIRM = 'task.referral.confirm_arrival.title';
const STILL_OPEN = 'task.referral.still_open.title';

// Maternal danger assessment answers (see maternal_danger_assessment.spec.js for the full shape).
const assessment = ({ convulsions = 'no', feverReported = 'no' } = {}) => [
  ['pregnant'], ['110', '70', '36.8'], [convulsions, 'no', 'no', 'no', 'no', 'no', feverReported], [],
];

// Referral answers. With reasons pre-filled from an assessment, page 1 asks only the severity.
const BOLGA = ['upper_east', 'bolgatanga_municipal', 'bolgatanga_regional_hospital_upper_east'];
const referral = ({ severity = 'emergency', reasons, people = ['husband', 'yes'] } = {}) => [
  reasons ? [severity, reasons] : [severity],
  BOLGA,
  people,
  [],
];

const arrived = [['yes', 'facility', 'admitted'], []];
const notYet = [['not_yet'], []];
const didNotGo = [['no', 'no_transport,no_money', 'yes'], []];

const tasksTitled = title => harness.getTasks({ title });

describe('Module 2: referrals are tracked until she arrives', () => {
  before(async () => { return await harness.start(); });
  after(async () => { return await harness.stop(); });
  beforeEach(async () => {
    await harness.clear();
    await harness.setNow('2026-09-28');
  });
  afterEach(() => { expect(harness.consoleErrors).to.be.empty; });

  const raiseFromAssessment = async (severity = 'emergency', assessmentOptions = { convulsions: 'yes' }) => {
    expect((await harness.fillForm('maternal_danger_assessment', ...assessment(assessmentOptions))).errors).to.be.empty;
    const [raise] = await tasksTitled(RAISE);
    await harness.loadAction(raise);
    const result = await harness.fillForm(...referral({ severity }));
    expect(result.errors).to.be.empty;
    return result.report;
  };

  it('a danger sign puts "raise referral" at the very top of today\'s list, with its reason', async () => {
    await harness.fillForm('maternal_danger_assessment', ...assessment({ convulsions: 'yes' }));
    const tasks = await tasksTitled(RAISE);
    expect(tasks).to.have.property('length', 1);
    expect(tasks[0].emission.priority).to.equal(LEVELS.RAISE_REFERRAL);
    expect(tasks[0].emission.priorityLabel).to.equal(REASONS.RAISE_REFERRAL);

    const all = (await harness.getTasks()).map(t => t.emission.priority);
    expect(Math.max(...all)).to.equal(LEVELS.RAISE_REFERRAL);
  });

  it('the referral carries the assessment\'s reasons, a code, the destination and a deadline', async () => {
    const report = await raiseFromAssessment();
    expect(report.fields.r_reasons).to.equal('convulsions');
    expect(report.fields.r_severity).to.equal('emergency');
    expect(report.fields.r_deadline_days).to.equal('1');
    expect(report.fields.referral_code).to.match(/^R[0-9a-f]{6}$/);
    expect(report.fields.r_destination_name).to.equal('Bolgatanga Regional Hospital (Regional Hospital)');
    expect(await tasksTitled(RAISE)).to.be.empty;
  });

  it('a nurse cannot downgrade an emergency from the assessment', async () => {
    const report = await raiseFromAssessment('routine');
    expect(report.fields.r_severity).to.equal('emergency');
  });

  it('after a referral, "confirm arrival" is on the list at unconfirmed-referral priority', async () => {
    await raiseFromAssessment();
    const tasks = await tasksTitled(CONFIRM);
    expect(tasks).to.have.property('length', 1);
    expect(tasks[0].emission.priority).to.equal(LEVELS.REFERRAL_UNCONFIRMED);
  });

  it('confirming arrival closes the loop', async () => {
    await raiseFromAssessment();
    const [confirm] = await tasksTitled(CONFIRM);
    await harness.loadAction(confirm);
    expect((await harness.fillForm(...arrived)).errors).to.be.empty;
    expect(await tasksTitled(CONFIRM)).to.be.empty;
    expect(await tasksTitled(STILL_OPEN)).to.be.empty;
  });

  it('"not yet" keeps the referral open and brings the nurse back tomorrow, until she arrives', async () => {
    await raiseFromAssessment();
    const [confirm] = await tasksTitled(CONFIRM);
    await harness.loadAction(confirm);
    await harness.fillForm(...notYet);
    expect(await tasksTitled(CONFIRM)).to.be.empty;

    await harness.flush(1);
    const [open] = await tasksTitled(STILL_OPEN);
    expect(open.emission.priority).to.equal(LEVELS.REFERRAL_UNCONFIRMED);
    await harness.loadAction(open);
    expect((await harness.fillForm(...arrived)).errors).to.be.empty;
    expect(await tasksTitled(STILL_OPEN)).to.be.empty;
  });

  it('"did not go" records why (for Module 6) and stays open while she still needs care', async () => {
    await raiseFromAssessment();
    const [confirm] = await tasksTitled(CONFIRM);
    await harness.loadAction(confirm);
    const result = await harness.fillForm(...didNotGo);
    expect(result.errors).to.be.empty;
    expect(result.report.fields.data.__not_arrived_reasons).to.equal('no_transport no_money');
    await harness.flush(1);
    expect(await tasksTitled(STILL_OPEN)).to.have.property('length', 1);
  });

  it('each referral is tracked separately: confirming one does not close another', async () => {
    await raiseFromAssessment();
    await harness.flush(1);
    // A second, direct referral for a different problem.
    expect((await harness.fillForm('referral', ...referral({ severity: 'urgent', reasons: 'fever' }))).errors).to.be.empty;

    const confirms = await tasksTitled(CONFIRM);
    expect(confirms).to.have.property('length', 2);
    await harness.loadAction(confirms[0]);
    await harness.fillForm(...arrived);
    expect(await tasksTitled(CONFIRM)).to.have.property('length', 1);
  });

  it('the decider can only be called with her consent, and needs a valid number', async () => {
    await harness.fillForm('maternal_danger_assessment', ...assessment({ convulsions: 'yes' }));
    const [raise] = await tasksTitled(RAISE);
    await harness.loadAction(raise);
    const bad = await harness.fillForm(['emergency'], BOLGA, ['none', 'no', 'yes', '12345'], []);
    expect(bad.errors).to.not.be.empty;

    await harness.clear();
    await harness.fillForm('maternal_danger_assessment', ...assessment({ convulsions: 'yes' }));
    const [raise2] = await tasksTitled(RAISE);
    await harness.loadAction(raise2);
    const good = await harness.fillForm(['emergency'], BOLGA, ['none', 'no', 'yes', '0244714242'], []);
    expect(good.errors).to.be.empty;
    expect(good.report.fields.data.__consent_call_decider).to.equal('yes');
  });

  describe('supervisor targets', () => {
    it('counts referrals raised and the share confirmed arrived', async () => {
      await raiseFromAssessment();
      await harness.flush(1);
      await harness.fillForm('referral', ...referral({ severity: 'urgent', reasons: 'fever' }));
      const [confirm] = await tasksTitled(CONFIRM);
      await harness.loadAction(confirm);
      await harness.fillForm(...arrived);

      const [raised] = await harness.getTargets({ type: 'referrals-raised' });
      expect(raised.value.total).to.equal(2);
      const [confirmed] = await harness.getTargets({ type: 'referrals-arrival-confirmed' });
      expect(confirmed.value).to.include({ pass: 1, total: 2, percent: 50 });
    });
  });
});
