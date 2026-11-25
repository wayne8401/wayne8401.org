// Model providers: Claude plus free / open-source models through any
// OpenAI-compatible endpoint (Ollama, OpenRouter, Groq, LM Studio, vLLM, llama.cpp...).
//
// A model id is "provider:model", e.g.
//   anthropic:claude-opus-5-5
//   ollama:qwen3:8b
//   openrouter:meta-llama/llama-3.3-70b-instruct:free
//   groq:llama-3.3-70b-versatile

const env = process.env;

export const PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)', kind: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY', free: false,
    setup: 'Set ANTHROPIC_API_KEY (get one at console.anthropic.com). Paid per token; strongest tool use and web search.',
  },
  ollama: {
    label: 'Ollama: open models on your computer', kind: 'openai', base: env.OLLAMA_URL || 'http://localhost:11434/v1', free: true,
    setup: 'Free and private. Install from ollama.com, then run e.g. "ollama pull qwen3:8b" or "ollama pull llama3.1:8b". Pick a model that supports tools.',
  },
  openrouter: {
    label: 'OpenRouter: free hosted open models', kind: 'openai', base: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY', free: true,
    setup: 'Create a free account at openrouter.ai, make a key, set OPENROUTER_API_KEY. Models ending in ":free" cost nothing (rate-limited).',
  },
  groq: {
    label: 'Groq: fast open models, free tier', kind: 'openai', base: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY', free: true,
    setup: 'Create a free account at console.groq.com, make a key, set GROQ_API_KEY.',
  },
  custom: {
    label: 'Custom OpenAI-compatible server', kind: 'openai', base: env.OPENAI_COMPAT_URL || '', keyEnv: 'OPENAI_COMPAT_KEY', free: true,
    setup: 'For LM Studio, vLLM, llama.cpp, LocalAI, Jan…: set OPENAI_COMPAT_URL (e.g. http://localhost:1234/v1) and OPENAI_COMPAT_KEY if it needs one.',
  },
};

