/* Agent Station on-phone engine: runs your agents inside the app itself.
 *
 * No computer needed. The agent loop, tools, memory, skills, files and workflows
 * all run on this device and are saved in the browser's storage (IndexedDB).
 * The "brain" (AI model) is one of:
 *   device:<model>      an open-source model running ON the phone via WebLLM (WebGPU).
 *                       Free, private, works offline after the one-time download.
 *   openrouter:<model>  free hosted open models (":free"), called from the phone
 *   groq:<model>        Groq free tier, called from the phone
 *   custom:<model>      any OpenAI-compatible server you point it at
 *   anthropic:<model>   Claude via the official Anthropic SDK (vendor/), with real web search
 * API keys are stored only on this device.
 */
(() => {
  'use strict';

  // On-device engine: wllama (llama.cpp compiled to WebAssembly, MIT). Runs on the phone's
  // processor in any modern browser, and uses the graphics chip (WebGPU) automatically when present.
  const WLLAMA_URL = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/index.js';
  const WLLAMA_WASM = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/wasm/wllama.wasm';
  const now = () => Date.now();
  const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 12)}`;
  const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const httpError = (msg) => new Error(msg);

  /* ---------------------------------------------------------- storage */
  const idb = (() => {
    let dbp;
    const db = () => (dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('agent-station', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', mode); const out = fn(t.objectStore('kv')); t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error); }); };
    return { get: (k) => tx('readonly', (s) => s.get(k)), set: (k, v) => tx('readwrite', (s) => s.put(v, k)) };
  })();

  const KEYS_LS = 'as.brainKeys';
  const keys = () => { try { return JSON.parse(localStorage.getItem(KEYS_LS)) || {}; } catch { return {}; } };
  const setKeys = (k) => { try { localStorage.setItem(KEYS_LS, JSON.stringify(k)); } catch { /* private mode */ } };

  /* ------------------------------------------------------------ state */
  const DEFAULT = () => ({
    stations: [
      { id: 'research', name: 'Research Bay', region: 'web' },
      { id: 'studio', name: 'Studio', region: 'writing' },
      { id: 'ops', name: 'Ops Deck', region: 'planning' },
    ],
    agents: [
      { id: 'scout', name: 'Scout', role: 'Web researcher', station: 'research', instructions: 'You find accurate, current information. Prefer reputable sources, cite links, and flag anything uncertain.' },
      { id: 'quill', name: 'Quill', role: 'Writer & editor', station: 'studio', instructions: 'You turn notes and research into clear, friendly writing: emails, posts, summaries and reports. Match the tone asked for and keep it concise.' },
      { id: 'atlas', name: 'Atlas', role: 'Planner', station: 'ops', instructions: 'You break goals into concrete plans, checklists and schedules. Be practical, estimate time, and order steps so the user can start today.' },
    ],
    workflows: [
      { id: 'wf_brief', name: 'Research → Brief', trigger: 'manual', description: 'Scout researches a topic, then Quill writes a one-page brief.', input: 'the best budget laptops for students this year',
        steps: [{ name: 'Research the topic', agent: 'scout', instructions: 'Research the topic below. Collect 5–8 key facts with sources.' }, { name: 'Write the brief', agent: 'quill', instructions: 'Write a one-page brief from the research: a 3-sentence summary, key points as bullets, and sources. Save it as a markdown file.' }] },
      { id: 'wf_plan', name: 'Goal → Action plan', trigger: 'manual', description: 'Atlas turns a goal into a plan, then Quill makes a friendly checklist.', input: 'start a small weekend baking business',
        steps: [{ name: 'Make a plan', agent: 'atlas', instructions: 'Turn the goal below into a step-by-step plan with milestones and rough time estimates.' }, { name: 'Write the checklist', agent: 'quill', instructions: 'Rewrite the plan as a short, encouraging checklist a beginner can follow. Save it as a markdown file.' }] },
    ],
    tasks: [], runs: [], skills: [], memories: [], events: [], files: {}, usage: {},
    settings: { defaultModel: '', plugins: {}, downloaded: {} },
  });
  let state = DEFAULT();
  const live = {};
  let saveTimer = null;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => idb.set('state', JSON.parse(JSON.stringify(state))).catch(() => {}), 300); };
  const ready = (async () => {
    try {
      const saved = await idb.get('state');
      if (saved) state = { ...DEFAULT(), ...saved, settings: { ...DEFAULT().settings, ...(saved.settings || {}) } };
      for (const t of state.tasks) if (t.status === 'running' || t.status === 'queued') { t.status = 'error'; t.result = 'The app was closed before this task finished. Keep the app open while agents work.'; }
      for (const r of state.runs) if (r.status === 'running') r.status = 'error';
    } catch { /* storage unavailable: run in memory */ }
  })();

  function event(level, agent, msg) {
    state.events.unshift({ id: uid('ev'), ts: now(), level, agent, msg: String(msg).slice(0, 400) });
    state.events.length = Math.min(state.events.length, 200);
    save();
  }
  const agentById = (id) => state.agents.find((a) => a.id === id);

  /* ----------------------------------------------------------- brains */
  // Official Qwen GGUF builds (Apache-2.0). Qwen models are trained for native tool calling.
  const DEVICE_MODELS = [
    { model: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', label: 'Qwen2.5 1.5B', size: '≈1.1 GB', note: 'Recommended: reliable tool use at a good speed' },
    { model: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', label: 'Qwen2.5 0.5B', size: '≈0.5 GB', note: 'Smallest and fastest; good for quick, simple tasks' },
    { model: 'Qwen/Qwen3-1.7B-GGUF', label: 'Qwen3 1.7B', size: '≈1.8 GB', note: 'Newest and smartest of the three; slower' },
  ];
  const CLAUDE = [
    { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', price: [4, 20] },
    { model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', price: [2, 10] },
    { model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', price: [0.1, 0.5] },
  ];
  const OPENAI_BASE = { openrouter: 'https://openrouter.ai/api/v1', groq: 'https://api.groq.com/openai/v1' };
  const hasWebGPU = () => typeof navigator !== 'undefined' && !!navigator.gpu;
  const canRunLocal = () => typeof WebAssembly === 'object' && typeof Worker === 'function';

  let modelCache = { at: 0, models: [], providers: {} };
  const parseModel = (id) => { const s = String(id || ''); const i = s.indexOf(':'); return i > 0 ? { provider: s.slice(0, i), model: s.slice(i + 1) } : { provider: 'anthropic', model: s }; };
  const priceOf = (id) => { const { provider, model } = parseModel(id); return provider === 'anthropic' ? CLAUDE.find((c) => c.model === model)?.price || [4, 20] : [0, 0]; };

  async function discover(force) {
    if (!force && now() - modelCache.at < 5 * 60e3 && modelCache.at) return modelCache;
    const k = keys(), models = [], providers = {};
    const add = (provider, model, label, free, extra = {}) => models.push({ id: `${provider}:${model}`, provider, model, label, free, ...extra });
    // On-device
    if (canRunLocal()) {
      const have = DEVICE_MODELS.filter((m) => state.settings.downloaded[m.model]);
      have.forEach((m) => add('device', m.model, `${m.label} (on this phone)`, true));
      providers.device = { ready: have.length > 0, note: have.length ? `${have.length} model(s) downloaded` : 'Download a model to start' };
    } else providers.device = { ready: false, note: "This browser can't run models on the phone. Update Chrome or Safari." };
    // Claude
    if (k.anthropic) { CLAUDE.forEach((c) => add('anthropic', c.model, c.label, false)); providers.anthropic = { ready: true, note: 'Key saved on this phone' }; }
    else providers.anthropic = { ready: false, note: 'No key' };
    // OpenRouter free models with tools
    if (k.openrouter) {
      try {
        const j = await (await fetch(`${OPENAI_BASE.openrouter}/models`, { signal: AbortSignal.timeout(8000) })).json();
        const free = (j.data || []).filter((m) => m.id.endsWith(':free') && (m.supported_parameters || []).includes('tools') && !state.settings.noTools?.[`openrouter:${m.id}`]).slice(0, 30);
        free.sort((a, b) => rankFree({ model: a.id }) - rankFree({ model: b.id })).forEach((m) => add('openrouter', m.id, (m.name || m.id).replace(/^[^:]{1,30}:\s*/, '').replace(/\s*\(free\)\s*$/i, '') + ' (free)', true));
        providers.openrouter = { ready: free.length > 0, note: `${free.length} free model(s)` };
      } catch (e) { providers.openrouter = { ready: false, note: `Couldn't list models (${e.message})` }; }
    } else providers.openrouter = { ready: false, note: 'No key' };
    // Groq
    if (k.groq) {
      try {
        const j = await (await fetch(`${OPENAI_BASE.groq}/models`, { headers: { Authorization: `Bearer ${k.groq}` }, signal: AbortSignal.timeout(8000) })).json();
        const ids = (j.data || []).map((m) => m.id).filter((id) => !/whisper|tts|guard|playai/i.test(id));
        ids.forEach((id) => add('groq', id, `${id} (Groq)`, true));
        providers.groq = { ready: ids.length > 0, note: `${ids.length} model(s)` };
      } catch (e) { providers.groq = { ready: false, note: `Couldn't reach Groq (${e.message})` }; }
    } else providers.groq = { ready: false, note: 'No key' };
    // Custom
    if (k.customUrl) {
      try {
        const j = await (await fetch(`${k.customUrl.replace(/\/$/, '')}/models`, { headers: k.customKey ? { Authorization: `Bearer ${k.customKey}` } : {}, signal: AbortSignal.timeout(5000) })).json();
        const ids = (j.data || []).map((m) => m.id);
        ids.forEach((id) => add('custom', id, `${id} (custom)`, true));
        providers.custom = { ready: ids.length > 0, note: `${ids.length} model(s)` };
      } catch (e) { providers.custom = { ready: false, note: `Unreachable (${e.message})` }; }
    } else providers.custom = { ready: false, note: 'Not set' };
    modelCache = { at: now(), models, providers };
    return modelCache;
  }

  // Free models known to handle tools well, best first (matched loosely so new versions still match).
  const PREFERRED_FREE = [/llama-3\.3-70b/i, /deepseek-(chat|v3)/i, /qwen.*(72b|235b|32b|coder)/i, /gemini.*flash/i, /mistral-small/i, /llama-4/i, /qwen/i, /llama/i];
  const rankFree = (m) => { const i = PREFERRED_FREE.findIndex((re) => re.test(m.model)); return i < 0 ? 99 : i; };
  const defaultModel = () => {
    const ms = modelCache.models;
    if (state.settings.defaultModel && ms.some((m) => m.id === state.settings.defaultModel)) return state.settings.defaultModel;
    const pick = ms.find((m) => m.provider === 'device')
      || ms.find((m) => m.provider === 'anthropic' && m.model === 'claude-opus-5-5')
      || [...ms.filter((m) => m.provider === 'openrouter' || m.provider === 'groq')].sort((a, b) => rankFree(a) - rankFree(b))[0]
      || ms[0];
    return pick?.id || '';
  };
  const agentModel = (a) => (a.model && modelCache.models.some((m) => m.id === a.model) ? a.model : defaultModel());

  /* ------------------------------------------------- on-device runtime */
  const device = { engine: null, model: '', loading: false, loadingModel: '', progress: 0, text: '', error: '', gpu: false };
  async function loadDevice(model) {
    if (!canRunLocal()) throw httpError("This browser can't run models on the phone. Update Chrome or Safari, or use a free online brain.");
    const info = DEVICE_MODELS.find((m) => m.model === model);
    if (!info) throw httpError('Unknown on-device model');
    if (device.engine && device.model === model) return device.engine;
    if (device.loading) {
      // Another request is already loading this model: wait for it instead of failing.
      while (device.loading) await sleep(500);
      if (device.engine && device.model === model) return device.engine;
    }
    Object.assign(device, { loading: true, loadingModel: model, progress: 0, text: 'Starting…', error: '' });
    try {
      const { Wllama } = await import(WLLAMA_URL);
      if (device.engine) { try { await device.engine.exit(); } catch { /* ignore */ } device.engine = null; }
      const w = new Wllama({ default: WLLAMA_WASM }, { suppressNativeLog: true });
      const done = !!state.settings.downloaded[model];
      device.text = done ? 'Loading from your phone…' : 'Downloading (one time)…';
      await w.loadModelFromHF({ repo: model, quant: 'Q4_K_M' }, {
        n_ctx: 4096,
        progressCallback: ({ loaded, total }) => {
          device.progress = total ? loaded / total : 0;
          device.text = `${done ? 'Loading' : 'Downloading'} ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`;
        },
      });
      device.engine = w; device.model = model;
      device.text = 'Ready';
      state.settings.downloaded[model] = true;
      save();
      await discover(true);
      event('success', null, `On-device brain ready: ${info.label}${w.isMultithread?.() ? ' (multi-core)' : ''}`);
      return w;
    } catch (e) {
      device.error = e.message || String(e);
      throw httpError(`Couldn't load the on-device model: ${device.error}`);
    } finally { device.loading = false; device.loadingModel = ''; }
  }

  /* ------------------------------------------------------------ tools */
  const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
  const CORE_TOOLS = [
    { name: 'report_progress', description: 'Tell the user what you are doing right now (shown live). Call it when you start and at milestones.', parameters: obj({ message: { type: 'string' }, percent: { type: 'integer' } }) },
    { name: 'remember', description: 'Save a durable fact for future tasks (preferences, decisions, results). Never store secrets.', parameters: obj({ fact: { type: 'string' }, scope: { type: 'string', enum: ['agent', 'shared'] } }) },
    { name: 'recall', description: 'Search saved memories by keywords.', parameters: obj({ query: { type: 'string' } }) },
    { name: 'save_skill', description: 'Learn a skill: save a reusable playbook for this kind of task. Use when asked to learn something, or after a task the user will likely repeat.', parameters: obj({ name: { type: 'string' }, description: { type: 'string' }, instructions: { type: 'string' } }) },
    { name: 'use_skill', description: 'Load the full instructions of a saved skill before doing a task it covers.', parameters: obj({ name: { type: 'string' } }) },
    { name: 'write_file', description: "Save a deliverable (report, draft, plan) to the station's files so the user can open it.", parameters: obj({ filename: { type: 'string' }, content: { type: 'string' } }) },
    { name: 'read_file', description: "Read a file from the station's files.", parameters: obj({ filename: { type: 'string' } }) },
    { name: 'list_files', description: "List the station's saved files.", parameters: obj({}) },
  ];

  // Built-in plugins that work from a phone browser (free, no keys).
  const CODES = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail' };
  function calc(src) {
    const FN = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, ln: Math.log, log: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan };
    const s = String(src).replace(/\s+/g, '').replace(/,/g, '').toLowerCase(); let i = 0;
    const peek = () => s[i];
    const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') v = s[i++] === '+' ? v + term() : v - term(); return v; };
    const term = () => { let v = factor(); while ('*/%'.includes(peek() || '_')) { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; };
    const factor = () => { const b = unary(); return peek() === '^' ? (i++, b ** factor()) : b; };
    const unary = () => (peek() === '-' ? (i++, -unary()) : peek() === '+' ? (i++, unary()) : atom());
    const pct = (v) => (peek() === '%' && !/[\d(a-z]/.test(s[i + 1] || '') ? (i++, v / 100) : v);
    const atom = () => {
      if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('missing )'); return pct(v); }
      const n = s.slice(i).match(/^\d+(\.\d+)?(e[+-]?\d+)?/); if (n) { i += n[0].length; return pct(+n[0]); }
      const id = s.slice(i).match(/^[a-z]+/);
      if (id) { i += id[0].length; if (id[0] === 'pi') return Math.PI; if (id[0] === 'e') return Math.E; if (FN[id[0]] && peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('missing )'); return FN[id[0]](v); } throw new Error(`unknown "${id[0]}"`); }
      throw new Error(`unexpected "${peek() ?? 'end'}"`);
    };
    const v = expr(); if (i < s.length) throw new Error(`unexpected "${s[i]}"`); return v;
  }
  const PLUGINS = [
    { name: 'plugin_calculator', label: 'Calculator', icon: '🧮', description: 'Exact math: + - * / ^ %, parentheses, sqrt, round, ln, log, sin, cos, tan, pi. Use it for any arithmetic.',
      parameters: obj({ expression: { type: 'string' } }),
      run: async ({ expression }) => { try { const v = calc(expression); return Number.isFinite(v) ? `${expression} = ${+v.toPrecision(12)}` : 'Not a finite number.'; } catch (e) { return `Could not calculate: ${e.message}`; } } },
    { name: 'plugin_weather', label: 'Weather', icon: '⛅', description: 'Current weather and a 3-day forecast for any city (Open-Meteo, free).',
      parameters: obj({ city: { type: 'string' } }),
      run: async ({ city }) => {
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(String(city).split(',')[0])}`)).json();
        const p = g.results?.[0]; if (!p) return `Couldn't find "${city}".`;
        const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&forecast_days=3&timezone=auto`)).json();
        const c = w.current, d = w.daily;
        return `${p.name}, ${p.country}: now ${c.temperature_2m}°C, ${CODES[c.weather_code] || 'mixed'}, wind ${c.wind_speed_10m} km/h.\n` + d.time.map((t, i) => `${t}: ${CODES[d.weather_code[i]] || 'mixed'}, ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C, rain ${d.precipitation_probability_max[i] ?? '?'}%`).join('\n');
      } },
    { name: 'plugin_wikipedia', label: 'Wikipedia', icon: '📚', description: 'Look up any topic on Wikipedia: a short, sourced summary. Use it for facts, people, places, history and definitions.',
      parameters: obj({ topic: { type: 'string' } }),
      run: async ({ topic }) => {
        const s = await (await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&limit=3&format=json&origin=*&search=${encodeURIComponent(topic)}`)).json();
        const title = s?.[1]?.[0]; if (!title) return `No Wikipedia article for "${topic}".`;
        const r = await (await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)).json();
        return `${r.title}: ${r.extract || 'No summary.'}\nSource: ${r.content_urls?.mobile?.page || r.content_urls?.desktop?.page || ''}${s[1].length > 1 ? `\nRelated: ${s[1].slice(1).join(', ')}` : ''}`;
      } },
  ];
  const pluginOn = (p) => state.settings.plugins[p.name] !== false;

  const safeName = (n) => { const b = String(n || '').split(/[\\/]/).pop().replace(/[^\w.\- ]+/g, '_').slice(0, 120); if (!b || b.startsWith('.')) throw new Error('Invalid filename'); return b; };
  function searchMemories(agentId, query, limit = 10) {
    const words = String(query || '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    return state.memories.filter((m) => m.scope === 'shared' || m.agent === agentId)
      .map((m) => ({ m, score: words.reduce((s, w) => s + (m.fact.toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter((x) => !words.length || x.score > 0).sort((a, b) => b.score - a.score || b.m.ts - a.m.ts).slice(0, limit).map((x) => x.m);
  }

  async function runTool(name, input, { agent, task }) {
    input = input || {};
    switch (name) {
      case 'report_progress': { const pct = Math.max(0, Math.min(100, +input.percent || 0)); live[agent.id] = { ...live[agent.id], task: input.message, progress: pct }; task.log.push({ ts: now(), msg: String(input.message) }); event('info', agent.id, input.message); return 'ok'; }
      case 'remember': {
        const fact = String(input.fact || '').trim().slice(0, 1000); if (!fact) return 'Nothing to remember.';
        if (state.memories.some((m) => m.fact.toLowerCase() === fact.toLowerCase())) return 'Already remembered.';
        state.memories.unshift({ id: uid('mem'), ts: now(), agent: agent.id, scope: input.scope === 'shared' ? 'shared' : 'agent', fact, source: task.id });
        event('success', agent.id, `Remembered: ${fact}`); return 'Saved to memory.';
      }
      case 'recall': { const h = searchMemories(agent.id, input.query); return h.length ? h.map((m) => `- ${m.fact}`).join('\n') : 'No matching memories.'; }
      case 'save_skill': {
        const id = slug(input.name); if (!id) return 'Skill needs a name.';
        const ex = state.skills.find((s) => s.id === id);
        const sk = { id, name: String(input.name), description: String(input.description || ''), instructions: String(input.instructions || ''), author: agent.id, updatedAt: now(), uses: ex?.uses || 0 };
        if (ex) Object.assign(ex, sk); else state.skills.unshift(sk);
        event('success', agent.id, `${ex ? 'Updated' : 'Learned'} skill “${sk.name}”`); return `Skill "${id}" saved.`;
      }
      case 'use_skill': { const s = state.skills.find((k) => k.id === slug(input.name)); if (!s) return `No skill "${input.name}". Available: ${state.skills.map((k) => k.id).join(', ') || 'none'}`; s.uses = (s.uses || 0) + 1; event('info', agent.id, `Using skill “${s.name}”`); return `# Skill: ${s.name}\n${s.description}\n\n${s.instructions}`; }
      case 'write_file': { const n = safeName(input.filename); state.files[n] = { content: String(input.content ?? ''), updatedAt: now() }; task.files = [...new Set([...(task.files || []), n])]; event('success', agent.id, `Saved file ${n}`); return `Saved ${n}.`; }
      case 'read_file': { const f = state.files[safeName(input.filename)]; if (!f) return 'No such file.'; return f.content.length > 30000 ? f.content.slice(0, 30000) + '\n…[truncated]' : f.content; }
      case 'list_files': { const n = Object.keys(state.files); return n.length ? n.join('\n') : 'No files yet.'; }
      default: {
        const p = PLUGINS.find((x) => x.name === name && pluginOn(x));
        if (p) { event('info', agent.id, `Using ${p.label}`); return String(await p.run(input)); }
        throw new Error(`Unknown tool ${name}`);
      }
    }
  }
  const toolDefs = () => [...CORE_TOOLS, ...PLUGINS.filter(pluginOn).map((p) => ({ name: p.name, description: `[${p.label}] ${p.description}`, parameters: p.parameters }))];

  /* ------------------------------------------------------- agent loop */
  const VOICE_RULES = 'This is a spoken conversation; your final answer is read aloud. Reply in 1–4 short natural sentences: no markdown, lists, tables, emojis or raw URLs. Put long details in a file and say so.';
  function systemPrompt(agent, provider) {
    const web = provider === 'anthropic'
      ? '- Use web_search and web_fetch for anything current or factual, and cite links.'
      : '- You have no general web search here. Use the Wikipedia tool for facts, and say when something may be out of date.';
    return `You are ${agent.name}, ${agent.role}, an AI agent in the user's Agent Station app.
${agent.instructions || ''}

How you work:
${web}
- Call report_progress when you start and at milestones; keep messages short.
- Use the memories listed in the task. Save durable facts with remember (never secrets).
- If a listed skill fits, call use_skill first. Save a skill when asked to learn something or after a task the user will repeat.
- Put longer deliverables in a file with write_file and mention the filename.
- The user may be a beginner: end with a short, plain-language answer.`;
  }
  function preamble(agent, text, voice, compact) {
    const skills = state.skills.map((s) => (compact ? `- ${s.id}` : `- ${s.id}: ${s.description}`)).join('\n') || '(none yet)';
    const mems = [...new Map([...searchMemories(agent.id, text, 6), ...state.memories.filter((m) => m.scope === 'shared' || m.agent === agent.id).slice(0, compact ? 4 : 8)].map((m) => [m.id, m])).values()].slice(0, compact ? 6 : 12);
    return `Today is ${new Date().toDateString()}.\n\nSkills:\n${skills}\n\nMemories:\n${mems.map((m) => `- ${m.fact}`).join('\n') || '(none yet)'}\n${voice ? `\n${VOICE_RULES}\n` : ''}\n---\n${text}`;
  }
  function addUsage(agent, task, usage, modelId) {
    if (!usage) return;
    const [pi, po] = priceOf(modelId);
    const inp = usage.input_tokens ?? usage.prompt_tokens ?? 0, cw = usage.cache_creation_input_tokens || 0, cr = usage.cache_read_input_tokens || 0;
    const out = usage.output_tokens ?? usage.completion_tokens ?? 0;
    const cost = (inp + cw * 1.25 + cr * 0.1) / 1e6 * pi + out / 1e6 * po;
    const u = (state.usage[agent.id] ||= { tokens: 0, cost: 0 }); u.tokens += inp + cw + cr + out; u.cost += cost;
    task.tokens = (task.tokens || 0) + inp + cw + cr + out; task.cost = (task.cost || 0) + cost;
  }
  async function runTools(calls, ctx) {
    const out = [];
    for (const c of calls) { try { out.push({ id: c.id, content: String(await runTool(c.name, c.input, ctx)) }); } catch (e) { out.push({ id: c.id, content: `Error: ${e.message}`, isError: true }); } }
    save(); return out;
  }

  let AnthropicSDK = null;
  async function runClaude(agent, task, model, modelId) {
    AnthropicSDK ||= (await import('./vendor/anthropic-sdk.mjs')).default;
    const client = new AnthropicSDK({ apiKey: keys().anthropic, dangerouslyAllowBrowser: true }); // key stays on this phone
    const tools = [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 6 },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 },
      ...CORE_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters, strict: true })),
      ...PLUGINS.filter(pluginOn).map((p) => ({ name: p.name, description: p.description, input_schema: p.parameters, strict: true })),
    ];
    const fallback = /^claude-(opus-5-5|sonnet-5-5)/.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
    const messages = [{ role: 'user', content: preamble(agent, task.prompt, task.voice) }];
    let final = '';
    for (let turn = 0; turn < 25; turn++) {
      const r = await client.beta.messages.create({ model, max_tokens: 16000, system: [{ type: 'text', text: systemPrompt(agent, 'anthropic'), cache_control: { type: 'ephemeral' } }], output_config: { effort: 'medium' }, ...fallback, tools, messages });
      addUsage(agent, task, r.usage, modelId);
      const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(); if (text) final = text;
      if (r.stop_reason === 'refusal') throw new Error('The model declined this request.');
      if (r.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: r.content }); continue; }
      const uses = r.content.filter((b) => b.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || !uses.length) return final || '(No written answer.)';
      messages.push({ role: 'assistant', content: r.content });
      const res = await runTools(uses.map((u) => ({ id: u.id, name: u.name, input: u.input })), { agent, task });
      messages.push({ role: 'user', content: res.map((x) => ({ type: 'tool_result', tool_use_id: x.id, content: x.content, ...(x.isError ? { is_error: true } : {}) })) });
    }
    return final + '\n\n(Stopped after 25 tool rounds.)';
  }

  async function openaiChat(provider, model, messages, tools) {
    const k = keys();
    const base = provider === 'custom' ? (k.customUrl || '').replace(/\/$/, '') : OPENAI_BASE[provider];
    const key = provider === 'custom' ? k.customKey : k[provider];
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    if (provider === 'openrouter') headers['X-Title'] = 'Agent Station';
    const body = { model, messages }; if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }
    // Free tiers are often busy: retry rate limits and server hiccups a couple of times.
    for (let attempt = 0; ; attempt++) {
      let res, j;
      try {
        res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
        j = await res.json().catch(() => null);
      } catch (e) {
        if (attempt < 2) { await sleep(2000 * (attempt + 1)); continue; }
        throw e;
      }
      if (res.ok && j?.choices?.length && !j.error) return j;
      const msg = String(j?.error?.message || j?.error || (res.ok ? 'empty answer' : `HTTP ${res.status}`));
      const status = res.ok ? (j?.error?.code || 502) : res.status;
      if (status === 401 || status === 403) throw Object.assign(new Error(`${provider}: key missing or invalid (${msg})`), { code: 'auth' });
      if ((status === 429 || status >= 500 || msg === 'empty answer') && attempt < 2) {
        const wait = Math.min(15000, (+res.headers?.get?.('retry-after') || 0) * 1000 || 3000 * (attempt + 1));
        await sleep(wait); continue;
      }
      if (status === 429) throw Object.assign(new Error(`${provider}: this free model is busy right now (rate limited). Try again in a minute, or pick another free model in Brain → Connect.`), { code: 'rate' });
      if (/tool|function/i.test(msg) && tools?.length) throw Object.assign(new Error(msg), { code: 'no-tools' });
      throw new Error(`${provider} error: ${msg}`);
    }
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stripThink = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').trim();

  // Some models write tool calls as text in Qwen/Hermes format instead of returning tool_calls.
  function textToolCalls(content) {
    const out = [];
    for (const m of String(content || '').matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)) {
      try { const j = JSON.parse(m[1]); if (j.name) out.push({ type: 'function', function: { name: j.name, arguments: JSON.stringify(j.arguments ?? j.parameters ?? {}) } }); } catch { /* ignore */ }
    }
    return out;
  }

  // One tool-calling loop for every OpenAI-style brain: online providers and on-device models.
  async function runToolLoop(agent, task, modelId, chat, { maxTurns = 20, compact = false, provider = 'openai' } = {}) {
    const tools = toolDefs().map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    const messages = [{ role: 'system', content: systemPrompt(agent, provider) }, { role: 'user', content: preamble(agent, task.prompt, task.voice, compact) }];
    let final = '';
    for (let turn = 0; turn < maxTurns; turn++) {
      const r = await chat(messages, tools);
      addUsage(agent, task, r.usage, modelId);
      const m = r.choices?.[0]?.message || {};
      let calls = (m.tool_calls || []).filter((c) => c.function?.name);
      if (!calls.length) calls = textToolCalls(m.content);
      const text = stripThink(String(m.content || '').replace(/<tool_call>[\s\S]*?<\/tool_call>/g, ''));
      if (text) final = text;
      if (!calls.length) return final || '(No written answer.)';
      calls.forEach((c, i) => { c.id ||= `call_${turn}_${i}`; c.type ||= 'function'; });
      messages.push({ role: 'assistant', content: m.content || '', tool_calls: calls });
      const parsed = calls.map((c) => { let input = null; try { input = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : c.function.arguments || {}; } catch { /* bad JSON */ } return { id: c.id, name: c.function.name, input }; });
      const res = await runTools(parsed.filter((p) => p.input), { agent, task });
      parsed.filter((p) => !p.input).forEach((p) => res.push({ id: p.id, content: 'Error: arguments were not valid JSON. Try again.' }));
      res.forEach((x) => messages.push({ role: 'tool', tool_call_id: x.id, content: compact ? x.content.slice(0, 2500) : x.content }));
    }
    return final + `\n\n(Stopped after ${maxTurns} tool rounds.)`;
  }

  const runOpenAI = (agent, task, provider, model, modelId) =>
    runToolLoop(agent, task, modelId, (messages, tools) => openaiChat(provider, model, messages, tools), { provider });

  async function runDevice(agent, task, model) {
    const w = await loadDevice(model);
    const noThink = /qwen3/i.test(model);
    return runToolLoop(agent, task, `device:${model}`, async (messages, tools) => {
      const msgs = noThink ? messages.map((m, i) => (i === 0 ? { ...m, content: m.content + '\n/no_think' } : m)) : messages;
      const t0 = now();
      const tick = setInterval(() => { live[agent.id] = { ...live[agent.id], task: `Thinking on your phone… ${Math.round((now() - t0) / 1000)}s` }; }, 1000);
      try { return await w.createChatCompletion({ messages: msgs, tools, tool_choice: 'auto', max_tokens: 1024, temperature: 0.3 }); }
      finally { clearInterval(tick); }
    }, { maxTurns: 10, compact: true, provider: 'device' });
  }

  async function runAgent(agent, task) {
    await discover();
    const modelId = agentModel(agent);
    if (!modelId) throw new Error('Your agents need a brain first. Open Brain → Connect → "Set up brains" to download a free on-device model or add a free key.');
    task.model = modelId;
    const { provider, model } = parseModel(modelId);
    if (provider === 'device') return runDevice(agent, task, model);
    if (provider === 'anthropic') return runClaude(agent, task, model, modelId);
    try { return await runOpenAI(agent, task, provider, model, modelId); }
    catch (e) {
      if (e.code !== 'no-tools') throw e;
      // That model can't use tools: hide it and hand the task to the next tool-capable model.
      (state.settings.noTools ||= {})[modelId] = true; save();
      await discover(true);
      const next = agentModel(agent);
      if (!next || next === modelId) throw new Error(`${model} can't use tools, and no other tool-capable model is available. Add another brain in Brain → Connect.`);
      event('info', agent.id, `${model} can't use tools; switched to ${parseModel(next).model}`);
      if (agent.model === modelId) { agent.model = ''; save(); }
      return runAgent(agent, task);
    }
  }

  /* ---------------------------------------------- tasks and workflows */
  const queues = {};
  function createTask(agentId, prompt, extra = {}) {
    const agent = agentById(agentId); if (!agent) throw httpError('Pick an agent first');
    const text = String(prompt || '').trim(); if (!text) throw httpError('Write a prompt first');
    const task = { id: uid('task'), agent: agent.id, prompt: text.slice(0, 20000), status: 'queued', createdAt: now(), log: [], files: [], ...extra };
    state.tasks.unshift(task); state.tasks.length = Math.min(state.tasks.length, 150);
    event('info', agent.id, `New task: ${task.title || text.slice(0, 70)}`);
    const done = (queues[agent.id] || Promise.resolve()).then(() => execute(agent, task));
    Object.defineProperty(task, 'done', { value: done, enumerable: false });
    queues[agent.id] = done.catch(() => {});
    save(); return task;
  }
  async function execute(agent, task) {
    task.status = 'running'; task.startedAt = now();
    live[agent.id] = { status: 'running', task: 'Thinking…', progress: 3 };
    save();
    try {
      task.result = await runAgent(agent, task); task.status = 'done';
      event('success', agent.id, `Finished: ${task.title || task.prompt.slice(0, 60)}`);
    } catch (e) {
      task.status = 'error';
      const A = AnthropicSDK;
      task.result = A && e instanceof A.AuthenticationError ? 'Your Claude API key is invalid. Update it in Brain → Connect → Set up brains.'
        : A && e instanceof A.RateLimitError ? 'Claude is rate limiting requests. Try again in a minute.'
        : e instanceof TypeError && /fetch/i.test(e.message) ? "Couldn't reach the AI service. Check your internet connection (on-device models work offline)."
        : e.message || String(e);
      event('error', agent.id, `Task failed: ${task.result}`);
    } finally {
      task.finishedAt = now();
      live[agent.id] = { status: task.status === 'error' ? 'error' : 'idle', task: task.status === 'error' ? task.result : '', progress: 0 };
      save();
    }
    return task;
  }
  function runWorkflow(wf, input) {
    if (state.runs.some((r) => r.workflow === wf.id && r.status === 'running')) throw httpError('This workflow is already running');
    const run = { id: uid('run'), workflow: wf.id, input: String(input ?? wf.input ?? ''), status: 'running', startedAt: now(), steps: wf.steps.map((s) => ({ name: s.name, agent: s.agent, status: 'pending', duration: 0 })) };
    state.runs.unshift(run); state.runs.length = Math.min(state.runs.length, 60);
    event('info', wf.steps[0]?.agent, `Workflow “${wf.name}” started`); save();
    (async () => {
      let handoff = '';
      for (let i = 0; i < wf.steps.length; i++) {
        const s = wf.steps[i], rs = run.steps[i]; rs.status = 'running'; const t0 = now(); save();
        const t = createTask(s.agent, `Workflow "${wf.name}", step ${i + 1} of ${wf.steps.length}: ${s.name}\n\nInstructions:\n${s.instructions}\n\nWorkflow input:\n${run.input || '(none)'}${handoff ? `\n\nResults from earlier steps:\n${handoff}` : ''}`, { title: `${wf.name} · ${s.name}`, run: run.id });
        rs.task = t.id; await t.done; rs.duration = (now() - t0) / 1000;
        rs.status = t.status === 'done' ? 'done' : 'error';
        if (t.status !== 'done') { run.status = 'error'; event('error', s.agent, `Workflow “${wf.name}” stopped at “${s.name}”`); save(); return; }
        handoff += `\n## ${s.name}\n${t.result}${t.files?.length ? `\nFiles: ${t.files.join(', ')}` : ''}\n`;
      }
      run.status = 'done'; run.output = handoff; event('success', wf.steps.at(-1)?.agent, `Workflow “${wf.name}” completed`); save();
    })();
    return run;
  }
  async function improvePrompt(text, agentId) {
    await discover();
    const a = agentById(agentId), modelId = a ? agentModel(a) : defaultModel();
    if (!modelId) throw httpError('Set up a brain first (Brain → Connect).');
    const system = 'Rewrite the user\'s request so an AI agent can act on it: goal, key context, constraints, output format, and what "done" looks like. Keep their intent, under 120 words, and use [brackets] for details only the user knows. Reply with the improved prompt only.';
    const { provider, model } = parseModel(modelId);
    if (provider === 'device') { const w = await loadDevice(model); const r = await w.createChatCompletion({ messages: [{ role: 'system', content: system + (/qwen3/i.test(model) ? '\n/no_think' : '') }, { role: 'user', content: text }], temperature: 0.4, max_tokens: 400 }); return stripThink(r.choices[0].message.content); }
    if (provider === 'anthropic') { AnthropicSDK ||= (await import('./vendor/anthropic-sdk.mjs')).default; const c = new AnthropicSDK({ apiKey: keys().anthropic, dangerouslyAllowBrowser: true }); const r = await c.messages.create({ model, max_tokens: 2000, output_config: { effort: 'low' }, system, messages: [{ role: 'user', content: text }] }); return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim(); }
    const r = await openaiChat(provider, model, [{ role: 'system', content: system }, { role: 'user', content: text }]); return stripThink(r.choices[0].message.content);
  }

  /* ----------------------------------------------------------- status */
  const PROVIDER_INFO = [
    { id: 'device', label: 'On this phone (open-source, offline)', free: true, setup: 'Download a Qwen model once in Set up brains (0.5–1.8 GB, use Wi-Fi). Runs on any recent phone.' },
    { id: 'openrouter', label: 'OpenRouter: free online open models', free: true, setup: 'Free key at openrouter.ai → paste it in Set up brains. ":free" models cost nothing (rate-limited).' },
    { id: 'groq', label: 'Groq: fast free tier', free: true, setup: 'Free key at console.groq.com → paste it in Set up brains.' },
    { id: 'anthropic', label: 'Claude (Anthropic)', free: false, setup: 'Key from console.anthropic.com → paste it in Set up brains. Paid per use; includes real web search.' },
    { id: 'custom', label: 'Custom OpenAI-compatible server', free: true, setup: 'URL (https) and optional key of any OpenAI-compatible server.' },
  ];
  function status() {
    const files = Object.entries(state.files).map(([name, f]) => ({ name, size: f.content.length, updatedAt: f.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
    const run = (wf) => state.runs.find((r) => r.workflow === wf.id);
    return {
      mode: 'phone', model: defaultModel(), defaultModel: defaultModel(), serverTime: now(),
      models: modelCache.models, providers: PROVIDER_INFO.map((p) => ({ ...p, ...(modelCache.providers[p.id] || { ready: false, note: '' }) })),
      device: { webgpu: hasWebGPU(), supported: canRunLocal(), loading: device.loading, loadingModel: device.loadingModel || '', progress: device.progress, text: device.text, error: device.error, loaded: device.model, downloaded: state.settings.downloaded, models: DEVICE_MODELS },
      keys: Object.fromEntries(Object.entries(keys()).map(([k, v]) => [k, k === 'customUrl' ? v : !!v])),
      connectors: [], plugins: PLUGINS.map((p) => ({ name: p.name, label: p.label, icon: p.icon, description: p.description, enabled: pluginOn(p) })),
      voice: { stt: false }, clone: { available: false }, studio: { available: false, voices: [] }, voices: [],
      stations: state.stations,
      agents: state.agents.map((a) => {
        const l = live[a.id] || {}, u = state.usage[a.id] || { tokens: 0, cost: 0 };
        const queued = state.tasks.filter((t) => t.agent === a.id && t.status === 'queued').length;
        return { ...a, model: agentModel(a), modelChosen: a.model || '', voiceId: '', avatar: a.avatar || '',
          status: l.status === 'running' ? 'running' : l.status === 'error' ? 'error' : queued ? 'waiting' : 'idle',
          task: l.status === 'running' || l.status === 'error' ? l.task : queued ? `${queued} task(s) queued` : 'Ready for a task',
          progress: l.progress || 0, tokens: u.tokens, cost: +u.cost.toFixed(4) };
      }),
      workflows: state.workflows.map((wf) => { const r = run(wf); return { ...wf, status: r ? r.status : 'idle', startedAt: r?.startedAt, output: r?.output, steps: wf.steps.map((s, i) => ({ ...s, status: r?.steps[i]?.status || 'pending', duration: r?.steps[i]?.duration || 0, task: r?.steps[i]?.task })) }; }),
      tasks: state.tasks.slice(0, 60), skills: state.skills, memories: state.memories, events: state.events.slice(0, 80), files,
    };
  }

  /* ----------------------------------------------------------- routes */
  const NEEDS_COMPUTER = 'Connectors run programs on a computer, so they need the station server. Phones can run plugins, but not MCP connectors.';
  const routes = [
    ['GET', /^status$/, async () => { await discover(); return status(); }],
    ['POST', /^tasks$/, (_, b) => createTask(b.agent, b.prompt, { ...(b.voice ? { voice: true } : {}), ...(b.title ? { title: String(b.title).slice(0, 120) } : {}) })],
    ['POST', /^improve-prompt$/, async (_, b) => ({ prompt: await improvePrompt(String(b.prompt || '').slice(0, 4000), b.agent) })],
    ['POST', /^workflows$/, (_, b) => {
      const steps = (b.steps || []).filter((s) => agentById(s.agent) && s.instructions);
      if (!b.name || !steps.length) throw httpError('A workflow needs a name and steps with an agent and instructions');
      const wf = { id: uid('wf'), name: String(b.name).slice(0, 80), description: String(b.description || ''), input: String(b.input || ''), trigger: 'manual', steps: steps.map((s) => ({ name: s.name || 'Step', agent: s.agent, instructions: String(s.instructions) })) };
      state.workflows.push(wf); save(); return wf;
    }],
    ['DELETE', /^workflows\/(.+)$/, ([id]) => { state.workflows = state.workflows.filter((w) => w.id !== id); save(); return { ok: true }; }],
    ['POST', /^workflows\/(.+)\/run$/, ([id], b) => { const wf = state.workflows.find((w) => w.id === id); if (!wf) throw httpError('No such workflow'); return runWorkflow(wf, b.input); }],
    ['POST', /^agents$/, (_, b) => {
      if (!b.name) throw httpError('Agent needs a name');
      let id = slug(b.name) || uid('agent'); if (agentById(id)) id += '-' + Math.random().toString(36).slice(2, 5);
      const a = { id, name: String(b.name).slice(0, 40), role: String(b.role || 'Assistant').slice(0, 60), station: state.stations.some((s) => s.id === b.station) ? b.station : state.stations[0].id, instructions: String(b.instructions || '').slice(0, 4000), model: String(b.model || ''), avatar: /^[a-z0-9-]{1,30}$/.test(b.avatar || '') ? b.avatar : '' };
      state.agents.push(a); event('success', a.id, `${a.name} joined ${a.station}`); save(); return a;
    }],
    ['PATCH', /^agents\/(.+)$/, ([id], b) => {
      const a = agentById(id); if (!a) throw httpError('No such agent');
      if ('model' in b) { a.model = String(b.model || ''); event('info', a.id, `${a.name} now uses ${agentModel(a) || 'no model yet'}`); }
      if ('avatar' in b && /^[a-z0-9-]{0,30}$/.test(b.avatar || '')) a.avatar = b.avatar || '';
      save(); return a;
    }],
    ['PATCH', /^settings$/, (_, b) => { if ('defaultModel' in b) state.settings.defaultModel = String(b.defaultModel || ''); save(); return { defaultModel: defaultModel() }; }],
    ['POST', /^models\/refresh$/, async () => ({ count: (await discover(true)).models.length })],
    ['POST', /^plugins\/(.+)$/, ([n], b) => { state.settings.plugins[n] = !!b.enabled; save(); return { ok: true }; }],
    ['POST', /^skills$/, (_, b) => { const id = slug(b.name); if (!id || !b.instructions) throw httpError('Skill needs a name and steps'); state.skills = [{ id, name: b.name, description: b.description || '', instructions: b.instructions, author: 'you', updatedAt: now(), uses: 0 }, ...state.skills.filter((s) => s.id !== id)]; event('success', null, `You taught the station skill “${b.name}”`); save(); return { id }; }],
    ['DELETE', /^skills\/(.+)$/, ([id]) => { state.skills = state.skills.filter((s) => s.id !== id); save(); return { ok: true }; }],
    ['POST', /^memories$/, (_, b) => { const fact = String(b.fact || '').trim(); if (!fact) throw httpError('Memory is empty'); const m = { id: uid('mem'), ts: now(), agent: agentById(b.agent) ? b.agent : null, scope: agentById(b.agent) ? 'agent' : 'shared', fact: fact.slice(0, 1000), source: 'you' }; state.memories.unshift(m); save(); return m; }],
    ['DELETE', /^memories\/(.+)$/, ([id]) => { state.memories = state.memories.filter((m) => m.id !== id); save(); return { ok: true }; }],
    ['GET', /^files\/(.+)$/, ([n]) => state.files[decodeURIComponent(n)]?.content ?? ''],
    // phone-only
    ['POST', /^brain\/keys$/, async (_, b) => {
      const k = keys();
      for (const f of ['anthropic', 'openrouter', 'groq', 'customKey']) if (typeof b[f] === 'string') { if (b[f].trim()) k[f] = b[f].trim(); else delete k[f]; }
      if (typeof b.customUrl === 'string') { const u = b.customUrl.trim(); if (u && !/^https:\/\//.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(u)) throw httpError('Custom server must use https://'); if (u) k.customUrl = u; else delete k.customUrl; }
      // Check new keys right away so a typo shows up now, not on the first task.
      if (b.openrouter?.trim()) {
        const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${b.openrouter.trim()}` } }).catch(() => null);
        if (r && (r.status === 401 || r.status === 403)) throw httpError('That OpenRouter key was rejected. Copy it again from openrouter.ai → Keys (it starts with sk-or-).');
      }
      if (b.groq?.trim()) {
        const r = await fetch(`${OPENAI_BASE.groq}/models`, { headers: { Authorization: `Bearer ${b.groq.trim()}` } }).catch(() => null);
        if (r && (r.status === 401 || r.status === 403)) throw httpError('That Groq key was rejected. Copy it again from console.groq.com → API Keys.');
      }
      setKeys(k); const m = await discover(true); return { count: m.models.length };
    }],
    ['POST', /^brain\/device$/, (_, b) => { loadDevice(String(b.model || '')).catch(() => {}); return { ok: true }; }],
    ['POST', /^brain\/forget-device$/, (_, b) => { delete state.settings.downloaded[b.model]; save(); return discover(true).then(() => ({ ok: true })); }],
    ['POST', /^connectors\//, () => { throw httpError(NEEDS_COMPUTER); }],
  ];

  window.AgentStationEngine = {
    async handle(method, path, body) {
      await ready;
      for (const [m, re, fn] of routes) { const x = path.match(re); if (x && m === method) return JSON.parse(JSON.stringify(await fn(x.slice(1), body || {}) ?? null)); }
      throw httpError('Not available when agents run on the phone');
    },
    hasWebGPU,
  };
})();
