// Muse Bridge: lets your Muse agent (or any MCP client) work with Agent Station.
//
// Your agents run inside the phone app, and a phone can't receive connections,
// so this small always-on relay sits in the middle:
//   Muse  ──MCP──▶  /bridge/mcp   (tools below)
//   Phone ──sync──▶ /bridge/sync  (every few seconds while the app is open)
// The bridge stores a snapshot of your station, tasks Muse sends to your agents,
// tasks you send to Muse, and Muse's activity reports. Nothing else.
//
// `store` is any { get(key), set(key, value) } with JSON values (Netlify Blobs, a file, memory).

const now = () => Date.now();
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
const clip = (s, n) => String(s ?? '').slice(0, n);
const PROTOCOL = '2025-06-18';

async function load(store, key, dflt) { try { return (await store.get(key)) ?? dflt; } catch { return dflt; } }

/* ------------------------------------------------------------- MCP tools */
const TOOLS = [
  { name: 'station_overview', description: "See the user's Agent Station: their AI agents (name, job, what each is doing), workflows, and recent results. Call this first.", inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'give_task', description: "Give one of the user's Agent Station agents a task (e.g. research, writing, planning). Returns a task id; use check_task to get the result. Agents run in the user's phone app, so results arrive while the app is open.", inputSchema: { type: 'object', properties: { agent: { type: 'string', description: 'Agent id or name from station_overview' }, task: { type: 'string', description: 'Clear instructions: goal, context, format' } }, required: ['agent', 'task'], additionalProperties: false } },
  { name: 'check_task', description: 'Get the status and result of a task you gave with give_task or run_workflow.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'run_workflow', description: 'Run one of the user\'s Agent Station workflows (an assembly line of agents) on an input.', inputSchema: { type: 'object', properties: { workflow: { type: 'string', description: 'Workflow id or name' }, input: { type: 'string' } }, required: ['workflow'], additionalProperties: false } },
  { name: 'report_activity', description: "Show what you (Muse) are working on at your desk on the user's Agent Station production floor. Call it when you start, make progress on, or finish something. Pass the same id to update an activity.", inputSchema: { type: 'object', properties: { title: { type: 'string' }, status: { type: 'string', enum: ['working', 'done', 'error'] }, detail: { type: 'string' }, id: { type: 'string', description: 'Optional: id returned earlier, to update it' } }, required: ['title', 'status'], additionalProperties: false } },
  { name: 'get_my_tasks', description: 'Get tasks the user assigned to you (Muse) from Agent Station that are not finished yet.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'complete_my_task', description: 'Send back the result of a task the user assigned to you. It appears in Agent Station and is read aloud if they asked by voice.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, result: { type: 'string' }, status: { type: 'string', enum: ['done', 'error'] } }, required: ['id', 'result'], additionalProperties: false } },
];

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
const toolError = (t) => ({ content: [{ type: 'text', text: t }], isError: true });

async function callTool(store, name, args = {}) {
  const snap = await load(store, 'snapshot', null);
  const appNote = !snap ? 'The Agent Station app has not connected to this bridge yet. Ask the user to open the app and turn on Muse Bridge in Brain → Connect.'
    : now() - snap.at > 120000 ? `Note: the Agent Station app was last open ${Math.round((now() - snap.at) / 60000)} min ago. Tasks will start when the user opens it.` : '';
  const findAgent = (q) => snap?.agents?.find((a) => a.id === q || a.name.toLowerCase() === String(q).toLowerCase());
  switch (name) {
    case 'station_overview': {
      if (!snap) return text(appNote);
      return text({ note: appNote || undefined, agents: snap.agents.filter((a) => a.id !== 'muse'), workflows: snap.workflows, recent_results: snap.recent });
    }
    case 'give_task': {
      const a = findAgent(args.agent);
      if (snap && !a) return toolError(`No agent "${args.agent}". Agents: ${snap.agents.filter((x) => x.id !== 'muse').map((x) => `${x.name} (${x.id})`).join(', ')}`);
      if (!String(args.task || '').trim()) return toolError('task is empty');
      const cmds = await load(store, 'commands', []);
      const c = { id: uid('cmd'), type: 'task', agent: a?.id || String(args.agent), prompt: clip(args.task, 8000), status: 'pending', createdAt: now() };
      cmds.unshift(c); await store.set('commands', cmds.slice(0, 200));
      return text({ id: c.id, status: 'queued', agent: a?.name || args.agent, note: appNote || 'Use check_task with this id for the result.' });
    }
    case 'run_workflow': {
      const w = snap?.workflows?.find((x) => x.id === args.workflow || x.name.toLowerCase() === String(args.workflow).toLowerCase());
      if (snap && !w) return toolError(`No workflow "${args.workflow}". Workflows: ${snap.workflows.map((x) => `${x.name} (${x.id})`).join(', ')}`);
      const cmds = await load(store, 'commands', []);
      const c = { id: uid('cmd'), type: 'workflow', workflow: w?.id || String(args.workflow), input: clip(args.input, 8000), status: 'pending', createdAt: now() };
      cmds.unshift(c); await store.set('commands', cmds.slice(0, 200));
      return text({ id: c.id, status: 'queued', workflow: w?.name || args.workflow, note: appNote || 'Use check_task with this id for the result.' });
    }
    case 'check_task': {
      const c = (await load(store, 'commands', [])).find((x) => x.id === args.id);
      if (!c) return toolError('No task with that id.');
      return text({ id: c.id, status: c.status, result: c.result, files: c.files, note: c.status === 'pending' ? appNote || 'Waiting for the Agent Station app to pick it up.' : undefined });
    }
    case 'report_activity': {
      const reps = await load(store, 'reports', []);
      let r = args.id && reps.find((x) => x.id === args.id);
      if (r) Object.assign(r, { title: clip(args.title, 200), status: args.status, detail: clip(args.detail, 2000), at: now() });
      else { r = { id: uid('rep'), title: clip(args.title, 200), status: args.status, detail: clip(args.detail, 2000), at: now() }; reps.unshift(r); }
      await store.set('reports', reps.slice(0, 50));
      return text({ id: r.id, shown: true });
    }
    case 'get_my_tasks': {
      const inbox = (await load(store, 'inbox', [])).filter((x) => x.status === 'open' || x.status === 'working');
      for (const t of inbox) t.status = 'working';
      if (inbox.length) { const all = await load(store, 'inbox', []); for (const t of all) if (inbox.some((i) => i.id === t.id)) t.status = 'working'; await store.set('inbox', all); }
      return text(inbox.length ? inbox.map(({ id, prompt, createdAt, voice }) => ({ id, task: prompt, assigned: new Date(createdAt).toISOString(), reply_style: voice ? 'short, spoken (it will be read aloud)' : 'normal' })) : 'No open tasks from Agent Station.');
    }
    case 'complete_my_task': {
      const all = await load(store, 'inbox', []);
      const t = all.find((x) => x.id === args.id);
      if (!t) return toolError('No task with that id. Call get_my_tasks to see open tasks.');
      Object.assign(t, { status: args.status === 'error' ? 'error' : 'done', result: clip(args.result, 20000), doneAt: now() });
      await store.set('inbox', all);
      return text({ id: t.id, delivered: true });
    }
    default: return toolError(`Unknown tool ${name}`);
  }
}

