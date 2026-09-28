const { expect } = require('chai');
const TestRunner = require('cht-conf-test-harness');
const { LEVELS } = require('../../priority');
const { pregnancyRegistrationScenarios, pregnancyHomeVisitScenarios } = require('../form-inputs');
const harness = new TestRunner();

const SCREEN = 'task.barrier.screen.title';
const MAKE_PLAN = 'task.birth_plan.make.title';
const COMPLETE_PLAN = 'task.birth_plan.complete.title';
const MISSED = 'task.barrier.after_missed_referral.title';

// safe10Weeks registers on 1999-10-10 with LMP 1999-08-01 (10 weeks).
const REGISTRATION_DAY = '1999-10-10';
const LMP = '1999-08-01';

const screen = ({ travel = 'under_30', transport = 'household', nhis = 'active', money = 'yes',
  decider = 'herself', supports = 'yes', phone = 'own' } = {}) => [
  [travel, transport],
  [nhis, money],
  decider === 'herself' ? [decider, phone] : [decider, supports, phone],
  [],
];

const BOLGA = ['upper_east', 'bolgatanga_municipal', 'bolgatanga_regional_hospital_upper_east'];
const plan = ({ ride = ['named_driver', 'Issah', '0244000111'], money = ['yes', '200'], donor = 'yes',
  decider = 'present' } = {}) => [BOLGA, ride, [...money, donor, decider], []];

const tasksTitled = title => harness.getTasks({ title });

describe('Module 6: hidden barriers', () => {
  before(async () => { return await harness.start(); });
  after(async () => { return await harness.stop(); });
  beforeEach(async () => {
    await harness.clear();
    await harness.setNow(REGISTRATION_DAY);
  });
  afterEach(() => { expect(harness.consoleErrors).to.be.empty; });

  const register = async () => {
    expect((await harness.fillForm('pregnancy', ...pregnancyRegistrationScenarios.safe10Weeks)).errors).to.be.empty;
  };

  describe('barrier screen', () => {
    it('a new pregnancy gets a barrier screen task, ranked with its reason, cleared by screening', async () => {
      await register();
      const [task] = await tasksTitled(SCREEN);
      expect(task.emission.priority).to.equal(LEVELS.BARRIER_SCREEN);
      await harness.loadAction(task);
      expect((await harness.fillForm(...screen())).errors).to.be.empty;
      expect(await tasksTitled(SCREEN)).to.be.empty;
    });

    it('finds every barrier and turns each into an action', async () => {
      const result = await harness.fillForm('barrier_screen', ...screen({
        travel: 'over_2h', transport: 'none', nhis: 'expired', money: 'no',
        decider: 'husband', supports: 'unsure', phone: 'none',
      }));
      expect(result.errors).to.be.empty;
      expect(result.report.fields.r_barriers.split(' ')).to.have.members(
        ['far', 'no_transport', 'no_insurance', 'no_money', 'decider_not_supportive', 'no_phone']);
      expect(result.report.fields.r_barrier_count).to.equal('6');
    });

    it('finds none for a well-supported woman', async () => {
      const result = await harness.fillForm('barrier_screen', ...screen({ decider: 'husband', supports: 'yes' }));
      expect(result.report.fields.r_barriers).to.equal('');
      expect(result.report.fields.r_barrier_count).to.equal('0');
    });

    it('treats "not sure" about NHIS as a barrier to check, not as covered', async () => {
      const result = await harness.fillForm('barrier_screen', ...screen({ nhis: 'unknown' }));
      expect(result.report.fields.r_barriers).to.equal('no_insurance');
    });
  });

  it("barrier screen and birth plan tasks stop when the nurse clears the pregnancy's tasks", async () => {
    // The screen is due in the first weeks; the birth plan only from 24 weeks.
    await register();
    expect(await tasksTitled(SCREEN)).to.have.property('length', 1);
    const cleared = await harness.fillForm('pregnancy_home_visit', ...pregnancyHomeVisitScenarios.clearAll);
    expect(cleared.errors).to.be.empty;
    expect(await tasksTitled(SCREEN)).to.be.empty;

    // Without clearing, the birth plan appears at 26 weeks (see "is due by 32 weeks"); cleared, it doesn't.
    await harness.setNow(LMP);
    await harness.flush(26 * 7);
    expect(await tasksTitled(MAKE_PLAN)).to.be.empty;
  });

  describe('birth plan', () => {
    it('is due by 32 weeks: shown from 24 weeks, not before', async () => {
      await register();
      await harness.setNow(LMP);
      await harness.flush(23 * 7);
      expect(await tasksTitled(MAKE_PLAN)).to.be.empty;
      await harness.flush(7);
      const [task] = await tasksTitled(MAKE_PLAN);
      expect(task.emission.priority).to.equal(LEVELS.BIRTH_PLAN);
    });

    it('an incomplete plan lists what is missing and comes back until it is complete', async () => {
      await register();
      await harness.setNow(LMP);
      await harness.flush(28 * 7);
      const [make] = await tasksTitled(MAKE_PLAN);
      await harness.loadAction(make);
      const first = await harness.fillForm(...plan({ ride: ['none_yet'], money: ['no'], decider: 'not_involved' }));
      expect(first.errors).to.be.empty;
      expect(first.report.fields.r_missing.split(' ')).to.have.members(['ride', 'money', 'decider']);
      expect(await tasksTitled(MAKE_PLAN)).to.be.empty;

      await harness.flush(7);
      const [complete] = await tasksTitled(COMPLETE_PLAN);
      await harness.loadAction(complete);
      const second = await harness.fillForm(...plan());
      expect(second.errors).to.be.empty;
      expect(second.report.fields.r_complete).to.equal('yes');
      expect(await tasksTitled(COMPLETE_PLAN)).to.be.empty;
    });

    it('rejects a driver phone that is not a Ghana number', async () => {
      const result = await harness.fillForm('birth_plan', ...plan({ ride: ['named_driver', 'Issah', '12345'] }));
      expect(result.errors).to.not.be.empty;
    });

    it('supervisors see the share of active pregnancies with a complete plan', async () => {
      await register();
      await harness.fillForm('birth_plan', ...plan());
      const [target] = await harness.getTargets({ type: 'birth-plans-complete' });
      expect(target.value).to.include({ pass: 1, total: 1 });
    });
  });

  describe('after a missed referral', () => {
    const referAndMiss = async reasons => {
      await harness.fillForm('referral', ['urgent', 'fever'], BOLGA, ['husband', 'yes'], []);
      const [confirm] = await tasksTitled('task.referral.confirm_arrival.title');
      await harness.loadAction(confirm);
      expect((await harness.fillForm(['no', reasons, 'yes'], [])).errors).to.be.empty;
    };

    it('transport or money reasons trigger a same-day barrier check that carries the reasons', async () => {
      await referAndMiss('no_transport,no_money');
      const [task] = await tasksTitled(MISSED);
      expect(task.emission.priority).to.equal(LEVELS.BARRIER_AFTER_MISSED_REFERRAL);
      await harness.loadAction(task);
      const result = await harness.fillForm(...screen({ transport: 'none', money: 'no' }));
      expect(result.errors).to.be.empty;
      expect(result.report.fields.inputs.source_reasons).to.equal('no_transport no_money');
      expect(await tasksTitled(MISSED)).to.be.empty;
    });

    it('"she felt better" alone does not trigger a barrier check', async () => {
      await referAndMiss('felt_better');
      expect(await tasksTitled(MISSED)).to.be.empty;
    });
  });
});
