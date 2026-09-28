const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

// Module 2 referral destinations. A bad rebuild of data/northern_facilities.csv must fail loudly
// rather than silently drop a referral hospital from the nurse's list.
const readCsv = file => {
  const [header, ...lines] = fs.readFileSync(path.join(__dirname, '..', '..', 'data', file), 'utf8').trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map(line => {
    const values = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(v => v.replace(/,$/, '').replace(/^"|"$/g, ''));
    return Object.fromEntries(cols.map((c, i) => [c, values[i]]));
  });
};

describe('Northern facility list (referral destinations)', () => {
  const facilities = readCsv('northern_facilities.csv');

  it('covers all five northern regions', () => {
    const regions = new Set(facilities.map(f => f.region));
    expect([...regions].sort()).to.deep.equal(['North East', 'Northern', 'Savannah', 'Upper East', 'Upper West']);
  });

  it('has unique ids, a district for every facility, and coordinates inside northern Ghana', () => {
    const ids = facilities.map(f => f.id);
    expect(new Set(ids).size).to.equal(ids.length);
    facilities.forEach(f => {
      expect(f.district, f.name).to.not.be.empty;
      expect(Number(f.latitude), f.name).to.be.within(7.9, 11.2);
      expect(Number(f.longitude), f.name).to.be.within(-3.3, 0.7);
    });
  });

  it('includes the main referral hospitals', () => {
    const names = facilities.map(f => f.name);
    ['Tamale Central Hospital', 'Bolgatanga Regional Hospital', 'Upper West Regional Hospital',
      'Damongo District Hospital', 'Walewale District Hospital'].forEach(n => expect(names, n).to.include(n));
  });

  it('applies hand-verified corrections (Tamale Teaching Hospital is in Tamale, not Savannah)', () => {
    readCsv('facility_corrections.csv').forEach(fix => {
      const f = facilities.find(x => x.name === fix.name);
      expect(f, fix.name).to.exist;
      expect(f.region).to.equal(fix.region);
      expect(f.district).to.equal(fix.district);
    });
  });
});
