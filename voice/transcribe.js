// Speech to text. The pipeline never depends on one engine: the caller passes a transcriber, and the
// app ships with two options:
//   - whisper.cpp on a local machine or a CHW tablet (fully offline), via WHISPER_CPP_BIN and
//     WHISPER_MODEL (e.g. a fine-tuned Twi model converted to ggml); and
//   - an injected function (used in tests, and where a hosted engine is approved).
// Nothing here calls a network service unless the caller supplies one.
const { execFile } = require('node:child_process');

// A model that hangs must not hang the caller: after this long the run is killed and treated as failed
// (respond.js then gives the safe default reply).
const TIMEOUT_MS = 120 * 1000;

// Every transcriber carries .lang, the language its model understands (a shared/languages code), so
// respond.js never runs it on audio in another language. Today only Akan has a model in this repo;
// the Dagbani and Dagaare speech corpora that could train one are listed in docs/LANGUAGES.md.
//   whisperCppTranscriber({ language: 'ak' })               -> .lang 'twi'
//   whisperCppTranscriber({ language: 'xx', lang: 'dag' })  -> a future fine-tuned Dagbani model
function whisperCppTranscriber({ bin = process.env.WHISPER_CPP_BIN, model = process.env.WHISPER_MODEL, language = 'ak', lang, timeoutMs = TIMEOUT_MS } = {}) {
  const fn = (audioPath) => new Promise((resolve, reject) => {
    if (!bin || !model) return reject(new Error('Set WHISPER_CPP_BIN and WHISPER_MODEL to use local speech recognition'));
    execFile(bin, ['-m', model, '-l', language, '-nt', '-f', audioPath], { maxBuffer: 1024 * 1024, timeout: timeoutMs, encoding: 'utf8' }, (err, stdout) => {
      if (err) return reject(err);
      resolve(String(stdout).trim());
    });
  });
  fn.lang = lang || (language === 'ak' ? 'twi' : language);
  return fn;
}

// Akan (Twi) on the server: runs voice/transcribe_akan.py with the WAXAL Whisper model. The runner is
// injectable so tests do not need Python, ffmpeg or the model.
function akanTranscriber({
  python = process.env.PYTHON || 'python',
  script = require('node:path').join(__dirname, 'transcribe_akan.py'),
  model,
  run = runProcess,
} = {}) {
  const fn = async (audioPath) => {
    const args = [script, audioPath];
    if (model) args.push('--model', model);
    const out = await run(python, args);
    return String(out).trim();
  };
  fn.lang = 'twi';
  return fn;
}

function runProcess(cmd, args, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    // PYTHONIOENCODING: Twi letters (ɛ, ɔ) must reach us as UTF-8 whatever the server's console code page.
    execFile(cmd, args, { maxBuffer: 1024 * 1024, encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }, (err, stdout) => {
      if (err) return reject(new Error(`speech recognition failed: ${err.message}`));
      resolve(stdout);
    });
  });
}

module.exports = { TIMEOUT_MS, whisperCppTranscriber, akanTranscriber, runProcess };
