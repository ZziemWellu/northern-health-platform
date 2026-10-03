// Ghana mobile numbers as the forms record them: 10 digits starting with 0 (see the
// phone fields in cht-app/tools). The gateway wants international form, +233 then 9 digits.
const GHANA_LOCAL = /^0\d{9}$/;

function toGhanaInternational(local) {
  const digits = String(local || '').replace(/[\s-]/g, '');
  if (!GHANA_LOCAL.test(digits)) return null;
  return '+233' + digits.slice(1);
}

module.exports = { toGhanaInternational };
