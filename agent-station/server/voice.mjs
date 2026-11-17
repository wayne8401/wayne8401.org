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
