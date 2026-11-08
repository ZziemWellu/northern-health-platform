// One call: audio (or a transcript) in, an approved reply out, with a log line the reviewer can audit.
// The audit line records the intent and the reply id, never the caller's words, so no spoken
// health detail is stored in plain text.
//
// If speech recognition fails (no model, ffmpeg error, timeout), the caller still gets the safe default
// reply ("call your CHW"), never an error and never silence. The audit line says it failed.
const { matchIntent, replyFor } = require('./intents');

async function respondToAudio({ audioPath, transcriber, lang = 'en' }) {
  let transcript;
  try {
    transcript = await transcriber(audioPath);
  } catch (err) {
    const reply = replyFor('unknown', lang);
    return { ...reply, audit: { intent: reply.intent, lang, at: new Date().toISOString(), transcriberFailed: true } };
  }
  return respondToTranscript({ transcript, lang });
}

function respondToTranscript({ transcript, lang = 'en' }) {
  const intent = matchIntent(transcript);
  const reply = replyFor(intent, lang);
  return { ...reply, audit: { intent: reply.intent, lang, at: new Date().toISOString() } };
}

module.exports = { respondToAudio, respondToTranscript };
