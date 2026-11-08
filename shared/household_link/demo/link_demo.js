// End-to-end demo of the shared household record against demo environments.
//
// Environment (all optional; each step reports what it did or skipped):
//   MAMA_URL, MAMA_PHONE, MAMA_PASSWORD      the MAMA-AI API (a local demo instance or a hosted one)
//   CHT_URL, CHT_USER, CHT_PASS, CHT_HOUSEHOLD_UUID   the CHT demo instance and a household place
//   FACILITY_ID                               a facility UUID from MAMA-AI (default: first facility)
//
// It never sends SMS. Names used here are demo names. Run: node shared/household_link/demo/link_demo.js
const { HouseholdLinks, riskFlagEvent, referralFromFlag } = require('../household_link');
const { mamaClient } = require('../adapters/mama');
const { chtClient } = require('../adapters/cht');

async function main() {
  const env = process.env;
  const links = new HouseholdLinks();
  const report = [];
  const log = (step, detail) => { report.push({ step, ...detail }); console.log(`${step}: ${JSON.stringify(detail)}`); };

  // 1. CHT: create the person in the CHT if configured; otherwise use a demo external ID.
  let chtUuid = 'demo-cht-contact';
  if (env.CHT_URL && env.CHT_USER && env.CHT_PASS && env.CHT_HOUSEHOLD_UUID) {
    const cht = chtClient({ baseUrl: env.CHT_URL, username: env.CHT_USER, password: env.CHT_PASS });
    const person = await cht.createPerson({ name: 'Demo Ama', householdUuid: env.CHT_HOUSEHOLD_UUID });
    chtUuid = person._id || person.uuid;
    log('cht.createPerson', { status: 'created', uuid: chtUuid });
  } else {
    log('cht.createPerson', { status: 'skipped', reason: 'CHT_URL, CHT_USER, CHT_PASS, CHT_HOUSEHOLD_UUID not set' });
  }

  // 2. Platform person: one ID per person, linked to the CHT contact by reference.
  const householdId = 'H-demo-1';
  const personId = links.register({ source: 'cht', externalId: chtUuid, householdId });
  log('links.register(cht)', { personId });

  // 3. MAMA-AI: log in, create the patient using the platform ID as the code (no name is sent).
  if (!env.MAMA_URL || !env.MAMA_PHONE || !env.MAMA_PASSWORD) {
    log('mama', { status: 'skipped', reason: 'MAMA_URL, MAMA_PHONE, MAMA_PASSWORD not set' });
    return report;
  }
  const mama = mamaClient({ baseUrl: env.MAMA_URL, phone: env.MAMA_PHONE, password: env.MAMA_PASSWORD });
  await mama.login();
  let facilityId = env.FACILITY_ID;
  if (!facilityId) {
    const res = await fetch(`${env.MAMA_URL.replace(/\/$/, '')}/api/v1/facilities/?limit=1`);
    facilityId = (await res.json())[0].id;
  }
  const patient = await mama.createPatient({
    patient_code: personId, facility_id: facilityId, age: 27, gestation_weeks: 36, gravida: 2, para: 1,
  });
  links.register({ source: 'mama', externalId: patient.patient_code, householdId, personId });
  log('mama.createPatient', { patientId: patient.id, code: patient.patient_code });

  // 4. Module 1 raises a flag for this person. Only references and one short reason travel.
  const flag = riskFlagEvent({ personId, source: 'cht', urgency: 'emergency', reason: 'Heavy bleeding after birth at the day 1 visit' });
  log('flag', flag);

  // 5. Module 2 turns the flag into a referral without re-entry, and MAMA-AI recommends a facility.
  //    The demo flag and the recommendation request describe the same case (bleeding after birth).
  const referralInput = referralFromFlag(flag, { facilityId, nurseId: 'N-demo', referralId: `r-${Date.now()}` });
  const rec = await mama.recommendReferral({
    patient_id: patient.id, current_latitude: 9.4, current_longitude: -1.0, gestation_weeks: 36,
    risk_level: 'HIGH', primary_condition: 'PPH',
  });
  log('referral.recommend', { urgency: referralInput.urgency, destination: rec.destination_facility && rec.destination_facility.name });
  return report;
}

main().catch((err) => { console.error('demo failed:', err.message); process.exitCode = 1; });
