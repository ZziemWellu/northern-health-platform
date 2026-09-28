const { expect } = require('chai');
const { LEVELS, REASONS, priorityFor, newbornVisitPriority, NEWBORN_EVENT_KINDS } = require('../../priority');

describe('Module 1 priority scheme', () => {
  it('puts an emergency with no referral yet at the very top', () => {
    Object.entries(LEVELS).filter(([kind]) => kind !== 'RAISE_REFERRAL')
      .forEach(([kind, level]) => expect(LEVELS.RAISE_REFERRAL, kind).to.be.greaterThan(level));
  });

  it('ranks danger-sign follow-ups and unconfirmed referrals above every routine visit', () => {
    const urgent = ['RAISE_REFERRAL', 'DANGER_SIGN_FOLLOW_UP', 'RAISE_REFERRAL_URGENT', 'REFERRAL_UNCONFIRMED'];
    Object.entries(LEVELS).filter(([kind]) => !urgent.includes(kind)).forEach(([kind, level]) => {
      expect(LEVELS.DANGER_SIGN_FOLLOW_UP, kind).to.be.greaterThan(level);
      expect(LEVELS.REFERRAL_UNCONFIRMED, kind).to.be.greaterThan(level);
    });
  });

  it('ranks an urgent referral below an emergency and danger-sign follow-ups, above an unconfirmed one', () => {
    expect(LEVELS.RAISE_REFERRAL).to.be.greaterThan(LEVELS.DANGER_SIGN_FOLLOW_UP);
    expect(LEVELS.DANGER_SIGN_FOLLOW_UP).to.be.greaterThan(LEVELS.RAISE_REFERRAL_URGENT);
    expect(LEVELS.RAISE_REFERRAL_URGENT).to.be.greaterThan(LEVELS.REFERRAL_UNCONFIRMED);
  });

  it('ranks the newborn first week above pregnancy and delivery tasks, day 1 highest', () => {
    expect(LEVELS.NEWBORN_DAY_1).to.be.greaterThan(LEVELS.NEWBORN_DAY_3);
    expect(LEVELS.NEWBORN_DAY_3).to.be.greaterThan(LEVELS.NEWBORN_DAY_7);
    expect(LEVELS.NEWBORN_DAY_7).to.be.greaterThan(LEVELS.DELIVERY_DUE);
    expect(LEVELS.DELIVERY_DUE).to.be.greaterThan(LEVELS.ANC_FACILITY_REMINDER);
    expect(LEVELS.ANC_FACILITY_REMINDER).to.be.greaterThan(LEVELS.ANC_HOME_VISIT);
  });

  it('gives every level a distinct value, so the order is never ambiguous', () => {
    const values = Object.values(LEVELS);
    expect(new Set(values).size).to.equal(values.length);
  });

  it('gives every level a translatable reason', () => {
    Object.keys(LEVELS).forEach(kind => {
      expect(REASONS[kind], kind).to.match(/^priority\.reason\./);
      expect(priorityFor(kind)).to.deep.equal({ level: LEVELS[kind], label: REASONS[kind] });
    });
  });

  it('refuses an unknown kind instead of silently ranking it', () => {
    expect(() => priorityFor('MADE_UP')).to.throw('Unknown priority kind');
  });

  it('maps each newborn visit event to its own level', () => {
    Object.entries(NEWBORN_EVENT_KINDS).forEach(([eventId, kind]) => {
      expect(newbornVisitPriority({ id: eventId }).level).to.equal(LEVELS[kind]);
    });
    expect(() => newbornVisitPriority({ id: 'other' })).to.throw('Not a newborn visit event');
  });

  it('has an English text for every reason key', () => {
    const fs = require('fs');
    const path = require('path');
    const en = fs.readFileSync(path.join(__dirname, '..', '..', 'translations', 'messages-en.properties'), 'utf8');
    Object.values(REASONS).forEach(key => expect(en, key).to.include(`${key} = `));
  });
});
