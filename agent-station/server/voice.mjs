// Voice: speech-to-text on the server, for browsers without built-in speech
// recognition (e.g. Firefox). Uses Whisper, an open-source speech model, through
// any OpenAI-compatible transcription endpoint:
//   WHISPER_URL  your own server, e.g. Speaches / faster-whisper-server / LocalAI
//                (http://localhost:8000/v1). Free and private.
//   GROQ_API_KEY Groq's hosted Whisper (free tier) when WHISPER_URL isn't set.
// Most phones don't need this: Safari and Chrome transcribe on-device for free.

const env = process.env;

export function sttConfig() {
  if (env.WHISPER_URL) return { base: env.WHISPER_URL.replace(/\/$/, ''), key: env.WHISPER_KEY || '', model: env.WHISPER_MODEL || 'Systran/faster-whisper-small', provider: 'Whisper (your server)' };
  if (env.GROQ_API_KEY) return { base: 'https://api.groq.com/openai/v1', key: env.GROQ_API_KEY, model: env.WHISPER_MODEL || 'whisper-large-v3-turbo', provider: 'Whisper on Groq (free tier)' };
  return null;
}

export async function transcribe(audio, mime = 'audio/webm', lang = '') {
  const c = sttConfig();
  if (!c) throw Object.assign(new Error('Server speech-to-text is off. Set WHISPER_URL (free, self-hosted) or GROQ_API_KEY, or use Safari/Chrome which transcribe on-device.'), { status: 400 });
  if (!audio?.length) throw Object.assign(new Error('No audio received'), { status: 400 });
  const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mime }), `speech.${ext}`);
  form.append('model', c.model);
  if (/^[a-z]{2}$/.test(lang)) form.append('language', lang);
  const res = await fetch(`${c.base}/audio/transcriptions`, {
    method: 'POST', body: form,
    headers: c.key ? { Authorization: `Bearer ${c.key}` } : {},
    signal: AbortSignal.timeout(60000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${c.provider}: ${j.error?.message || j.error || `HTTP ${res.status}`}`);
  return { text: String(j.text || '').trim() };
}

// ---------------------------------------------------------------- cloning
// Talks to the local voice server (voice-clone/voice_server.py):
// Kokoro studio voices (Apache-2.0) and Chatterbox cloning (MIT).
const CLONE_URL = (env.VOICE_URL || env.CLONE_URL || 'http://127.0.0.1:8890').replace(/\/$/, '');
const OFF = { ok: false, device: '', multilingual: false, studio: false, clone: false, studioVoices: [] };
let health = { at: 0, ...OFF };

export async function cloneStatus() {
  if (Date.now() - health.at < 20000) return health;
  try {
    const j = await (await fetch(`${CLONE_URL}/health`, { signal: AbortSignal.timeout(1500) })).json();
    // Older servers (clone-only) didn't report engines; treat them as cloning-only.
    health = { at: Date.now(), ok: !!j.ok, device: j.device || '', multilingual: !!j.multilingual,
      studio: !!j.studio, clone: j.clone ?? !!j.ok, studioVoices: Array.isArray(j.studioVoices) ? j.studioVoices : [] };
  } catch { health = { at: Date.now(), ...OFF }; }
  return health;
}

/** Checks a recorded WAV sample: real WAV, mono/stereo PCM, 8–90 seconds. Returns seconds. */
export function checkWav(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw Object.assign(new Error('The recording must be a WAV file'), { status: 400 });
  let off = 12, fmt = null, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), len = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') { dataLen = Math.min(len, buf.length - off - 8); break; }
    off += 8 + len + (len % 2);
  }
  if (!fmt || !dataLen) throw Object.assign(new Error('Unreadable WAV recording'), { status: 400 });
  const secs = dataLen / (fmt.rate * fmt.channels * (fmt.bits / 8));
  if (secs < 8) throw Object.assign(new Error(`Recording is ${secs.toFixed(1)}s. Please read the whole script (at least 8 seconds)`), { status: 400 });
  if (secs > 90) throw Object.assign(new Error('Recording is too long (max 90 seconds)'), { status: 400 });
  return secs;
}

export async function cloneSpeak(text, voice, language = 'en', speed = 1) {
  const res = await fetch(`${CLONE_URL}/speak`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: String(text).slice(0, 1000), voice, language, speed }),
    signal: AbortSignal.timeout(180000),
  }).catch(() => { throw Object.assign(new Error('The voice server is not running. Start it with: python voice_server.py (see server/voice-clone/README.md)'), { status: 503 }); });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw Object.assign(new Error(j.error || `Voice cloner error ${res.status}`), { status: 502 }); }
  return Buffer.from(await res.arrayBuffer());
}
