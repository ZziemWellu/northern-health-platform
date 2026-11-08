const { expect } = require('chai');
const TestRunner = require('cht-conf-test-harness');
const harness = new TestRunner();

const person = fields => ({ _id: 'p1', type: 'person', name: 'Test Woman', date_of_birth: '1995-01-01', sex: 'female', parent: { _id: 'hh1' }, ...fields });
const languageField = summary => summary.fields.find(f => f.label === 'Language');

describe('The profile shows the language to use with the client', () => {
  before(async () => { return await harness.start(); });
  after(async () => { return await harness.stop(); });
  beforeEach(async () => { return await harness.clear(); });
  afterEach(() => { expect(harness.consoleErrors).to.be.empty; });

  it('names her language and the others she understands', async () => {
    const summary = await harness.getContactSummary(person({ preferred_language: 'dag', other_languages: 'hau twi' }), []);
    expect(languageField(summary).value).to.equal('Dagbani (Dagbanli); also understands Hausa, Akan (Twi)');
  });

  it('shows the written-in language when it is not on the list', async () => {
    const summary = await harness.getContactSummary(person({ preferred_language: 'other', preferred_language_other: 'Komba' }), []);
    expect(languageField(summary).value).to.equal('Komba');
  });

  it('asks for it when it has not been recorded', async () => {
    const summary = await harness.getContactSummary(person({}), []);
    expect(languageField(summary).value).to.match(/^Not recorded/);
  });
});
