#!/usr/bin/env node
// Estimates what a pilot's messages cost, using the published Ghana rate range.
// Rates are from third-party market sources (2026): ~GHS 0.02 (volume) to ~GHS 0.08 (low volume).
// Confirm the rate with the gateway's own price list before committing money.
//
//   node sms/budget.js --women 500 --messages-per-woman 6
const RATES = { low: 0.02, typical: 0.03, high: 0.08 };

function estimate({ women, messagesPerWoman }) {
  const messages = women * messagesPerWoman;
  return {
    messages,
    cedis: Object.fromEntries(Object.entries(RATES).map(([k, rate]) => [k, +(messages * rate).toFixed(2)])),
  };
}

if (require.main === module) {
  const arg = n => Number(process.argv[process.argv.indexOf(`--${n}`) + 1]);
  const women = arg('women') || 500;
  const per = arg('messages-per-woman') || 6;
  console.log(JSON.stringify(estimate({ women, messagesPerWoman: per }), null, 2));
}

module.exports = { estimate, RATES };
