const { expect } = require('chai');
const modules = require('../../modules');
const scenario = require('../../demo/scenario');
const { plan } = require('../../demo/seed');

// The demo district (demo/scenario.js) is synthetic data for showing the pilot. These checks keep it
// believable (dates in order, nothing in the future), inside the pilot build, and clearly marked; and
// they pin the seeder's safety rules, so it can never be pointed at a real district's data.
const PILOT_PROFILE = { name: 'pilot', parts: modules.PILOT };
const DAY = 864e5;

describe('Demo district (synthetic data)', () => {
  // Several seeding days, including the 1st of a month and a month-end, so date rules hold all year.
  for (const day of ['2026-11-08T12:00:00Z', '2027-03-01T12:00:00Z', '2027-01-31T16:00:00Z']) {
    describe(`seeded on ${day.slice(0, 10)}`, () => {
      const now = Date.parse(day);
      const s = scenario.build({ today: new Date(now), now });
      const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
      const lastMonthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 1, 1);

      it('has no event in the future, and each woman\'s events are in order', () => {
        for (const t of s.timelines) {
          let prev = 0;
          for (const e of t.events) {
            expect(e.at, `${t.woman.name}: ${e.form || e.task}`).to.be.below(now);
            expect(e.at).to.be.at.least(prev);
            prev = e.at;
          }
        }
      });

      it('registers each pregnancy before any visit, birth or danger check', () => {
        for (const t of s.timelines.filter(x => x.events.length)) {
          expect(t.events[0].form, t.woman.name).to.equal('pregnancy');
        }
      });

      it('gives every CHPS zone reports last month, so the Module 5 file has rows for each', () => {
        for (const z of s.zones) {
          const last = s.timelines.filter(t => t.household.zone === z.key)
            .flatMap(t => t.events).filter(e => e.at >= lastMonthStart && e.at < monthStart);
          expect(last.length, z.name).to.be.above(0);
        }
      });

      it('puts the Dalun stories where the demo script expects them', () => {
        const story = key => s.timelines.find(t => t.woman._id === `demo-kbg-p-dalun-${key}`);
        const ayishetu = story('ayishetu').events;
        expect(ayishetu[ayishetu.length - 1].form).to.equal('maternal_danger_assessment');
        expect(now - ayishetu[ayishetu.length - 1].at).to.be.below(DAY);
        expect(story('mariama').events).to.be.empty;
        const birth = story('sanatu').events.find(e => e.form === 'delivery');
        expect(now - birth.at).to.be.below(2 * DAY);
        expect(story('rahinatu').events[0].at).to.be.at.least(monthStart);
      });
    });
  }

  const s = scenario.build();

  it('uses only forms that are in the pilot build', () => {
    const forms = new Set(s.timelines.flatMap(t => t.events).map(e => e.form).filter(Boolean));
    expect(forms.size).to.be.above(0);
    expect(modules.inProfile('form', [...forms], PILOT_PROFILE).sort()).to.deep.equal([...forms].sort());
  });

  it('marks every document as demo data and names every place "(demo)" above household level', () => {
    for (const d of s.docs) {expect(d.demo_seed, d._id).to.equal(scenario.TAG);}
    for (const d of s.docs.filter(x => ['district_hospital', 'health_center'].includes(x.type))) {
      expect(d.name).to.match(/\(demo\)$/);
    }
    const ids = s.docs.map(d => d._id);
    expect(new Set(ids).size).to.equal(ids.length);
    expect(ids.every(id => id.startsWith('demo-kbg-'))).to.equal(true);
  });

  it('records each woman\'s language with a code from the registry, and a well-formed phone number', () => {
    const registry = require('../../../shared/languages/languages.json').languages;
    for (const { woman } of s.people) {
      expect(registry, woman.name).to.have.property(woman.preferred_language);
      for (const code of (woman.other_languages || '').split(' ').filter(Boolean)) {expect(registry).to.have.property(code);}
      expect(woman.phone).to.match(/^\+233\d{9}$/);
    }
  });

  it('gives every demo nurse a login on her own CHPS zone', () => {
    expect(s.nurses.map(n => n.username)).to.deep.equal(['demo_nurse_dalun', 'demo_nurse_gbullung', 'demo_nurse_bontanga']);
    for (const n of s.nurses) {expect(n.contact.parent._id).to.equal(n.zone.id);}
  });
});

describe('Demo seeder safety rules', () => {
  const s = scenario.build();
  const demo = s.docs;
  const legacyDistrict = { _id: 'old1', type: 'contact', contact_type: 'district_hospital', name: 'Demo District', _rev: '1' };
  const legacyPerson = { _id: 'old2', type: 'contact', contact_type: 'person', name: 'Demo Ama', parent: { _id: 'old1' }, patient_id: '555', _rev: '1' };
  const legacyReport = { _id: 'old3', type: 'data_record', form: 'pregnancy', fields: { patient_id: '555' }, _rev: '1' };
  const settings = { _id: 'org.couchdb.user:demo_nurse_dalun', type: 'user-settings', demo_seed: scenario.TAG, _rev: '1' };

  it('finds other people on the server and reports them (the seeder then refuses)', () => {
    const real = { _id: 'x', type: 'person', name: 'A real person', parent: { _id: 'real-zone' } };
    const p = plan([...demo, real], [], { removeLegacy: true });
    expect(p.others.map(d => d._id)).to.deep.equal(['x']);
  });

  it('deletes the old test district and its records only when asked', () => {
    const docs = [...demo, legacyDistrict, legacyPerson, legacyReport];
    const kept = plan(docs, [], { removeLegacy: false });
    expect(kept.doomed.map(d => d._id)).to.not.include.members(['old1', 'old2', 'old3']);
    const removed = plan(docs, [{ username: 'e2e_chw', place: [{ _id: 'old1' }] }], { removeLegacy: true });
    expect(removed.doomed.map(d => d._id)).to.include.members(['old1', 'old2', 'old3']);
    expect(removed.doomedUsers.map(u => u.username)).to.deep.equal(['e2e_chw']);
  });

  it('replaces the previous demo, but keeps the demo logins and their settings (CHT never frees a username)', () => {
    const p = plan([...demo, settings], [{ username: 'demo_nurse_dalun' }], { removeLegacy: true });
    expect(p.doomed.length).to.equal(demo.length);
    expect(p.doomed.map(d => d._id)).to.not.include(settings._id);
    expect(p.doomedUsers).to.be.empty;
    expect(p.others).to.be.empty;
  });
});
