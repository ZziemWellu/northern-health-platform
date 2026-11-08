const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const modules = require('../../modules');

// The pilot build includes only the parts in modules.PILOT. These checks make sure every task,
// target and form has been assigned to a part, so nothing joins or leaves the pilot by accident.
const ROOT = path.join(__dirname, '..', '..');
const allTasks = require(path.join(ROOT, 'tasks.js'));
const allTargets = require(path.join(ROOT, 'targets.js'));
const appForms = fs.readdirSync(path.join(ROOT, 'forms', 'app'))
  .filter(f => f.endsWith('.xml')).map(f => f.replace(/\.xml$/, ''));
const PILOT_PROFILE = { name: 'pilot', parts: modules.PILOT };

describe('Module map and build profiles', () => {
  it('the committed profile is the full build', () => {
    expect(require('../../profile').parts).to.equal('all');
  });

  it('every task, target and app form is assigned to a known part', () => {
    allTasks.forEach(t => expect(modules.PARTS, `task ${t.name}`).to.include(modules.partOf('task', t.name)));
    allTargets.forEach(t => expect(modules.PARTS, `target ${t.id}`).to.include(modules.partOf('target', t.id)));
    appForms.forEach(f => expect(modules.PARTS, `form ${f}`).to.include(modules.partOf('form', f)));
  });

  it('the map lists nothing that no longer exists', () => {
    expect(Object.keys(modules.TASKS).sort()).to.deep.equal(allTasks.map(t => t.name).sort());
    expect(Object.keys(modules.TARGETS).sort()).to.deep.equal(allTargets.map(t => t.id).sort());
    expect(Object.keys(modules.FORMS).sort()).to.deep.equal([...appForms].sort());
  });

  it('the pilot is Modules 1 and 5 plus raising a referral, on top of the reference workflows', () => {
    expect(modules.PILOT).to.deep.equal(['reference', '1', '2.raise', '5']);
    const tasks = modules.inProfile('task', allTasks, PILOT_PROFILE).map(t => t.name);
    expect(tasks).to.include.members(['pnc.newborn_home_visit', 'maternal_danger_follow_up', 'referral.raise']);
    expect(tasks).to.not.include.members(['referral.confirm_arrival', 'referral.still_open', 'barrier.screen', 'smc.catch_up', 'sick_child.follow_up']);
  });

  it('in the pilot, every task still opens a form the pilot ships', () => {
    const forms = new Set(modules.inProfile('form', appForms, PILOT_PROFILE));
    modules.inProfile('task', allTasks, PILOT_PROFILE).forEach(t => t.actions.forEach(a =>
      expect(forms.has(a.form), `${t.name} -> ${a.form}`).to.equal(true)));
  });

  it('a danger assessment in the pilot can still lead to a referral', () => {
    const raise = modules.inProfile('task', allTasks, PILOT_PROFILE).find(t => t.name === 'referral.raise');
    expect(raise.appliesToType).to.include('maternal_danger_assessment');
    expect(modules.inProfile('form', appForms, PILOT_PROFILE)).to.include.members(['maternal_danger_assessment', 'referral']);
  });
});
