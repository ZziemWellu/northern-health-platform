// One call: audio (or a transcript) in, an approved reply out, with a log line the reviewer can audit.
// The audit line records the intent and the reply id, never the caller's words, so no spoken
// health detail is stored in plain text.
//
// If speech recognition fails (no model, ffmpeg error, timeout), the caller still gets the safe default
// reply ("call your CHW"), never an error and never silence. The audit line says it failed.
//
// `lang` is the language the caller speaks (a code such as "dag", or her CHT profile fields
// { preferred_language, other_languages }). A transcriber declares the language its model was trained
// on (transcriber.lang). The Akan model must never be run on Dagbani or Gurene audio: it would return
// confident nonsense, and a missed emergency word is worse than an honest "call your CHW". So a
// mismatch gets the safe default reply and the audit line records it.
const { matchIntent, replyFor } = require('./intents');
const languages = require('../shared/languages');

function spokenLanguage(lang) {
  if (lang && typeof lang === 'object') return languages.clientLanguages(lang)[0] || 'en';
  return languages.normaliseCode(lang) || 'en';
}

async function respondToAudio({ audioPath, transcriber, lang = 'en' }) {
  const spoken = spokenLanguage(lang);
  const modelLang = transcriber && transcriber.lang ? languages.normaliseCode(transcriber.lang) : null;
  if (modelLang && modelLang !== spoken) {
    const reply = replyFor('unknown', lang);
    return { ...reply, audit: { intent: reply.intent, lang: spoken, at: new Date().toISOString(), noModelForLanguage: true } };
  }
  let transcript;
  try {
    transcript = await transcriber(audioPath);
  } catch (err) {
    const reply = replyFor('unknown', lang);
    return { ...reply, audit: { intent: reply.intent, lang: spoken, at: new Date().toISOString(), transcriberFailed: true } };
  }
  return respondToTranscript({ transcript, lang });
}

function respondToTranscript({ transcript, lang = 'en' }) {
  const spoken = spokenLanguage(lang);
  const intent = matchIntent(transcript, spoken);
  const reply = replyFor(intent, lang);
  return { ...reply, audit: { intent: reply.intent, lang: spoken, replyLang: reply.lang, fallback: reply.fallback, at: new Date().toISOString() } };
}

module.exports = { respondToAudio, respondToTranscript };
