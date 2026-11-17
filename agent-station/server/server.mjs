// Agent Station server — runs your agents on Claude and serves the mobile app.
//
//   ANTHROPIC_API_KEY=sk-ant-...  node server.mjs
//
// Agents can search the web, read pages, write files, remember facts across
// tasks, and save reusable "skills" (playbooks) they load on later tasks.
// Workflows chain agents: each step's result is handed to the next step.
// Everything is stored in ./data so it survives restarts.

import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, 'data'));
const FILES_DIR = path.join(DATA_DIR, 'files');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const MODEL = process.env.AGENT_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.AGENT_EFFORT || 'medium';
const TOKEN = process.env.STATION_TOKEN || '';          // optional: require "Authorization: Bearer <token>"
const PRICE_IN = +process.env.PRICE_IN_PER_M || 4;      // USD per 1M input tokens (claude-opus-5-5)
const PRICE_OUT = +process.env.PRICE_OUT_PER_M || 20;   // USD per 1M output tokens
const MAX_TURNS = +process.env.MAX_TURNS || 30;         // safety cap on tool-use rounds per task

const client = new Anthropic(); // reads ANTHROPIC_API_KEY (or an `ant auth login` profile)

/* ------------------------------------------------------------------ state */

const uid = (p) => `${p}_${crypto.randomBytes(5).toString('hex')}`;
const now = () => Date.now();

const DEFAULT_STATE = () => ({
  stations: [
    { id: 'research', name: 'Research Bay', region: 'web' },
    { id: 'studio', name: 'Studio', region: 'writing' },
    { id: 'ops', name: 'Ops Deck', region: 'planning' },
  ],
  agents: [
    {
      id: 'scout', name: 'Scout', role: 'Web researcher', station: 'research',
      instructions: 'You find accurate, current information on the web. Prefer primary and reputable sources, cite links, and flag anything uncertain.',
    },
    {
      id: 'quill', name: 'Quill', role: 'Writer & editor', station: 'studio',
      instructions: 'You turn notes and research into clear, friendly writing: emails, posts, summaries and reports. Match the tone the user asks for and keep it concise.',
    },
    {
      id: 'atlas', name: 'Atlas', role: 'Planner', station: 'ops',
      instructions: 'You break goals into concrete plans, checklists and schedules. Be practical, estimate time, and order steps so the user can start today.',
    },
  ],
  workflows: [
    {
      id: 'wf_brief', name: 'Research → Brief', trigger: 'manual',
      description: 'Scout researches a topic, then Quill writes a one-page brief.',
      input: 'the best budget laptops for students this year',
      steps: [
        { name: 'Research the topic', agent: 'scout', instructions: 'Research the topic below on the web. Collect 5–8 key facts with source links.' },
        { name: 'Write the brief', agent: 'quill', instructions: 'Write a one-page brief from the research: a 3-sentence summary, key points as bullets, and sources. Save it as a markdown file.' },
      ],
    },
    {
      id: 'wf_plan', name: 'Goal → Action plan', trigger: 'manual',
      description: 'Atlas turns a goal into a plan, then Quill makes a friendly checklist.',
      input: 'start a small weekend baking business',
      steps: [
        { name: 'Make a plan', agent: 'atlas', instructions: 'Turn the goal below into a step-by-step plan with milestones and rough time estimates.' },
        { name: 'Write the checklist', agent: 'quill', instructions: 'Rewrite the plan as a short, encouraging checklist a beginner can follow. Save it as a markdown file.' },
      ],
    },
  ],
  tasks: [],
  runs: [],
  skills: [],
  memories: [],
  events: [],
  usage: {},
});

let state = DEFAULT_STATE();
const live = {}; // per-agent runtime: { status, task, progress, taskId }

async function loadState() {
  await fs.mkdir(FILES_DIR, { recursive: true });
  try {
    const saved = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
    state = { ...DEFAULT_STATE(), ...saved };
    // Tasks that were mid-run when the server stopped can't resume.
    for (const t of state.tasks) if (t.status === 'running' || t.status === 'queued') { t.status = 'error'; t.result = 'Server restarted before this task finished.'; }
    for (const r of state.runs) if (r.status === 'running') r.status = 'error';
  } catch { /* first run */ }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const tmp = STATE_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(state, null, 1));
    await fs.rename(tmp, STATE_FILE);
  }, 300);
}