/** Handle one MCP JSON-RPC message (or a batch). Returns the response body, or null for notifications. */
export async function handleMcp(store, msg) {
  if (Array.isArray(msg)) { const out = (await Promise.all(msg.map((m) => handleMcp(store, m)))).filter(Boolean); return out.length ? out : null; }
  const { id, method, params } = msg || {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!method) return fail(-32600, 'Invalid request');
  if (id === undefined || id === null) return null; // notification (e.g. notifications/initialized)
  switch (method) {
    case 'initialize':
      return reply({ protocolVersion: params?.protocolVersion || PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'agent-station-bridge', version: '1.0.0' },
        instructions: "Agent Station is the user's team of AI agents. Use station_overview first. Use give_task/run_workflow to delegate work and check_task for results. Use report_activity so your work shows on the user's production floor, and get_my_tasks/complete_my_task for tasks the user assigns to you." });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const t = TOOLS.find((x) => x.name === params?.name);
      if (!t) return fail(-32602, `Unknown tool: ${params?.name}`);
      try { return reply(await callTool(store, t.name, params.arguments || {})); }
      catch (e) { return reply(toolError(`Bridge error: ${e.message}`)); }
    }
    case 'resources/list': return reply({ resources: [] });
    case 'prompts/list': return reply({ prompts: [] });
    default: return fail(-32601, `Method not found: ${method}`);
  }
}

/** Phone app sync: upload a snapshot + updates, download new work. */
export async function handleSync(store, body = {}) {
  if (body.snapshot) await store.set('snapshot', { ...body.snapshot, at: now() });
  let cmds = await load(store, 'commands', []);
  if (Array.isArray(body.commandUpdates) && body.commandUpdates.length) {
    for (const u of body.commandUpdates) { const c = cmds.find((x) => x.id === u.id); if (c) Object.assign(c, { status: u.status, taskId: u.taskId, result: u.result != null ? clip(u.result, 20000) : c.result, files: u.files || c.files, updatedAt: now() }); }
    await store.set('commands', cmds);
  }
  let inbox = await load(store, 'inbox', []);
  if (Array.isArray(body.inboxNew) && body.inboxNew.length) {
    for (const t of body.inboxNew) if (!inbox.some((x) => x.id === t.id)) inbox.unshift({ id: clip(t.id, 80), prompt: clip(t.prompt, 8000), voice: !!t.voice, status: 'open', createdAt: now() });
    inbox = inbox.slice(0, 100); await store.set('inbox', inbox);
  }
  const reports = await load(store, 'reports', []);
  return { commands: cmds.filter((c) => c.status === 'pending'), inbox, reports: reports.slice(0, 20), serverTime: now() };
}

/** Shared HTTP handling for any web-standard runtime (Netlify Functions, Deno, Bun, Node 18+). */
export async function handleRequest(request, store, token) {
  const url = new URL(request.url);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Expose-Headers': 'Mcp-Session-Id' };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!token) return json({ error: 'The bridge is off: set the BRIDGE_TOKEN environment variable (Netlify → Site configuration → Environment variables), then redeploy.' }, 503);
  const auth = request.headers.get('authorization') || '';
  const given = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
  if (given !== token) return json({ error: 'Missing or wrong bridge token' }, 401);
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/bridge/sync') && request.method === 'POST') return json(await handleSync(store, await request.json().catch(() => ({}))));
  if (path.endsWith('/bridge/mcp')) {
    if (request.method === 'GET') return new Response('Use POST for MCP (Streamable HTTP).', { status: 405, headers: { Allow: 'POST', ...cors } });
    if (request.method === 'DELETE') return new Response(null, { status: 204, headers: cors });
    const body = await request.json().catch(() => null);
    if (!body) return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    const out = await handleMcp(store, body);
    return out ? json(out) : new Response(null, { status: 202, headers: cors });
  }
  if (path.endsWith('/bridge/health')) return json({ ok: true, mcp: '/bridge/mcp' });
  return json({ error: 'Not found' }, 404);
}
