// Connectors: plug any MCP (Model Context Protocol) server into your agents.
//
// The app can switch on catalog entries and add remote MCP URLs. Connectors that
// run a local command can only be added by editing DATA_DIR/connectors.json on
// the server itself, so nobody can start programs on your computer from the app.

import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Free, open-source, maintained MCP servers. {FILES} and {DATA} are filled in at runtime.
export const CATALOG = [
  { id: 'filesystem', name: 'Files', icon: '🗂️', desc: 'Read, write, search and organize files in the station files folder.', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '{FILES}'], needs: [], requires: 'Node.js' },
  { id: 'browser', name: 'Web browser', icon: '🌐', desc: 'A real headless browser (Playwright): open sites, click, fill forms, read pages that need JavaScript.', type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest', '--headless', '--isolated'], needs: [], requires: 'Node.js (downloads a browser on first use)' },
  { id: 'thinking', name: 'Step-by-step thinking', icon: '🧩', desc: 'A reasoning scratchpad that helps smaller free models plan multi-step work.', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'], needs: [], requires: 'Node.js' },
  { id: 'knowledge-graph', name: 'Knowledge graph', icon: '🕸️', desc: 'Long-term memory of people, projects and how they relate.', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], env: { MEMORY_FILE_PATH: '{DATA}/knowledge-graph.jsonl' }, needs: [], requires: 'Node.js' },
  { id: 'fetch', name: 'Web page reader', icon: '📰', desc: 'Fetch any web page and turn it into clean text (official Python server).', type: 'stdio', command: 'uvx', args: ['mcp-server-fetch'], needs: [], requires: 'Python uv (docs.astral.sh/uv)' },
  { id: 'time', name: 'Time & time zones', icon: '🕒', desc: 'Current time anywhere and time-zone conversions.', type: 'stdio', command: 'uvx', args: ['mcp-server-time'], needs: [], requires: 'Python uv (docs.astral.sh/uv)' },
  { id: 'github', name: 'GitHub', icon: '🐙', desc: 'Repos, issues, pull requests and code search via the official GitHub MCP server.', type: 'http', url: 'https://api.githubcopilot.com/mcp/', needs: [{ key: 'token', label: 'GitHub personal access token', help: 'github.com → Settings → Developer settings → Personal access tokens', header: 'Authorization', prefix: 'Bearer ' }], requires: 'A GitHub account' },
  { id: 'notion', name: 'Notion', icon: '📒', desc: 'Search, read and update your Notion pages and databases (official Notion server).', type: 'stdio', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], needs: [{ key: 'NOTION_TOKEN', label: 'Notion integration token', help: 'notion.so/profile/integrations → New integration, then share pages with it', env: 'NOTION_TOKEN' }], requires: 'Node.js + a Notion account' },
  { id: 'everything', name: 'MCP test server', icon: '🧪', desc: 'Example tools for checking that connectors work.', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'], needs: [], requires: 'Node.js' },
];

