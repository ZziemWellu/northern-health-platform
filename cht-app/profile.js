// Build profile: which parts of the app this build includes (see modules.js).
// The committed app is the full build. tools/pilot_build.js replaces this file in a separate copy of
// the app with the pilot's parts; never commit a restricted profile here.
module.exports = { name: 'full', parts: 'all' };