// Claude models (input/output USD per 1M tokens).
const CLAUDE = [
  { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', price: [4, 20] },
  { model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', price: [2, 10] },
  { model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', price: [0.1, 0.5] },
];

const keyOf = (p) => (PROVIDERS[p]?.keyEnv ? env[PROVIDERS[p].keyEnv] || '' : '');

export function parseModel(id) {
  const s = String(id || '');
  const i = s.indexOf(':');
  if (i > 0 && PROVIDERS[s.slice(0, i)]) return { provider: s.slice(0, i), model: s.slice(i + 1) };
  return { provider: 'anthropic', model: s || 'claude-opus-5-5' };
}

export function priceOf(id) {
  const { provider, model } = parseModel(id);
  if (provider !== 'anthropic') return [0, 0]; // local / free tiers
  return CLAUDE.find((c) => c.model === model)?.price || [4, 20];
}

async function getJson(url, headers = {}, ms = 2500) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let cache = { at: 0, models: [], providers: {} };

/** Find every model this server can use right now. */
export async function discoverModels(force = false) {
  if (!force && Date.now() - cache.at < 5 * 60e3 && cache.models.length) return cache;
  const models = [], providers = {};
  const add = (provider, model, label, free) => models.push({ id: `${provider}:${model}`, provider, model, label: label || model, free });

  // Claude
  const hasClaude = !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  providers.anthropic = { ready: hasClaude, note: hasClaude ? 'API key set' : 'No API key' };
  if (hasClaude) CLAUDE.forEach((c) => add('anthropic', c.model, c.label, false));

  // Ollama (local)
  try {
    const root = PROVIDERS.ollama.base.replace(/\/v1\/?$/, '');
    const tags = await getJson(`${root}/api/tags`, {}, 1500);
    const names = (tags.models || []).map((m) => m.name);
    names.forEach((n) => add('ollama', n, `${n} (local)`, true));
    providers.ollama = { ready: names.length > 0, note: names.length ? `${names.length} model(s) installed` : 'Running, but no models pulled yet' };
  } catch { providers.ollama = { ready: false, note: 'Not running on this computer' }; }

  // OpenRouter free models with tool support
  if (keyOf('openrouter')) {
    try {
      const j = await getJson(`${PROVIDERS.openrouter.base}/models`, { Authorization: `Bearer ${keyOf('openrouter')}` }, 6000);
      const free = (j.data || []).filter((m) => m.id.endsWith(':free') && (m.supported_parameters || []).includes('tools'));
      free.slice(0, 40).forEach((m) => add('openrouter', m.id, `${m.name || m.id}`, true));
      providers.openrouter = { ready: free.length > 0, note: `${free.length} free model(s) with tool use` };
    } catch (e) { providers.openrouter = { ready: false, note: `Key set, but listing failed (${e.message})` }; }
  } else providers.openrouter = { ready: false, note: 'No API key' };

  // Groq
  if (keyOf('groq')) {
    try {
      const j = await getJson(`${PROVIDERS.groq.base}/models`, { Authorization: `Bearer ${keyOf('groq')}` }, 6000);
      const ids = (j.data || []).map((m) => m.id).filter((id) => !/whisper|tts|guard|playai/i.test(id));
      ids.forEach((id) => add('groq', id, `${id} (Groq)`, true));
      providers.groq = { ready: ids.length > 0, note: `${ids.length} model(s)` };
    } catch (e) { providers.groq = { ready: false, note: `Key set, but listing failed (${e.message})` }; }
  } else providers.groq = { ready: false, note: 'No API key' };

  // Custom OpenAI-compatible
  if (PROVIDERS.custom.base) {
    try {
      const j = await getJson(`${PROVIDERS.custom.base.replace(/\/$/, '')}/models`, keyOf('custom') ? { Authorization: `Bearer ${keyOf('custom')}` } : {}, 3000);
      const ids = (j.data || []).map((m) => m.id);
      ids.forEach((id) => add('custom', id, `${id} (custom)`, true));
      providers.custom = { ready: ids.length > 0, note: `${ids.length} model(s)` };
    } catch (e) { providers.custom = { ready: false, note: `Unreachable (${e.message})` }; }
  } else providers.custom = { ready: false, note: 'OPENAI_COMPAT_URL not set' };

  cache = { at: Date.now(), models, providers };
  return cache;
}

/** Model new agents use when none is chosen: env override, else the first one available. */
export function pickDefault(models) {
  if (env.DEFAULT_MODEL) return env.DEFAULT_MODEL;
  return models.find((m) => m.provider === 'anthropic' && m.model === 'claude-opus-5-5')?.id
    || models.find((m) => m.provider === 'ollama')?.id
    || models.find((m) => m.provider === 'groq')?.id
    || models.find((m) => m.provider === 'openrouter')?.id
    || models[0]?.id
    || 'anthropic:claude-opus-5-5';
}

/** One chat-completions call to an OpenAI-compatible provider. */
export async function openaiChat(provider, model, messages, tools) {
  const p = PROVIDERS[provider];
  if (!p?.base) throw new Error(`${provider} is not configured`);
  const headers = { 'Content-Type': 'application/json' };
  if (keyOf(provider)) headers.Authorization = `Bearer ${keyOf(provider)}`;
  if (provider === 'openrouter') headers['X-Title'] = 'Agent Station';
  const body = { model, messages };
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }
  const res = await fetch(`${p.base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10 * 60e3),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || text.slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new Error(`${p.label}: key missing or invalid (${msg})`);
    if (res.status === 429) throw new Error(`${p.label}: rate limited, try again shortly (free tiers have limits)`);
    if (/tool|function/i.test(String(msg))) throw new Error(`${model} can't use tools. Pick a tool-capable model (e.g. qwen3, llama3.1, mistral-small). Details: ${msg}`);
    throw new Error(`${p.label} error ${res.status}: ${msg}`);
  }
  if (!json?.choices?.length) throw new Error(`${p.label} returned no answer`);
  return json;
}
