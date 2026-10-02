const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-like'));
chai.use(require('chai-things'));

const TestRunner = require('cht-conf-test-harness');
const { deliveryReportScenarios, pregnancyHomeVisitScenarios } = require('../form-inputs');
const { LEVELS, REASONS } = require('../../priority');
const harness = new TestRunner();

// deliveryReportScenarios record a birth on 2000-04-22.
const BIRTH_DAY = '2000-04-22';
const VISIT_TITLE = 'task.pnc.newborn_home_visit.title';
const FOLLOW_UP_TITLE = 'task.pnc.newborn_danger_sign_follow_up.title';

// pnc_home_visit pages: newborn (seen, 9 danger signs, breastfeeding), mother (5 signs), summary.
const newbornVisit = {
  allWell: [['yes', ...Array(9).fill('no'), 'yes'], Array(5).fill('no'), []],
  babyNotFeeding: [['yes', 'no', 'yes', ...Array(7).fill('no'), 'yes'], Array(5).fill('no'), []],
  babyNotSeen: [['no'], Array(5).fill('no'), []],
};

const emissionOf = task => task.emission;

describe('Module 1: newborn home visits (day 1, 3, 7, week 6) ranked by urgency', () => {
  before(async () => { return await harness.start(); });
  after(async () => { return await harness.stop(); });
  beforeEach(async () => {
    await harness.clear();
    await harness.setNow(BIRTH_DAY);
  });
  afterEach(() => { expect(harness.consoleErrors).to.be.empty; });

  const recordDelivery = async (scenario = deliveryReportScenarios.oneChildHealthyHome) => {
    const result = await harness.fillForm('delivery', ...scenario);
    expect(result.errors).to.be.empty;
  };

  it('shows the day-1 visit on the day of birth, at newborn-day-1 priority with its reason', async () => {
    await recordDelivery();
    const tasks = await harness.getTasks({ title: VISIT_TITLE });
    expect(tasks).to.have.property('length', 1);
    expect(emissionOf(tasks[0]).priority).to.equal(LEVELS.NEWBORN_DAY_1);
    expect(emissionOf(tasks[0]).priorityLabel).to.equal(REASONS.NEWBORN_DAY_1);
  });

  it('walks through day 1, day 3, day 7 and week 6 as each visit is done, then stops', async () => {
    await recordDelivery();

    let tasks = await harness.getTasks({ title: VISIT_TITLE });
    await harness.loadAction(tasks[0]);
    expect((await harness.fillForm(...newbornVisit.allWell)).errors).to.be.empty;
    expect(await harness.getTasks({ title: VISIT_TITLE })).to.be.empty;

    await harness.flush(3); // day 3
    tasks = await harness.getTasks({ title: VISIT_TITLE });
    expect(tasks).to.have.property('length', 1);
    expect(emissionOf(tasks[0]).priority).to.equal(LEVELS.NEWBORN_DAY_3);
    await harness.loadAction(tasks[0]);
    expect((await harness.fillForm(...newbornVisit.allWell)).errors).to.be.empty;
    expect(await harness.getTasks({ title: VISIT_TITLE })).to.be.empty;

    await harness.flush(4); // day 7
    tasks = await harness.getTasks({ title: VISIT_TITLE });
    expect(tasks).to.have.property('length', 1);
    expect(emissionOf(tasks[0]).priority).to.equal(LEVELS.NEWBORN_DAY_7);
    await harness.loadAction(tasks[0]);
    expect((await harness.fillForm(...newbornVisit.allWell)).errors).to.be.empty;
    expect(await harness.getTasks({ title: VISIT_TITLE })).to.be.empty;

    await harness.flush(35); // day 42: WHO's fourth postnatal contact
    tasks = await harness.getTasks({ title: VISIT_TITLE });
    expect(tasks).to.have.property('length', 1);
    expect(emissionOf(tasks[0]).priority).to.equal(LEVELS.NEWBORN_WEEK_6);
    await harness.loadAction(tasks[0]);
    expect((await harness.fillForm(...newbornVisit.allWell)).errors).to.be.empty;

    await harness.flush(10); // day 52: tracking has ended
    expect(await harness.getTasks({ title: VISIT_TITLE })).to.be.empty;
  });

  it('a missed day-1 visit gives way to the day-3 visit rather than piling up', async () => {
    await recordDelivery();
    await harness.flush(3);
    const tasks = await harness.getTasks({ title: VISIT_TITLE });
    expect(tasks).to.have.property('length', 1);
    expect(emissionOf(tasks[0]).priority).to.equal(LEVELS.NEWBORN_DAY_3);
  });

  it('a newborn danger sign at a visit brings the nurse back tomorrow, at the top of the list', async () => {
    await recordDelivery();
    const [visit] = await harness.getTasks({ title: VISIT_TITLE });
    await harness.loadAction(visit);
    expect((await harness.fillForm(...newbornVisit.babyNotFeeding)).errors).to.be.empty;

    await harness.flush(1);
    const followUps = await harness.getTasks({ title: FOLLOW_UP_TITLE });
    expect(followUps).to.have.property('length', 1);
    expect(emissionOf(followUps[0]).priority).to.equal(LEVELS.DANGER_SIGN_FOLLOW_UP);
    expect(emissionOf(followUps[0]).priorityLabel).to.equal(REASONS.DANGER_SIGN_FOLLOW_UP);

    // The follow-up outranks any routine visit due the same day.
    const all = (await harness.getTasks()).map(emissionOf);
    const top = [...all].sort((a, b) => b.priority - a.priority)[0];
    expect(top.title).to.equal(FOLLOW_UP_TITLE);
  });

  it('a baby who was not seen also triggers a next-day follow-up', async () => {
    await recordDelivery();
    const [visit] = await harness.getTasks({ title: VISIT_TITLE });
    await harness.loadAction(visit);
    expect((await harness.fillForm(...newbornVisit.babyNotSeen)).errors).to.be.empty;
    await harness.flush(1);
    expect(await harness.getTasks({ title: FOLLOW_UP_TITLE })).to.have.property('length', 1);
  });

  it('newborn visits stop when the nurse clears the household\'s tasks (refused care or moved away)', async () => {
    await recordDelivery();
    expect(await harness.getTasks({ title: VISIT_TITLE })).to.have.property('length', 1);
    await harness.flush(1);
    const cleared = await harness.fillForm('pregnancy_home_visit', ...pregnancyHomeVisitScenarios.clearAll);
    expect(cleared.errors).to.be.empty;
    expect(await harness.getTasks({ title: VISIT_TITLE })).to.be.empty;
  });

  it('a clean follow-up visit clears the follow-up', async () => {
    await recordDelivery();
    const [visit] = await harness.getTasks({ title: VISIT_TITLE });
    await harness.loadAction(visit);
    await harness.fillForm(...newbornVisit.babyNotFeeding);
    await harness.flush(1);
    const [followUp] = await harness.getTasks({ title: FOLLOW_UP_TITLE });
    await harness.loadAction(followUp);
    expect((await harness.fillForm(...newbornVisit.allWell)).errors).to.be.empty;
    expect(await harness.getTasks({ title: FOLLOW_UP_TITLE })).to.be.empty;
  });
});