const toolName = (sid, t) => `mcp_${sid}_${t}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

export class Connectors {
  constructor({ dataDir, filesDir, onEvent }) {
    this.file = path.join(dataDir, 'connectors.json');
    this.dataDir = dataDir; this.filesDir = filesDir; this.onEvent = onEvent || (() => {});
    this.cfg = { enabled: {}, remote: [], local: [] };
    this.live = {};      // id -> { status, error, tools, client }
    this.toolMap = {};   // exposed tool name -> { sid, tool }
  }

  async load() {
    try { this.cfg = { enabled: {}, remote: [], local: [], ...JSON.parse(await fs.readFile(this.file, 'utf8')) }; } catch { /* first run */ }
    await this.save();
    for (const id of Object.keys(this.cfg.enabled)) this.connect(id).catch(() => {});
  }

  async save() {
    await fs.writeFile(this.file, JSON.stringify(this.cfg, null, 2), { mode: 0o600 }); // holds tokens: owner-only
  }

  /** Every connector the station knows: catalog + remote URLs + server-side custom commands. */
  all() {
    return [
      ...CATALOG,
      ...this.cfg.remote.map((r) => ({ id: r.id, name: r.name, icon: '🔗', desc: r.url, type: 'http', url: r.url, needs: [], custom: true, requires: 'Remote MCP server' })),
      ...this.cfg.local.map((l) => ({ id: l.id, name: l.name || l.id, icon: '🛠️', desc: `${l.command} ${(l.args || []).join(' ')}`, type: 'stdio', command: l.command, args: l.args || [], env: l.env, needs: [], local: true, requires: 'Configured on the server' })),
    ];
  }

  view() {
    return this.all().map((c) => {
      const l = this.live[c.id] || {};
      return {
        id: c.id, name: c.name, icon: c.icon, desc: c.desc, type: c.type, requires: c.requires, custom: !!c.custom, local: !!c.local,
        needs: c.needs.map((n) => ({ key: n.key, label: n.label, help: n.help })),
        enabled: !!this.cfg.enabled[c.id],
        status: this.cfg.enabled[c.id] ? (l.status || 'connecting') : 'off',
        error: l.error || '',
        tools: (l.tools || []).map((t) => ({ name: t.name, description: (t.description || '').slice(0, 160) })),
      };
    });
  }

  fill(s) { return String(s).replaceAll('{FILES}', this.filesDir).replaceAll('{DATA}', this.dataDir); }

  async connect(id) {
    const c = this.all().find((x) => x.id === id);
    if (!c) throw new Error('Unknown connector');
    await this.disconnect(id, true);
    const secrets = this.cfg.enabled[id]?.secrets || {};
    this.live[id] = { status: 'connecting', tools: [] };
    let transport;
    if (c.type === 'http') {
      const headers = {};
      for (const n of c.needs) if (n.header && secrets[n.key]) headers[n.header] = (n.prefix || '') + secrets[n.key];
      const remote = this.cfg.remote.find((r) => r.id === id);
      if (remote?.token) headers.Authorization = `Bearer ${remote.token}`;
      transport = new StreamableHTTPClientTransport(new URL(c.url), { requestInit: { headers } });
    } else {
      const envVars = { ...process.env };
      for (const [k, v] of Object.entries(c.env || {})) envVars[k] = this.fill(v);
      for (const n of c.needs) if (n.env && secrets[n.key]) envVars[n.env] = secrets[n.key];
      transport = new StdioClientTransport({ command: c.command, args: c.args.map((a) => this.fill(a)), env: envVars, stderr: 'pipe' });
      let errTail = '';
      transport.stderr?.on('data', (d) => { errTail = (errTail + d).slice(-600); this.live[id] && (this.live[id].stderr = errTail); });
    }
    const client = new Client({ name: 'agent-station', version: '1.0.0' });
    try {
      await Promise.race([
        client.connect(transport),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out starting (first start can take a minute while it downloads)')), 120000)),
      ]);
      const { tools } = await client.listTools();
      this.live[id] = { status: 'connected', tools, client };
      this.rebuildMap();
      this.onEvent('success', `Connector “${c.name}” connected with ${tools.length} tool(s)`);
    } catch (e) {
      const tail = this.live[id]?.stderr ? ` — ${this.live[id].stderr.trim().split('\n').pop()}` : '';
      const missing = e.code === 'ENOENT' ? ` (is ${c.command} installed? Needs: ${c.requires})` : '';
      this.live[id] = { status: 'error', error: `${e.message}${missing}${tail}`.slice(0, 400), tools: [] };
      try { await client.close(); } catch { /* ignore */ }
      this.onEvent('error', `Connector “${c.name}” failed: ${this.live[id].error}`);
    }
  }

  async disconnect(id, quiet) {
    const l = this.live[id];
    if (l?.client) { try { await l.client.close(); } catch { /* ignore */ } }
    delete this.live[id];
    this.rebuildMap();
    if (!quiet) this.onEvent('info', `Connector ${id} switched off`);
  }

  async enable(id, secrets = {}) {
    const c = this.all().find((x) => x.id === id);
    if (!c) throw new Error('Unknown connector');
    for (const n of c.needs) if (!secrets[n.key] && !this.cfg.enabled[id]?.secrets?.[n.key]) throw new Error(`${n.label} is required`);
    this.cfg.enabled[id] = { secrets: { ...(this.cfg.enabled[id]?.secrets || {}), ...secrets } };
    await this.save();
    this.connect(id).catch(() => {}); // connects in the background; status shows in the app
  }

  async disable(id) {
    delete this.cfg.enabled[id];
    await this.save();
    await this.disconnect(id);
  }

  async addRemote({ name, url, token }) {
    let u; try { u = new URL(url); } catch { throw new Error('Enter a valid https:// URL'); }
    if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error('Remote connectors must use https://');
    const id = 'remote-' + String(name || u.hostname).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    this.cfg.remote = [...this.cfg.remote.filter((r) => r.id !== id), { id, name: String(name || u.hostname).slice(0, 40), url: u.href, token: token || '' }];
    await this.enable(id);
    return { id };
  }

  async removeRemote(id) {
    await this.disable(id);
    this.cfg.remote = this.cfg.remote.filter((r) => r.id !== id);
    await this.save();
  }

  rebuildMap() {
    this.toolMap = {};
    for (const [sid, l] of Object.entries(this.live)) for (const t of l.tools || []) this.toolMap[toolName(sid, t.name)] = { sid, tool: t };
  }

  /** Tool definitions in a neutral shape: { name, description, parameters }. */
  toolDefs() {
    return Object.entries(this.toolMap).map(([name, { sid, tool }]) => ({
      name,
      description: `[${this.all().find((c) => c.id === sid)?.name || sid}] ${tool.description || tool.name}`.slice(0, 1000),
      parameters: tool.inputSchema?.type === 'object' ? tool.inputSchema : { type: 'object', properties: {} },
    }));
  }

  has(name) { return !!this.toolMap[name]; }

  async call(name, args) {
    const m = this.toolMap[name];
    const client = m && this.live[m.sid]?.client;
    if (!client) throw new Error('That connector is not connected');
    const res = await client.callTool({ name: m.tool.name, arguments: args || {} });
    const text = (res.content || []).map((b) => (b.type === 'text' ? b.text : b.type === 'resource' ? (b.resource?.text || `[resource ${b.resource?.uri}]`) : `[${b.type}]`)).join('\n');
    if (res.isError) throw new Error(text || 'Tool error');
    return text.length > 60000 ? text.slice(0, 60000) + '\n…[truncated]' : text || '(no output)';
  }

  async closeAll() { for (const id of Object.keys(this.live)) await this.disconnect(id, true); }
}
