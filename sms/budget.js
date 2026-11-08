#!/usr/bin/env node
// Estimates what a pilot's messages cost, using the published Ghana rate range.
// Rates are from third-party market sources (2026): ~GHS 0.02 (volume) to ~GHS 0.08 (low volume).
// Confirm the rate with the gateway's own price list before committing money.
//
// Gateways bill per SMS part. An English reminder is one part; the same reminder in Dagbani, Gurene or
// another northern language usually needs 2-3, because letters like ɛ, ɔ and ŋ switch the message to
// UCS-2 (70 characters a part). Check a real text with require('../shared/languages').smsParts(text).
//
//   node sms/budget.js --women 500 --messages-per-woman 6 [--parts-per-message 3]
const RATES = { low: 0.02, typical: 0.03, high: 0.08 };

function estimate({ women, messagesPerWoman, partsPerMessage = 1 }) {
  const messages = women * messagesPerWoman;
  const parts = messages * partsPerMessage;
  return {
    messages,
    parts,
    cedis: Object.fromEntries(Object.entries(RATES).map(([k, rate]) => [k, +(parts * rate).toFixed(2)])),
  };
}

if (require.main === module) {
  const arg = n => Number(process.argv[process.argv.indexOf(`--${n}`) + 1]);
  const women = arg('women') || 500;
  const per = arg('messages-per-woman') || 6;
  const parts = arg('parts-per-message') || 1;
  console.log(JSON.stringify(estimate({ women, messagesPerWoman: per, partsPerMessage: parts }), null, 2));
}

module.exports = { estimate, RATES };