function event(level, agent, msg) {
  state.events.unshift({ id: uid('ev'), ts: now(), level, agent, msg: String(msg).slice(0, 500) });
  state.events.length = Math.min(state.events.length, 300);
  save();
}

const agentById = (id) => state.agents.find((a) => a.id === id);
const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/* ------------------------------------------------------------------ tools */

// Tools the agents can call. web_search / web_fetch run on Anthropic's servers;
// the rest run here, against this server's ./data folder.
const strictTool = (name, description, properties, required = Object.keys(properties)) => ({
  name, description, strict: true,
  input_schema: { type: 'object', properties, required, additionalProperties: false },
});

const TOOLS = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
  strictTool('report_progress', 'Tell the user what you are doing right now. Call it when you start, at each milestone, and before finishing. Shown live in the mobile app.', {
    message: { type: 'string', description: 'Short status, e.g. "Comparing 4 laptop reviews"' },
    percent: { type: 'integer', description: 'Rough completion 0-100' },
  }),
  strictTool('remember', 'Save a durable fact for future tasks: user preferences, decisions, names, outcomes, things that worked. Never store passwords, keys or other secrets.', {
    fact: { type: 'string' },
    scope: { type: 'string', enum: ['agent', 'shared'], description: '"agent" = only you, "shared" = every agent on the station' },
  }),
  strictTool('recall', 'Search saved memories by keywords. Use it at the start of a task to pick up what you already know about the user or topic.', {
    query: { type: 'string' },
  }),
  strictTool('save_skill', 'Learn a skill: save a reusable playbook so you (or any agent) can repeat this kind of task well next time. Use when the user asks you to learn something, or after finishing a task they will likely repeat. Saving an existing name updates it.', {
    name: { type: 'string', description: 'Short, e.g. "weekly-newsletter"' },
    description: { type: 'string', description: 'One line: when to use this skill' },
    instructions: { type: 'string', description: 'Numbered steps, tips, output format, and quality checks' },
  }),
  strictTool('use_skill', 'Load the full instructions of a saved skill before doing a task it covers.', {
    name: { type: 'string' },
  }),
  strictTool('write_file', 'Save a deliverable (report, email draft, plan, CSV...) to the station\'s files. The user can open and download it from the app. Overwrites a file with the same name.', {
    filename: { type: 'string', description: 'e.g. "laptop-brief.md"' },
    content: { type: 'string' },
  }),
  strictTool('read_file', 'Read a file from the station\'s files.', { filename: { type: 'string' } }),
  strictTool('list_files', 'List the station\'s saved files.', {}),
];

function safeFile(name) {
  const base = path.basename(String(name || '')).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  if (!base || base.startsWith('.')) throw new Error('Invalid filename');
  const full = path.resolve(FILES_DIR, base);
  if (path.dirname(full) !== FILES_DIR) throw new Error('Invalid filename');
  return { base, full };
}

