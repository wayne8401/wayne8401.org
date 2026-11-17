/* Agent Station — mobile command center for your AI agents.
 * Talks to the Agent Station server (server/server.mjs) when connected,
 * otherwise runs a built-in demo so you can learn everything risk-free. */
(() => {
  'use strict';

  /* ================================================================ utils */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('as.' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('as.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const COLORS = ['#38e8ff', '#9b7bff', '#4dffa6', '#ffb84d', '#ff7ad9', '#7aa8ff', '#ffd84d'];
  const LEVEL = { info: '#38e8ff', success: '#4dffa6', warn: '#ffb84d', error: '#ff5c7a' };
  const now = () => Date.now();
  const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
  const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n || 0)));
  const fmtDur = (s) => (s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
  const ago = (t) => (t ? fmtDur(Math.max(0, (now() - t) / 1000)) + ' ago' : '');
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /* ======================================================= tiny markdown */
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  }
  function md(src) {
    const lines = esc(src || '').split('\n');
    let out = '', list = false, code = false, table = [];
    const flushTable = () => {
      if (!table.length) return;
      const rows = table.filter((r) => !/^\|?\s*:?-{2,}/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim())));
      out += `<div class="tbl"><table>${rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('')}</table></div>`;
      table = [];
    };
    for (const l of lines) {
      if (l.trim().startsWith('```')) { flushTable(); if (list) { out += '</ul>'; list = false; } out += code ? '</pre>' : '<pre class="code">'; code = !code; continue; }
      if (code) { out += l + '\n'; continue; }
      if (l.trim().startsWith('|')) { if (list) { out += '</ul>'; list = false; } table.push(l.trim()); continue; }
      flushTable();
      const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
      if (li) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(li[1])}</li>`; continue; }
      if (list) { out += '</ul>'; list = false; }
      const h = l.match(/^#{1,6}\s+(.*)/);
      if (h) out += `<h4>${inline(h[1])}</h4>`;
      else if (l.trim()) out += `<p>${inline(l)}</p>`;
    }
    flushTable();
    if (list) out += '</ul>';
    if (code) out += '</pre>';
    return `<div class="md">${out}</div>`;
  }

  /* ===================================================== starter content */
  const STATIONS = [
    { id: 'research', name: 'Research Bay', region: 'web' },
    { id: 'studio', name: 'Studio', region: 'writing' },
    { id: 'ops', name: 'Ops Deck', region: 'planning' },
  ];
  const AGENTS = [
    { id: 'scout', name: 'Scout', role: 'Web researcher', station: 'research', instructions: 'You find accurate, current information on the web. Prefer primary and reputable sources, cite links, and flag anything uncertain.' },
    { id: 'quill', name: 'Quill', role: 'Writer & editor', station: 'studio', instructions: 'You turn notes and research into clear, friendly writing: emails, posts, summaries and reports.' },
    { id: 'atlas', name: 'Atlas', role: 'Planner', station: 'ops', instructions: 'You break goals into concrete plans, checklists and schedules the user can start today.' },
  ];
  const WORKFLOWS = [
    {
      id: 'wf_brief', name: 'Research → Brief', trigger: 'manual', description: 'Scout researches a topic, then Quill writes a one-page brief.', input: 'the best budget laptops for students this year',
      steps: [
        { name: 'Research the topic', agent: 'scout', instructions: 'Research the topic below on the web. Collect 5–8 key facts with source links.' },
        { name: 'Write the brief', agent: 'quill', instructions: 'Write a one-page brief from the research: a 3-sentence summary, key points as bullets, and sources. Save it as a markdown file.' },
      ],
    },
    {
      id: 'wf_plan', name: 'Goal → Action plan', trigger: 'manual', description: 'Atlas turns a goal into a plan, then Quill makes a friendly checklist.', input: 'start a small weekend baking business',
      steps: [
        { name: 'Make a plan', agent: 'atlas', instructions: 'Turn the goal below into a step-by-step plan with milestones and rough time estimates.' },
        { name: 'Write the checklist', agent: 'quill', instructions: 'Rewrite the plan as a short, encouraging checklist a beginner can follow. Save it as a markdown file.' },
      ],
    },
  ];

  // Prompt templates: [brackets] are blanks the user fills in.
  const TEMPLATES = [
    { icon: '🔎', title: 'Research a topic', agent: 'scout', prompt: 'Research [topic] and give me the 5 most important facts as bullet points, each with a source link. I am a beginner, so explain any jargon in plain words.' },
    { icon: '⚖️', title: 'Compare options', agent: 'scout', prompt: 'Compare [option A], [option B] and [option C] for [what I need it for], with a budget of [amount]. Make a table of price, pros and cons, then recommend one in two sentences.' },
    { icon: '📰', title: 'Summarize a link', agent: 'scout', prompt: 'Read [paste a link] and summarize it in 5 bullet points for a busy reader. End with one action I could take today.' },
    { icon: '✉️', title: 'Write an email', agent: 'quill', prompt: 'Write a [friendly / professional] email to [who] about [what]. Keep it under 150 words and end with a clear next step. Save it as a file.' },
    { icon: '📣', title: 'Social posts', agent: 'quill', prompt: 'Write 3 short [platform] posts announcing [news]. Upbeat tone, one emoji each, under 40 words each.' },
    { icon: '🗺️', title: 'Plan a goal', agent: 'atlas', prompt: 'Help me [goal] by [date]. Make a week-by-week plan with 3 tasks per week, each under an hour. Save the plan as a checklist file.' },
    { icon: '📅', title: 'Plan my day', agent: 'atlas', prompt: 'Here is my to-do list: [paste list]. Order it by priority and fit it into my day from [start time] to [end time], with short breaks.' },
    { icon: '🧠', title: 'Remember me', agent: 'atlas', prompt: 'Remember these facts about me for all future tasks (shared with every agent): my name is [name], I work as [job], and I prefer [short / detailed] answers.' },
    { icon: '🎓', title: 'Teach a skill', agent: 'quill', prompt: 'Learn a new skill called "[skill name]": whenever I ask for [type of task], always [the steps you want followed]. Save it as a skill and show me what you saved.' },
  ];

  const ROLE_PRESETS = [
    { role: 'Customer support helper', instructions: 'You draft kind, accurate replies to customer messages. Ask for missing details, never promise refunds or dates you cannot confirm, and keep replies under 120 words.' },
    { role: 'Data analyst', instructions: 'You find, compare and summarize numbers. Show your working in a small table, state assumptions, and highlight the one insight that matters most.' },
    { role: 'Social media manager', instructions: 'You write on-brand social posts and content calendars. Keep posts short, add a call to action, and suggest the best time to post.' },
    { role: 'Study tutor', instructions: 'You explain topics step by step for a beginner, use everyday analogies, and finish with 3 quick quiz questions.' },
  ];

  const DEMO_MODELS = [
    { id: 'anthropic:claude-opus-5-5', provider: 'anthropic', label: 'Claude Opus 5.5', free: false },
    { id: 'anthropic:claude-haiku-5-5', provider: 'anthropic', label: 'Claude Haiku 5.5', free: false },
    { id: 'ollama:qwen3:8b', provider: 'ollama', label: 'qwen3:8b (local)', free: true },
    { id: 'ollama:llama3.1:8b', provider: 'ollama', label: 'llama3.1:8b (local)', free: true },
    { id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free', provider: 'openrouter', label: 'Llama 3.3 70B Instruct (free)', free: true },
    { id: 'groq:llama-3.3-70b-versatile', provider: 'groq', label: 'llama-3.3-70b-versatile (Groq)', free: true },
  ];
  const DEMO_PROVIDERS = [
    { id: 'anthropic', label: 'Claude (Anthropic)', free: false, ready: true, note: 'pretend: API key set', setup: 'Set ANTHROPIC_API_KEY (console.anthropic.com). Paid per token; strongest tool use and web search.' },
    { id: 'ollama', label: 'Ollama: open models on your computer', free: true, ready: true, note: 'pretend: 2 models installed', setup: 'Free and private. Install from ollama.com, then run "ollama pull qwen3:8b".' },
    { id: 'openrouter', label: 'OpenRouter: free hosted open models', free: true, ready: true, note: 'pretend: free models available', setup: 'Free account at openrouter.ai → set OPENROUTER_API_KEY. Models ending in ":free" cost nothing.' },
    { id: 'groq', label: 'Groq: fast open models, free tier', free: true, ready: true, note: 'pretend: key set', setup: 'Free account at console.groq.com → set GROQ_API_KEY.' },
    { id: 'custom', label: 'Custom OpenAI-compatible server', free: true, ready: false, note: 'Not set', setup: 'LM Studio, vLLM, llama.cpp, LocalAI, Jan: set OPENAI_COMPAT_URL (e.g. http://localhost:1234/v1).' },
  ];
  const DEMO_CONNECTORS = [
    { id: 'filesystem', name: 'Files', icon: '🗂️', desc: 'Read, write, search and organize files in the station files folder.', requires: 'Node.js', needs: [] },
    { id: 'browser', name: 'Web browser', icon: '🌐', desc: 'A real headless browser (Playwright): open sites, click, fill forms, read pages that need JavaScript.', requires: 'Node.js', needs: [] },
    { id: 'thinking', name: 'Step-by-step thinking', icon: '🧩', desc: 'A reasoning scratchpad that helps smaller free models plan multi-step work.', requires: 'Node.js', needs: [] },
    { id: 'knowledge-graph', name: 'Knowledge graph', icon: '🕸️', desc: 'Long-term memory of people, projects and how they relate.', requires: 'Node.js', needs: [] },
    { id: 'fetch', name: 'Web page reader', icon: '📰', desc: 'Fetch any web page and turn it into clean text.', requires: 'Python uv', needs: [] },
    { id: 'time', name: 'Time & time zones', icon: '🕒', desc: 'Current time anywhere and time-zone conversions.', requires: 'Python uv', needs: [] },
    { id: 'github', name: 'GitHub', icon: '🐙', desc: 'Repos, issues, pull requests and code search via the official GitHub MCP server.', requires: 'A GitHub account', needs: [{ key: 'token', label: 'GitHub personal access token', help: 'github.com → Settings → Developer settings → Personal access tokens' }] },
    { id: 'notion', name: 'Notion', icon: '📒', desc: 'Search, read and update your Notion pages and databases.', requires: 'Node.js + a Notion account', needs: [{ key: 'NOTION_TOKEN', label: 'Notion integration token', help: 'notion.so/profile/integrations → New integration' }] },
    { id: 'everything', name: 'MCP test server', icon: '🧪', desc: 'Example tools for checking that connectors work.', requires: 'Node.js', needs: [] },
  ].map((c) => ({ ...c, type: 'stdio', enabled: false, status: 'off', error: '', tools: [] }));
  const DEMO_PLUGINS = [
    { name: 'plugin_calculator', label: 'Calculator', icon: '🧮', description: 'Exact math so agents never guess at numbers.', enabled: true },
    { name: 'plugin_weather', label: 'Weather', icon: '⛅', description: 'Current weather and 3-day forecast (Open-Meteo, free).', enabled: true },
    { name: 'plugin_wikipedia', label: 'Wikipedia', icon: '📚', description: 'Short, sourced encyclopedia summaries.', enabled: true },
  ];

  /* ===================================================== demo simulator */
  // A pretend station that behaves like the real server, so beginners can
  // explore tasks, workflows, memory and skills without an API key.
  const demo = (() => {
    const d = {
      stations: STATIONS.map((s) => ({ ...s })),
      agents: AGENTS.map((a) => ({ ...a, model: '' })),
      workflows: JSON.parse(JSON.stringify(WORKFLOWS)),
      connectors: JSON.parse(JSON.stringify(DEMO_CONNECTORS)), plugins: DEMO_PLUGINS.map((p) => ({ ...p })), defaultModel: 'ollama:qwen3:8b',
      tasks: [], runs: [], events: [], usage: {}, files: {},
      skills: [{
        id: 'beginner-explainer', name: 'beginner-explainer', description: 'Explain any topic to a complete beginner', author: 'quill', uses: 2, updatedAt: now() - 864e5,
        instructions: '1. Start with a one-sentence answer.\n2. Use an everyday analogy.\n3. Define any jargon in brackets.\n4. Keep it under 200 words.\n5. End with "Try this next:" and one small action.',
      }],
      memories: [{ id: uid('mem'), ts: now() - 36e5, agent: null, scope: 'shared', fact: 'The user is new to AI agents and prefers simple, friendly explanations.', source: 'you' }],
    };
    const live = {}, waiters = {};
    const PHASES = {
      scout: ['Checking memories for context', 'Searching the web for “{t}”', 'Reading 4 promising sources', 'Cross-checking the facts', 'Writing up findings'],
      quill: ['Loading your style preferences', 'Outlining the piece', 'Writing the first draft', 'Polishing tone and length', 'Saving the file'],
      atlas: ['Clarifying the goal', 'Breaking it into milestones', 'Estimating time for each step', 'Ordering steps so you can start today', 'Saving the plan'],
    };
    const ev = (level, agent, msg) => { d.events.unshift({ id: uid('ev'), ts: now(), level, agent, msg }); d.events.length = Math.min(d.events.length, 150); };
    const topic = (p) => p.replace(/^(please|can you|could you)\s+/i, '').split(/[.\n]/)[0].split(/\s+/).slice(0, 7).join(' ');

    function createTask(agentId, prompt, extra = {}) {
      const agent = d.agents.find((a) => a.id === agentId);
      if (!agent) throw new Error('Pick an agent first');
      const text = String(prompt || '').trim();
      if (!text) throw new Error('Write a prompt first');
      const task = { id: uid('task'), agent: agent.id, prompt: text, status: 'queued', createdAt: now(), log: [], files: [], tokens: 0, cost: 0, ...extra };
      Object.defineProperty(task, 'done', { value: new Promise((r) => (waiters[task.id] = r)), enumerable: false });
      d.tasks.unshift(task);
      ev('info', agent.id, `New task: ${task.title || text.slice(0, 70)}`);
      return task;
    }

    function finish(agent, task) {
      const t = topic(task.prompt);
      const fname = `${slug(t) || 'result'}.md`;
      const body = `# ${t}\n\n*Demo file created by ${agent.name}.*\n\nIn live mode this file would hold the real deliverable: researched facts with sources, a finished draft, or a step-by-step plan.\n\n- Point 1 about ${t}\n- Point 2 about ${t}\n- Point 3 about ${t}\n`;
      d.files[fname] = { content: body, updatedAt: now() };
      task.files = [fname];
      // Memory: notice "remember"/"I prefer" style prompts.
      if (/\b(remember|my name is|i prefer|i like|i work)\b/i.test(task.prompt)) {
        const fact = task.prompt.replace(/^.*?(remember( these facts about me)?( for (all )?future tasks)?( \(shared with every agent\))?:?)/i, '').trim().slice(0, 300) || task.prompt.slice(0, 300);
        d.memories.unshift({ id: uid('mem'), ts: now(), agent: /shared|every agent/i.test(task.prompt) ? null : agent.id, scope: /shared|every agent/i.test(task.prompt) ? 'shared' : 'agent', fact, source: task.id });
        ev('success', agent.id, `Remembered: ${fact.slice(0, 80)}`);
      }
      // Skills: notice "learn a skill"/"every week" style prompts.
      const sk = task.prompt.match(/skill called\s+["“]?([^"”.]+)["”]?/i);
      if (sk || /\b(learn|teach)\b.*\bskill\b/i.test(task.prompt)) {
        const name = slug(sk ? sk[1] : t) || 'new-skill';
        d.skills = d.skills.filter((s) => s.id !== name);
        d.skills.unshift({ id: name, name, description: `Learned from your request: ${task.prompt.slice(0, 90)}`, instructions: `1. Re-read the request carefully.\n2. ${task.prompt}\n3. Check the result against the request before replying.`, author: agent.id, uses: 0, updatedAt: now() });
        ev('success', agent.id, `Learned skill “${name}”`);
      }
      task.result = `**Demo result from ${agent.name}.** In live mode, ${agent.name} would really ${agent.id === 'scout' ? 'search the web, read the pages and cite sources' : agent.id === 'quill' ? 'write the full piece and save it as a file' : 'build a complete, dated plan'} for:\n\n> ${task.prompt.slice(0, 200)}\n\n**What happened**\n- Read your memories and loaded matching skills\n- Did the work in ${task.log.length} steps (see the timeline above)\n- Saved \`${fname}\` — tap it below to open\n\nConnect your own station server (⚙️ Setup) to get real results.`;
      task.status = 'done';
      task.finishedAt = now();
      ev('success', agent.id, `Finished: ${task.title || t}`);
      waiters[task.id]?.(task);
    }

    function tick() {
      for (const agent of d.agents) {
        let task = d.tasks.find((t) => t.agent === agent.id && t.status === 'running');
        if (!task) {
          task = [...d.tasks].reverse().find((t) => t.agent === agent.id && t.status === 'queued');
          if (!task) continue;
          task.status = 'running'; task.startedAt = now(); task.progress = 0;
        }
        const phases = PHASES[agent.id] || PHASES.atlas;
        task.progress = Math.min(100, (task.progress || 0) + 6 + Math.random() * 10);
        const idx = Math.min(phases.length - 1, Math.floor((task.progress / 100) * phases.length));
        const msg = phases[idx].replace('{t}', topic(task.prompt));
        if (task.log.at(-1)?.msg !== msg) { task.log.push({ ts: now(), msg }); ev('info', agent.id, msg); }
        const u = (d.usage[agent.id] ||= { tokens: 0, cost: 0 });
        const tk = 400 + Math.floor(Math.random() * 1600);
        u.tokens += tk; u.cost += tk * 0.000008; task.tokens += tk; task.cost += tk * 0.000008;
        live[agent.id] = { task: msg, progress: task.progress };
        if (task.progress >= 100) { finish(agent, task); live[agent.id] = {}; }
      }
      for (const r of d.runs) if (r.status === 'running') r.steps.forEach((s) => { if (s.status === 'running') s.duration = (now() - s.t0) / 1000; });
    }
    setInterval(tick, 1100);

    function runWorkflow(wf, input) {
      if (d.runs.some((r) => r.workflow === wf.id && r.status === 'running')) throw new Error('This workflow is already running');
      const run = { id: uid('run'), workflow: wf.id, input: input ?? wf.input, status: 'running', startedAt: now(), steps: wf.steps.map((s) => ({ name: s.name, agent: s.agent, status: 'pending', duration: 0 })) };
      d.runs.unshift(run);
      ev('info', wf.steps[0].agent, `Workflow “${wf.name}” started`);
      (async () => {
        for (let i = 0; i < wf.steps.length; i++) {
          const s = wf.steps[i], rs = run.steps[i];
          rs.status = 'running'; rs.t0 = now();
          const task = createTask(s.agent, `${s.instructions}\n\nInput: ${run.input}`, { title: `${wf.name} · ${s.name}`, run: run.id });
          rs.task = task.id;
          await task.done;
          rs.status = 'done'; rs.duration = (now() - rs.t0) / 1000;
        }
        run.status = 'done'; run.output = 'Demo workflow finished.';
        ev('success', wf.steps.at(-1).agent, `Workflow “${wf.name}” completed`);
      })();
      return run;
    }

    function connect(id) {
      const c = d.connectors.find((x) => x.id === id);
      Object.assign(c, { enabled: true, status: 'connecting', error: '' });
      setTimeout(() => {
        const tools = { filesystem: ['read_file', 'write_file', 'search_files', 'list_directory'], browser: ['browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot'], github: ['search_repositories', 'list_issues', 'create_issue', 'get_pull_request'], notion: ['search', 'retrieve_page', 'create_page'], time: ['get_current_time', 'convert_time'], fetch: ['fetch'], thinking: ['sequentialthinking'], 'knowledge-graph': ['create_entities', 'search_nodes', 'read_graph'] }[id] || ['echo', 'add'];
        Object.assign(c, { status: 'connected', tools: tools.map((name) => ({ name, description: 'Demo tool' })) });
        ev('success', null, `Connector “${c.name}” connected with ${tools.length} tool(s)`);
      }, 1800);
      return { ok: true };
    }

    function improve(text) {
      const t = text.trim();
      const parts = [t.endsWith('.') ? t : t + '.'];
      if (!/\b(for|because|i am|i'm|my|our|audience|budget)\b/i.test(t)) parts.push('Context: this is for [who it is for / why I need it].');
      if (!/\b(list|bullet|table|email|paragraph|page|words|steps|checklist|file|summary|outline|posts?)\b/i.test(t)) parts.push('Format: [e.g. 5 bullet points / a short table / under 150 words].');
      if (!/\b(under|at least|must|only|include|avoid|deadline|by |tone)\b/i.test(t)) parts.push('Done when: [what a great result looks like, e.g. "I can decide in 2 minutes"].');
      parts.push('If anything is unclear, make a sensible assumption and tell me what you assumed.');
      return parts.join('\n');
    }

    function status() {
      const files = Object.entries(d.files).map(([name, f]) => ({ name, size: f.content.length, updatedAt: f.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
      return {
        mode: 'demo', model: d.defaultModel, defaultModel: d.defaultModel,
        models: DEMO_MODELS, providers: DEMO_PROVIDERS, connectors: d.connectors, plugins: d.plugins,
        stations: d.stations,
        agents: d.agents.map((a) => {
          const running = d.tasks.find((t) => t.agent === a.id && t.status === 'running');
          const queued = d.tasks.filter((t) => t.agent === a.id && t.status === 'queued').length;
          const u = d.usage[a.id] || { tokens: 0, cost: 0 };
          return { ...a, model: a.model || d.defaultModel, modelChosen: a.model || '', status: running ? 'running' : queued ? 'waiting' : 'idle', task: running ? live[a.id]?.task || 'Starting…' : queued ? `${queued} task(s) queued` : 'Ready for a task', progress: running ? running.progress : 0, tokens: u.tokens, cost: u.cost };
        }),
        workflows: d.workflows.map((wf) => {
          const r = d.runs.find((x) => x.workflow === wf.id);
          return { ...wf, status: r ? r.status : 'idle', startedAt: r?.startedAt, output: r?.output, steps: wf.steps.map((s, i) => ({ ...s, status: r?.steps[i]?.status || 'pending', duration: r?.steps[i]?.duration || 0, task: r?.steps[i]?.task })) };
        }),
        tasks: d.tasks.slice(0, 60), skills: d.skills, memories: d.memories, events: d.events.slice(0, 80), files,
      };
    }

    const routes = [
      ['GET', /^status$/, () => status()],
      ['POST', /^tasks$/, (_, b) => createTask(b.agent, b.prompt)],
      ['POST', /^improve-prompt$/, (_, b) => ({ prompt: improve(b.prompt || '') })],
      ['POST', /^workflows$/, (_, b) => { const wf = { id: uid('wf'), trigger: 'manual', ...b }; d.workflows.push(wf); return wf; }],
      ['DELETE', /^workflows\/(.+)$/, ([id]) => { d.workflows = d.workflows.filter((w) => w.id !== id); return { ok: true }; }],
      ['POST', /^workflows\/(.+)\/run$/, ([id], b) => runWorkflow(d.workflows.find((w) => w.id === id), b.input)],
      ['POST', /^agents$/, (_, b) => { let id = slug(b.name); if (d.agents.some((a) => a.id === id)) id += '-' + Math.random().toString(36).slice(2, 5); const a = { id, name: b.name, role: b.role || 'Assistant', station: b.station || 'research', instructions: b.instructions || '' }; d.agents.push(a); ev('success', id, `${a.name} joined the station`); return a; }],
      ['POST', /^skills$/, (_, b) => { const s = { id: slug(b.name), name: b.name, description: b.description, instructions: b.instructions, author: 'you', uses: 0, updatedAt: now() }; d.skills = [s, ...d.skills.filter((k) => k.id !== s.id)]; ev('success', null, `You taught the station skill “${s.name}”`); return s; }],
      ['DELETE', /^skills\/(.+)$/, ([id]) => { d.skills = d.skills.filter((s) => s.id !== id); return { ok: true }; }],
      ['POST', /^memories$/, (_, b) => { const m = { id: uid('mem'), ts: now(), agent: b.agent || null, scope: b.agent ? 'agent' : 'shared', fact: b.fact, source: 'you' }; d.memories.unshift(m); return m; }],
      ['DELETE', /^memories\/(.+)$/, ([id]) => { d.memories = d.memories.filter((m) => m.id !== id); return { ok: true }; }],
      ['PATCH', /^agents\/(.+)$/, ([id], b) => { const a = d.agents.find((x) => x.id === id); if ('model' in b) { a.model = b.model; ev('info', id, `${a.name} now uses ${b.model || d.defaultModel}`); } return a; }],
      ['PATCH', /^settings$/, (_, b) => { if (b.defaultModel) d.defaultModel = b.defaultModel; return { defaultModel: d.defaultModel }; }],
      ['POST', /^models\/refresh$/, () => ({ count: DEMO_MODELS.length })],
      ['POST', /^connectors\/remote$/, (_, b) => { const id = 'remote-' + slug(b.name || 'connector'); d.connectors.push({ id, name: b.name || b.url, icon: '🔗', desc: b.url, requires: 'Remote MCP server', needs: [], custom: true, type: 'http', enabled: false, status: 'off', tools: [] }); return connect(id); }],
      ['DELETE', /^connectors\/remote\/(.+)$/, ([id]) => { d.connectors = d.connectors.filter((c) => c.id !== id); return { ok: true }; }],
      ['POST', /^connectors\/(.+)\/(enable|retry)$/, ([id]) => connect(id)],
      ['POST', /^connectors\/(.+)\/disable$/, ([id]) => { const c = d.connectors.find((x) => x.id === id); Object.assign(c, { enabled: false, status: 'off', tools: [] }); return { ok: true }; }],
      ['POST', /^plugins\/(.+)$/, ([n], b) => { d.plugins.find((p) => p.name === n).enabled = !!b.enabled; return { ok: true }; }],
      ['GET', /^files\/(.+)$/, ([n]) => d.files[decodeURIComponent(n)]?.content ?? ''],
    ];
    return {
      async handle(method, p, body) {
        for (const [m, re, fn] of routes) { const x = p.match(re); if (x && m === method) return JSON.parse(JSON.stringify(fn(x.slice(1), body || {}))); }
        throw new Error('Not available in demo');
      },
    };
  })();

  /* ========================================================= connection */
  const cfg = Object.assign({ source: '', base: '', token: '', interval: 3 }, store.get('cfg', {}));
  const isServer = () => cfg.source === 'server';
  const apiUrl = (p) => { const b = (cfg.base || '').trim().replace(/\/+$/, ''); return (b ? b + '/' : '') + 'api/' + p; };

  async function call(method, p, body) {
    if (!isServer()) return demo.handle(method, p, body);
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
    const res = await fetch(apiUrl(p), { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (p.startsWith('files/')) { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text(); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /* ============================================================== state */
  const EMPTY = { stations: [], agents: [], workflows: [], tasks: [], skills: [], memories: [], events: [], files: [], models: [], providers: [], connectors: [], plugins: [], mode: 'demo' };
  let S = { ...EMPTY };
  let lastOk = 0, lastErr = '', timer = null;
  const ui = {
    tab: store.get('tab', 'station'), stationFilter: 'all', brain: 'skills',
    draft: store.get('draft', ''), draftAgent: store.get('draftAgent', 'scout'),
    sheet: null, builder: null,
  };
  const agentById = (id) => S.agents.find((a) => a.id === id);
  const colorOf = (id) => COLORS[Math.max(0, S.agents.findIndex((a) => a.id === id)) % COLORS.length];
  const agentName = (id) => agentById(id)?.name || (id ? id : 'Station');

  async function refresh() {
    try {
      const d = await call('GET', 'status');
      S = { ...EMPTY, ...d };
      lastOk = now(); lastErr = '';
    } catch (e) { lastErr = e.message || String(e); }
    update();
  }
  function schedule() {
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) refresh(); }, isServer() ? Math.max(2, +cfg.interval || 3) * 1000 : 1000);
    refresh();
  }

  /* ============================================================ models */
  const PROV_NAME = { anthropic: 'Claude', ollama: 'Ollama · local', openrouter: 'OpenRouter', groq: 'Groq', custom: 'Custom' };
  const modelInfo = (id) => S.models.find((m) => m.id === id);
  function shortModel(id) {
    if (!id) return '—';
    const m = modelInfo(id);
    const label = m?.label || id.slice(id.indexOf(':') + 1);
    return label.replace(/\s*\((local|free|Groq|custom)\)$/i, '');
  }
  const isFree = (id) => (modelInfo(id)?.free ?? !String(id).startsWith('anthropic:'));
  const modelBadge = (id) => `<span class="mbadge ${isFree(id) ? 'free' : ''}">${isFree(id) ? 'FREE · ' : ''}${esc(shortModel(id))}</span>`;
  function modelOptions(selected, withDefault) {
    const groups = {};
    for (const m of S.models) (groups[m.provider] ||= []).push(m);
    let html = withDefault ? `<option value="" ${!selected ? 'selected' : ''}>Station default (${esc(shortModel(S.defaultModel))})</option>` : '';
    for (const [prov, list] of Object.entries(groups)) {
      html += `<optgroup label="${esc(PROV_NAME[prov] || prov)}${list[0].free ? ' (free)' : ''}">${list.map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</optgroup>`;
    }
    if (selected && !modelInfo(selected)) html += `<option value="${esc(selected)}" selected>${esc(selected)} (not available now)</option>`;
    return html || '<option value="">No models found. See Brain → Connect</option>';
  }

  /* ========================================================= components */
  const pill = (s) => `<span class="pill s-${esc(s)}">${esc(s)}</span>`;
  const avatar = (a, size = '') => `<span class="avatar ${size}" style="background:${colorOf(a.id)}">${esc((a.name || '?').slice(0, 1))}</span>`;
  const bar = (pct) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct || 0))}%"></i></div>`;
  const empty = (msg, cta = '') => `<div class="empty">${msg}${cta}</div>`;

  /* ============================================================= views */
  const VIEWS = {
    station: () => `
      <div class="hello card">
        <div><h3>${greeting()}</h3><p class="muted">${S.mode === 'demo' ? 'You are in <b>demo mode</b> — everything is simulated. Connect your station in ⚙️ to do real work.' : `Connected to your station · ${esc(S.model || '')}`}</p></div>
        <button class="btn small" data-act="go-tasks">+ New task</button>
      </div>
      <div class="stats" id="statsRow" data-region="stats"></div>
      <h2>Station map</h2>
      <div class="card" data-region="map"></div>
      <div class="h2row"><h2>Agents</h2><button class="link" data-act="new-agent">+ Add agent</button></div>
      <div class="chips" data-region="stationChips"></div>
      <div class="list" style="margin-top:10px" data-region="agents"></div>
      <h2>Live activity</h2>
      <div class="feed" data-region="feed"></div>`,

    tasks: () => `
      <form class="card composer" id="composer" data-form="task">
        <div class="h2row" style="margin:0 0 8px"><h3>Give an agent a task</h3><button type="button" class="link" data-act="lesson" data-id="prompts">How?</button></div>
        <div class="pickers" id="agentPicker" data-region="picker"></div>
        <textarea name="prompt" id="draft" rows="5" placeholder="Describe what you want done, like you'd brief a smart helper.&#10;e.g. Find 3 cozy cafés near downtown that open before 8am, with links." maxlength="20000">${esc(ui.draft)}</textarea>
        <div id="coach" class="coach">${coachHtml(ui.draft)}</div>
        <div class="row">
          <button type="button" class="btn ghost" data-act="improve">✨ Improve my prompt</button>
          <button type="submit" class="btn">Send ➜</button>
        </div>
      </form>
      <div class="h2row"><h2>Start from a template</h2><span class="muted">fill in the [brackets]</span></div>
      <div class="templates" id="templates">
        ${TEMPLATES.map((t, i) => `<button class="tpl card" data-act="template" data-id="${i}"><span class="emo">${t.icon}</span><b>${esc(t.title)}</b><span class="muted">${esc(agentName(t.agent))}</span></button>`).join('')}
      </div>
      <h2>Your tasks</h2>
      <div class="list" data-region="tasks"></div>`,

    flows: () => `
      <div class="intro card"><p>A <b>workflow</b> is a team play: each step is done by an agent, and its result is handed to the next step automatically.</p></div>
      <div class="h2row"><h2>Workflows</h2><button class="link" data-act="new-flow">+ New workflow</button></div>
      <div class="list" id="flowList" data-region="flows"></div>`,

    brain: () => `
      <div class="seg" id="brainTabs">
        ${['skills', 'memory', 'files', 'connect'].map((k) => `<button class="${ui.brain === k ? 'active' : ''}" data-act="brain-tab" data-id="${k}">${{ skills: '🎓 Skills', memory: '🧠 Memory', files: '📁 Files', connect: '🔌 Connect' }[k]}</button>`).join('')}
      </div>
      <div data-region="brain"></div>`,

    guide: () => `
      <div class="card hello">
        <div><h3>New here? Take the tour</h3><p class="muted">A 60-second walk through every screen.</p></div>
        <button class="btn small" data-act="tour">▶ Start</button>
      </div>
      <h2>Lessons</h2>
      <div class="lessons" id="lessons">${LESSONS.map((l) => `<details class="card lesson" id="lesson-${l.id}"><summary><span class="emo">${l.icon}</span><b>${esc(l.title)}</b><span class="muted">${esc(l.time)}</span></summary><div class="lesson-body">${l.body}</div></details>`).join('')}</div>
      <h2>Prompt cheat sheet</h2>
      <div class="card">${md('**G**oal — what do you want done?\n**C**ontext — who is it for, what matters, what do you already know?\n**F**ormat — bullets, table, email, file, word limit?\n**D**one when — how will you know it is great?\n\nRemember it as **G-C-F-D**: *Good Chefs Follow Directions.*')}</div>
      <h2>Settings</h2>
      <button class="btn ghost" data-act="settings">⚙️ Connection &amp; settings</button>`,
  };

  const REGIONS = {
    stats() {
      const A = S.agents;
      const busy = A.filter((a) => a.status === 'running').length;
      const done = S.tasks.filter((t) => t.status === 'done').length;
      const cost = A.reduce((s, a) => s + (a.cost || 0), 0);
      return `
        <div class="card stat"><div class="label">Agents working</div><div class="value">${busy}<span class="muted" style="font-size:15px"> / ${A.length}</span></div><div class="sub">${A.some((a) => a.status === 'error') ? '<span class="s-error">one needs attention</span>' : busy ? 'on it' : 'ready'}</div></div>
        <div class="card stat"><div class="label">Tasks done</div><div class="value">${done}</div><div class="sub">${S.tasks.filter((t) => t.status === 'queued' || t.status === 'running').length} in progress</div></div>
        <div class="card stat"><div class="label">Skills · Memories</div><div class="value">${S.skills.length}<span class="muted" style="font-size:15px"> · ${S.memories.length}</span></div><div class="sub">what they've learned</div></div>
        <div class="card stat"><div class="label">Spend</div><div class="value">$${cost.toFixed(2)}</div><div class="sub">${fmtNum(A.reduce((s, a) => s + (a.tokens || 0), 0))} tokens${S.mode === 'demo' ? ' · pretend' : ''}</div></div>`;
    },
    map: () => orbit(),
    stationChips: () => `<button class="chip ${ui.stationFilter === 'all' ? 'active' : ''}" data-act="station" data-id="all">All</button>${S.stations.map((s) => `<button class="chip ${ui.stationFilter === s.id ? 'active' : ''}" data-act="station" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('')}`,
    agents() {
      const list = ui.stationFilter === 'all' ? S.agents : S.agents.filter((a) => a.station === ui.stationFilter);
      return list.map((a) => `
        <button class="card agent" data-act="agent" data-id="${esc(a.id)}">
          ${avatar(a)}
          <div><div class="name">${esc(a.name)} <span class="muted">· ${esc(a.role)}</span></div>
            <div class="task">${esc(a.task || '—')}</div>${bar(a.status === 'running' ? a.progress : 0)}<div class="mline">${modelBadge(a.model)}</div></div>
          ${pill(a.status)}
        </button>`).join('') || empty('No agents on this station yet.');
    },
    feed: () => eventsHtml(S.events.slice(0, 6)) + (S.events.length > 6 ? '<button class="btn ghost" data-act="all-events">See all activity</button>' : ''),
    picker: () => S.agents.map((a) => `<button type="button" class="pick ${ui.draftAgent === a.id ? 'active' : ''}" data-act="pick-agent" data-id="${esc(a.id)}">${avatar(a, 'sm')}<span>${esc(a.name)}<small>${esc(shortModel(a.model))}${isFree(a.model) ? ' · free' : ''}</small></span></button>`).join(''),
    tasks() {
      return S.tasks.map((t) => {
        const a = agentById(t.agent) || { id: t.agent, name: t.agent };
        const lastLog = t.log?.at(-1)?.msg;
        return `<button class="card taskcard" data-act="task" data-id="${esc(t.id)}">
          <div class="wf-head">${avatar(a, 'sm')}<div class="grow"><b>${esc(t.title || t.prompt.split('\n')[0].slice(0, 90))}</b><p class="muted">${esc(a.name)} · ${ago(t.createdAt)}</p></div>${pill(t.status)}</div>
          ${t.status === 'running' ? `<p class="muted live-line">▸ ${esc(lastLog || 'Starting…')}</p>${bar(agentById(t.agent)?.progress)}` : ''}
          ${t.status === 'done' && t.files?.length ? `<p class="muted">📎 ${t.files.map(esc).join(', ')}</p>` : ''}
        </button>`;
      }).join('') || empty('No tasks yet. Pick an agent, write a prompt (or tap a template) and press <b>Send</b>.');
    },
    flows() {
      return S.workflows.map((w) => {
        const done = w.steps.filter((s) => s.status === 'done').length;
        return `<div class="card">
          <div class="wf-head"><div class="grow"><h3>${esc(w.name)}</h3><p class="muted">${esc(w.description || '')}${w.startedAt ? ` · last run ${ago(w.startedAt)}` : ''}</p></div>${pill(w.status)}</div>
          ${w.status === 'running' ? bar(w.steps.length ? (done / w.steps.length) * 100 : 0) : ''}
          <ol class="steps">${w.steps.map((s, i) => {
            const a = agentById(s.agent);
            return `<li class="step ${esc(s.status)}" ${s.task ? `data-act="task" data-id="${esc(s.task)}"` : ''}>
              <span class="mark">${s.status === 'done' ? '✓' : s.status === 'error' ? '!' : i + 1}</span>
              <div><div class="title">${esc(s.name)}</div><div class="who">${esc(a ? a.name : s.agent)}${s.task ? ' · tap for result' : ''}</div></div>
              <span class="t">${s.duration ? fmtDur(s.duration) : ''}</span></li>`;
          }).join('')}</ol>
          <div class="row" style="margin-top:12px">
            <button class="btn" data-act="run-flow" data-id="${esc(w.id)}" ${w.status === 'running' ? 'disabled' : ''}>${w.status === 'running' ? 'Running…' : '▶ Run'}</button>
            <button class="btn ghost narrow" data-act="del-flow" data-id="${esc(w.id)}" aria-label="Delete workflow">🗑</button>
          </div>
        </div>`;
      }).join('') || empty('No workflows yet.', '<br><button class="btn small" data-act="new-flow" style="margin-top:12px">Build your first workflow</button>');
    },
    brain() {
      if (ui.brain === 'skills') {
        return `<div class="intro card"><p><b>Skills</b> are playbooks your agents learned. They load the right one automatically when a task fits. Agents can learn new skills themselves — just ask them to <i>“learn a skill”</i> — or you can teach one here.</p><button class="btn small" data-act="teach">+ Teach a skill</button></div>
          <div class="list" style="margin-top:10px">${S.skills.map((s) => `<button class="card skill" data-act="skill" data-id="${esc(s.id)}"><div class="wf-head"><span class="emo">🎓</span><div class="grow"><b>${esc(s.name)}</b><p class="muted">${esc(s.description || '')}</p></div></div><p class="muted tiny">by ${esc(s.author === 'you' ? 'you' : agentName(s.author))} · used ${s.uses || 0}× · ${ago(s.updatedAt)}</p></button>`).join('') || empty('No skills yet.')}</div>`;
      }
      if (ui.brain === 'memory') {
        return `<div class="intro card"><p><b>Memory</b> is what your agents know about you and past work. They read it before every task and save new facts as they go. Remove anything you don't want kept.</p><button class="btn small" data-act="add-memory">+ Tell them something</button></div>
          <div class="list" style="margin-top:10px">${S.memories.map((m) => `<div class="card mem"><div class="grow"><p>${esc(m.fact)}</p><p class="muted tiny">${m.scope === 'shared' ? '🌐 all agents' : '👤 ' + esc(agentName(m.agent))} · ${m.source === 'you' ? 'added by you' : 'learned on a task'} · ${ago(m.ts)}</p></div><button class="icon-btn" data-act="del-memory" data-id="${esc(m.id)}" aria-label="Forget">✕</button></div>`).join('') || empty('Nothing remembered yet.')}</div>`;
      }
      if (ui.brain === 'connect') return connectHtml();
      return `<div class="intro card"><p><b>Files</b> are deliverables your agents saved: reports, drafts, plans.</p></div>
        <div class="list" style="margin-top:10px">${S.files.map((f) => `<button class="card file" data-act="file" data-id="${esc(f.name)}"><span class="emo">📄</span><div class="grow"><b>${esc(f.name)}</b><p class="muted tiny">${(f.size / 1024).toFixed(1)} KB · ${ago(f.updatedAt)}</p></div><span class="muted">›</span></button>`).join('') || empty('No files yet. Ask an agent to “save it as a file”.')}</div>`;
    },
  };

  function connectHtml() {
    const statusPill = (c) => `<span class="pill s-${{ connected: 'running', connecting: 'waiting', error: 'error', off: 'idle' }[c.status] || 'idle'}">${esc(c.status)}</span>`;
    return `
      <div class="intro card"><p><b>Connect</b> gives your agents brains and hands: choose <b>AI models</b> (including free, open-source ones), switch on <b>connectors</b> to apps and services, and toggle <b>plugins</b>.</p></div>
      <div class="h2row"><h2>AI models</h2><button class="link" data-act="refresh-models">↻ Refresh</button></div>
      <div class="card">
        <label class="field">Default model for all agents<select data-change="default-model">${modelOptions(S.defaultModel, false)}</select></label>
        <p class="muted tiny" style="margin:0">Each agent can use a different model. Open an agent on the Station tab to change it. Free models cost nothing to run.</p>
      </div>
      <div class="list" style="margin-top:10px">${S.providers.map((p) => `
        <div class="card prov ${p.ready ? 'ready' : ''}">
          <div class="wf-head"><span class="emo">${p.ready ? '✅' : '⚪'}</span><div class="grow"><b>${esc(p.label)}</b>${p.free ? ' <span class="mbadge free">FREE</span>' : ''}<p class="muted tiny">${esc(p.note || '')}</p></div></div>
          ${p.ready ? '' : `<p class="muted tiny setup">How to turn on: ${esc(p.setup)}</p>`}
        </div>`).join('')}</div>
      <div class="h2row"><h2>Connectors</h2><button class="link" data-act="add-remote">+ Add by URL</button></div>
      <p class="muted tiny" style="margin:-4px 2px 10px">Open-source MCP connectors. Switch one on and every agent can use its tools.</p>
      <div class="list">${S.connectors.map((c) => `
        <div class="card conn">
          <div class="wf-head"><span class="emo">${c.icon || '🔌'}</span><div class="grow"><b>${esc(c.name)}</b><p class="muted tiny">${esc(c.desc)}</p></div>${statusPill(c)}</div>
          <p class="muted tiny" style="margin:8px 0 0">${c.needs?.length ? '🔑 Needs: ' + c.needs.map((n) => esc(n.label)).join(', ') + ' · ' : '🆓 No account needed · '}Requires: ${esc(c.requires || '')}</p>
          ${c.error ? `<p class="tiny s-error" style="margin:6px 0 0">${esc(c.error)}</p>` : ''}
          <div class="row" style="margin-top:10px">
            ${c.enabled ? `<button class="btn ghost" data-act="conn-disable" data-id="${esc(c.id)}">Switch off</button>` : `<button class="btn" data-act="conn-enable" data-id="${esc(c.id)}">Switch on</button>`}
            ${c.status === 'connected' ? `<button class="btn ghost" data-act="conn-tools" data-id="${esc(c.id)}">${c.tools.length} tools</button>` : ''}
            ${c.status === 'error' ? `<button class="btn ghost" data-act="conn-retry" data-id="${esc(c.id)}">Retry</button>` : ''}
            ${c.custom ? `<button class="btn ghost narrow" data-act="del-remote" data-id="${esc(c.id)}" aria-label="Remove">🗑</button>` : ''}
          </div>
        </div>`).join('') || empty('Connectors appear when connected to a station server.')}</div>
      <h2>Plugins</h2>
      <p class="muted tiny" style="margin:-4px 2px 10px">Small built-in tools. Add your own: drop a file in <code>server/plugins/</code>.</p>
      <div class="list">${S.plugins.map((p) => `
        <div class="card mem"><span class="emo">${p.icon}</span><div class="grow"><b>${esc(p.label)}</b><p class="muted tiny">${esc(p.description)}</p></div>
          <button class="toggle ${p.enabled ? 'on' : ''}" data-act="plugin-toggle" data-id="${esc(p.name)}" role="switch" aria-checked="${p.enabled}" aria-label="${esc(p.label)}"><i></i></button></div>`).join('') || empty('No plugins loaded.')}</div>`;
  }

  function greeting() {
    const h = new Date().getHours();
    return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'} 👋`;
  }

  function eventsHtml(list) {
    return list.map((e) => `<div class="card event"><span class="lvl" style="background:${LEVEL[e.level] || LEVEL.info}"></span><div><div class="msg">${esc(e.msg)}</div><div class="meta mono">${clock(e.ts)} · ${esc(agentName(e.agent))}</div></div></div>`).join('') || empty('Waiting for activity…');
  }

  function orbit() {
    const St = S.stations, cx = 150, cy = 150;
    let svg = `<circle class="ring" cx="${cx}" cy="${cy}" r="62"/><circle class="ring" cx="${cx}" cy="${cy}" r="122"/>`;
    let nodes = '';
    St.forEach((st, i) => {
      const ang = (i / St.length) * Math.PI * 2 - Math.PI / 2;
      const sx = cx + Math.cos(ang) * 62, sy = cy + Math.sin(ang) * 62;
      const members = S.agents.filter((a) => a.station === st.id);
      const hot = members.some((a) => a.status === 'running');
      svg += `<line class="link ${hot ? 'hot' : ''}" x1="${cx}" y1="${cy}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}"/>`;
      nodes += `<g class="node" data-act="station" data-id="${esc(st.id)}"><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="13" fill="#0b1022" stroke="#9b7bff" stroke-width="2"/><text x="${sx.toFixed(1)}" y="${(sy + 3.5).toFixed(1)}">${esc(st.name.slice(0, 1))}</text></g>`;
      members.forEach((a, j) => {
        const spread = (Math.PI * 2) / Math.max(St.length, 1);
        const aa = ang + (j - (members.length - 1) / 2) * (spread / Math.max(members.length, 2)) * 0.9;
        const ax = cx + Math.cos(aa) * 122, ay = cy + Math.sin(aa) * 122;
        const ring = { running: '#4dffa6', waiting: '#ffb84d', error: '#ff5c7a' }[a.status] || '#8592b8';
        svg += `<line class="link ${a.status === 'running' ? 'hot' : ''}" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}"/>`;
        nodes += `<g class="node" data-act="agent" data-id="${esc(a.id)}"><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="15" fill="${colorOf(a.id)}" opacity=".18"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="9" fill="${colorOf(a.id)}" stroke="${ring}" stroke-width="2.5"/><text x="${ax.toFixed(1)}" y="${(ay + 27).toFixed(1)}">${esc(a.name)}</text></g>`;
      });
    });
    return `<div class="orbit"><svg viewBox="-12 -12 324 324" role="img" aria-label="Station map">${svg}
      <circle cx="${cx}" cy="${cy}" r="24" fill="rgba(56,232,255,.12)" stroke="#38e8ff" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="#38e8ff"/><text class="hub-label" x="${cx}" y="${cy + 40}">CORE</text>${nodes}</svg></div>
      <p class="muted center">Tap an agent to see what it's doing. Green = working.</p>`;
  }

  /* ======================================================= prompt coach */
  const COACH = [
    { key: 'Goal', tip: 'Start with an action: find, write, plan, compare…', test: (t, w) => w >= 5 && /\b(find|write|research|compare|plan|summari[sz]e|draft|create|make|list|explain|analy[sz]e|build|learn|teach|review|organi[sz]e|suggest|help|read|remember|order|check)\w*/i.test(t) },
    { key: 'Context', tip: 'Who is it for? Why? Budget, location, level…', test: (t, w) => w >= 12 && /\b(for|because|about|my|our|i am|i'm|audience|budget|near|beginner|team|customers?)\b/i.test(t) },
    { key: 'Format', tip: 'Say the shape: bullets, table, email, file, word limit', test: (t) => /\b(list|bullets?|table|email|paragraphs?|page|words|steps|checklist|markdown|file|csv|summary|outline|posts?|plan)\b/i.test(t) },
    { key: 'Done when', tip: 'Add a limit or quality bar: under 150 words, 3 options, by Friday', test: (t) => /\b(under|less than|at least|exactly|by \w+|deadline|must|only|include|avoid|tone|max|limit|each|\d+)\b/i.test(t) },
  ];
  function coachHtml(text) {
    const t = text || '', w = t.trim() ? t.trim().split(/\s+/).length : 0;
    const res = COACH.map((c) => ({ ...c, ok: c.test(t, w) }));
    const score = res.filter((r) => r.ok).length;
    const hasBlanks = /\[[^\]]+\]/.test(t);
    const label = !w ? 'Prompt coach' : ['Just starting', 'Getting there', 'Good', 'Very good', 'Excellent'][score];
    const next = res.find((r) => !r.ok);
    return `<div class="meter"><span>${label}</span><div class="dots">${res.map((r) => `<i class="${r.ok ? 'on' : ''}" title="${r.key}">${r.key}</i>`).join('')}</div></div>
      <p class="muted tiny">${hasBlanks ? '✏️ Replace the <b>[brackets]</b> with your details.' : !w ? 'Great prompts have a <b>Goal</b>, <b>Context</b>, <b>Format</b> and a <b>Done when</b>.' : next ? `💡 ${next.key}: ${next.tip}` : '🚀 Ready to send!'}</p>`;
  }

  /* ============================================================ lessons */
  const LESSONS = [
    { id: 'agents', icon: '🤖', title: 'What is an AI agent?', time: '1 min', body: md('An **AI agent** is an assistant that doesn\'t just chat — it *does* things. Your agents can:\n\n- **Search the web** and read pages for up-to-date facts\n- **Write files** — reports, emails, plans — you can open here\n- **Remember** what you tell them, across tasks\n- **Learn skills** — playbooks they reuse next time\n- **Work as a team** in workflows\n\nEach agent has a **role** (like *Web researcher*) and lives on a **station** — just a group, like a department.') },
    { id: 'first', icon: '🚀', title: 'Your first task in 3 steps', time: '1 min', body: md('1. Open **Tasks** and tap an agent (Scout for research, Quill for writing, Atlas for planning).\n2. Write what you want, or tap a **template** and fill in the [brackets].\n3. Press **Send**. Watch the live timeline — then open the result and any files.\n\nNot quite right? Tap **Follow up** on the result to refine it, like talking to a colleague.') },
    { id: 'prompts', icon: '✍️', title: 'Writing great prompts', time: '2 min', body: md('Use **G-C-F-D**: Goal, Context, Format, Done when.\n\n**Weak:** “laptops”\n\n**Strong:** “**Find** 3 laptops under $600 (**goal**) for a college student who writes essays and watches videos (**context**). Give me a **table** of price, battery life and weight (**format**), then pick one in two sentences — **done when** I can decide in 2 minutes.”\n\nTips:\n- Paste links or text the agent should use\n- Say who it is for and the tone you want\n- Ask it to **save it as a file** for longer work\n- Stuck? Tap **✨ Improve my prompt** — it rewrites your idea for you') },
    { id: 'flows', icon: '🔗', title: 'Workflows: agents as a team', time: '2 min', body: md('A workflow is a list of steps. Each step names an **agent** and its **instructions**. When you press **Run**, step 1 starts; its result is passed to step 2, and so on.\n\nTry the built-in **Research → Brief**: Scout researches, Quill writes it up.\n\nTo build your own: **Flows → + New workflow**, add steps, and give it a default input (the topic or goal). Good workflows have 2–4 small steps, each with one clear job.') },
    { id: 'memory', icon: '🧠', title: 'Memory: agents that know you', time: '1 min', body: md('Before every task, agents read what they remember about you. They save new facts as they work — your preferences, decisions, results.\n\n- Teach them directly: **Brain → Memory → Tell them something**, or send a task like “Remember that I prefer short answers.”\n- **All agents** memories are shared; others belong to one agent.\n- You are in control: remove anything with ✕.\n\nNever share passwords or card numbers — agents are told not to store secrets, but don\'t give them any.') },
    { id: 'skills', icon: '🎓', title: 'Skills: teach once, reuse forever', time: '2 min', body: md('A **skill** is a saved playbook — steps, format and checks for a kind of task.\n\n- Ask an agent: *“Learn a skill called weekly-newsletter: …”* (try the 🎓 template)\n- Agents also save skills on their own after tasks you\'re likely to repeat\n- Or write one yourself: **Brain → Skills → Teach a skill**\n\nNext time a task fits, the agent loads the skill first — so results get more consistent over time.') },
    { id: 'free-models', icon: '🆓', title: 'Free & open-source AI models', time: '3 min', body: md('Agents don\'t have to use a paid model. Each agent can run on a different "brain":\n\n- **Ollama: 100% free and private.** Runs open models (Qwen, Llama, Mistral, Gemma, DeepSeek…) on your own computer. Install from **ollama.com**, then run `ollama pull qwen3:8b`. The station finds it automatically.\n- **OpenRouter: free hosted models.** Make a free key at openrouter.ai; models ending in **:free** cost nothing (with rate limits).\n- **Groq: very fast, free tier.** Free key at console.groq.com.\n- **LM Studio / vLLM / llama.cpp:** any OpenAI-compatible server works.\n- **Claude:** paid, but the strongest at long multi-step work.\n\n**Tips:** pick models that support **tools** (qwen3, llama3.1, mistral-small). Small local models are great for drafts and simple lookups; give hard research to bigger models. Switch on the **Step-by-step thinking** connector to help small models plan.\n\nChange models in **Brain → Connect**, or per agent by tapping it on the Station tab.') },
    { id: 'connectors', icon: '🧰', title: 'Connectors & plugins', time: '2 min', body: md('**Connectors** plug apps into your agents using **MCP**, an open standard. Switch one on in **Brain → Connect** and every agent can use its tools:\n\n- 🌐 **Web browser**: clicks around real websites\n- 🗂️ **Files**, 🕸️ **Knowledge graph**, 🕒 **Time**, 📰 **Web page reader**\n- 🐙 **GitHub** and 📒 **Notion** (need a token from your account)\n- 🔗 **Add by URL**: any remote MCP server\n\n**Plugins** are tiny built-in tools (calculator, weather, Wikipedia). Developers can add one by dropping a file into `server/plugins/`.\n\nOnly connect services you trust, and give tokens the least access they need.') },
    { id: 'connect', icon: '🔌', title: 'Connect real agents', time: '5 min', body: md('Demo mode is pretend. To make your agents do real work:\n\n1. Choose a brain: install **Ollama** (free, ollama.com) and run `ollama pull qwen3:8b`, **or** get a Claude key at console.anthropic.com, **or** a free OpenRouter/Groq key.\n2. On a computer with Node.js 18+, open the `agent-station/server` folder and run:\n```\nnpm install\nnpm start\n```\n(For Claude: `ANTHROPIC_API_KEY=your-key npm start`. For OpenRouter: `OPENROUTER_API_KEY=… npm start`.)\n3. Open the address it prints (on your phone, use the computer\'s Wi-Fi IP, e.g. `http://192.168.1.20:8787`).\n4. The app connects automatically. Install it: **Share → Add to Home Screen**.\n\nRunning it somewhere public? Set `STATION_TOKEN` and enter the same token in ⚙️ Settings.') },
    { id: 'safety', icon: '🛡️', title: 'Safety & costs', time: '1 min', body: md('- **Costs:** Ollama and other free models cost nothing. Claude tasks use tokens billed to your API key. The Spend tile shows an estimate. Research tasks cost more than short writing tasks.\n- **Check facts:** agents cite sources — open the links for anything important.\n- **Privacy:** don\'t paste passwords, card numbers or other people\'s private data.\n- **Stay in charge:** agents only write files inside the station; they can\'t send emails or buy things.') },
  ];

  /* ============================================================= sheets */
  function agentSheet(a) {
    const st = S.stations.find((s) => s.id === a.station);
    const tasks = S.tasks.filter((t) => t.agent === a.id).slice(0, 5);
    const mems = S.memories.filter((m) => m.agent === a.id).slice(0, 5);
    const skills = S.skills.filter((s) => s.author === a.id);
    return `
      <div class="agent static">${avatar(a)}<div><h3>${esc(a.name)}</h3><p class="muted">${esc(a.role)} · ${esc(st ? st.name : a.station)}</p></div>${pill(a.status)}</div>
      <div class="card" style="margin-top:14px"><div class="muted tiny">Right now</div><div style="margin-top:4px">${esc(a.task || '—')}</div>${bar(a.status === 'running' ? a.progress : 0)}</div>
      <div class="kv">
        <div><span>Tasks done</span><b>${S.tasks.filter((t) => t.agent === a.id && t.status === 'done').length}</b></div>
        <div><span>Spend</span><b>$${(a.cost || 0).toFixed(2)}</b></div>
        <div><span>Skills learned</span><b>${skills.length}</b></div>
        <div><span>Memories</span><b>${S.memories.filter((m) => m.agent === a.id).length}</b></div>
      </div>
      <label class="field">🧠 AI model<select data-change="agent-model" data-id="${esc(a.id)}">${modelOptions(a.modelChosen, true)}</select></label>
      <button class="btn" data-act="task-for" data-id="${esc(a.id)}">Give ${esc(a.name)} a task</button>
      ${a.instructions ? `<h2>How ${esc(a.name)} works</h2><div class="card"><p class="muted">${esc(a.instructions)}</p></div>` : ''}
      <h2>Recent tasks</h2>
      <div class="list">${tasks.map((t) => `<button class="card taskcard" data-act="task" data-id="${esc(t.id)}"><div class="wf-head"><span class="grow">${esc(t.title || t.prompt.slice(0, 70))}</span>${pill(t.status)}</div></button>`).join('') || empty('No tasks yet')}</div>
      ${mems.length ? `<h2>What ${esc(a.name)} remembers</h2><div class="card">${md(mems.map((m) => '- ' + m.fact).join('\n'))}</div>` : ''}`;
  }

  function taskSheet(t) {
    const a = agentById(t.agent) || { id: t.agent, name: t.agent };
    return `
      <div class="wf-head">${avatar(a)}<div class="grow"><h3>${esc(a.name)}</h3><p class="muted">${esc(t.title || 'Task')} · ${ago(t.createdAt)}</p></div>${pill(t.status)}</div>
      <h2>Your prompt</h2><div class="card"><p class="prewrap">${esc(t.prompt)}</p></div>
      <h2>Timeline</h2>
      <div class="card"><ol class="timeline">${(t.log || []).map((l) => `<li><span class="mono muted">${clock(l.ts)}</span> ${esc(l.msg)}</li>`).join('') || `<li class="muted">${t.status === 'queued' ? 'Waiting for the agent to finish its current task…' : 'Starting…'}</li>`}${t.status === 'running' ? '<li class="pulse-dot">working…</li>' : ''}</ol></div>
      ${t.result ? `<h2>${t.status === 'error' ? 'What went wrong' : 'Result'}</h2><div class="card ${t.status === 'error' ? 'err' : ''}">${md(t.result)}</div>` : ''}
      ${t.files?.length ? `<h2>Files</h2><div class="list">${t.files.map((f) => `<button class="card file" data-act="file" data-id="${esc(f)}"><span class="emo">📄</span><b class="grow">${esc(f)}</b><span class="muted">open ›</span></button>`).join('')}</div>` : ''}
      ${t.status === 'done' || t.status === 'error' ? `<div class="row" style="margin-top:16px"><button class="btn" data-act="follow-up" data-id="${esc(t.id)}">↩ Follow up</button><button class="btn ghost" data-act="teach" data-id="${esc(t.id)}">🎓 Save as skill</button></div>` : ''}
      ${t.tokens ? `<p class="muted tiny center" style="margin-top:14px">${fmtNum(t.tokens)} tokens · ~$${(t.cost || 0).toFixed(3)}${S.mode === 'demo' ? ' (pretend)' : ''}</p>` : ''}`;
  }

  function skillSheet(s) {
    return `<h3>🎓 ${esc(s.name)}</h3><p class="muted">${esc(s.description || '')}</p>
      <h2>Playbook</h2><div class="card">${md(s.instructions)}</div>
      <p class="muted tiny">Author: ${esc(s.author === 'you' ? 'you' : agentName(s.author))} · used ${s.uses || 0}×</p>
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-act="edit-skill" data-id="${esc(s.id)}">✏️ Edit</button><button class="btn danger" data-act="del-skill" data-id="${esc(s.id)}">Delete</button></div>`;
  }

  const agentOptions = (sel, withAll) => (withAll ? `<option value="">🌐 All agents</option>` : '') + S.agents.map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} — ${esc(a.role)}</option>`).join('');

  function builderSheet() {
    const b = ui.builder;
    return `<form data-form="flow">
      <h3>New workflow</h3><p class="muted">Steps run in order. Each step gets the results of the steps before it.</p>
      <label class="field">Name<input name="name" required maxlength="80" value="${esc(b.name)}" placeholder="e.g. Weekly newsletter"></label>
      <label class="field">What it does (optional)<input name="description" maxlength="300" value="${esc(b.description)}" placeholder="Scout finds news, Quill writes the newsletter"></label>
      <label class="field">Default input<input name="input" value="${esc(b.input)}" placeholder="e.g. AI news for small businesses"></label>
      ${b.steps.map((s, i) => `<div class="card stepedit">
        <div class="wf-head"><b class="grow">Step ${i + 1}</b>${b.steps.length > 1 ? `<button type="button" class="icon-btn" data-act="rm-step" data-id="${i}" aria-label="Remove step">✕</button>` : ''}</div>
        <label class="field">Step name<input data-step="${i}" data-k="name" value="${esc(s.name)}" placeholder="e.g. Find this week's news"></label>
        <label class="field">Agent<select data-step="${i}" data-k="agent">${agentOptions(s.agent)}</select></label>
        <label class="field">Instructions<textarea rows="3" data-step="${i}" data-k="instructions" placeholder="What should this agent do with the input?">${esc(s.instructions)}</textarea></label>
      </div>`).join('')}
      <button type="button" class="btn ghost" data-act="add-step" style="margin:10px 0">+ Add step</button>
      <button class="btn" type="submit">Save workflow</button>
    </form>`;
  }

  function settingsSheet() {
    return `<form data-form="settings">
      <h3>⚙️ Connection</h3>
      <p class="muted">${S.mode === 'demo' ? 'Now: <b>demo mode</b> (simulated).' : `Now: connected${lastOk ? ', last update ' + clock(lastOk) : ''}.`} ${lastErr ? `<span class="s-error">Error: ${esc(lastErr)}</span>` : ''}</p>
      <label class="field">Mode<select name="source"><option value="demo" ${!isServer() ? 'selected' : ''}>Demo (pretend agents, no setup)</option><option value="server" ${isServer() ? 'selected' : ''}>My station server (real agents)</option></select></label>
      <label class="field">Server address — leave empty if this page is served by your station<input name="base" type="url" inputmode="url" placeholder="http://192.168.1.20:8787" value="${esc(cfg.base)}"></label>
      <label class="field">Station token (only if you set STATION_TOKEN)<input name="token" type="password" autocomplete="off" value="${esc(cfg.token)}"></label>
      <label class="field">Refresh every (seconds)<input name="interval" type="number" min="2" max="60" value="${esc(cfg.interval)}"></label>
      <button class="btn" type="submit">Save &amp; connect</button>
      <p class="muted tiny" style="margin-top:14px">Need a server? See Guide → <b>Connect real agents</b>.</p>
      <button type="button" class="btn ghost" data-act="tour" style="margin-top:6px">▶ Replay the tour</button>
    </form>`;
  }

  function renderSheet() {
    const sh = ui.sheet; if (!sh) return;
    let html = sh.html;
    if (sh.kind === 'agent') { const a = agentById(sh.id); if (!a) return closeSheet(); html = agentSheet(a); }
    if (sh.kind === 'task') { const t = S.tasks.find((x) => x.id === sh.id); if (!t) return closeSheet(); html = taskSheet(t); }
    if (sh.kind === 'skill') { const s = S.skills.find((x) => x.id === sh.id); if (!s) return closeSheet(); html = skillSheet(s); }
    if (sh.kind === 'builder') html = builderSheet();
    if (sh.kind === 'events') html = `<h3>All activity</h3><div class="feed" style="margin-top:12px">${eventsHtml(S.events)}</div>`;
    if (sh._last !== html) { $('#sheetBody').innerHTML = html; sh._last = html; }
  }
  function openSheet(kind, id, html) {
    ui.sheet = { kind, id, html };
    $('#sheet').hidden = false;
    $('.sheet-panel').scrollTop = 0;
    renderSheet();
  }
  function closeSheet() { ui.sheet = null; $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; }

  /* ============================================================ render */
  const regionCache = new Map();
  function render() {
    $('#view').innerHTML = VIEWS[ui.tab]();
    regionCache.clear();
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
    update();
  }
  function update() {
    for (const el of $$('#view [data-region]')) {
      if (el.contains(document.activeElement) && /^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) continue; // don't yank a control the user is using
      const html = REGIONS[el.dataset.region]?.() ?? '';
      if (regionCache.get(el) !== html) { el.innerHTML = html; regionCache.set(el, html); }
    }
    const typing = document.activeElement?.closest?.('#sheetBody form') || (document.activeElement?.tagName === 'SELECT' && document.activeElement.closest('#sheetBody'));
    if (ui.sheet && !typing) renderSheet();
    $('#sourceLabel').textContent = S.mode === 'demo' ? 'Demo mode' : (() => { try { return cfg.base ? new URL(cfg.base).host : location.host; } catch { return 'My station'; } })();
    const badge = $('#liveBadge');
    badge.className = 'live' + (lastErr ? ' error' : S.mode === 'demo' ? ' demo' : '');
    $('#liveText').textContent = lastErr ? 'OFFLINE' : S.mode === 'demo' ? 'DEMO' : 'LIVE';
    const running = S.tasks.filter((t) => t.status === 'running' || t.status === 'queued').length;
    const dot = $('[data-tab=tasks] .badge');
    dot.textContent = running || ''; dot.hidden = !running;
  }
  function go(tab) { ui.tab = tab; store.set('tab', tab); window.scrollTo(0, 0); render(); }

  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show ' + kind;
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = 'toast'), 2600);
  }

  async function act(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); await refresh(); return r; }
    catch (e) { toast(e.message || String(e), 'bad'); }
  }

  function setDraft(text, agent) {
    ui.draft = text; store.set('draft', text);
    if (agent && agentById(agent)) { ui.draftAgent = agent; store.set('draftAgent', agent); }
    if (ui.tab !== 'tasks') go('tasks'); else render();
    const ta = $('#draft');
    if (ta) {
      ta.focus();
      const m = text.match(/\[[^\]]+\]/); // jump to the first blank
      if (m) ta.setSelectionRange(m.index, m.index + m[0].length); else ta.setSelectionRange(text.length, text.length);
    }
  }

  /* ============================================================ actions */
  const ACTIONS = {
    'go-tasks': () => go('tasks'),
    agent: (id) => openSheet('agent', id),
    task: (id) => openSheet('task', id),
    skill: (id) => openSheet('skill', id),
    station: (id) => { ui.stationFilter = id; if (ui.tab !== 'station') go('station'); else update(); },
    'all-events': () => openSheet('events'),
    'brain-tab': (id) => { ui.brain = id; render(); },
    'pick-agent': (id) => { ui.draftAgent = id; store.set('draftAgent', id); update(); },
    'task-for': (id) => { closeSheet(); setDraft(ui.draft, id); },
    template: (i) => { const t = TEMPLATES[+i]; setDraft(t.prompt, t.agent); toast('Template added — replace the [brackets]'); },
    lesson: (id) => { go('guide'); const el = $('#lesson-' + id); if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    async improve() {
      const text = ($('#draft')?.value || '').trim();
      if (!text) return toast('Write a rough idea first — even a few words', 'bad');
      const btn = $('[data-act=improve]'); btn.disabled = true; btn.textContent = '✨ Improving…';
      try {
        const r = await call('POST', 'improve-prompt', { prompt: text, agent: ui.draftAgent });
        setDraft(r.prompt);
        toast('Improved! Review it, fill any [brackets], then send');
      } catch (e) { toast(e.message, 'bad'); }
      finally { const b = $('[data-act=improve]'); if (b) { b.disabled = false; b.textContent = '✨ Improve my prompt'; } }
    },
    'follow-up': (id) => {
      const t = S.tasks.find((x) => x.id === id); if (!t) return;
      closeSheet();
      setDraft(`Follow-up on my earlier request:\n"${t.prompt.slice(0, 400)}"\n\nYour previous answer:\n${(t.result || '').slice(0, 1500)}\n\nNow please: [what to change or do next]`, t.agent);
    },
    teach: (id) => {
      const t = id && S.tasks.find((x) => x.id === id);
      openSheet('form', null, skillForm(t ? { name: '', description: `Tasks like: ${t.prompt.slice(0, 80)}`, instructions: `1. ${t.prompt.split('\n')[0]}\n2. [add the steps that made this result good]\n3. Check the result against the request before replying.` } : {}));
    },
    'edit-skill': (id) => { const s = S.skills.find((x) => x.id === id); if (s) openSheet('form', null, skillForm(s)); },
    'del-skill': (id) => { if (confirm('Delete this skill? Agents will stop using it.')) { closeSheet(); act(() => call('DELETE', 'skills/' + encodeURIComponent(id)), 'Skill deleted'); } },
    'add-memory': () => openSheet('form', null, `<form data-form="memory"><h3>🧠 Tell your agents something</h3><p class="muted">A fact they should always know: your name, preferences, business details…</p>
      <label class="field">Memory<textarea name="fact" rows="3" required maxlength="1000" placeholder="e.g. I run a bakery called Sunrise Bakes in Austin. Keep answers short."></textarea></label>
      <label class="field">Who should know it?<select name="agent">${agentOptions('', true)}</select></label>
      <p class="muted tiny">Never add passwords, card numbers or other secrets.</p>
      <button class="btn" type="submit">Remember this</button></form>`),
    'del-memory': (id) => act(() => call('DELETE', 'memories/' + encodeURIComponent(id)), 'Forgotten'),
    async file(name) {
      try {
        const text = await call('GET', 'files/' + encodeURIComponent(name));
        openSheet('form', null, `<div class="wf-head"><h3 class="grow">📄 ${esc(name)}</h3><button class="btn small ghost" data-act="download" data-id="${esc(name)}">Download</button></div><div class="card" style="margin-top:12px">${/\.(md|txt)$/i.test(name) ? md(text) : `<pre class="code">${esc(text)}</pre>`}</div>`);
        ui.sheet.fileText = text;
      } catch (e) { toast(e.message, 'bad'); }
    },
    download: (name) => {
      const blob = new Blob([ui.sheet?.fileText ?? ''], { type: 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    'run-flow': (id) => {
      const w = S.workflows.find((x) => x.id === id); if (!w) return;
      openSheet('form', null, `<form data-form="run" data-id="${esc(id)}"><h3>▶ Run “${esc(w.name)}”</h3><p class="muted">${esc(w.description || '')}</p>
        <label class="field">What should this run work on?<textarea name="input" rows="3">${esc(w.input || '')}</textarea></label>
        <ol class="mini-steps">${w.steps.map((s) => `<li><b>${esc(agentName(s.agent))}</b> — ${esc(s.name)}</li>`).join('')}</ol>
        <button class="btn" type="submit">Start workflow</button></form>`);
    },
    'del-flow': (id) => { if (confirm('Delete this workflow?')) act(() => call('DELETE', 'workflows/' + encodeURIComponent(id)), 'Workflow deleted'); },
    'new-flow': () => { ui.builder = { name: '', description: '', input: '', steps: [{ name: '', agent: S.agents[0]?.id, instructions: '' }, { name: '', agent: S.agents[1]?.id || S.agents[0]?.id, instructions: '' }] }; openSheet('builder'); },
    'add-step': () => { syncBuilder(); ui.builder.steps.push({ name: '', agent: S.agents[0]?.id, instructions: '' }); renderSheet(); },
    'rm-step': (i) => { syncBuilder(); ui.builder.steps.splice(+i, 1); renderSheet(); },
    'new-agent': () => openSheet('form', null, `<form data-form="agent"><h3>➕ Add an agent</h3><p class="muted">Give it a name, a job and a few sentences on how to work. Tap a preset to start.</p>
      <div class="chips" style="margin-bottom:12px">${ROLE_PRESETS.map((p, i) => `<button type="button" class="chip" data-act="preset" data-id="${i}">${esc(p.role)}</button>`).join('')}</div>
      <label class="field">Name<input name="name" required maxlength="40" placeholder="e.g. Nova"></label>
      <label class="field">Role<input name="role" maxlength="60" placeholder="e.g. Customer support helper"></label>
      <label class="field">Station<select name="station">${S.stations.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field">How should it work?<textarea name="instructions" rows="4" placeholder="You help me… Always… Never…"></textarea></label>
      <label class="field">AI model<select name="model">${modelOptions('', true)}</select></label>
      <button class="btn" type="submit">Add to station</button></form>`),
    preset: (i) => { const p = ROLE_PRESETS[+i], f = $('#sheetBody form'); f.role.value = p.role; f.instructions.value = p.instructions; if (!f.name.value) f.name.focus(); },
    'refresh-models': () => act(() => call('POST', 'models/refresh'), 'Models refreshed'),
    'conn-enable': (id) => {
      const c = S.connectors.find((x) => x.id === id); if (!c) return;
      if (!c.needs?.length) return act(() => call('POST', `connectors/${encodeURIComponent(id)}/enable`, {}), `Connecting ${c.name}…`);
      openSheet('form', null, `<form data-form="conn" data-id="${esc(id)}"><h3>${c.icon} Connect ${esc(c.name)}</h3><p class="muted">${esc(c.desc)}</p>
        ${c.needs.map((n) => `<label class="field">${esc(n.label)}<input name="${esc(n.key)}" type="password" autocomplete="off" required></label><p class="muted tiny" style="margin:-8px 0 12px">Where to get it: ${esc(n.help || '')}</p>`).join('')}
        <p class="muted tiny">Stored only on your station server (never in this app). Give it the least access it needs.</p>
        <button class="btn" type="submit">Connect</button></form>`);
    },
    'conn-disable': (id) => act(() => call('POST', `connectors/${encodeURIComponent(id)}/disable`), 'Switched off'),
    'conn-retry': (id) => act(() => call('POST', `connectors/${encodeURIComponent(id)}/retry`), 'Retrying…'),
    'conn-tools': (id) => {
      const c = S.connectors.find((x) => x.id === id); if (!c) return;
      openSheet('form', null, `<h3>${c.icon} ${esc(c.name)}: ${c.tools.length} tools</h3><p class="muted">Agents pick these automatically when a task needs them.</p><div class="card">${md(c.tools.map((t) => `- **${t.name}**${t.description ? ': ' + t.description : ''}`).join('\n'))}</div>`);
    },
    'add-remote': () => openSheet('form', null, `<form data-form="remote"><h3>🔗 Add a connector by URL</h3><p class="muted">Any remote MCP server (Streamable HTTP), e.g. one from your favourite app or a self-hosted tool.</p>
      <label class="field">Name<input name="name" required maxlength="40" placeholder="e.g. My CRM"></label>
      <label class="field">Server URL<input name="url" type="url" required placeholder="https://example.com/mcp"></label>
      <label class="field">Access token (optional)<input name="token" type="password" autocomplete="off"></label>
      <p class="muted tiny">Only connect servers you trust: agents will be able to use every tool they offer.</p>
      <button class="btn" type="submit">Add connector</button></form>`),
    'del-remote': (id) => { if (confirm('Remove this connector?')) act(() => call('DELETE', `connectors/remote/${encodeURIComponent(id)}`), 'Removed'); },
    'plugin-toggle': (name) => { const p = S.plugins.find((x) => x.name === name); act(() => call('POST', `plugins/${encodeURIComponent(name)}`, { enabled: !p.enabled }), `${p.label} ${p.enabled ? 'off' : 'on'}`); },
    settings: () => openSheet('form', null, settingsSheet()),
    tour: () => { closeSheet(); startTour(); },
    close: () => closeSheet(),
  };

  function skillForm(s = {}) {
    return `<form data-form="skill"><h3>🎓 Teach a skill</h3><p class="muted">Write a playbook once; any agent will load it when a task fits.</p>
      <label class="field">Skill name<input name="name" required maxlength="80" value="${esc(s.name || '')}" placeholder="e.g. weekly-newsletter"></label>
      <label class="field">When should agents use it?<input name="description" maxlength="300" value="${esc(s.description || '')}" placeholder="e.g. When I ask for my weekly newsletter"></label>
      <label class="field">Steps &amp; rules<textarea name="instructions" rows="7" required placeholder="1. Find 5 news items from this week&#10;2. Write a friendly intro (2 sentences)&#10;3. One short paragraph per item with a link&#10;4. Under 400 words, save as a file">${esc(s.instructions || '')}</textarea></label>
      <button class="btn" type="submit">Save skill</button></form>`;
  }

  function syncBuilder() {
    const f = $('#sheetBody form[data-form=flow]'); if (!f || !ui.builder) return;
    ui.builder.name = f.name.value; ui.builder.description = f.description.value; ui.builder.input = f.input.value;
    $$('[data-step]', f).forEach((el) => { ui.builder.steps[+el.dataset.step][el.dataset.k] = el.value; });
  }

  const FORMS = {
    async task(f) {
      const prompt = f.prompt.value.trim();
      if (!prompt) return toast('Write what you want done first', 'bad');
      if (/\[[^\]]+\]/.test(prompt) && !confirm('Your prompt still has [brackets] to fill in. Send anyway?')) return;
      const t = await act(() => call('POST', 'tasks', { agent: ui.draftAgent, prompt }), `Sent to ${agentName(ui.draftAgent)} 🚀`);
      if (t) { ui.draft = ''; store.set('draft', ''); f.prompt.value = ''; $('#coach').innerHTML = coachHtml(''); openSheet('task', t.id); }
    },
    async flow() {
      syncBuilder();
      const b = ui.builder;
      if (!b.steps.every((s) => s.agent && s.instructions.trim())) return toast('Every step needs an agent and instructions', 'bad');
      const ok = await act(() => call('POST', 'workflows', { ...b, steps: b.steps.map((s, i) => ({ ...s, name: s.name || `Step ${i + 1}` })) }), 'Workflow saved');
      if (ok) { closeSheet(); go('flows'); }
    },
    async run(f) {
      const ok = await act(() => call('POST', `workflows/${encodeURIComponent(f.dataset.id)}/run`, { input: f.input.value }), 'Workflow started ▶');
      if (ok) { closeSheet(); if (ui.tab !== 'flows') go('flows'); }
    },
    async agent(f) {
      const ok = await act(() => call('POST', 'agents', { name: f.name.value.trim(), role: f.role.value.trim(), station: f.station.value, instructions: f.instructions.value.trim(), model: f.model.value }), 'Agent added 🎉');
      if (ok) closeSheet();
    },
    async skill(f) {
      const ok = await act(() => call('POST', 'skills', { name: f.name.value.trim(), description: f.description.value.trim(), instructions: f.instructions.value.trim() }), 'Skill saved 🎓');
      if (ok) { closeSheet(); ui.brain = 'skills'; go('brain'); }
    },
    async memory(f) {
      const ok = await act(() => call('POST', 'memories', { fact: f.fact.value.trim(), agent: f.agent.value || null }), 'Remembered 🧠');
      if (ok) closeSheet();
    },
    async conn(f) {
      const id = f.dataset.id, secrets = {};
      $$('input', f).forEach((i) => { secrets[i.name] = i.value.trim(); });
      const ok = await act(() => call('POST', `connectors/${encodeURIComponent(id)}/enable`, { secrets }), 'Connecting…');
      if (ok) closeSheet();
    },
    async remote(f) {
      const ok = await act(() => call('POST', 'connectors/remote', { name: f.name.value.trim(), url: f.url.value.trim(), token: f.token.value.trim() }), 'Connector added');
      if (ok) closeSheet();
    },
    async settings(f) {
      Object.assign(cfg, { source: f.source.value, base: f.base.value.trim(), token: f.token.value, interval: +f.interval.value || 3 });
      store.set('cfg', cfg);
      document.activeElement?.blur();
      lastErr = '';
      await refresh();
      if (isServer() && lastErr) toast(`Couldn't connect: ${lastErr}`, 'bad');
      else { toast(isServer() ? 'Connected to your station ✅' : 'Demo mode on'); closeSheet(); }
      schedule();
    },
  };

  /* ============================================================== tour */
  const TOUR = [
    { title: 'Welcome to Agent Station 👋', text: 'This is mission control for your AI team. In about a minute you will know how to give agents real work, run team workflows, and teach them things.' },
    { tab: 'station', target: '#statsRow', title: 'Live numbers', text: 'How many agents are working, tasks finished, what they have learned, and spend — updated live.' },
    { tab: 'station', target: '.orbit', title: 'The station map', text: 'Stations in the middle, agents around them. Moving lines and a green ring mean an agent is working. Tap any agent to look inside.' },
    { tab: 'station', target: '[data-region=agents] .agent', title: 'Your agents', text: 'Each agent has a job. Scout researches the web, Quill writes, Atlas plans. You can add your own with “+ Add agent”.' },
    { tab: 'tasks', target: '#composer', title: 'Give a task', text: 'Pick an agent, describe what you want, press Send. You will see every step it takes, then the result and any files it saved.' },
    { tab: 'tasks', target: '#templates', title: 'Templates', text: 'Not sure what to write? Tap a template, then replace the [brackets] with your details.' },
    { tab: 'tasks', target: '#coach', title: 'Prompt coach', text: 'Lights up as your prompt gets clearer: Goal, Context, Format, Done when. “✨ Improve my prompt” rewrites a rough idea for you.' },
    { tab: 'flows', target: '#flowList .card', title: 'Workflows', text: 'Teams of agents working in order — each step hands its result to the next. Press Run to try one, or build your own.' },
    { tab: 'brain', target: '#brainTabs', title: 'The Brain', text: 'Skills = playbooks agents learned. Memory = what they know about you. Files = their deliverables. Connect = choose AI models (free ones too), connectors and plugins.' },
    { tab: 'guide', target: '#lessons', title: 'Lessons', text: 'Short lessons for every feature, including how to connect real agents. You can replay this tour from here anytime.' },
    { title: 'You are ready! 🚀', text: 'Try your first task now — pick a template, fill in the blanks, and send it.', cta: 'Give my first task' },
  ];
  let tourIdx = -1;
  function startTour() { tourIdx = 0; showTour(); }
  function endTour() { tourIdx = -1; $('#tour')?.remove(); store.set('toured', true); }
  function showTour() {
    const step = TOUR[tourIdx];
    if (!step) return endTour();
    if (step.tab && ui.tab !== step.tab) go(step.tab);
    let el = $('#tour');
    if (!el) {
      el = document.createElement('div'); el.id = 'tour';
      el.innerHTML = '<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-live="polite"></div>';
      document.body.appendChild(el);
    }
    const target = step.target && $(step.target);
    if (target) target.scrollIntoView({ block: 'center' });
    el.querySelector('.tour-card').innerHTML = `
      <div class="muted tiny">Step ${tourIdx + 1} of ${TOUR.length}</div>
      <h3>${step.title}</h3><p>${step.text}</p>
      <div class="row"><button class="btn ghost" data-tour="skip">${tourIdx === TOUR.length - 1 ? 'Close' : 'Skip'}</button>
      ${tourIdx ? '<button class="btn ghost narrow" data-tour="back">‹</button>' : ''}
      <button class="btn" data-tour="next">${step.cta || (tourIdx === TOUR.length - 1 ? 'Done' : 'Next ›')}</button></div>`;
    requestAnimationFrame(() => placeTour(target));
  }
  function placeTour(target) {
    const el = $('#tour'); if (!el) return;
    const hole = el.querySelector('.tour-hole'), card = el.querySelector('.tour-card');
    if (!target) { hole.style.cssText = 'left:50%;top:40%;width:0;height:0'; card.style.cssText = 'top:50%;transform:translateY(-50%)'; return; }
    const r = target.getBoundingClientRect(), pad = 8;
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const ch = card.offsetHeight, gap = 16;
    if (innerHeight - r.bottom >= ch + gap * 2) card.style.cssText = `top:${r.bottom + gap}px`;
    else if (r.top >= ch + gap * 2) card.style.cssText = `top:${r.top - gap - ch}px`;
    else card.style.cssText = `top:${innerHeight - ch - gap}px`; // tall target: dock the card at the bottom
  }

  /* ============================================================ events */
  document.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tour]');
    if (tb) {
      const k = tb.dataset.tour;
      if (k === 'skip') return endTour();
      if (k === 'back') { tourIdx--; return showTour(); }
      if (TOUR[tourIdx].cta) { endTour(); return ACTIONS.template(0); }
      tourIdx++; return showTour();
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) return go(tab.dataset.tab);
    if (e.target.closest('[data-close]')) return closeSheet();
    const a = e.target.closest('[data-act]');
    if (a && ACTIONS[a.dataset.act]) { e.preventDefault(); ACTIONS[a.dataset.act](a.dataset.id); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    FORMS[f.dataset.form]?.(f);
  });
  document.addEventListener('change', (e) => {
    const k = e.target.dataset?.change;
    if (k === 'default-model') act(() => call('PATCH', 'settings', { defaultModel: e.target.value }), 'Default model updated');
    if (k === 'agent-model') act(() => call('PATCH', `agents/${encodeURIComponent(e.target.dataset.id)}`, { model: e.target.value }), 'Model updated');
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'draft') { ui.draft = e.target.value; store.set('draft', ui.draft); $('#coach').innerHTML = coachHtml(ui.draft); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (tourIdx >= 0) endTour(); else closeSheet(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.id === 'draft') $('#composer').requestSubmit();
  });
  addEventListener('resize', () => { if (tourIdx >= 0) placeTour(TOUR[tourIdx].target && $(TOUR[tourIdx].target)); });
  addEventListener('scroll', () => { if (tourIdx >= 0) placeTour(TOUR[tourIdx].target && $(TOUR[tourIdx].target)); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  /* ========================================================= starfield */
  (function stars() {
    const c = $('#stars'), x = c.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pts = [];
    const size = () => {
      c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
      pts = Array.from({ length: 110 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, r: Math.random() * 1.3 + 0.2, s: Math.random() * 0.25 + 0.05 }));
    };
    const draw = () => {
      x.clearRect(0, 0, c.width, c.height);
      const g = x.createRadialGradient(c.width * 0.8, 0, 0, c.width * 0.8, 0, c.width);
      g.addColorStop(0, 'rgba(155,123,255,.14)'); g.addColorStop(1, 'transparent');
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#cfe6ff';
      pts.forEach((p) => { if (!reduce) { p.y += p.s; if (p.y > c.height) p.y = 0; } x.globalAlpha = 0.3 + p.r / 2; x.beginPath(); x.arc(p.x, p.y, p.r * devicePixelRatio, 0, 7); x.fill(); });
      x.globalAlpha = 1;
      if (!reduce) requestAnimationFrame(draw);
    };
    addEventListener('resize', () => { size(); if (reduce) draw(); });
    size(); draw();
  })();

  /* ============================================================== boot */
  (async function boot() {
    // First visit: if this page is served by a station server, connect to it automatically.
    if (!cfg.source) {
      cfg.source = 'demo';
      if (location.protocol.startsWith('http')) {
        try {
          const r = await fetch('api/status', { cache: 'no-store' });
          if (r.ok || r.status === 401) { cfg.source = 'server'; if (r.status === 401) setTimeout(() => { toast('Your station needs a token — enter it in Settings', 'bad'); ACTIONS.settings(); }, 600); }
        } catch { /* static hosting: stay in demo */ }
      }
      store.set('cfg', cfg);
    }
    if (!VIEWS[ui.tab]) ui.tab = 'station';
    render();
    schedule();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!store.get('toured', false)) setTimeout(startTour, 700);
  })();
})();
