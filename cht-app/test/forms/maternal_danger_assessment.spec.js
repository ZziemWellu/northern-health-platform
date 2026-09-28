const { expect } = require('chai');
const TestRunner = require('cht-conf-test-harness');
const { LEVELS, REASONS } = require('../../priority');
const harness = new TestRunner();

const FORM = 'maternal_danger_assessment';
const FOLLOW_UP_TITLE = 'task.maternal_danger_follow_up.title';

// Builds the page-by-page answers for the form. Defaults describe a well woman in pregnancy.
const answers = (overrides = {}) => {
  const a = {
    stage: 'pregnant', systolic: '110', diastolic: '70', temperature: '36.8',
    convulsions: 'no', headache: 'no', blurred: 'no', epigastric: 'no',
    bleeding: 'no', bleedingMl: '', foul: 'no', feverReported: 'no', labourHours: '',
    ...overrides,
  };
  const symptoms = [a.convulsions, a.headache, a.blurred, a.epigastric, a.bleeding];
  if (a.bleeding === 'yes') {
    symptoms.push(a.bleedingMl);
  }
  symptoms.push(a.foul, a.feverReported);
  if (a.stage === 'labour') {
    symptoms.push(a.labourHours);
  }
  return [[a.stage], [a.systolic, a.diastolic, a.temperature], symptoms, []];
};

const assess = async (overrides) => {
  const result = await harness.fillForm(FORM, ...answers(overrides));
  expect(result.errors).to.be.empty;
  const fields = result.report.fields;
  return { severity: fields.r_severity, reasons: fields.r_reasons ? fields.r_reasons.split(' ') : [] };
};