async function listFiles() {
  const names = await fs.readdir(FILES_DIR).catch(() => []);
  const out = [];
  for (const n of names) {
    const st = await fs.stat(path.join(FILES_DIR, n)).catch(() => null);
    if (st?.isFile()) out.push({ name: n, size: st.size, updatedAt: st.mtimeMs });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

function searchMemories(agentId, query, limit = 12) {
  const words = String(query || '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  return state.memories
    .filter((m) => m.scope === 'shared' || m.agent === agentId)
    .map((m) => ({ m, score: words.reduce((s, w) => s + (m.fact.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .filter((x) => !words.length || x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.ts - a.m.ts)
    .slice(0, limit)
    .map((x) => x.m);
}

async function runTool(name, input, ctx) {
  const { agent, task } = ctx;
  switch (name) {
    case 'report_progress': {
      const pct = Math.max(0, Math.min(100, +input.percent || 0));
      live[agent.id] = { ...live[agent.id], task: input.message, progress: pct };
      task.log.push({ ts: now(), msg: input.message });
      event('info', agent.id, input.message);
      return 'ok';
    }
    case 'remember': {
      const fact = String(input.fact || '').trim().slice(0, 1000);
      if (!fact) return 'Nothing to remember.';
      if (state.memories.some((m) => m.fact.toLowerCase() === fact.toLowerCase())) return 'Already remembered.';
      state.memories.unshift({ id: uid('mem'), ts: now(), agent: agent.id, scope: input.scope === 'shared' ? 'shared' : 'agent', fact, source: task.id });
      event('success', agent.id, `Remembered: ${fact}`);
      return 'Saved to memory.';
    }
    case 'recall': {
      const hits = searchMemories(agent.id, input.query);
      return hits.length ? hits.map((m) => `- ${m.fact}`).join('\n') : 'No matching memories.';
    }
    case 'save_skill': {
      const id = slug(input.name);
      if (!id) return 'Skill needs a name.';
      const existing = state.skills.find((s) => s.id === id);
      const skill = { id, name: input.name, description: input.description, instructions: input.instructions, author: agent.id, updatedAt: now(), uses: existing?.uses || 0 };
      if (existing) Object.assign(existing, skill); else state.skills.unshift(skill);
      event('success', agent.id, `${existing ? 'Updated' : 'Learned'} skill “${input.name}”`);
      return `Skill "${id}" saved.`;
    }
    case 'use_skill': {
      const s = state.skills.find((k) => k.id === slug(input.name));
      if (!s) return `No skill named "${input.name}". Available: ${state.skills.map((k) => k.id).join(', ') || 'none'}`;
      s.uses = (s.uses || 0) + 1;
      event('info', agent.id, `Using skill “${s.name}”`);
      return `# Skill: ${s.name}\n${s.description}\n\n${s.instructions}`;
    }
    case 'write_file': {
      const { base, full } = safeFile(input.filename);
      await fs.writeFile(full, String(input.content ?? ''));
      task.files = [...new Set([...(task.files || []), base])];
      event('success', agent.id, `Saved file ${base}`);
      return `Saved ${base}.`;
    }
    case 'read_file': {
      const { full } = safeFile(input.filename);
      const text = await fs.readFile(full, 'utf8');
      return text.length > 60000 ? text.slice(0, 60000) + '\n…[truncated]' : text;
    }
    case 'list_files': {
      const files = await listFiles();
      return files.length ? files.map((f) => `${f.name} (${f.size} bytes)`).join('\n') : 'No files yet.';
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

/* ------------------------------------------------------------- agent loop */

function systemPrompt(agent) {
  // Kept stable per agent so it can be prompt-cached; changing context goes in the user turn.
  return `You are ${agent.name}, ${agent.role}, an AI agent at the user's Agent Station.
${agent.instructions || ''}

How you work:
- Do real work with your tools. Use web_search and web_fetch for anything current or factual, and cite links.
- Call report_progress when you start, at each milestone, and just before you finish. Keep messages short; the user watches them live on their phone.
- Memory: the task message lists memories you already have. Use recall for anything more. Save durable facts (preferences, decisions, results) with remember. Never save secrets.
- Skills: if a listed skill fits the task, call use_skill first and follow it. When the user asks you to learn something, or you finish a task they are likely to repeat, save_skill with clear numbered steps.
- Put substantial deliverables (reports, drafts, plans, tables) in a file with write_file, and mention the filename.
- The user may be a beginner. End with a short, plain-language answer: what you did, the result, and any files you saved.
- If the task is unclear, make a sensible assumption, state it, and proceed.`;
}

function contextPreamble(agent, text) {
  const skills = state.skills.map((s) => `- ${s.id}: ${s.description}`).join('\n') || '(none yet)';
  const mems = searchMemories(agent.id, text, 8);
  const recent = state.memories.filter((m) => m.scope === 'shared' || m.agent === agent.id).slice(0, 8);
  const merged = [...new Map([...mems, ...recent].map((m) => [m.id, m])).values()].slice(0, 12);
  return `Today is ${new Date().toDateString()}.

Skills you can load with use_skill:
${skills}

Memories you already have:
${merged.map((m) => `- ${m.fact}`).join('\n') || '(none yet)'}

---
${text}`;
}

function addUsage(agent, task, usage) {
  if (!usage) return;
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const output = usage.output_tokens || 0;
  const cost = ((usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1) / 1e6 * PRICE_IN + output / 1e6 * PRICE_OUT;
  const u = (state.usage[agent.id] ||= { tokens: 0, cost: 0 });
  u.tokens += input + output; u.cost += cost;
  task.tokens = (task.tokens || 0) + input + output; task.cost = (task.cost || 0) + cost;
}

async function runAgent(agent, task) {
  const messages = [{ role: 'user', content: contextPreamble(agent, task.prompt) }];
  let finalText = '';
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: 'text', text: systemPrompt(agent), cache_control: { type: 'ephemeral' } }],
      output_config: { effort: EFFORT },
      // If a safety classifier declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: TOOLS,
      messages,
    });
    addUsage(agent, task, response.usage);
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (text) finalText = text;

    if (response.stop_reason === 'refusal') throw new Error('The model declined this request.');
    if (response.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: response.content }); continue; }

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      if (response.stop_reason === 'max_tokens' && !finalText) throw new Error('Ran out of output space before finishing.');
      return finalText || '(The agent finished without a written answer.)';
    }

    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const tu of toolUses) {
      try {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: String(await runTool(tu.name, tu.input || {}, { agent, task })) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: `Error: ${e.message}`, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
    save();
  }
  return (finalText ? finalText + '\n\n' : '') + `(Stopped after ${MAX_TURNS} tool rounds.)`;
}

/* --------------------------------------------------------- tasks & queues */

const queues = {}; // agentId -> Promise chain, so each agent works one task at a time

function createTask(agentId, prompt, extra = {}) {
  const agent = agentById(agentId);
  if (!agent) throw httpError(400, 'Unknown agent');
  const text = String(prompt || '').trim();
  if (!text) throw httpError(400, 'Prompt is empty');
  const task = { id: uid('task'), agent: agent.id, prompt: text.slice(0, 20000), status: 'queued', createdAt: now(), log: [], files: [], ...extra };
  state.tasks.unshift(task);
  state.tasks.length = Math.min(state.tasks.length, 200);
  event('info', agent.id, `New task: ${task.title || text.slice(0, 80)}`);
  task.done = (queues[agent.id] || Promise.resolve()).then(() => execute(agent, task));
  queues[agent.id] = task.done.catch(() => {});
  Object.defineProperty(task, 'done', { enumerable: false }); // keep the promise out of JSON
  save();
  return task;
}

async function execute(agent, task) {
  task.status = 'running'; task.startedAt = now();
  live[agent.id] = { status: 'running', task: 'Starting…', progress: 2, taskId: task.id };
  save();
  try {
    task.result = await runAgent(agent, task);
    task.status = 'done';
    event('success', agent.id, `Finished: ${task.title || task.prompt.slice(0, 60)}`);
  } catch (e) {
    task.status = 'error';
    const noKey = !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !(e instanceof Anthropic.APIError);
    task.result = e instanceof Anthropic.AuthenticationError || noKey ? 'Your Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY and restart the server (see Guide → Connect real agents).'
      : e instanceof Anthropic.RateLimitError ? 'Rate limited by the API. Try again in a minute.'
      : e.message;
    event('error', agent.id, `Task failed: ${task.result}`);
  } finally {
    task.finishedAt = now();
    live[agent.id] = { status: task.status === 'error' ? 'error' : 'idle', task: task.status === 'error' ? task.result : '', progress: 0, lastFinished: now() };
    save();
  }
  return task;
}

async function runWorkflow(wf, input) {
  const run = { id: uid('run'), workflow: wf.id, input: String(input ?? wf.input ?? ''), status: 'running', startedAt: now(), steps: wf.steps.map((s) => ({ name: s.name, agent: s.agent, status: 'pending', duration: 0 })) };
  state.runs.unshift(run);
  state.runs.length = Math.min(state.runs.length, 100);
  event('info', wf.steps[0]?.agent, `Workflow “${wf.name}” started`);
  save();
  (async () => {
    let handoff = '';
    for (let i = 0; i < wf.steps.length; i++) {
      const step = wf.steps[i], rs = run.steps[i];
      rs.status = 'running'; const t0 = now(); save();
      const prompt = `Workflow "${wf.name}" — step ${i + 1} of ${wf.steps.length}: ${step.name}

Your instructions for this step:
${step.instructions}

Workflow input from the user:
${run.input || '(none)'}
${handoff ? `\nResults from earlier steps:\n${handoff}` : ''}`;
      const task = createTask(step.agent, prompt, { title: `${wf.name} · ${step.name}`, run: run.id });
      rs.task = task.id;
      await task.done;
      rs.duration = (now() - t0) / 1000;
      rs.status = task.status === 'done' ? 'done' : 'error';
      if (task.status !== 'done') { run.status = 'error'; event('error', step.agent, `Workflow “${wf.name}” stopped at “${step.name}”`); save(); return; }
      handoff += `\n## ${step.name} (${agentById(step.agent)?.name})\n${task.result}${task.files?.length ? `\nFiles: ${task.files.join(', ')}` : ''}\n`;
    }
    run.status = 'done'; run.finishedAt = now(); run.output = handoff;
    event('success', wf.steps.at(-1)?.agent, `Workflow “${wf.name}” completed`);
    save();
  })();
  return run;
}

async function improvePrompt(text, agentId) {
  const agent = agentById(agentId);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system: 'You help beginners write better instructions for AI agents. Rewrite the user\'s request so an agent can act on it: state the goal, key context, constraints, the output format, and what "done" looks like. Keep the user\'s intent and voice, keep it under 120 words, and use [brackets] for details only the user can fill in. Reply with the improved prompt only.',
    messages: [{ role: 'user', content: `Agent: ${agent ? `${agent.name} (${agent.role})` : 'any'}\n\nRequest:\n${text}` }],
  });
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

/* ------------------------------------------------------------ status view */

function statusView(files) {
  const runFor = (wf) => state.runs.find((r) => r.workflow === wf.id);
  return {
    mode: 'live', model: MODEL, serverTime: now(),
    stations: state.stations,
    agents: state.agents.map((a) => {
      const l = live[a.id] || {};
      const u = state.usage[a.id] || { tokens: 0, cost: 0 };
      const queued = state.tasks.filter((t) => t.agent === a.id && t.status === 'queued').length;
      return {
        id: a.id, name: a.name, role: a.role, station: a.station, instructions: a.instructions, model: MODEL,
        status: l.status === 'running' ? 'running' : l.status === 'error' ? 'error' : queued ? 'waiting' : 'idle',
        task: l.status === 'running' ? l.task : l.status === 'error' ? l.task : queued ? `${queued} task(s) queued` : 'Ready for a task',
        progress: l.progress || 0, tokens: u.tokens, cost: +u.cost.toFixed(4),
      };
    }),
    workflows: state.workflows.map((wf) => {
      const r = runFor(wf);
      return {
        id: wf.id, name: wf.name, description: wf.description, trigger: wf.trigger, input: wf.input,
        status: r ? r.status : 'idle', startedAt: r?.startedAt, runId: r?.id, output: r?.output,
        steps: wf.steps.map((s, i) => ({ name: s.name, agent: s.agent, instructions: s.instructions, status: r?.steps[i]?.status || 'pending', duration: r?.steps[i]?.duration || 0, task: r?.steps[i]?.task })),
      };
    }),
    tasks: state.tasks.slice(0, 60),
    skills: state.skills,
    memories: state.memories.slice(0, 200),
    events: state.events.slice(0, 80),
    files,
  };
}

/* -------------------------------------------------------------- HTTP API */

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

async function readJson(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 1e6) throw httpError(413, 'Body too large'); }
  try { return body ? JSON.parse(body) : {}; } catch { throw httpError(400, 'Invalid JSON'); }
}

function send(res, status, data, headers = {}) {
  const isBuf = Buffer.isBuffer(data) || typeof data === 'string';
  res.writeHead(status, { 'Content-Type': isBuf ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(isBuf ? data : JSON.stringify(data));
}

const STATIC = { 'index.html': 'text/html', 'app.js': 'text/javascript', 'styles.css': 'text/css', 'sw.js': 'text/javascript', 'manifest.webmanifest': 'application/manifest+json', 'icon.svg': 'image/svg+xml' };

const routes = [
  ['GET', /^\/api\/status$/, async () => statusView(await listFiles())],
  ['POST', /^\/api\/tasks$/, async (_, b) => createTask(b.agent, b.prompt)],
  ['POST', /^\/api\/improve-prompt$/, async (_, b) => ({ prompt: await improvePrompt(String(b.prompt || '').slice(0, 4000), b.agent) })],
  ['POST', /^\/api\/workflows$/, async (_, b) => {
    const steps = (Array.isArray(b.steps) ? b.steps : []).filter((s) => agentById(s.agent) && s.instructions);
    if (!b.name || !steps.length) throw httpError(400, 'A workflow needs a name and at least one step with an agent and instructions');
    const wf = { id: uid('wf'), name: String(b.name).slice(0, 80), description: String(b.description || '').slice(0, 300), input: String(b.input || ''), trigger: 'manual', steps: steps.map((s) => ({ name: String(s.name || 'Step').slice(0, 80), agent: s.agent, instructions: String(s.instructions).slice(0, 4000) })) };
    state.workflows.push(wf); save(); return wf;
  }],
  ['DELETE', /^\/api\/workflows\/([\w-]+)$/, async ([id]) => { state.workflows = state.workflows.filter((w) => w.id !== id); save(); return { ok: true }; }],
  ['POST', /^\/api\/workflows\/([\w-]+)\/run$/, async ([id], b) => {
    const wf = state.workflows.find((w) => w.id === id);
    if (!wf) throw httpError(404, 'No such workflow');
    if (state.runs.some((r) => r.workflow === id && r.status === 'running')) throw httpError(409, 'This workflow is already running');
    return runWorkflow(wf, b.input);
  }],
  ['POST', /^\/api\/agents$/, async (_, b) => {
    if (!b.name) throw httpError(400, 'Agent needs a name');
    let id = slug(b.name) || uid('agent'); if (agentById(id)) id = `${id}-${crypto.randomBytes(2).toString('hex')}`;
    const station = state.stations.some((s) => s.id === b.station) ? b.station : state.stations[0].id;
    const a = { id, name: String(b.name).slice(0, 40), role: String(b.role || 'Assistant').slice(0, 60), station, instructions: String(b.instructions || '').slice(0, 4000) };
    state.agents.push(a); event('success', a.id, `${a.name} joined ${station}`); save(); return a;
  }],
  ['POST', /^\/api\/skills$/, async (_, b) => {
    const id = slug(b.name); if (!id || !b.instructions) throw httpError(400, 'Skill needs a name and instructions');
    const s = { id, name: String(b.name).slice(0, 80), description: String(b.description || '').slice(0, 300), instructions: String(b.instructions).slice(0, 8000), author: 'you', updatedAt: now(), uses: 0 };
    state.skills = [s, ...state.skills.filter((k) => k.id !== id)]; event('success', null, `You taught the station skill “${s.name}”`); save(); return s;
  }],
  ['DELETE', /^\/api\/skills\/([\w-]+)$/, async ([id]) => { state.skills = state.skills.filter((s) => s.id !== id); save(); return { ok: true }; }],
  ['POST', /^\/api\/memories$/, async (_, b) => {
    const fact = String(b.fact || '').trim(); if (!fact) throw httpError(400, 'Memory is empty');
    const m = { id: uid('mem'), ts: now(), agent: agentById(b.agent) ? b.agent : null, scope: agentById(b.agent) ? 'agent' : 'shared', fact: fact.slice(0, 1000), source: 'you' };
    state.memories.unshift(m); save(); return m;
  }],
  ['DELETE', /^\/api\/memories\/([\w-]+)$/, async ([id]) => { state.memories = state.memories.filter((m) => m.id !== id); save(); return { ok: true }; }],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' };
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '', cors);

    if (url.pathname.startsWith('/api/')) {
      if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'Missing or wrong station token' }, cors);
      const fm = url.pathname.match(/^\/api\/files\/(.+)$/);
      if (fm && req.method === 'GET') {
        const { base, full } = safeFile(decodeURIComponent(fm[1]));
        if (!fss.existsSync(full)) return send(res, 404, { error: 'No such file' }, cors);
        return send(res, 200, await fs.readFile(full), { ...cors, 'Content-Disposition': `inline; filename="${base}"` });
      }
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) return send(res, 200, await fn(m.slice(1), method === 'GET' ? {} : await readJson(req)), cors);
      }
      return send(res, 404, { error: 'Not found' }, cors);
    }

    // Serve the mobile app itself from the parent folder.
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (STATIC[name]) {
      return send(res, 200, await fs.readFile(path.join(APP_DIR, name)), { 'Content-Type': STATIC[name], 'Cache-Control': 'no-cache' });
    }
    send(res, 404, 'Not found');
  } catch (e) {
    send(res, e.status || 500, { error: e.status ? e.message : `Server error: ${e.message}` }, cors);
    if (!e.status) console.error(e);
  }
});

await loadState();
server.listen(PORT, HOST, () => {
  console.log(`\n  Agent Station is running → http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL} · data: ${DATA_DIR}${TOKEN ? ' · token required' : ''}`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) console.log('  ⚠  ANTHROPIC_API_KEY is not set — tasks will fail until you set it.');
  console.log('  Open the address above on your phone (same Wi-Fi: use this computer\'s IP).\n');
});
