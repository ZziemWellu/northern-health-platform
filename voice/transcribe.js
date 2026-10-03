// Speech to text. The pipeline never depends on one engine: the caller passes a transcriber, and the
// app ships with two options:
//   - whisper.cpp on a local machine or a CHW tablet (fully offline), via WHISPER_CPP_BIN and
//     WHISPER_MODEL (e.g. a fine-tuned Twi model converted to ggml); and
//   - an injected function (used in tests, and where a hosted engine is approved).
// Nothing here calls a network service unless the caller supplies one.
const { execFile } = require('node:child_process');

function whisperCppTranscriber({ bin = process.env.WHISPER_CPP_BIN, model = process.env.WHISPER_MODEL, language = 'ak' } = {}) {
  return (audioPath) => new Promise((resolve, reject) => {
    if (!bin || !model) return reject(new Error('Set WHISPER_CPP_BIN and WHISPER_MODEL to use local speech recognition'));
    execFile(bin, ['-m', model, '-l', language, '-nt', '-f', audioPath], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(String(stdout).trim());
    });
  });
}

module.exports = { whisperCppTranscriber };