describe('Module 1: maternal danger assessment (rules ported from MAMA-AI)', () => {
  before(async () => { return await harness.start(); });
  after(async () => { return await harness.stop(); });
  beforeEach(async () => {
    await harness.clear();
    await harness.setNow('2026-09-28');
  });
  afterEach(() => { expect(harness.consoleErrors).to.be.empty; });

  it('finds no danger in a well woman', async () => {
    const { severity, reasons } = await assess();
    expect(severity).to.equal('none');
    expect(reasons).to.be.empty;
  });

  describe('severe hypertension (flags on its own; MAMA-AI also required a headache)', () => {
    it('flags systolic 160 with no headache', async () => {
      const { severity, reasons } = await assess({ systolic: '160', diastolic: '95' });
      expect(severity).to.equal('emergency');
      expect(reasons).to.include('severe_hypertension');
    });

    it('flags diastolic 110 alone (MAMA-AI ignored diastolic pressure)', async () => {
      const { reasons } = await assess({ systolic: '150', diastolic: '110' });
      expect(reasons).to.include('severe_hypertension');
    });

    it('does not flag 159/109 as severe', async () => {
      const { reasons } = await assess({ systolic: '159', diastolic: '109' });
      expect(reasons).to.not.include('severe_hypertension');
    });
  });

  describe('pre-eclampsia signs', () => {
    it('flags 140/90 with a severe headache', async () => {
      const { severity, reasons } = await assess({ systolic: '140', diastolic: '90', headache: 'yes' });
      expect(severity).to.equal('emergency');
      expect(reasons).to.include('pre_eclampsia_signs');
    });

    it('flags raised pressure with blurred vision or upper belly pain too', async () => {
      expect((await assess({ systolic: '145', diastolic: '85', blurred: 'yes' })).reasons).to.include('pre_eclampsia_signs');
      await harness.clear();
      expect((await assess({ systolic: '130', diastolic: '95', epigastric: 'yes' })).reasons).to.include('pre_eclampsia_signs');
    });

    it('does not flag 139/89 with a headache', async () => {
      const { reasons } = await assess({ systolic: '139', diastolic: '89', headache: 'yes' });
      expect(reasons).to.not.include('pre_eclampsia_signs');
    });

    it('does not flag a missing blood pressure as normal or raised: it simply cannot fire', async () => {
      const { reasons } = await assess({ systolic: '', diastolic: '', headache: 'yes' });
      expect(reasons).to.not.include('pre_eclampsia_signs');
      expect(reasons).to.not.include('severe_hypertension');
    });
  });

  it('flags convulsions as an emergency', async () => {
    const { severity, reasons } = await assess({ convulsions: 'yes' });
    expect(severity).to.equal('emergency');
    expect(reasons).to.include('convulsions');
  });

  describe('bleeding', () => {
    it('flags any vaginal bleeding during pregnancy', async () => {
      const { severity, reasons } = await assess({ bleeding: 'yes', bleedingMl: '50' });
      expect(severity).to.equal('emergency');
      expect(reasons).to.include('bleeding_in_pregnancy');
    });

    it('flags more than 500 mL after birth as haemorrhage, and not 500', async () => {
      expect((await assess({ stage: 'after_birth', bleeding: 'yes', bleedingMl: '600' })).reasons).to.include('haemorrhage_after_birth');
      await harness.clear();
      expect((await assess({ stage: 'after_birth', bleeding: 'yes', bleedingMl: '500' })).reasons).to.not.include('haemorrhage_after_birth');
    });
  });

  describe('fever and sepsis', () => {
    it('flags fever with foul discharge as possible sepsis (emergency)', async () => {
      const { severity, reasons } = await assess({ temperature: '38.5', foul: 'yes' });
      expect(severity).to.equal('emergency');
      expect(reasons).to.include('sepsis_signs');
      expect(reasons).to.not.include('fever');
    });

    it('flags reported fever alone as urgent, not emergency', async () => {
      const { severity, reasons } = await assess({ feverReported: 'yes' });
      expect(severity).to.equal('urgent');
      expect(reasons).to.deep.equal(['fever']);
    });

    it('flags a measured 38.0 C, and not 37.9 C', async () => {
      expect((await assess({ temperature: '38.0' })).reasons).to.include('fever');
      await harness.clear();
      expect((await assess({ temperature: '37.9' })).reasons).to.be.empty;
    });
  });

  it('flags 12 hours of labour on its own as urgent (MAMA-AI also required severe pain)', async () => {
    const { severity, reasons } = await assess({ stage: 'labour', labourHours: '12' });
    expect(severity).to.equal('urgent');
    expect(reasons).to.deep.equal(['prolonged_labour']);
  });

  it('reports every rule that fires, not just the first (MAMA-AI stopped at one)', async () => {
    const { severity, reasons } = await assess({
      systolic: '165', diastolic: '112', headache: 'yes', temperature: '38.4', foul: 'yes',
    });
    expect(severity).to.equal('emergency');
    expect(reasons).to.have.members(['severe_hypertension', 'pre_eclampsia_signs', 'sepsis_signs']);
  });

  describe('follow-up task', () => {
    it('a flagged woman tops tomorrow\'s list until a reassessment is done', async () => {
      await assess({ convulsions: 'yes' });
      await harness.flush(1);
      const tasks = await harness.getTasks({ title: FOLLOW_UP_TITLE });
      expect(tasks).to.have.property('length', 1);
      expect(tasks[0].emission.priority).to.equal(LEVELS.DANGER_SIGN_FOLLOW_UP);
      expect(tasks[0].emission.priorityLabel).to.equal(REASONS.DANGER_SIGN_FOLLOW_UP);

      await harness.loadAction(tasks[0]);
      expect((await harness.fillForm(...answers())).errors).to.be.empty;
      expect(await harness.getTasks({ title: FOLLOW_UP_TITLE })).to.be.empty;
    });

    it('a well woman gets no follow-up task', async () => {
      await assess();
      await harness.flush(1);
      expect(await harness.getTasks({ title: FOLLOW_UP_TITLE })).to.be.empty;
    });
  });
});
