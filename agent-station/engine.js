/* Agent Station on-phone engine: runs your agents inside the app itself.
 *
 * No computer needed. The agent loop, tools, memory, skills, files and workflows
 * all run on this device and are saved in the browser's storage (IndexedDB).
 * The "brain" (AI model) is one of:
 *   device:<model>      an open-source Qwen model running ON the phone via wllama (CPU, or GPU when available).
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
  const ECHO = () => ({ id: 'echo', name: 'Echo', role: 'Social media manager', station: 'studio', instructions: 'You plan and write social media posts: scroll-stopping hooks, captions sized for each platform, relevant hashtags and a simple posting schedule. Match the brand voice asked for, suggest an image or video idea for each post, and never post anything yourself unless a connected tool is asked to.' });
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
      ECHO(),
    ],
    workflows: [
      { id: 'wf_brief', name: 'Research → Brief', trigger: 'manual', description: 'Scout researches a topic, then Quill writes a one-page brief.', input: 'the best budget laptops for students this year',
        steps: [{ name: 'Research the topic', agent: 'scout', instructions: 'Research the topic below. Collect 5–8 key facts with sources.' }, { name: 'Write the brief', agent: 'quill', instructions: 'Write a one-page brief from the research: a 3-sentence summary, key points as bullets, and sources. Save it as a markdown file.' }] },
      { id: 'wf_plan', name: 'Goal → Action plan', trigger: 'manual', description: 'Atlas turns a goal into a plan, then Quill makes a friendly checklist.', input: 'start a small weekend baking business',
        steps: [{ name: 'Make a plan', agent: 'atlas', instructions: 'Turn the goal below into a step-by-step plan with milestones and rough time estimates.' }, { name: 'Write the checklist', agent: 'quill', instructions: 'Rewrite the plan as a short, encouraging checklist a beginner can follow. Save it as a markdown file.' }] },
    ],
    tasks: [], runs: [], approvals: [], skills: [], memories: [], events: [], files: {}, usage: {},
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
      state.approvals ||= [];
      if (!state.settings.echoAdded) { if (!state.agents.some((x) => x.id === 'echo')) state.agents.push(ECHO()); state.settings.echoAdded = true; } // Echo joined in a later version
      for (const t of state.tasks) if ((t.status === 'running' || t.status === 'queued') && t.agent !== 'muse') { t.status = 'error'; t.result = 'The app was closed before this task finished. Keep the app open while agents work.'; }
      for (const r of state.runs) if (r.status === 'running') { r.status = 'error'; r.steps.forEach((st) => { if (st.status === 'running') st.status = 'error'; }); }
    } catch { /* storage unavailable: run in memory */ }
  })();

  function event(level, agent, msg) {
    state.events.unshift({ id: uid('ev'), ts: now(), level, agent, msg: String(msg).slice(0, 400) });
    state.events.length = Math.min(state.events.length, 200);
    save();
  }
  const agentById = (id) => state.agents.find((a) => a.id === id);
  // Agent Builder fields: custom look, voice pitch and personality sliders.
  function custom(b) {
    const out = {};
    if ('look' in b) out.look = window.AgentStationCharacters?.cleanLook(b.look) || null;
    if ('pitch' in b) out.pitch = Math.max(0.5, Math.min(2, +b.pitch || 1));
    if (b.traits && typeof b.traits === 'object') out.traits = Object.fromEntries(['warm', 'detail', 'playful', 'bold'].map((k) => [k, Math.max(0, Math.min(100, +b.traits[k] || 50))]));
    return out;
  }

  /* ----------------------------------------------------------- brains */
  // Free models that run on the phone (GGUF, under the 2 GB browser limit, no sign-up needed).
  // tools: true  = trained for native tool calling (files, memory, plugins…)
  // tools: false = chat only (answers directly; great for writing and conversation)
  const DEVICE_MODELS = [
    { model: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', label: 'Qwen2.5 1.5B', size: '≈1.1 GB', tools: true, license: 'Apache-2.0', note: 'Recommended: reliable tool use at a good speed' },
    { model: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF', label: 'Qwen2.5 0.5B', size: '≈0.5 GB', tools: true, license: 'Apache-2.0', note: 'Smallest and fastest; quick, simple tasks' },
    { model: 'bartowski/Llama-3.2-1B-Instruct-GGUF', label: 'Llama 3.2 1B', size: '≈0.8 GB', tools: true, license: 'Llama 3.2 Community License (free)', note: "Meta's small Llama; fast" },
    { model: 'bartowski/Llama-3.2-3B-Instruct-GGUF', label: 'Llama 3.2 3B', size: '≈2.0 GB', tools: true, license: 'Llama 3.2 Community License (free)', note: 'Smartest Llama that fits; needs a phone with 6 GB+ memory' },
    { model: 'Qwen/Qwen3-1.7B-GGUF', label: 'Qwen3 1.7B', size: '≈1.8 GB', tools: true, license: 'Apache-2.0', note: 'Newest Qwen; smart but slower' },
    { model: 'unsloth/gemma-3-1b-it-GGUF', label: 'Gemma 3 1B', size: '≈0.8 GB', tools: false, license: 'Gemma terms (free)', note: "Google's small model; friendly writing and chat" },
    { model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF', label: 'SmolLM2 1.7B', size: '≈1.1 GB', tools: false, license: 'Apache-2.0', note: 'Fully open model by Hugging Face' },
    { model: 'bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF', label: 'DeepSeek R1 Distill 1.5B', size: '≈1.1 GB', tools: false, license: 'MIT', note: 'Thinks step by step: puzzles, math, reasoning' },
    { model: 'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF', label: 'TinyLlama 1.1B', size: '≈0.7 GB', tools: false, license: 'Apache-2.0', note: 'Tiny classic Llama-style chat model' },
  ];
  const deviceInfo = (model) => DEVICE_MODELS.find((m) => m.model === model);
  const CLAUDE = [
    { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', price: [4, 20] },
    { model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', price: [2, 10] },
    { model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', price: [0.1, 0.5] },
  ];
  // Paid AI providers with OpenAI-compatible chat APIs (keys stay on this phone).
  const PAID = {
    openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', keep: (id) => /^(gpt-|o\d|chatgpt-)/i.test(id) && !/audio|realtime|image|embed|tts|transcri|search|moderation|instruct|dall|codex-mini/i.test(id) },
    gemini: { label: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keep: (id) => /gemini/i.test(id) && !/embed|image|tts|aqa|live|native-audio/i.test(id) },
    xai: { label: 'Grok', base: 'https://api.x.ai/v1', keep: (id) => /grok/i.test(id) && !/image|imagine/i.test(id) },
    mistral: { label: 'Mistral', base: 'https://api.mistral.ai/v1', keep: (id) => !/embed|moderation|ocr|transcri|voxtral/i.test(id) },
    deepseek: { label: 'DeepSeek', base: 'https://api.deepseek.com/v1', keep: () => true },
    perplexity: { label: 'Perplexity', base: 'https://api.perplexity.ai', fixed: ['sonar', 'sonar-pro', 'sonar-reasoning-pro'], tools: false },
  };
  const OPENAI_BASE = { openrouter: 'https://openrouter.ai/api/v1', groq: 'https://api.groq.com/openai/v1', ...Object.fromEntries(Object.entries(PAID).map(([k, v]) => [k, v.base])) };
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
      have.forEach((m) => add('device', m.model, `${m.label} (on this phone)`, true, { tools: m.tools }));
      providers.device = { ready: have.length > 0, note: have.length ? `${have.length} model(s) downloaded` : 'Download a model to start' };
    } else providers.device = { ready: false, note: "This browser can't run models on the phone. Update Chrome or Safari." };
    // Claude
    if (k.anthropic) { CLAUDE.forEach((c) => add('anthropic', c.model, c.label, false, { tools: true })); providers.anthropic = { ready: true, note: 'Key saved on this phone' }; }
    else providers.anthropic = { ready: false, note: 'No key' };
    // OpenRouter free models with tools
    if (k.openrouter) {
      try {
        const j = await (await fetch(`${OPENAI_BASE.openrouter}/models`, { signal: AbortSignal.timeout(8000) })).json();
        const toolOk = (m) => (m.supported_parameters || []).includes('tools') && !state.settings.noTools?.[`openrouter:${m.id}`];
        const free = (j.data || []).filter((m) => m.id.endsWith(':free'))
          .sort((a, b) => (toolOk(b) - toolOk(a)) || (rankFree({ model: a.id }) - rankFree({ model: b.id }))).slice(0, 40);
        free.forEach((m) => add('openrouter', m.id, (m.name || m.id).replace(/^[^:]{1,30}:\s*/, '').replace(/\s*\(free\)\s*$/i, '') + ' (free)', true, { tools: toolOk(m) }));
        const nt = free.filter(toolOk).length;
        providers.openrouter = { ready: free.length > 0, note: `${free.length} free model(s), ${nt} with tools` };
      } catch (e) { providers.openrouter = { ready: false, note: `Couldn't list models (${e.message})` }; }
    } else providers.openrouter = { ready: false, note: 'No key' };
    // Groq
    if (k.groq) {
      try {
        const j = await (await fetch(`${OPENAI_BASE.groq}/models`, { headers: { Authorization: `Bearer ${k.groq}` }, signal: AbortSignal.timeout(8000) })).json();
        const ids = (j.data || []).map((m) => m.id).filter((id) => !/whisper|tts|guard|playai/i.test(id));
        ids.forEach((id) => add('groq', id, `${id} (Groq)`, true, { tools: !state.settings.noTools?.[`groq:${id}`] }));
        providers.groq = { ready: ids.length > 0, note: `${ids.length} model(s)` };
      } catch (e) { providers.groq = { ready: false, note: `Couldn't reach Groq (${e.message})` }; }
    } else providers.groq = { ready: false, note: 'No key' };
    // Paid providers
    for (const [pid, P] of Object.entries(PAID)) {
      if (!k[pid]) { providers[pid] = { ready: false, note: 'No key' }; continue; }
      let ids = [];
      if (P.fixed) ids = P.fixed;
      else {
        try {
          const r = await fetch(`${P.base}/models`, { headers: { Authorization: `Bearer ${k[pid]}` }, signal: AbortSignal.timeout(8000) });
          if (r.status === 401 || r.status === 403) { providers[pid] = { ready: false, note: 'Key rejected. Check it in Set up brains' }; continue; }
          ids = ((await r.json()).data || []).map((m) => String(m.id).replace(/^models\//, '')).filter(P.keep).sort().reverse().slice(0, 25);
        } catch { ids = []; }
      }
      if (k[`${pid}Model`]) ids = [...new Set([k[`${pid}Model`], ...ids])];
      ids.forEach((id) => add(pid, id, `${id} (${P.label})`, false, { tools: P.tools !== false && !state.settings.noTools?.[`${pid}:${id}`] }));
      providers[pid] = ids.length ? { ready: true, note: `${ids.length} model(s)${P.tools === false ? ' · chat with live web search' : ''}` }
        : { ready: false, note: "Key saved, but the model list couldn't be loaded from the phone. Type a model name in Set up brains." };
    }
    // Custom
    if (k.customUrl) {
      try {
        const j = await (await fetch(`${k.customUrl.replace(/\/$/, '')}/models`, { headers: k.customKey ? { Authorization: `Bearer ${k.customKey}` } : {}, signal: AbortSignal.timeout(5000) })).json();
        const ids = (j.data || []).map((m) => m.id);
        ids.forEach((id) => add('custom', id, `${id} (custom)`, true, { tools: !state.settings.noTools?.[`custom:${id}`] }));
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
    if (state.settings.defaultModel && modelCache.models.some((m) => m.id === state.settings.defaultModel)) return state.settings.defaultModel;
    const ms = modelCache.models.filter((m) => m.tools !== false).length ? modelCache.models.filter((m) => m.tools !== false) : modelCache.models;
    const paidOrder = ['anthropic', 'openai', 'gemini', 'xai', 'mistral', 'deepseek'];
    const pick = ms.find((m) => m.provider === 'anthropic' && m.model === 'claude-opus-5-5')
      || paidOrder.map((p) => ms.find((m) => m.provider === p)).find(Boolean)
      || ms.find((m) => m.provider === 'device')
      || [...ms.filter((m) => m.provider === 'openrouter' || m.provider === 'groq')].sort((a, b) => rankFree(a) - rankFree(b))[0]
      || ms[0];
    return pick?.id || '';
  };
  const agentModel = (a) => (a.model && modelCache.models.some((m) => m.id === a.model) ? a.model : defaultModel());

  /* ------------------------------------------------- on-device runtime */
  const device = { engine: null, model: '', loading: false, loadingModel: '', progress: 0, text: '', error: '', gpu: false };
  async function loadDevice(model) {
    if (!canRunLocal()) throw httpError("This browser can't run models on the phone. Update Chrome or Safari, or use a free online brain.");
    const info = deviceInfo(model);
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
      await w.loadModelFromHF({ repo: model }, { // picks Q4_K_M, then Q8_0, then whatever the repo has
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

  /* ------------------------------------------------- work connectors */
  // Remote MCP servers (Zapier, GitHub, any URL). With a Claude brain, Anthropic connects to them
  // server-side (works for every server). Other brains connect from the phone, which works when the
  // server allows browser requests (CORS).
  const CONN_LS = 'as.connectors';
  const connectors = () => { try { return JSON.parse(localStorage.getItem(CONN_LS)) || []; } catch { return []; } };
  const setConnectors = (c) => { try { localStorage.setItem(CONN_LS, JSON.stringify(c)); } catch { /* private mode */ } };
  const mcpSessions = {};
  const MCP_PROTO = '2025-06-18';
  async function mcpRpc(c, method, params, sessionId, notify = false) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': MCP_PROTO };
    if (c.token) headers.Authorization = `Bearer ${c.token}`;
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const id = notify ? undefined : Math.floor(Math.random() * 1e9);
    const res = await fetch(c.url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', ...(notify ? {} : { id }), method, ...(params ? { params } : {}) }), signal: AbortSignal.timeout(60000) });
    if (notify) return {};
    if (res.status === 401 || res.status === 403) throw new Error('The connector rejected the token');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let msg;
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
      for (const line of (await res.text()).split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5)); if (j.id === id) msg = j; } catch { /* skip */ } }
    } else msg = await res.json();
    if (!msg || msg.jsonrpc !== '2.0') throw new Error("That address didn't answer like an MCP connector. Check the URL.");
    if (msg.error) throw new Error(msg.error.message || 'Connector error');
    if (msg.result === undefined) throw new Error("That address didn't answer like an MCP connector. Check the URL.");
    return { result: msg.result, sessionId: res.headers.get('mcp-session-id') || sessionId };
  }
  async function mcpConnect(c, fresh = false) {
    const s = mcpSessions[c.id];
    if (!fresh && s && now() - s.at < 10 * 60e3) return s;
    try {
      const init = await mcpRpc(c, 'initialize', { protocolVersion: MCP_PROTO, capabilities: {}, clientInfo: { name: 'agent-station', version: '1.0.0' } });
      await mcpRpc(c, 'notifications/initialized', null, init.sessionId, true).catch(() => {});
      const { result } = await mcpRpc(c, 'tools/list', {}, init.sessionId);
      return (mcpSessions[c.id] = { ok: true, at: now(), sessionId: init.sessionId, tools: result?.tools || [] });
    } catch (e) {
      const blocked = e instanceof TypeError;
      return (mcpSessions[c.id] = { ok: false, at: now(), tools: [], error: blocked ? 'This connector blocks requests from the phone browser. It works when the agent uses a Claude brain.' : e.message });
    }
  }
  const connName = (c) => `mcp_${c.id}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30);
  async function connectorToolDefs() {
    const defs = [];
    for (const c of connectors().filter((x) => x.enabled)) {
      const s = await mcpConnect(c);
      for (const t of s.tools) defs.push({ name: `${connName(c)}__${t.name}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64), description: `[${c.name}] ${t.description || t.name}`.slice(0, 1000), parameters: t.inputSchema?.type === 'object' ? t.inputSchema : { type: 'object', properties: {} }, _conn: c, _tool: t.name });
    }
    return defs;
  }
  async function callConnectorTool(def, input) {
    const s = await mcpConnect(def._conn);
    const { result } = await mcpRpc(def._conn, 'tools/call', { name: def._tool, arguments: input || {} }, s.sessionId);
    const out = (result?.content || []).map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join('\n');
    if (result?.isError) throw new Error(out || 'Connector tool error');
    return out.length > 30000 ? out.slice(0, 30000) + '\n…[truncated]' : out || '(no output)';
  }

  /* ------------------------------------------------------------ tools */
  const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
  const CORE_TOOLS = [
    { name: 'report_progress', description: 'Tell the user what you are doing right now (shown live). Call it when you start and at milestones.', parameters: obj({ message: { type: 'string' }, percent: { type: 'integer' } }) },
    { name: 'remember', description: 'Save a durable fact for future tasks (preferences, decisions, results). Never store secrets.', parameters: obj({ fact: { type: 'string' }, scope: { type: 'string', enum: ['agent', 'shared'] } }) },
    { name: 'recall', description: 'Search saved memories by keywords.', parameters: obj({ query: { type: 'string' } }) },
    { name: 'save_skill', description: 'Learn a skill: save a reusable playbook for this kind of task. Use when asked to learn something, or after a task the user will likely repeat.', parameters: obj({ name: { type: 'string' }, description: { type: 'string' }, instructions: { type: 'string' } }) },
    { name: 'queue_post', description: 'Propose a social media post or message for the owner to approve. NOTHING is published: the owner reviews it in Approvals and posts it themselves. Always use this instead of posting.', parameters: obj({ platform: { type: 'string', description: 'TikTok, Instagram, Facebook, Etsy, Shopify, email…' }, text: { type: 'string', description: 'The full post text, hashtags included' }, note: { type: 'string', description: 'Image idea, best time to post or link; empty string if none' } }) },
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
    { name: 'plugin_store_profit', label: 'Store profit', icon: '💵', description: 'Profit calculator for store products: give a selling price and a base cost; returns profit in dollars, margin percent and markup percent.',
      parameters: obj({ price: { type: 'number', description: 'Selling price in dollars, e.g. 34.99' }, cost: { type: 'number', description: 'Base cost in dollars, e.g. 13' } }),
      run: async ({ price, cost }) => {
        const p = Number(price), c = Number(cost);
        if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0 || c < 0) return 'Give a selling price above 0 and a base cost of 0 or more.';
        const profit = p - c;
        return `Price $${p.toFixed(2)}, cost $${c.toFixed(2)}: profit $${profit.toFixed(2)} per sale, margin ${(profit / p * 100).toFixed(2)}%${c > 0 ? `, markup ${(profit / c * 100).toFixed(2)}%` : ''}.${profit < 0 ? ' This sells at a loss.' : ''}`;
      } },
    { name: 'plugin_drop_countdown', label: 'Drop countdown', icon: '⏳', description: 'How many days and hours are left until a date, such as a product drop or Black Friday. Counts from midnight Central time unless a time zone is given.',
      parameters: { type: 'object', properties: { date: { type: 'string', description: 'Target date, best as YYYY-MM-DD (optionally "YYYY-MM-DD HH:MM"), e.g. 2026-11-27' }, timezone: { type: 'string', description: 'IANA time zone, default America/Chicago' } }, required: ['date'] },
      run: async ({ date, timezone }) => {
        const tz = timezone || 'America/Chicago';
        const off = (at) => { const v = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value])); return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - at.getTime(); };
        try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return `Unknown time zone "${tz}".`; }
        let t; const m = String(date).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/);
        if (m) { const g = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)); t = new Date(g - off(new Date(g - off(new Date(g))))); }
        else t = new Date(date);
        if (Number.isNaN(t.getTime())) return `Couldn't read the date "${date}". Use YYYY-MM-DD.`;
        const label = t.toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
        const ms = t - Date.now();
        if (ms <= 0) { const ago = Math.floor(-ms / 36e5); return `That moment (${label}) has already passed, ${Math.floor(ago / 24)} days ${ago % 24} hours ago.`; }
        const h = Math.floor(ms / 36e5);
        return `${Math.floor(h / 24)} days and ${h % 24} hours left until ${label} (${tz}).`;
      } },
    { name: 'plugin_current_time', label: 'Current time', icon: '🕒', description: "Today's date and the current time in America/Chicago (Central time), or another time zone if asked.",
      parameters: { type: 'object', properties: { timezone: { type: 'string', description: 'IANA time zone, default America/Chicago' } } },
      run: async ({ timezone } = {}) => {
        const tz = timezone || 'America/Chicago', now = new Date();
        try { return `${now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${now.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })} (${tz}).`; }
        catch { return `Unknown time zone "${tz}".`; }
      } },
    { name: 'plugin_best_time_to_post', label: 'Best time to post', icon: '📅', description: 'Suggested posting windows for TikTok, Instagram or Facebook (Central time), with a tip. General guidance, not account-specific.',
      parameters: { type: 'object', properties: { platform: { type: 'string', enum: ['TikTok', 'Instagram', 'Facebook'] } }, required: ['platform'] },
      run: async ({ platform }) => {
        const G = { tiktok: ['TikTok', ['Tue–Thu 6–9 PM', 'Weekdays 7–9 AM', 'Sunday 7–9 PM'], 'Evenings and late nights do best; post 3–5 times a week and keep videos short.'], instagram: ['Instagram', ['Weekdays 11 AM–1 PM', 'Weekdays 7–9 PM', 'Tue–Thu is strongest'], 'Reels reach new people at midday; Stories and carousels do well in the evening.'], facebook: ['Facebook', ['Weekdays 9 AM–12 PM', 'Wed 11 AM–1 PM', 'Weekdays 1–3 PM'], 'Mornings on weekdays; weekends are usually quieter.'] };
        const k = String(platform || '').toLowerCase().replace(/[^a-z]/g, ''); const g = G[/^tik/.test(k) ? 'tiktok' : /^(ig|insta)/.test(k) ? 'instagram' : /^(fb|face)/.test(k) ? 'facebook' : k];
        if (!g) return 'Pick TikTok, Instagram or Facebook.';
        return `Best times to post on ${g[0]} (Central time):\n- ${g[1].join('\n- ')}\nTip: ${g[2]}\nThese are common industry patterns. Check your own analytics after a few weeks and adjust.`;
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

  async function runTool(name, input, { agent, task, extraMap }) {
    if (extraMap?.[name]) { event('info', agent.id, `Using ${extraMap[name]._conn.name}: ${extraMap[name]._tool}`); return callConnectorTool(extraMap[name], input); }
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
      case 'queue_post': {
        const text = String(input.text || '').trim().slice(0, 4000); if (!text) return 'A post needs text.';
        const it = { id: uid('ap'), agent: agent.id, platform: String(input.platform || 'Social').slice(0, 30), text, note: String(input.note || '').slice(0, 500), status: 'pending', createdAt: now() };
        state.approvals.unshift(it); state.approvals.length = Math.min(state.approvals.length, 200);
        event('info', agent.id, `Proposed a ${it.platform} post: waiting for your approval`); return 'Queued for the owner\'s approval. Nothing has been posted. Tell the owner it is waiting in Approvals.';
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
    // Work connectors: Anthropic connects to the MCP servers on its side, so every connector works here.
    const conns = connectors().filter((c) => c.enabled);
    const mcp = conns.length ? {
      mcp_servers: conns.map((c) => ({ type: 'url', url: c.url, name: connName(c), ...(c.token ? { authorization_token: c.token } : {}) })),
      betas: [...(fallback.betas || []), 'mcp-client-2025-11-20'],
    } : {};
    conns.forEach((c) => tools.push({ type: 'mcp_toolset', mcp_server_name: connName(c) }));
    if (conns.length) task.log.push({ ts: now(), msg: `Connectors ready: ${conns.map((c) => c.name).join(', ')}` });
    const messages = [{ role: 'user', content: preamble(agent, task.prompt, task.voice) }];
    let final = '';
    for (let turn = 0; turn < 25; turn++) {
      const r = await client.beta.messages.create({ model, max_tokens: 16000, system: [{ type: 'text', text: systemPrompt(agent, 'anthropic'), cache_control: { type: 'ephemeral' } }], output_config: { effort: 'medium' }, ...fallback, ...mcp, tools, messages });
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
    const extra = provider === 'device' ? [] : await connectorToolDefs(); // small on-device models get the core tools only
    if (extra.length) task.log.push({ ts: now(), msg: `Connector tools ready: ${extra.length}` });
    const extraMap = Object.fromEntries(extra.map((d) => [d.name, d]));
    const ctxExtra = { extraMap };
    const tools = [...toolDefs(), ...extra].map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
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
      const res = await runTools(parsed.filter((p) => p.input), { agent, task, ...ctxExtra });
      parsed.filter((p) => !p.input).forEach((p) => res.push({ id: p.id, content: 'Error: arguments were not valid JSON. Try again.' }));
      res.forEach((x) => messages.push({ role: 'tool', tool_call_id: x.id, content: compact ? x.content.slice(0, 2500) : x.content }));
    }
    return final + `\n\n(Stopped after ${maxTurns} tool rounds.)`;
  }

  const runOpenAI = (agent, task, provider, model, modelId) =>
    runToolLoop(agent, task, modelId, (messages, tools) => openaiChat(provider, model, messages, tools), { provider });

  // Chat-only brains answer directly, without tools.
  async function runChatOnly(agent, task, modelId, complete) {
    const sys = `You are ${agent.name}, ${agent.role}, an AI agent in the user's Agent Station app.
${agent.instructions || ''}

You are running on a chat-only brain: you can't use tools, browse, save files or save memories in this mode. Answer directly and helpfully from what you know, and say so if something may be out of date. The user may be a beginner: keep answers clear and well organized.`;
    const messages = [{ role: 'system', content: sys }, { role: 'user', content: preamble(agent, task.prompt, task.voice, true).replace(/\nSkills:[\s\S]*?\nMemories:/, '\nMemories:') }];
    live[agent.id] = { ...live[agent.id], task: 'Writing an answer…' };
    task.log.push({ ts: now(), msg: 'Chat-only brain: answering directly (no tools)' });
    const r = await complete(messages);
    addUsage(agent, task, r.usage, modelId);
    return stripThink(r.choices?.[0]?.message?.content) || '(No written answer.)';
  }

  async function runDevice(agent, task, model) {
    const w = await loadDevice(model);
    const noThink = /qwen3/i.test(model);
    if (deviceInfo(model)?.tools === false) {
      return runChatOnly(agent, task, `device:${model}`, async (messages) => {
        const t0 = now();
        const tick = setInterval(() => { live[agent.id] = { ...live[agent.id], task: `Thinking on your phone… ${Math.round((now() - t0) / 1000)}s` }; }, 1000);
        try { return await w.createChatCompletion({ messages, max_tokens: 1024, temperature: 0.6 }); }
        finally { clearInterval(tick); }
      });
    }
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
    const chatOnly = () => runChatOnly(agent, task, modelId, (messages) => openaiChat(provider, model, messages));
    if (modelCache.models.find((m) => m.id === modelId)?.tools === false) return chatOnly();
    try { return await runOpenAI(agent, task, provider, model, modelId); }
    catch (e) {
      if (e.code !== 'no-tools') throw e;
      // The provider says this model can't use tools: label it chat-only from now on.
      (state.settings.noTools ||= {})[modelId] = true; save();
      await discover(true);
      if (agent.model === modelId) { event('info', agent.id, `${model} is chat-only; answering without tools`); return chatOnly(); }
      const next = agentModel(agent);
      if (!next || next === modelId) return chatOnly();
      event('info', agent.id, `${model} is chat-only; switched to ${parseModel(next).model} so tools keep working`);
      return runAgent(agent, task);
    }
  }

  /* ------------------------------------------------------ Muse Bridge */
  const BRIDGE_LS = 'as.bridge';
  const bridgeCfg = () => { try { return JSON.parse(localStorage.getItem(BRIDGE_LS)) || {}; } catch { return {}; } };
  const setBridgeCfg = (c) => { try { localStorage.setItem(BRIDGE_LS, JSON.stringify(c)); } catch { /* private mode */ } };
  const defaultBridgeUrl = () => (typeof location !== 'undefined' && /^https?:/.test(location.origin) ? `${location.origin}/bridge` : '');
  const bridge = { connected: false, lastSync: 0, error: '', reportsSeen: {}, waiters: {} };
  const MUSE_LOOK = { ...(window.AgentStationCharacters?.LOOKS.muse || {}) };
  function ensureMuse(on) {
    const has = state.agents.find((a) => a.id === 'muse');
    if (has && has.look?.shape === 'tall' && has.look?.eyes === 'dot') { has.look = { ...MUSE_LOOK }; save(); } // older Muse look → robot
    if (on && !has) { state.agents.push({ id: 'muse', name: 'Muse', role: 'Your Muse agent', station: 'ops', external: true, look: MUSE_LOOK, instructions: 'External agent: tasks are sent to Muse through the Muse Bridge.' }); event('success', 'muse', 'Muse joined your station 🤝'); save(); }
  }
  async function bridgeSync() {
    const cfg = bridgeCfg(); if (!cfg.enabled || !cfg.token) return;
    const url = (cfg.url || defaultBridgeUrl()).replace(/\/$/, ''); if (!url) return;
    ensureMuse(true);
    state.bridge ||= { taken: {}, sentInbox: {} };
    const B = state.bridge;
    // tasks the user gave to Muse that haven't been sent yet
    const inboxNew = state.tasks.filter((t) => t.agent === 'muse' && t.status === 'running' && !B.sentInbox[t.id]).map((t) => ({ id: t.id, prompt: t.prompt, voice: !!t.voice }));
    // results for commands Muse sent us
    const commandUpdates = [];
    for (const [cmdId, info] of Object.entries(B.taken)) {
      if (info.reported) continue;
      if (info.kind === 'failed') { commandUpdates.push({ id: cmdId, status: 'error', result: `Agent Station couldn't start this: ${info.error}` }); info.reported = true; continue; }
      if (info.kind === 'task') { const t = state.tasks.find((x) => x.id === info.ref); if (t && (t.status === 'done' || t.status === 'error')) { commandUpdates.push({ id: cmdId, status: t.status, taskId: t.id, result: t.result, files: t.files }); info.reported = true; } }
      else { const r = state.runs.find((x) => x.id === info.ref); if (r && r.status !== 'running') { commandUpdates.push({ id: cmdId, status: r.status === 'done' ? 'done' : 'error', taskId: r.id, result: r.output || 'The workflow stopped early.' }); info.reported = true; } }
    }
    const snapshot = {
      agents: state.agents.map((a) => ({ id: a.id, name: a.name, role: a.role, station: a.station, status: (live[a.id] || {}).status || 'idle', doing: (live[a.id] || {}).task || '' })),
      workflows: state.workflows.map((w) => ({ id: w.id, name: w.name, description: w.description, steps: w.steps.map((st) => `${st.name} (${agentById(st.agent)?.name || st.agent})`) })),
      recent: state.tasks.filter((t) => t.status === 'done').slice(0, 6).map((t) => ({ agent: agentById(t.agent)?.name || t.agent, task: (t.title || t.prompt).slice(0, 120), result: String(t.result || '').slice(0, 800), files: t.files })),
    };
    let res;
    try {
      const r = await fetch(`${url}/sync`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot, inboxNew, commandUpdates }) });
      res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.error || `HTTP ${r.status}`);
      Object.assign(bridge, { connected: true, lastSync: now(), error: '' });
    } catch (e) {
      commandUpdates.forEach((u) => { if (B.taken[u.id]) B.taken[u.id].reported = false; });
      Object.assign(bridge, { connected: false, error: e instanceof TypeError ? "Can't reach the bridge. Check the address and your connection." : e.message });
      return;
    }
    inboxNew.forEach((t) => { B.sentInbox[t.id] = true; });
    // new work from Muse
    for (const c of res.commands || []) {
      if (B.taken[c.id]) continue;
      try {
        if (c.type === 'task') { const t = createTask(c.agent, c.prompt, { title: `🤝 From Muse: ${c.prompt.slice(0, 60)}`, fromMuse: c.id }); B.taken[c.id] = { kind: 'task', ref: t.id }; event('info', 'muse', `Muse gave ${agentById(c.agent)?.name || c.agent} a task`); }
        else { const w = state.workflows.find((x) => x.id === c.workflow); const run = runWorkflow(w, c.input); B.taken[c.id] = { kind: 'workflow', ref: run.id }; event('info', 'muse', `Muse started “${w.name}”`); }
      } catch (e) { B.taken[c.id] = { kind: 'failed', error: e.message }; event('error', 'muse', `Couldn't start Muse's request: ${e.message}`); }
    }
    // answers from Muse to tasks the user assigned it
    for (const item of res.inbox || []) {
      if (item.status !== 'done' && item.status !== 'error') continue;
      const t = state.tasks.find((x) => x.id === item.id);
      if (!t || t.status === 'done' || t.status === 'error') continue;
      const w = bridge.waiters[t.id];
      if (w) { delete bridge.waiters[t.id]; w(item); }
      else { Object.assign(t, { status: item.status, result: item.result, finishedAt: now() }); live.muse = { status: 'idle' }; event(item.status === 'done' ? 'success' : 'error', 'muse', `Muse finished: ${t.prompt.slice(0, 60)}`); }
    }
    // Muse's activity on its desk
    const reps = res.reports || [];
    const waiting = state.tasks.some((t) => t.agent === 'muse' && t.status === 'running');
    const latest = reps[0];
    if (latest && latest.status === 'working' && now() - latest.at < 15 * 60e3) live.muse = { status: 'running', task: `${latest.title}${latest.detail ? ': ' + latest.detail : ''}`, progress: 50 };
    else if (waiting) live.muse = { status: 'running', task: 'Waiting for Muse to pick up your task…', progress: 10 };
    else if (live.muse?.status === 'running') live.muse = { status: 'idle' };
    for (const r of reps.slice().reverse()) {
      const key = `${r.id}:${r.status}`;
      if (bridge.reportsSeen[key]) continue;
      bridge.reportsSeen[key] = true;
      if (Object.keys(bridge.reportsSeen).length > 1 || bridge.primed) event(r.status === 'error' ? 'error' : r.status === 'done' ? 'success' : 'info', 'muse', `Muse ${r.status === 'done' ? 'finished' : r.status === 'error' ? 'hit a problem with' : 'is working on'}: ${r.title}${r.detail ? ' (' + r.detail.slice(0, 80) + ')' : ''}`);
    }
    bridge.primed = true;
    bridge.reports = reps;
    save();
  }
  setInterval(() => { if (typeof document === 'undefined' || !document.hidden) bridgeSync().catch(() => {}); }, 5000);

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
    if (agent.external) {
      // Muse works on its own; the bridge delivers the task and brings the answer back.
      task.status = 'running'; task.startedAt = now();
      task.log.push({ ts: now(), msg: bridgeCfg().enabled ? 'Sent to Muse through the Muse Bridge' : 'Muse Bridge is off: turn it on in Brain → Connect' });
      live[agent.id] = { status: 'running', task: 'Waiting for Muse to pick up your task…', progress: 10 };
      save(); bridgeSync().catch(() => {});
      const item = await new Promise((res) => { bridge.waiters[task.id] = res; });
      Object.assign(task, { status: item.status === 'error' ? 'error' : 'done', result: item.result, finishedAt: now() });
      live[agent.id] = { status: 'idle' };
      event(task.status === 'done' ? 'success' : 'error', agent.id, `Muse finished: ${task.prompt.slice(0, 60)}`); save();
      return task;
    }
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
    { id: 'device', label: 'On this phone (free, offline)', free: true, setup: 'Download a free model once in Set up brains: Qwen, Llama, Gemma, SmolLM, DeepSeek or TinyLlama (0.5–2 GB, use Wi-Fi). Runs on any recent phone.' },
    { id: 'openrouter', label: 'OpenRouter: free online open models', free: true, setup: 'Free key at openrouter.ai → paste it in Set up brains. ":free" models cost nothing (rate-limited).' },
    { id: 'groq', label: 'Groq: fast free tier', free: true, setup: 'Free key at console.groq.com → paste it in Set up brains.' },
    { id: 'anthropic', label: 'Claude (Anthropic)', free: false, setup: 'Key from console.anthropic.com → paste it in Set up brains. Paid per use; includes real web search.' },
    { id: 'openai', label: 'OpenAI (GPT)', free: false, setup: 'Key from platform.openai.com → API keys. Paid per use.' },
    { id: 'gemini', label: 'Google Gemini', free: false, setup: 'Key from aistudio.google.com → Get API key. Has a free tier; paid per use beyond it.' },
    { id: 'xai', label: 'xAI Grok', free: false, setup: 'Key from console.x.ai. Paid per use.' },
    { id: 'mistral', label: 'Mistral', free: false, setup: 'Key from console.mistral.ai. Paid per use.' },
    { id: 'deepseek', label: 'DeepSeek', free: false, setup: 'Key from platform.deepseek.com. Paid per use; low prices.' },
    { id: 'perplexity', label: 'Perplexity (live web search)', free: false, setup: 'Key from perplexity.ai → Settings → API. Answers with live web search (chat only).' },
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
      connectors: connectors().map((c) => { const s = mcpSessions[c.id]; return { id: c.id, name: c.name, kind: c.kind, host: (() => { try { return new URL(c.url).host; } catch { return c.url; } })(), enabled: !!c.enabled, hasToken: !!c.token, browser: s ? (s.ok ? 'ok' : 'blocked') : 'unknown', tools: s?.tools?.map((t) => t.name) || [], error: s?.error || '' }; }),
      bridge: { enabled: !!bridgeCfg().enabled, hasToken: !!bridgeCfg().token, url: bridgeCfg().url || defaultBridgeUrl(), connected: bridge.connected, lastSync: bridge.lastSync, error: bridge.error, mcpUrl: `${(bridgeCfg().url || defaultBridgeUrl()).replace(/\/$/, '')}/mcp`, reports: (bridge.reports || []).slice(0, 5) },
      plugins: PLUGINS.map((p) => ({ name: p.name, label: p.label, icon: p.icon, description: p.description, enabled: pluginOn(p) })),
      voice: { stt: false }, clone: { available: false }, studio: { available: false, voices: [] }, voices: [],
      stations: state.stations, approvals: state.approvals.slice(0, 100),
      agents: state.agents.map((a) => {
        const l = live[a.id] || {}, u = state.usage[a.id] || { tokens: 0, cost: 0 };
        const queued = state.tasks.filter((t) => t.agent === a.id && t.status === 'queued').length;
        return { ...a, model: agentModel(a), modelChosen: a.model || '', voiceId: '', avatar: a.avatar || '',
          status: l.status === 'running' ? 'running' : l.status === 'error' ? 'error' : queued ? 'waiting' : 'idle',
          task: l.status === 'running' || l.status === 'error' ? l.task : queued ? `${queued} task(s) queued` : 'Ready for a task',
          progress: l.progress || 0, tokens: u.tokens, cost: +u.cost.toFixed(4) };
      }),
      workflows: state.workflows.map((wf) => { const r = run(wf); return { ...wf, status: r ? r.status : 'idle', startedAt: r?.startedAt, output: r?.output, steps: wf.steps.map((s, i) => ({ ...s, status: r?.steps[i]?.status || 'pending', duration: r?.steps[i]?.duration || 0, task: r?.steps[i]?.task })) }; }),
      tasks: state.tasks.slice(0, 150), skills: state.skills, memories: state.memories, events: state.events.slice(0, 80), files,
    };
  }

  /* ----------------------------------------------------------- routes */
  const NEEDS_COMPUTER = 'Connectors run programs on a computer, so they need the station server. Phones can run plugins, but not MCP connectors.';
  const routes = [
    ['GET', /^status$/, async () => { await discover(); return status(); }],
    ['POST', /^tasks$/, (_, b) => createTask(b.agent, b.prompt, { ...(b.voice ? { voice: true } : {}), ...(b.title ? { title: String(b.title).slice(0, 120) } : {}) })],
    ['POST', /^tasks\/archive$/, (_, b) => {
      // move finished tasks to history (all finished ones, or the ids given)
      const ids = Array.isArray(b.ids) ? new Set(b.ids) : null; let n = 0;
      for (const t of state.tasks) if ((t.status === 'done' || t.status === 'error') && !t.archived && (!ids || ids.has(t.id))) { t.archived = true; n++; }
      save(); return { ok: true, count: n };
    }],
    ['POST', /^tasks\/([^/]+)\/(archive|restore)$/, ([id, op]) => {
      const t = state.tasks.find((x) => x.id === id); if (!t) throw httpError('No such task');
      if (op === 'archive') { if (t.status === 'running' || t.status === 'queued') throw httpError('This task is still working'); t.archived = true; t.restored = false; }
      else { t.archived = false; t.restored = true; } // restored = stays in Tasks even when old
      save(); return { ok: true };
    }],
    ['POST', /^improve-prompt$/, async (_, b) => ({ prompt: await improvePrompt(String(b.prompt || '').slice(0, 4000), b.agent) })],
    ['POST', /^approvals\/(.+)$/, ([id], b) => {
      const it = state.approvals.find((x) => x.id === id); if (!it) throw httpError('No such item');
      if (typeof b.text === 'string' && b.text.trim()) it.text = b.text.slice(0, 4000);
      if (b.decision === 'approve' || b.decision === 'reject') { it.status = b.decision === 'approve' ? 'approved' : 'rejected'; it.decidedAt = now(); event(b.decision === 'approve' ? 'success' : 'info', it.agent, `You ${it.status} a ${it.platform} post`); }
      if (b.decision === 'posted') { it.status = 'posted'; it.decidedAt = now(); }
      save(); return it;
    }],
    ['DELETE', /^approvals\/(.+)$/, ([id]) => { state.approvals = state.approvals.filter((x) => x.id !== id); save(); return { ok: true }; }],
    ['POST', /^stations$/, (_, b) => { const name = String(b.name || '').trim().slice(0, 30); if (!name) throw httpError('A room needs a name'); let id = slug(name) || 'room'; if (state.stations.some((x) => x.id === id)) id += '-' + Math.random().toString(36).slice(2, 5); const st = { id, name, region: 'custom', custom: true }; state.stations.push(st); save(); return st; }],
    ['DELETE', /^stations\/(.+)$/, ([id]) => { const st = state.stations.find((x) => x.id === id); if (!st || !st.custom) throw httpError('Only rooms you built can be removed'); if (state.agents.some((a) => a.station === id)) throw httpError('Move the agents out of this room first'); state.stations = state.stations.filter((x) => x.id !== id); save(); return { ok: true }; }],
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
      const extra = custom(b);
      const a = { ...extra, id, name: String(b.name).slice(0, 40), role: String(b.role || 'Assistant').slice(0, 60), station: state.stations.some((s) => s.id === b.station) ? b.station : state.stations[0].id, instructions: String(b.instructions || '').slice(0, 4000), model: String(b.model || ''), avatar: /^[a-z0-9-]{1,30}$/.test(b.avatar || '') ? b.avatar : '' };
      state.agents.push(a); event('success', a.id, `${a.name} joined ${a.station}`); save(); return a;
    }],
    ['PATCH', /^agents\/(.+)$/, ([id], b) => {
      const a = agentById(id); if (!a) throw httpError('No such agent');
      if ('model' in b) { a.model = String(b.model || ''); event('info', a.id, `${a.name} now uses ${agentModel(a) || 'no model yet'}`); }
      if ('avatar' in b && /^[a-z0-9-]{0,30}$/.test(b.avatar || '')) a.avatar = b.avatar || '';
      Object.assign(a, custom(b));
      for (const k of ['name', 'role', 'instructions']) if (typeof b[k] === 'string' && b[k].trim()) a[k] = b[k].slice(0, k === 'instructions' ? 4000 : k === 'name' ? 40 : 60);
      if (typeof b.station === 'string' && state.stations.some((s) => s.id === b.station)) a.station = b.station;
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
      for (const f of ['anthropic', 'openrouter', 'groq', 'customKey', ...Object.keys(PAID), ...Object.keys(PAID).map((p) => `${p}Model`)]) if (typeof b[f] === 'string') { if (b[f].trim()) k[f] = b[f].trim(); else if (b[f] === '' && b.clear) delete k[f]; }
      if (b.clear) for (const f of Object.keys(k)) if (!b[f]) delete k[f];
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
      for (const pid of Object.keys(PAID)) {
        if (!b[pid]?.trim() || PAID[pid].fixed) continue;
        const r = await fetch(`${PAID[pid].base}/models`, { headers: { Authorization: `Bearer ${b[pid].trim()}` } }).catch(() => null); // null = blocked by the browser; can't check, accept it
        if (r && (r.status === 401 || r.status === 403)) throw httpError(`That ${PAID[pid].label} key was rejected. Copy it again from your ${PAID[pid].label} account.`);
      }
      setKeys(k); const m = await discover(true); return { count: m.models.length };
    }],
    ['POST', /^brain\/device$/, (_, b) => { loadDevice(String(b.model || '')).catch(() => {}); return { ok: true }; }],
    ['POST', /^brain\/forget-device$/, (_, b) => { delete state.settings.downloaded[b.model]; save(); return discover(true).then(() => ({ ok: true })); }],
    ['POST', /^phone-connectors$/, async (_, b) => {
      let u; try { u = new URL(String(b.url || '').trim()); } catch { throw httpError('Paste the full connector address (it starts with https://)'); }
      if (u.protocol !== 'https:') throw httpError('Connector addresses must start with https://');
      const c = { id: slug(b.name || u.hostname).slice(0, 24) || uid('c'), name: String(b.name || u.hostname).slice(0, 40), kind: String(b.kind || 'url').slice(0, 20), url: u.href, token: String(b.token || '').trim(), enabled: true };
      const list = connectors().filter((x) => x.id !== c.id); list.push(c); setConnectors(list);
      const s = await mcpConnect(c, true);
      event(s.ok ? 'success' : 'info', null, s.ok ? `Connector “${c.name}” ready with ${s.tools.length} tools` : `Connector “${c.name}” saved. ${s.error}`);
      return { ok: s.ok, tools: s.tools.length, error: s.error || '' };
    }],
    ['POST', /^phone-connectors\/([\w-]+)\/toggle$/, ([id], b) => { const list = connectors(); const c = list.find((x) => x.id === id); if (!c) throw httpError('No such connector'); c.enabled = !!b.enabled; setConnectors(list); return { ok: true }; }],
    ['POST', /^phone-connectors\/([\w-]+)\/test$/, async ([id]) => { const c = connectors().find((x) => x.id === id); if (!c) throw httpError('No such connector'); const s = await mcpConnect(c, true); return { ok: s.ok, tools: s.tools.length, error: s.error || '' }; }],
    ['DELETE', /^phone-connectors\/([\w-]+)$/, ([id]) => { setConnectors(connectors().filter((x) => x.id !== id)); delete mcpSessions[id]; return { ok: true }; }],
    ['POST', /^bridge$/, async (_, b) => {
      const cfg = { ...bridgeCfg() };
      if (typeof b.token === 'string' && b.token.trim()) cfg.token = b.token.trim();
      if (typeof b.url === 'string') cfg.url = b.url.trim().replace(/\/+$/, '').replace(/\/(mcp|sync)$/, '');
      if ('enabled' in b) cfg.enabled = !!b.enabled;
      setBridgeCfg(cfg);
      if (cfg.enabled) { ensureMuse(true); await bridgeSync(); if (!bridge.connected) return { ok: false, error: bridge.error }; }
      return { ok: true };
    }],
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
