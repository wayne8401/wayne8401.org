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
    { id: 'echo', name: 'Echo', role: 'Social media manager', station: 'studio', instructions: 'You plan and write social media posts: hooks, captions, hashtags and a posting schedule.' },
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
    { name: 'plugin_store_profit', label: 'Store profit', icon: '💵', description: 'Profit and margin from a selling price and a base cost.', enabled: true },
    { name: 'plugin_drop_countdown', label: 'Drop countdown', icon: '⏳', description: 'Days and hours left until a drop date.', enabled: true },
    { name: 'plugin_current_time', label: 'Current time', icon: '🕒', description: "Today's date and time in America/Chicago.", enabled: true },
    { name: 'plugin_best_time_to_post', label: 'Best time to post', icon: '📅', description: 'Best posting windows for TikTok, Instagram and Facebook.', enabled: true },
  ];

  /* ===================================================== demo simulator */
  // A pretend station that behaves like the real server, so beginners can
  // explore tasks, workflows, memory and skills without an API key.
  const demo = (() => {
    const d = {
      stations: STATIONS.map((s) => ({ ...s })),
      agents: AGENTS.map((a) => ({ ...a, model: '' })),
      approvals: [{ id: 'ap-demo', agent: 'echo', platform: 'Instagram', text: 'Sample post: new tees are almost here! Which color should drop first? 👇 #smallbusiness', note: 'Demo item. Real posts show up here when an agent proposes one.', status: 'pending', createdAt: Date.now() }],
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
      if (task.voice) {
        const said = task.prompt.split('The user now says: ').pop();
        task.result = `This is demo mode, so I'm pretending. You said: "${said.slice(0, 120)}". With a real model connected, I'd actually work on that and answer you out loud in a few short sentences.`;
        task.status = 'done'; task.finishedAt = now(); ev('success', agent.id, 'Answered by voice'); waiters[task.id]?.(task); return;
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
        models: DEMO_MODELS, providers: DEMO_PROVIDERS, connectors: d.connectors, plugins: d.plugins, voices: [], clone: { available: false }, studio: { available: false, voices: [] },
        stations: d.stations, approvals: d.approvals,
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
      ['POST', /^tasks$/, (_, b) => createTask(b.agent, b.prompt, { ...(b.voice ? { voice: true } : {}), ...(b.title ? { title: b.title } : {}) })],
      ['POST', /^improve-prompt$/, (_, b) => ({ prompt: improve(b.prompt || '') })],
      ['POST', /^approvals\/(.+)$/, ([id], b) => { const it = d.approvals.find((x) => x.id === id); if (!it) return {}; if (b.text) it.text = b.text; if (b.decision === 'approve') it.status = 'approved'; if (b.decision === 'reject') it.status = 'rejected'; if (b.decision === 'posted') it.status = 'posted'; return it; }],
      ['DELETE', /^approvals\/(.+)$/, ([id]) => { d.approvals = d.approvals.filter((x) => x.id !== id); return { ok: true }; }],
      ['POST', /^stations$/, (_, b) => { const name = String(b.name || '').trim().slice(0, 30) || 'Room'; const st = { id: slug(name) + '-' + Math.random().toString(36).slice(2, 5), name, custom: true }; d.stations.push(st); return st; }],
      ['DELETE', /^stations\/(.+)$/, ([id]) => { d.stations = d.stations.filter((x) => x.id !== id || !x.custom); return { ok: true }; }],
      ['POST', /^workflows$/, (_, b) => { const wf = { id: uid('wf'), trigger: 'manual', ...b }; d.workflows.push(wf); return wf; }],
      ['DELETE', /^workflows\/(.+)$/, ([id]) => { d.workflows = d.workflows.filter((w) => w.id !== id); return { ok: true }; }],
      ['POST', /^workflows\/(.+)\/run$/, ([id], b) => runWorkflow(d.workflows.find((w) => w.id === id), b.input)],
      ['POST', /^agents$/, (_, b) => { let id = slug(b.name); if (d.agents.some((a) => a.id === id)) id += '-' + Math.random().toString(36).slice(2, 5); const a = { id, name: b.name, role: b.role || 'Assistant', station: b.station || 'research', instructions: b.instructions || '', avatar: b.avatar || '', voiceId: '', model: b.model || '', look: window.AgentStationCharacters?.cleanLook(b.look) || null, pitch: b.pitch || null, traits: b.traits || null }; d.agents.push(a); ev('success', id, `${a.name} joined the station`); return a; }],
      ['POST', /^skills$/, (_, b) => { const s = { id: slug(b.name), name: b.name, description: b.description, instructions: b.instructions, author: 'you', uses: 0, updatedAt: now() }; d.skills = [s, ...d.skills.filter((k) => k.id !== s.id)]; ev('success', null, `You taught the station skill “${s.name}”`); return s; }],
      ['DELETE', /^skills\/(.+)$/, ([id]) => { d.skills = d.skills.filter((s) => s.id !== id); return { ok: true }; }],
      ['POST', /^memories$/, (_, b) => { const m = { id: uid('mem'), ts: now(), agent: b.agent || null, scope: b.agent ? 'agent' : 'shared', fact: b.fact, source: 'you' }; d.memories.unshift(m); return m; }],
      ['DELETE', /^memories\/(.+)$/, ([id]) => { d.memories = d.memories.filter((m) => m.id !== id); return { ok: true }; }],
      ['PATCH', /^agents\/(.+)$/, ([id], b) => { const a = d.agents.find((x) => x.id === id); if ('avatar' in b) a.avatar = b.avatar; if ('look' in b) a.look = window.AgentStationCharacters?.cleanLook(b.look) || null; for (const k of ['pitch', 'traits', 'name', 'role', 'instructions', 'station']) if (k in b && b[k] !== '') a[k] = b[k]; if ('model' in b) { a.model = b.model; ev('info', id, `${a.name} now uses ${b.model || d.defaultModel}`); } return a; }],
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
  const isPhone = () => cfg.source === 'phone';
  const engine = window.AgentStationEngine;
  const apiUrl = (p) => { const b = (cfg.base || '').trim().replace(/\/+$/, ''); return (b ? b + '/' : '') + 'api/' + p; };

  async function call(method, p, body) {
    if (isPhone() && engine) return engine.handle(method, p, body);
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
  const EMPTY = { approvals: [], stations: [], agents: [], workflows: [], tasks: [], skills: [], memories: [], events: [], files: [], models: [], providers: [], connectors: [], plugins: [], voices: [], clone: {}, studio: { voices: [] }, mode: 'demo' };
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
    timer = setInterval(() => { if (!document.hidden || (isPhone() && S.tasks.some((t) => t.status === 'running'))) refresh(); }, isServer() ? Math.max(2, +cfg.interval || 3) * 1000 : 1000);
    refresh();
  }

  /* ============================================================ models */
  const PROV_NAME = { anthropic: 'Claude', ollama: 'Ollama · local', openrouter: 'OpenRouter', groq: 'Groq', custom: 'Custom', device: 'On this phone', openai: 'OpenAI', gemini: 'Google Gemini', xai: 'xAI Grok', mistral: 'Mistral', deepseek: 'DeepSeek', perplexity: 'Perplexity' };
  const modelInfo = (id) => S.models.find((m) => m.id === id);
  function shortModel(id) {
    if (!id) return '—';
    const m = modelInfo(id);
    const label = m?.label || id.slice(id.indexOf(':') + 1);
    return label.replace(/\s*\((local|free|Groq|custom|on this phone|OpenAI|Gemini|Grok|Mistral|DeepSeek|Perplexity)\)$/i, '');
  }
  const isChatOnly = (id) => modelInfo(id)?.tools === false;
  const isFree = (id) => (modelInfo(id)?.free ?? !String(id).startsWith('anthropic:'));
  const modelBadge = (id) => `<span class="mbadge ${isFree(id) ? 'free' : ''}">${isFree(id) ? 'FREE · ' : ''}${esc(shortModel(id))}${isChatOnly(id) ? ' · 💬 chat only' : ''}</span>`;
  function modelOptions(selected, withDefault) {
    const groups = {};
    for (const m of S.models) (groups[m.provider] ||= []).push(m);
    let html = withDefault ? `<option value="" ${!selected ? 'selected' : ''}>Station default (${esc(shortModel(S.defaultModel))})</option>` : '';
    for (const [prov, list] of Object.entries(groups)) {
      html += `<optgroup label="${esc(PROV_NAME[prov] || prov)}${list[0].free ? ' (free)' : ''}">${list.map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.label)}${m.tools === false ? ' · 💬 chat only' : ' · 🛠'}</option>`).join('')}</optgroup>`;
    }
    if (selected && !modelInfo(selected)) html += `<option value="${esc(selected)}" selected>${esc(selected)} (not available now)</option>`;
    return html || '<option value="">No models found. See Brain → Connect</option>';
  }

  /* ========================================================= components */
  const pill = (s) => `<span class="pill s-${esc(s)}">${esc(s)}</span>`;
  const CH = window.AgentStationCharacters || { CHARACTERS: [], LOOKS: {}, avatarSvg: () => '', byId: () => null };
  const lookOf = (a) => (a?.look && CH.cleanLook(a.look)) || CH.LOOKS[a?.avatar] || CH.byId(a?.avatar)?.look || CH.LOOKS[a?.id] || null;
  const avatar = (a, size = '', { bare = false, alive = false, speaking = false, full, mode, cls = '' } = {}) => {
    const look = lookOf(a);
    return look ? `<span class="avatar art ${size}${bare ? ' bare' : ''}${alive ? ' alive' : ''}${speaking ? ' speaking' : ''} ${cls}">${CH.avatarSvg(look, esc(a.name || ''), { full: full ?? !/\b(sm|xs)\b/.test(size), bare, mode })}</span>`
      : `<span class="avatar ${size}" style="background:${colorOf(a.id)}">${esc((a.name || '?').slice(0, 1))}</span>`;
  };
  const charAvatar = (c, size = '') => `<span class="avatar art ${size}">${CH.avatarSvg(c.look, esc(c.name), { full: !/\b(sm|xs)\b/.test(size) })}</span>`;
  const bar = (pct) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct || 0))}%"></i></div>`;
  const empty = (msg, cta = '') => `<div class="empty">${msg}${cta}</div>`;

  /* ------------------------------------------------ factory floor + approvals */
  let FLOOR_COLS = 2; // stations per row: 2 on phones, 3 on wider screens (updated on each render)
  const floorLayout = () => store.get('floor', {});
  function floorPos(sts) {
    const L = floorLayout(), taken = new Set(), pos = {};
    sts.forEach((st) => { const p = L[st.id]; if (p && p.c < FLOOR_COLS && !taken.has(p.c + ',' + p.r)) { pos[st.id] = p; taken.add(p.c + ',' + p.r); } });
    sts.forEach((st) => { if (pos[st.id]) return; let i = 0; for (;; i++) { const c = i % FLOOR_COLS, r = Math.floor(i / FLOOR_COLS); if (!taken.has(c + ',' + r)) { pos[st.id] = { c, r }; taken.add(c + ',' + r); break; } } });
    return pos;
  }
  // Space sector: each station grows modules as its crew finishes tasks (1 module per 3 tasks, up to level 5).
  const spaceSeen = {}; let spaceReady = false;
  function stationGrowth(id) {
    const crew = new Set(S.agents.filter((a) => a.station === id).map((a) => a.id));
    const done = S.tasks.filter((t) => t.status === 'done' && crew.has(t.agent)).length;
    const level = Math.min(5, 1 + Math.floor(done / 3));
    return { level, done, left: 3 - (done % 3) };
  }
  const STATION_HUES = ['#38e8ff', '#ff7ad9', '#4dffa6', '#ffd84d', '#b9a3ff', '#ff9a4d'];
  function stationSvg(id, level, busy) {
    const hue = STATION_HUES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % STATION_HUES.length];
    const mods = [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0]].slice(0, Math.max(0, level));
    const M = 12; // module spacing
    const modSvg = mods.map(([dx, dy]) => `<rect x="${60 + dx * M * 1.5 - 7}" y="${36 + dy * M - 5}" width="14" height="10" rx="3" fill="#c7cfdc"/><rect x="${60 + dx * M * 1.5 - 4}" y="${36 + dy * M - 2}" width="8" height="4" rx="1" fill="${hue}" opacity="${busy ? 1 : .55}"/>`).join('');
    const truss = mods.map(([dx, dy]) => `<line x1="60" y1="36" x2="${60 + dx * M * 1.5}" y2="${36 + dy * M}" stroke="#6b7690" stroke-width="2"/>`).join('');
    if (!level) return `<svg viewBox="0 0 120 72"><g class="scaffold"><rect x="44" y="24" width="32" height="24" fill="none" stroke="#ffc85a" stroke-width="1.5" stroke-dasharray="3 2"/><path d="M44 24 L76 48 M76 24 L44 48" stroke="#ffc85a" stroke-width="1" opacity=".6"/></g>
      <g class="drone d1"><circle r="3" fill="#c7cfdc"/><circle r="1.2" fill="${hue}"/></g><g class="drone d2"><circle r="3" fill="#c7cfdc"/><circle r="1.2" fill="#ffc85a"/></g></svg>`;
    return `<svg viewBox="0 0 120 72">
      <rect x="6" y="31" width="22" height="10" fill="#1d3a6b" stroke="#3e6bff" stroke-width="1"/><rect x="92" y="31" width="22" height="10" fill="#1d3a6b" stroke="#3e6bff" stroke-width="1"/>
      <path d="M13 31 V41 M20 31 V41 M99 31 V41 M106 31 V41" stroke="#3e6bff" stroke-width=".8"/><line x1="28" y1="36" x2="48" y2="36" stroke="#6b7690" stroke-width="2"/><line x1="72" y1="36" x2="92" y2="36" stroke="#6b7690" stroke-width="2"/>
      ${truss}<ellipse cx="60" cy="36" rx="17" ry="6" fill="none" stroke="#6b7690" stroke-width="2"/>${modSvg}
      <circle cx="60" cy="36" r="9" fill="#e8ecf6"/><circle cx="60" cy="36" r="4" fill="${hue}" class="${busy ? 'blink' : ''}"/>
      <line x1="60" y1="27" x2="60" y2="18" stroke="#c7cfdc" stroke-width="1.4"/><circle cx="60" cy="17" r="2" fill="${busy ? '#4dffa6' : '#ff5c7a'}" class="blink"/></svg>`;
  }
  /* Station interior (top-down deck view). Original art: metal floor, walls, desks, machines and belts. */
  const PROP = {
    dish: `<svg viewBox="0 0 30 30"><circle cx="15" cy="17" r="10" fill="#d9dde6"/><circle cx="15" cy="17" r="10" fill="none" stroke="#8a93a6" stroke-width="1.4"/><circle cx="15" cy="17" r="3" fill="#8a93a6"/><path d="M15 17 L22 8" stroke="#8a93a6" stroke-width="1.6"/><rect x="11" y="26" width="8" height="3" fill="#4a5163"/></svg>`,
    ring: `<svg viewBox="0 0 30 30"><circle cx="15" cy="13" r="9" fill="none" stroke="#fff6e8" stroke-width="3"/><rect x="12.5" y="9" width="5" height="8" rx="1" fill="#0b1022"/><path d="M15 22 V29 M15 25 L10 29 M15 25 L20 29" stroke="#8a93a6" stroke-width="1.4"/></svg>`,
    board: `<svg viewBox="0 0 30 30"><rect x="2" y="4" width="26" height="18" rx="1" fill="#e9edf3" stroke="#8a93a6"/><rect x="5" y="12" width="3" height="7" fill="#3e6bff"/><rect x="10" y="9" width="3" height="10" fill="#3e6bff"/><path d="M16 17 L20 11 L24 14" stroke="#e5484d" stroke-width="1.4" fill="none"/><rect x="13" y="22" width="4" height="6" fill="#4a5163"/></svg>`,
    plant: `<svg viewBox="0 0 20 20"><rect x="6" y="12" width="8" height="7" rx="1" fill="#6b4a32"/><path d="M10 13 C 4 10 4 4 9 2 C 9 6 10 9 10 13 C 10 9 12 5 16 4 C 16 9 13 11 10 13" fill="#3fbf6a"/></svg>`,
    shelf: `<svg viewBox="0 0 30 16"><rect x="1" y="1" width="28" height="14" rx="1" fill="#5a3e2b"/>${[3, 7, 10, 14, 18, 21, 25].map((x, i) => `<rect x="${x}" y="3" width="3" height="10" fill="${['#e5484d', '#3e6bff', '#e9b949', '#4dffa6', '#b9a3ff', '#ff9a4d', '#38e8ff'][i]}"/>`).join('')}</svg>`,
    crate: `<svg viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" rx="1" fill="#8a6a3e"/><path d="M2 2 L18 18 M18 2 L2 18" stroke="#5a4426" stroke-width="1.4"/><rect x="2" y="2" width="16" height="16" rx="1" fill="none" stroke="#5a4426" stroke-width="1.4"/></svg>`,
  };
  const PROP_BY_KIND = { library: ['dish', 'shelf'], writer: ['shelf', 'plant'], planning: ['board', 'crate'], studio: ['ring', 'plant'], office: ['plant', 'crate'] };
  const deskSvg = (on) => `<svg viewBox="0 0 40 34"><circle cx="20" cy="29" r="5" fill="#2b3550"/><rect x="2" y="4" width="36" height="18" rx="2" fill="#6b7690"/><rect x="2" y="4" width="36" height="3" fill="#8a93a6"/><rect x="11" y="7" width="18" height="10" rx="1" fill="#0b1022"/><rect x="13" y="9" width="14" height="6" fill="${on ? '#4dffa6' : '#1d2b45'}" ${on ? 'class="blink"' : ''}/></svg>`;
  const machineSvg = (on) => `<svg viewBox="0 0 64 36"><rect x="2" y="6" width="60" height="26" rx="3" fill="#5c6478"/><rect x="2" y="6" width="60" height="26" rx="3" fill="none" stroke="#e9b949" stroke-width="1.6" stroke-dasharray="4 3"/><rect x="14" y="10" width="36" height="16" rx="2" fill="#2b3142"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${17 + i * 7}" y="13" width="4" height="10" fill="#8a93a6"/>`).join('')}<circle cx="56" cy="11" r="2" fill="${on ? '#4dffa6' : '#e5484d'}" class="blink"/></svg>`;
  function roomHtml(st, p, now) {
    const team = S.agents.filter((a) => a.status !== undefined && a.station === st.id), workers = team.filter((a) => a.status === 'running'), busy = workers.length > 0;
    const born = (spaceSeen[st.id] ??= spaceReady ? now : 0), building = now - born < 6000; // only stations launched while the app is open
    const crew = new Set(team.map((a) => a.id)), mine = S.tasks.filter((t) => crew.has(t.agent));
    const shipped = mine.filter((t) => t.status === 'done').length, failed = mine.filter((t) => t.status === 'error').length, pending = mine.filter((t) => t.status === 'queued' || t.status === 'waiting').length;
    const g = stationGrowth(st.id), kind = sceneKind({ id: '', role: `${st.name} ${st.region || ''}` }), props = PROP_BY_KIND[kind] || PROP_BY_KIND.office;
    const desks = team.slice(0, 4).map((a, i) => {
      const on = a.status === 'running';
      return `<span class="rdesk" style="--i:${i}">${deskSvg(on)}<span class="rplate">${esc(a.name)}<br>${esc((a.role || '').split(/[ &]/)[0])}</span>
        <span class="rbot ${on ? 'atdesk' : 'walk'}" style="--d:${(i * 1.7 + st.id.length) % 6}s;--w:${8 + (i * 13) % 14}px">${avatar(a, 'xs', { bare: true, full: true })}</span></span>`;
    }).join('');
    const extra = Math.max(0, Math.min(3, g.level - 1)); // more machines as the station grows
    return `<div class="ftile room ${busy ? 'busy' : ''} ${building ? 'building' : ''}" data-room="${esc(st.id)}" style="grid-column:${p.c + 1};grid-row:${p.r + 1}">
      <span class="rtitle">${esc(st.name.toUpperCase())}${st.region ? ` · ${esc(String(st.region).toUpperCase())}` : ''}</span>
      <span class="rprops">${props.map((k) => `<span class="rprop ${k}">${PROP[k]}</span>`).join('')}</span>
      <span class="rline"><span class="rmach">${machineSvg(busy)}</span><span class="rbelt ${busy ? 'on' : ''}">${busy ? '<i class="box"></i><i class="box b2"></i>' : ''}</span>${Array.from({ length: extra }, () => `<span class="rmach small">${machineSvg(busy)}</span>`).join('')}</span>
      <span class="rdesks">${desks}${team.length > 4 ? `<span class="rmore">+${team.length - 4}</span>` : ''}</span>
      ${S.mode === 'phone' && S.equipment ? `<span class="requip">${Object.entries(S.equipment).map(([k, e]) => { const on = Array.isArray(st.equipment) ? st.equipment.includes(k) : true; return `<button class="eqbtn ${on ? 'on' : ''}" data-act="equip-toggle" data-id="${esc(st.id)}:${k}" title="${esc(e.label)}: ${esc(e.what)}" aria-label="${esc(e.label)} ${on ? 'installed' : 'not installed'}" aria-pressed="${on}">${e.icon}</button>`; }).join('')}</span>` : ''}
      <span class="rstats">${mine.length} RUNS · ${shipped} SHIPPED · ${failed} FAILED</span>
      ${pending ? `<span class="rpend">${pending} pending</span>` : ''}
      ${building ? '<span class="rbuild">🏗️ UNDER CONSTRUCTION</span>' : ''}
      ${st.custom ? `<button class="fx" data-act="room-del" data-id="${esc(st.id)}" aria-label="Remove station">✕</button>` : ''}</div>`;
  }
  function floorHtml() {
    FLOOR_COLS = typeof innerWidth === 'number' && innerWidth >= 1000 ? 3 : 2;
    const sts = S.stations; if (!sts.length) return empty('No rooms yet.');
    const pos = floorPos(sts), rows = Math.max(...Object.values(pos).map((p) => p.r)) + 2;
    const now = Date.now();
    const tiles = sts.map((st) => roomHtml(st, pos[st.id], now)).join('');
    spaceReady = true;
    // conveyor belts: link rooms of consecutive steps in each production line
    const links = [];
    (S.workflows || []).forEach((wf) => { for (let i = 0; i < wf.steps.length - 1; i++) { const a = agentById(wf.steps[i].agent), b = agentById(wf.steps[i + 1].agent); if (a && b && a.station !== b.station && pos[a.station] && pos[b.station]) links.push([a.station, b.station, wf.status === 'running']); } });
    const cw = 100 / FLOOR_COLS, ch = 100 / rows, cx = (p) => (p.c + .5) * cw, cy = (p) => (p.r + .5) * ch;
    const svg = `<svg class="fbelts" viewBox="0 0 100 100" preserveAspectRatio="none">${links.map(([a, b, on]) => `<line x1="${cx(pos[a])}" y1="${cy(pos[a])}" x2="${cx(pos[b])}" y2="${cy(pos[b])}" class="belt ${on ? 'on' : ''}"/>`).join('')}</svg>`;
    const ships = links.filter((l) => l[2]).map(([a, b], i) => `<span class="shuttle" style="--x1:${cx(pos[a])}%;--y1:${cy(pos[a])}%;--x2:${cx(pos[b])}%;--y2:${cy(pos[b])}%;animation-delay:${i * .7}s">🛸</span>`).join('');
    return `<div class="fgrid deck" id="fgrid" style="grid-template-columns:repeat(${FLOOR_COLS},1fr);grid-template-rows:repeat(${rows - 1},${FLOOR_COLS === 3 ? 270 : 220}px) ${sts.length % FLOOR_COLS ? '' : '70px'}">${svg}${ships}${tiles}</div>
      <p class="muted tiny" style="margin:8px 0 0">Each room is a station. Idle robots walk the deck; working robots sit at their desks while the room's machine and belts run. Rooms add equipment every 3 tasks their crew finishes. Belts between rooms are your production lines. Press and drag a room to move it.</p>`;
  }
  const PLATFORM_URL = { tiktok: 'https://www.tiktok.com/upload', instagram: 'https://www.instagram.com/', facebook: 'https://www.facebook.com/', etsy: 'https://www.etsy.com/your/shops/me/dashboard', shopify: 'https://admin.shopify.com/' };
  function approvalsSheet() {
    const list = S.approvals || [], pend = list.filter((x) => x.status === 'pending'), ready = list.filter((x) => x.status === 'approved');
    const card = (x) => { const a = agentById(x.agent) || { name: x.agent }; return `<div class="card apcard"><div class="wf-head"><b class="grow">${esc(x.platform)} · from ${esc(a.name)}</b><small class="muted">${esc(clock(x.createdAt))}</small></div>
      <textarea class="aptext" data-apid="${esc(x.id)}" rows="5" ${x.status === 'pending' ? '' : 'readonly'}>${esc(x.text)}</textarea>${x.note ? `<p class="muted tiny">${esc(x.note)}</p>` : ''}
      ${x.status === 'pending' ? `<div class="row"><button class="btn small" data-act="ap-approve" data-id="${esc(x.id)}">👍 Approve</button><button class="btn small ghost" data-act="ap-reject" data-id="${esc(x.id)}">✕ Reject</button></div>`
        : `<div class="row"><button class="btn small" data-act="ap-copy" data-id="${esc(x.id)}">📋 Copy</button><a class="btn small ghost" target="_blank" rel="noopener" href="${esc(PLATFORM_URL[String(x.platform).toLowerCase()] || 'https://www.google.com')}">Open ${esc(x.platform)}</a><button class="btn small ghost" data-act="ap-posted" data-id="${esc(x.id)}">✔ I posted it</button></div>`}</div>`; };
    return `<h3>✅ Approvals</h3><p class="muted">Agents only propose. You decide, and you post it yourself. Approving never publishes anything.</p>
      ${pend.map(card).join('') || '<p class="muted tiny">Nothing waiting.</p>'}${ready.length ? `<h4 style="margin:14px 0 6px">Approved, ready for you to post</h4>${ready.map(card).join('')}` : ''}`;
  }
  function lineSheet() {
    const ids = ui.lineAgents || [];
    return `<h3>🔗 Build a production line</h3><p class="muted">Pick agents in the order they work. Each one gets the previous agent's result.</p>
      <label class="field">Line name<input id="lineName" value="${esc(ui.lineName || '')}" placeholder="e.g. Research then write then plan"></label>
      <div class="chips">${S.agents.map((a) => `<button type="button" class="chip ${ids.includes(a.id) ? 'active' : ''}" data-act="line-pick" data-id="${esc(a.id)}">${ids.includes(a.id) ? ids.indexOf(a.id) + 1 + '. ' : ''}${esc(a.name)}</button>`).join('')}</div>
      <p class="muted tiny">${ids.length ? ids.map((i) => agentName(i)).join(' ➜ ') : 'Tap agents in order.'}</p>
      <button class="btn" data-act="line-save" ${ids.length < 2 ? 'disabled' : ''}>Build line</button>`;
  }

  /* ============================================================= views */
  const VIEWS = {
    station: () => `
      <div data-region="asks"></div>
      <div class="hello card" data-region="hello"></div>
      <div class="stats" id="statsRow" data-region="stats"></div>
      <div class="h2row"><h2>🏭 Production line</h2><span class="muted tiny livetag" data-region="lineTag"></span></div>
      <div class="card line" id="prodLine" data-region="line"></div>
      <div class="h2row"><h2>✅ Approvals</h2><span class="muted tiny">nothing posts without you</span></div>
      <div class="card" data-region="approvals"></div>
      <div class="h2row"><h2>🛰️ Space station</h2><span><button class="link" data-act="room-add">🚀 Launch station</button> · <button class="link" data-act="line-build">🛸 Route</button></span></div>
      <div class="card svcard"><div class="svhost" id="svhost"></div>
        <div class="svbar"><span class="muted tiny">Drag to look around · pinch or scroll to zoom · tap a robot</span><span><button class="link" data-act="sv-fit">⤢ Fit</button> · <button class="link" data-act="sv-full">⛶ Full screen</button></span></div></div>
      <details class="card roomedit"><summary><b>🧱 Edit rooms</b> <span class="muted tiny">move, remove, see crews</span></summary><div class="ffloor space" data-region="ffloor"></div></details>
      <div class="h2row"><h2>🖥️ Workstations</h2><span><button class="link" data-act="forge">🛠️ Build</button> · <button class="link" data-act="new-agent">✨ Gallery</button></span></div>
      <div class="floor" id="floor" data-region="floor"></div>
      <details class="card mapcard"><summary><b>🛰️ Network map</b> <span class="muted tiny">how stations connect</span></summary><div data-region="map"></div></details>
      <h2>Live activity</h2>
      <div class="feed" data-region="feed"></div>`,

    tasks: () => `
      <div data-region="asks"></div>
      <div data-region="outbox"></div>
      <form class="card composer" id="composer" data-form="task">
        <div class="h2row" style="margin:0 0 8px"><h3>Give an agent a task</h3><button type="button" class="link" data-act="lesson" data-id="prompts">How?</button></div>
        <div class="pickers" id="agentPicker" data-region="picker"></div>
        <div class="ta-wrap"><button type="button" class="dict-btn" data-act="dictate" aria-label="Dictate with your voice" title="Dictate">🎤</button>
        <textarea name="prompt" id="draft" rows="5" placeholder="Describe what you want done, like you'd brief a smart helper.&#10;e.g. Find 3 cozy cafés near downtown that open before 8am, with links." maxlength="20000">${esc(ui.draft)}</textarea></div>
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
      <div class="h2row"><h2>Your tasks</h2>${S.mode === 'phone' ? '<button class="link" data-act="archive-done">🗄 Clear finished</button>' : ''}</div>
      <div class="list" data-region="tasks"></div>
      <div data-region="history"></div>`,

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

  /* Asks before guessing (a StarNet idea): an agent's one question waits here for a tap. */
  function askCard(t) {
    const a = agentById(t.agent) || { id: t.agent, name: t.agent };
    return `<div class="card askcard"><div class="wf-head">${avatar(a, 'sm')}<div class="grow"><b>❓ ${esc(a.name)} needs your answer, Commander</b><p class="askq">${esc(t.ask.question)}</p></div></div>
      ${t.ask.options?.length ? `<div class="askopts">${t.ask.options.map((o, i) => `<button class="chip" data-act="ask-pick" data-id="${esc(t.id)}|${i}">${esc(o)}</button>`).join('')}</div>` : ''}
      <form class="row askform" data-form="ask" data-id="${esc(t.id)}"><input name="answer" maxlength="500" placeholder="Or type your own answer" autocomplete="off"><button class="btn small" type="submit">Send</button></form></div>`;
  }
  const outboxSeen = () => +store.get('outboxSeen', 0) || 0;
  function fileMaker(name) { const t = S.tasks.find((x) => x.files?.includes(name)); return t ? agentById(t.agent) || { id: t.agent, name: t.agent } : null; }
  function outboxSheet() {
    const files = S.files || [], seen = outboxSeen();
    return `<h3>📦 Outbox</h3><p class="muted">Finished work your agents delivered: real files you can open, share or download. Newest first.</p>
      <div class="list" style="margin-top:12px">${files.map((f) => { const who = fileMaker(f.name); return `<div class="card obfile ${f.updatedAt > seen ? 'fresh' : ''}">
        <div class="wf-head">${who ? avatar(who, 'sm') : '<span class="emo">📄</span>'}<div class="grow"><b>${esc(f.name)}</b><p class="muted tiny">${who ? esc(who.name) + ' · ' : ''}${ago(f.updatedAt)} · ${(f.size / 1024).toFixed(1)} KB${f.updatedAt > seen ? ' · <b class="newtag">NEW</b>' : ''}</p></div></div>
        <div class="row obbtns"><button class="btn small" data-act="file" data-id="${esc(f.name)}">Open</button><button class="btn small ghost" data-act="file-share" data-id="${esc(f.name)}">Share</button><button class="btn small ghost" data-act="download" data-id="${esc(f.name)}">Download</button></div></div>`; }).join('') || empty('Nothing delivered yet. Ask an agent to “save it as a file” and it lands here.')}</div>`;
  }
  const REGIONS = {
    asks() { return S.tasks.filter((t) => t.ask && t.status === 'running').map(askCard).join(''); },
    outbox() {
      const files = S.files || []; if (!files.length) return '';
      const fresh = files.filter((f) => f.updatedAt > outboxSeen()).length;
      return `<button class="card outboxcard" data-act="outbox"><span class="emo">📦</span><div class="grow"><b>Outbox</b><p class="muted tiny">${files.length} deliverable${files.length > 1 ? 's' : ''} · latest: ${esc(files[0].name)}</p></div>${fresh ? `<span class="pill s-running">${fresh} new</span>` : ''}<span class="muted">›</span></button>`;
    },
    lineTag: () => { const n = S.tasks.filter((t) => t.status === 'running').length; return n ? `<span class="dotlive"></span> ${n} in production` : 'idle'; },
    line() {
      const pkg = (t) => {
        const a = agentById(t.agent) || { id: t.agent, name: t.agent };
        return `<button class="pkg ${esc(t.status)}" data-act="task" data-id="${esc(t.id)}">${avatar(a, 'xs')}<span>${esc((t.title || t.prompt).replace(/^🎙️\s*/, '').slice(0, 34))}</span></button>`;
      };
      const q = S.tasks.filter((t) => t.status === 'queued'), w = S.tasks.filter((t) => t.status === 'running');
      const d = S.tasks.filter((t) => t.status === 'done' || t.status === 'error').slice(0, 3);
      const bay = (icon, name, list, cls, emptyMsg) => `<div class="pbay ${cls}"><div class="pbay-h">${icon} ${name} <b>${list.length}</b></div>${list.slice(0, 3).map(pkg).join('') || `<span class="muted tiny">${emptyMsg}</span>`}${list.length > 3 ? `<span class="muted tiny">+${list.length - 3} more</span>` : ''}</div>`;
      return `<div class="pbays">${bay('📥', 'Queue', q, 'queue', 'empty')}<div class="parrow">›</div>${bay('⚙️', 'Working', w, 'work', 'waiting for work')}<div class="parrow">›</div>${bay('✅', 'Done', d, 'done', 'nothing yet')}</div>
        <div class="conveyor ${w.length ? 'on' : ''}"><i></i></div>
        ${!S.tasks.length ? '<p class="muted tiny center" style="margin:8px 0 0">Give an agent a task and watch it move down the line.</p>' : ''}`;
    },
    approvals() {
      const p = (S.approvals || []).filter((x) => x.status === 'pending'), r = (S.approvals || []).filter((x) => x.status === 'approved');
      if (!p.length && !r.length) return '<p class="muted tiny" style="margin:0">Posts your agents write wait here for your OK. Nothing is ever published for you.</p>';
      return `<button class="btn small ${p.length ? '' : 'ghost'}" data-act="approvals-open">${p.length ? `Review ${p.length} waiting` : 'Open approvals'}</button>${r.length ? ` <span class="muted tiny">${r.length} approved, ready for you to post</span>` : ''}`;
    },
    ffloor() { return floorHtml(); },
    floor() {
      const ICON = { research: '🔬', studio: '🎨', ops: '🗂️' };
      return S.stations.map((st) => {
        const team = S.agents.filter((a) => a.station === st.id);
        const museDesk = S.mode === 'phone' && st === S.stations[0] && !agentById('muse') ? `<button class="desk ghostdesk" data-act="muse-open" aria-label="Connect Muse"><span class="say">Tap to connect Muse</span><span class="worker">${avatar({ id: 'muse', name: 'Muse', look: CH.LOOKS.muse }, 'md')}</span><span class="tabletop"></span><span class="plate"><b>Muse</b><small>🤝 not connected</small></span></button>` : '';
        const busy = team.filter((a) => a.status === 'running').length;
        return `<div class="card wsta">
          <div class="wf-head"><b class="grow">${ICON[st.id] || '🏢'} ${esc(st.name)}</b><span class="mbadge ${busy ? 'free' : ''}">${busy ? `${busy} working` : 'quiet'}</span></div>
          <div class="desks">${team.map((a) => desk(a)).join('') + museDesk || '<p class="muted tiny">No agents at this station yet.</p>'}</div>
        </div>`;
      }).join('') || empty('No stations yet.');
    },
    hello: () => {
      if (S.mode === 'phone' && !S.models.length) return `${commanderAvatar('md')}<div class="grow"><h3>${greeting()}</h3><p class="muted">Your agents run <b>on this phone</b>, but they need a brain first. It's free.</p></div>
        <button class="btn small" data-act="brain">🧠 Set up</button>`;
      const line = S.mode === 'demo' ? 'You are in <b>demo mode</b>: everything is simulated. Tap ⚙️ to run real agents.'
        : S.mode === 'phone' ? `Agents run on this phone · ${esc(shortModel(S.defaultModel))}${isFree(S.defaultModel) ? ' · free' : ''}`
        : `Connected to your station · ${esc(shortModel(S.defaultModel || S.model))}`;
      return `${commanderAvatar('md')}<div class="grow"><h3>${greeting()}</h3><p class="muted">${line}</p>${S.mode === 'phone' ? `<button class="brainchip" data-act="brain">🧠 Brain: <b>${esc(shortModel(S.defaultModel))}</b> ▾</button>` : ''}</div><button class="btn small" data-act="go-tasks">+ New task</button>`;
    },
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
    history() {
      const old = S.tasks.filter(inHistory);
      if (!old.length) return '';
      const who = [...new Set(old.map((t) => t.agent))];
      const f = ui.histAgent && who.includes(ui.histAgent) ? ui.histAgent : '';
      const list = old.filter((t) => !f || t.agent === f);
      return `<details class="history" ${ui.histOpen ? 'open' : ''} data-toggle="hist"><summary><h2>📚 Task history <span class="muted">${old.length}</span></h2></summary>
        <p class="muted tiny" style="margin:-4px 2px 10px">Finished tasks move here after a day, or when you tap <b>Clear finished</b>. Every result is kept: tap one to open it, follow up or put it back.</p>
        ${who.length > 1 ? `<div class="chips" style="margin-bottom:10px"><button class="chip ${f ? '' : 'active'}" data-act="hist-agent" data-id="">All</button>${who.map((id) => `<button class="chip ${f === id ? 'active' : ''}" data-act="hist-agent" data-id="${esc(id)}">${esc(agentName(id))}</button>`).join('')}</div>` : ''}
        <div class="list">${list.map((t) => histRow(t, true)).join('')}</div></details>`;
    },
    tasks() {
      return S.tasks.filter((t) => !inHistory(t)).map((t) => {
        const a = agentById(t.agent) || { id: t.agent, name: t.agent };
        const lastLog = t.log?.at(-1)?.msg;
        return `<button class="card taskcard" data-act="task" data-id="${esc(t.id)}">
          <div class="wf-head">${avatar(a, 'sm')}<div class="grow"><b>${esc(t.title || t.prompt.split('\n')[0].slice(0, 90))}</b><p class="muted">${esc(a.name)} · ${ago(t.createdAt)}</p></div>${pill(t.status)}</div>
          ${t.status === 'running' ? `<p class="muted live-line">▸ ${esc(lastLog || 'Starting…')}</p>${bar(agentById(t.agent)?.progress)}` : ''}
          ${t.status === 'done' && t.files?.length ? `<p class="muted">📎 ${t.files.map(esc).join(', ')}</p>` : ''}
        </button>`;
      }).join('') || empty(S.tasks.length ? 'All caught up. Finished tasks are in <b>📚 Task history</b> below.' : 'No tasks yet. Pick an agent, write a prompt (or tap a template) and press <b>Send</b>.');
    },
    flows() {
      return S.workflows.map((w) => {
        const done = w.steps.filter((s) => s.status === 'done').length;
        return `<div class="card">
          <div class="wf-head"><div class="grow"><h3>${esc(w.name)}</h3><p class="muted">${esc(w.description || '')}${w.startedAt ? ` · last run ${ago(w.startedAt)}` : ''}</p></div>${pill(w.status)}</div>
          ${w.status === 'running' ? bar(w.steps.length ? (done / w.steps.length) * 100 : 0) : ''}
          <div class="pline">${w.steps.map((s, i) => {
            const a = agentById(s.agent) || { id: s.agent, name: s.agent };
            return `${i ? `<span class="pbelt ${w.steps[i - 1].status === 'done' ? 'fed' : ''} ${s.status === 'running' ? 'on' : ''}"></span>` : ''}
              <button class="machine s-${esc(s.status)}" ${s.task ? `data-act="task" data-id="${esc(s.task)}"` : 'tabindex="-1"'}>
                <span class="mtop">${avatar(a, 'sm')}<span class="gear">⚙</span>${s.status === 'running' ? '<span class="box">📦</span>' : ''}</span>
                <b>${i + 1}. ${esc(s.name)}</b><small>${esc(a.name)}${s.duration ? ` · ${fmtDur(s.duration)}` : ''}</small>
                <span class="mstate">${{ done: '✅ done', running: '⚙️ working', error: '⚠️ stopped', pending: '⏸ waiting' }[s.status] || ''}</span>
              </button>`;
          }).join('')}</div>
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
      ${S.mode === 'phone' ? phoneConnectHtml() : ''}
      <h2>Voice</h2>
      ${voiceSettingsHtml()}
      <div class="h2row"><h2>AI models</h2><button class="link" data-act="refresh-models">↻ Refresh</button></div>
      ${S.mode === 'phone' ? `<button class="btn" data-act="brain" style="margin-bottom:10px">🧠 Set up brains: on-device or free keys</button>` : ''}
      <div class="card">
        <label class="field">Default model for all agents<select data-change="default-model">${modelOptions(S.defaultModel, false)}</select></label>
        <p class="muted tiny" style="margin:0">Each agent can use a different model. Open an agent on the Station tab to change it. Free models cost nothing to run.</p>
      </div>
      <div class="list" style="margin-top:10px">${S.providers.map((p) => `
        <div class="card prov ${p.ready ? 'ready' : ''}">
          <div class="wf-head"><span class="emo">${p.ready ? '✅' : '⚪'}</span><div class="grow"><b>${esc(p.label)}</b>${p.free ? ' <span class="mbadge free">FREE</span>' : ''}<p class="muted tiny">${esc(p.note || '')}</p></div></div>
          ${p.ready ? '' : `<p class="muted tiny setup">How to turn on: ${esc(p.setup)}</p>`}
        </div>`).join('')}</div>
      ${S.mode === 'phone' ? '' : `
      <div class="h2row"><h2>Connectors</h2><button class="link" data-act="add-remote">+ Add by URL</button></div>`}
      <p class="muted tiny" style="margin:-4px 2px 10px">Open-source MCP connectors. Switch one on and every agent can use its tools.</p>
      <div class="list" ${S.mode === 'phone' ? 'hidden' : ''}>${S.connectors.map((c) => `
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

  const DAY = 24 * 3600 * 1000;
  const finished = (t) => t.status === 'done' || t.status === 'error';
  /** Finished tasks leave the Tasks list for history when archived, or a day after they finish (unless put back). */
  function inHistory(t) { return finished(t) && !t.restored && (t.archived || Date.now() - (t.finishedAt || t.createdAt || 0) > DAY); }
  function histRow(t, withAgent) {
    const a = agentById(t.agent) || { id: t.agent, name: t.agent };
    return `<button class="card taskcard hist" data-act="task" data-id="${esc(t.id)}"><div class="wf-head">${withAgent ? avatar(a, 'sm') : ''}<div class="grow"><b>${esc(t.title || t.prompt.split('\n')[0].slice(0, 80))}</b><p class="muted tiny">${withAgent ? esc(a.name) + ' · ' : ''}${ago(t.finishedAt || t.createdAt)}${t.files?.length ? ' · 📎 ' + t.files.length : ''}</p></div>${pill(t.status)}</div></button>`;
  }

  /* Office scenes shown behind an agent while it works (original art). Picked by agent, then by job. */
  const SCENES = {
    library: `<rect width="160" height="120" fill="#1f3352"/><rect y="96" width="160" height="24" fill="#1d2b45"/>
      ${[[6, 10], [6, 40], [6, 70], [112, 10], [112, 40], [112, 70]].map(([x, y]) => `<rect x="${x}" y="${y + 24}" width="42" height="3" fill="#5a3e2b"/>${[0, 6, 11, 17, 23, 28, 34].map((dx, i) => `<rect x="${x + 2 + dx}" y="${y + (i % 3) * 2 + 4}" width="${i % 2 ? 4 : 5}" height="${20 - (i % 3) * 2}" rx="1" fill="${['#e5484d', '#3e6bff', '#e9b949', '#4dffa6', '#b9a3ff', '#ff9a4d', '#38e8ff'][i]}" opacity=".85"/>`).join('')}`).join('')}
      <rect x="56" y="12" width="48" height="34" rx="2" fill="#e8d9b5"/><path d="M60 20 Q70 16 76 24 T98 22 M62 34 Q74 28 84 36 T100 34" stroke="#8a6d45" stroke-width="1.4" fill="none"/><circle cx="88" cy="26" r="2.4" fill="#e5484d"/><path d="M66 40 L72 30 L78 38" stroke="#4a7a52" stroke-width="1.2" fill="none"/>
      <circle cx="80" cy="76" r="9" fill="#3e6bff" opacity=".8"/><path d="M73 72 Q80 68 86 74 M72 80 Q80 84 87 79" stroke="#4dffa6" stroke-width="1.4" fill="none"/><rect x="77" y="85" width="6" height="8" fill="#5a3e2b"/>`,
    writer: `<rect width="160" height="120" fill="#33283f"/><rect x="104" y="10" width="44" height="40" rx="3" fill="#1a2a4a"/><path d="M126 10 V50 M104 30 H148" stroke="#251d30" stroke-width="3"/><circle cx="138" cy="20" r="4" fill="#fff6bf" opacity=".8"/>
      <rect y="92" width="160" height="28" fill="#4a3424"/><rect y="90" width="160" height="4" fill="#5e4430"/>
      <path d="M22 90 L22 52 Q22 40 34 40 L44 40" stroke="#c7cfdc" stroke-width="3" fill="none"/><path d="M36 34 L54 34 L58 46 L32 46 Z" fill="#e9b949"/><path d="M34 46 L56 46 L74 90 L16 90 Z" fill="#fff6bf" opacity=".12"/><rect x="14" y="88" width="16" height="4" rx="2" fill="#c7cfdc"/>
      <rect x="58" y="74" width="30" height="18" fill="#f3efe4" transform="rotate(-6 73 83)"/><rect x="62" y="70" width="30" height="20" fill="#fffdf6"/><path d="M66 76 H86 M66 80 H88 M66 84 H80" stroke="#9aa3b8" stroke-width="1.2"/>
      <circle cx="98" cy="86" r="3.5" fill="#fffdf6"/><circle cx="104" cy="88" r="3" fill="#f3efe4"/>
      <rect x="120" y="74" width="16" height="16" rx="3" fill="#e5484d"/><path d="M136 78 Q142 78 142 83 Q142 88 136 88" stroke="#e5484d" stroke-width="2.4" fill="none"/><path d="M124 70 Q122 64 126 60 M130 70 Q128 64 132 60" stroke="#fff" stroke-width="1.4" fill="none" opacity=".55"/>`,
    planning: `<rect width="160" height="120" fill="#12271f"/><rect y="98" width="160" height="22" fill="#1a3329"/>
      <rect x="14" y="10" width="132" height="70" rx="4" fill="#eef2f6"/><rect x="14" y="10" width="132" height="70" rx="4" fill="none" stroke="#a9b8d6" stroke-width="3"/>
      <path d="M24 66 V30 M24 66 H74" stroke="#6b7690" stroke-width="1.4"/>${[[30, 50], [40, 40], [50, 56], [60, 34]].map(([x, y]) => `<rect x="${x}" y="${y}" width="7" height="${66 - y}" fill="#3e6bff"/>`).join('')}
      <path d="M84 60 L96 48 L106 54 L118 36 L130 42" stroke="#e5484d" stroke-width="2" fill="none"/>${[[84, 60], [96, 48], [106, 54], [118, 36], [130, 42]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#e5484d"/>`).join('')}
      <rect x="86" y="16" width="16" height="14" fill="#ffd84d" transform="rotate(-4 94 23)"/><rect x="108" y="16" width="16" height="14" fill="#4dffa6"/><rect x="128" y="18" width="14" height="13" fill="#ff7ad9" transform="rotate(5 135 24)"/>
      ${[[94, 17, '#e5484d'], [116, 17, '#3e6bff'], [135, 19, '#e9b949'], [40, 20, '#4dffa6'], [60, 22, '#ff9a4d']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${c}"/>`).join('')}
      <rect x="76" y="80" width="8" height="18" fill="#6b7690"/>`,
    studio: `<rect width="160" height="120" fill="#2a1430"/><rect y="98" width="160" height="22" fill="#331a3a"/>
      <circle cx="80" cy="42" r="26" fill="none" stroke="#fff6e8" stroke-width="7" opacity=".9"/><circle cx="80" cy="42" r="26" fill="none" stroke="#ffd9f2" stroke-width="16" opacity=".12"/>
      <rect x="72" y="28" width="16" height="28" rx="3" fill="#0b1022"/><rect x="74" y="31" width="12" height="21" rx="1.5" fill="#38e8ff" opacity=".7"/><circle cx="80" cy="54" r="1" fill="#c7cfdc"/>
      <path d="M80 68 V96 M80 82 L66 98 M80 82 L94 98" stroke="#c7cfdc" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="12" y="20" width="24" height="30" rx="2" fill="#fff6e8" opacity=".25"/><path d="M24 50 V98" stroke="#6b7690" stroke-width="2"/>
      <path d="M128 26 C128 20 136 20 136 26 C136 20 144 20 144 26 C144 33 136 38 136 40 C136 38 128 33 128 26 Z" fill="#ff5c7a" opacity=".9"/><circle cx="118" cy="58" r="6" fill="none" stroke="#ff7ad9" stroke-width="2"/><path d="M116 58 L118 60 L121 56" stroke="#ff7ad9" stroke-width="1.6" fill="none"/><text x="128" y="64" font-size="10" fill="#ffd9f2" font-family="sans-serif" font-weight="700">+1k</text>`,
    office: `<rect width="160" height="120" fill="#17213a"/><rect y="96" width="160" height="24" fill="#1f2b48"/>
      <rect x="16" y="12" width="56" height="44" rx="3" fill="#0c1a33"/>${[[20, 34, 8, 20], [30, 26, 10, 28], [42, 38, 8, 16], [52, 22, 12, 32], [66, 32, 5, 22]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#26375e"/>`).join('')}<path d="M44 12 V56 M16 34 H72" stroke="#17213a" stroke-width="2"/>
      <circle cx="120" cy="26" r="12" fill="#eef2f6"/><path d="M120 18 V26 L126 30" stroke="#0b1022" stroke-width="2" fill="none"/>
      <rect x="98" y="60" width="50" height="3" fill="#5a3e2b"/><rect x="102" y="48" width="8" height="12" fill="#3e6bff"/><rect x="112" y="50" width="6" height="10" fill="#e9b949"/>
      <path d="M140 60 Q134 46 140 40 Q146 46 140 60 M140 60 Q132 50 128 52 M140 60 Q148 50 152 52" fill="#4dffa6" opacity=".8"/><rect x="134" y="80" width="12" height="16" rx="2" fill="#5a3e2b"/><path d="M140 80 Q130 66 136 60 M140 80 Q150 66 144 60" stroke="#4dffa6" stroke-width="3" fill="none"/>`,
  };
  const SCENE_BY_AGENT = { scout: 'library', quill: 'writer', atlas: 'planning', echo: 'studio' };
  function sceneKind(a) {
    if (SCENE_BY_AGENT[a.id]) return SCENE_BY_AGENT[a.id];
    const r = `${a.role || ''}`.toLowerCase();
    if (/research|fact|tutor|study|learn|news|security/.test(r)) return 'library';
    if (/writ|edit|email|story|copy|blog/.test(r)) return 'writer';
    if (/plan|ops|schedul|budget|project|travel|routine|coach/.test(r)) return 'planning';
    if (/social|media|post|market|video|creat/.test(r)) return 'studio';
    return 'office';
  }
  const sceneHtml = (a) => `<span class="scene" aria-hidden="true"><svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">${SCENES[sceneKind(a)]}</svg></span>`;

  /* Transforming robots: agents with a vehicle or jet kit park as a car/jet and transform into robot mode to work. */
  const transformAt = {}, lastStatus = {};
  const canTransform = (a) => { const l = lookOf(a); return l && l.kind !== 'human' && (l.body === 'vehicle' || l.body === 'jet'); };
  function deskAvatar(a) {
    const working = a.status === 'running' || a.status === 'waiting';
    if (lastStatus[a.id] !== undefined && (lastStatus[a.id] === 'running' || lastStatus[a.id] === 'waiting') !== working) transformAt[a.id] = Date.now();
    lastStatus[a.id] = a.status;
    const anim = Date.now() - (transformAt[a.id] || 0) < 1400 ? ' transforming-now' : '';
    const opts = { bare: a.status === 'running', alive: true, speaking: vc.state === 'speaking' && vc.agent === a.id };
    if (!canTransform(a)) return avatar(a, 'lg', opts);
    return avatar(a, 'lg', { ...opts, mode: working || opts.speaking ? 'robot' : 'vehicle', cls: (working ? 'mode-robot' : 'mode-vehicle') + anim });
  }

  function desk(a) {
    const say = a.status === 'running' ? (a.task || 'Working…') : a.status === 'waiting' ? (a.task || 'Waiting in line') : a.status === 'error' ? 'Ran into a problem. Tap me' : 'Ready for a task';
    return `<button class="desk s-${esc(a.status)} ${ui.flashAgent === a.id ? 'flash' : ''}" data-act="agent" data-id="${esc(a.id)}" aria-label="${esc(a.name)}: ${esc(say)}">
      <span class="say">${esc(say)}</span>
      ${a.status === 'running' ? sceneHtml(a) : ''}
      <span class="worker">${deskAvatar(a)}<i class="lamp"></i></span>
      <span class="monitor ${a.status === 'running' ? 'on' : ''}"><i></i><i></i><i></i></span>
      <span class="tabletop"></span>
      <span class="plate"><b>${esc(a.name)}</b><small>${a.external ? '🤝 via Muse Bridge' : a.model ? `${esc(shortModel(a.model))}${isChatOnly(a.model) ? ' · 💬' : ''}` : esc(a.role)}</small></span>
      ${a.status === 'running' ? bar(a.progress) : '<span class="bar ghost"></span>'}
    </button>`;
  }

  const PAID_FIELDS = [
    ['openai', 'OpenAI (GPT)', 'sk-…', 'platform.openai.com → API keys.'],
    ['gemini', 'Google Gemini', 'AIza…', 'aistudio.google.com → Get API key (has a free tier).'],
    ['xai', 'xAI Grok', 'xai-…', 'console.x.ai → API keys.'],
    ['mistral', 'Mistral', 'key', 'console.mistral.ai → API keys.'],
    ['deepseek', 'DeepSeek', 'sk-…', 'platform.deepseek.com → API keys (low prices).'],
    ['perplexity', 'Perplexity', 'pplx-…', 'perplexity.ai → Settings → API. Answers with live web search (chat only).'],
  ];
  const CONN_CATALOG = [
    { kind: 'zapier', icon: '⚡', name: 'Zapier', blurb: '8,000+ apps in one connector: Gmail, Google Calendar, Sheets, Drive, Slack, Notion, CRMs…', urlLabel: 'Your Zapier MCP server URL', tokenLabel: '', help: 'On <b>mcp.zapier.com</b>, create an MCP server, add the actions you want agents to use (e.g. Gmail “Send email”, Google Calendar “Create event”), then copy its server URL.' },
    { kind: 'google', icon: '📧', name: 'Gmail · Calendar · Drive', via: 'zapier', blurb: 'Read and send email, schedule events, find and create docs (through Zapier).', urlLabel: 'Your Zapier MCP server URL', help: 'On <b>mcp.zapier.com</b>, add Gmail, Google Calendar and Google Drive actions to your MCP server, then copy its URL.' },
    { kind: 'notion', icon: '📒', name: 'Notion', via: 'zapier', blurb: 'Create and update pages and databases (through Zapier).', urlLabel: 'Your Zapier MCP server URL', help: 'On <b>mcp.zapier.com</b>, add Notion actions (e.g. “Create page”) to your MCP server, then copy its URL.' },
    { kind: 'slack', icon: '💬', name: 'Slack', via: 'zapier', blurb: 'Post and read messages (through Zapier).', urlLabel: 'Your Zapier MCP server URL', help: 'On <b>mcp.zapier.com</b>, add Slack actions (e.g. “Send channel message”) to your MCP server, then copy its URL.' },
    { kind: 'github', icon: '🐙', name: 'GitHub', blurb: 'Repos, issues and pull requests (official GitHub MCP server).', url: 'https://api.githubcopilot.com/mcp/', tokenLabel: 'GitHub personal access token', help: 'github.com → Settings → Developer settings → Personal access tokens. Give it only the repos and permissions you want agents to use.' },
    { kind: 'url', icon: '🔗', name: 'Any MCP server', blurb: 'Paste the address of any remote MCP connector.', urlLabel: 'Server URL (https://…)', tokenLabel: 'Access token (optional)', help: 'Many apps now offer an MCP server. Only connect ones you trust: agents can use every tool it offers.' },
  ];

  function museCardHtml() {
    const b = S.bridge || {};
    const museAgent = agentById('muse');
    const pillB = b.enabled ? (b.connected ? '<span class="pill s-running">connected</span>' : '<span class="pill s-error">not connected</span>') : '<span class="pill s-idle">off</span>';
    return `
      <div class="card musecard">
        <div class="wf-head">${avatar(museAgent || { id: 'muse', name: 'Muse', look: CH.LOOKS.muse }, 'md')}<div class="grow"><b>Muse Bridge</b><p class="muted tiny">Muse joins your floor: you can give Muse tasks, Muse can give your agents tasks, and Muse's work shows at its desk.</p></div>${pillB}</div>
        ${b.enabled && b.connected ? `<p class="muted tiny" style="margin:10px 0 0">Last sync ${ago(b.lastSync)}. ${(b.reports || []).length ? 'Latest from Muse: <b>' + esc(b.reports[0].title) + '</b> (' + esc(b.reports[0].status) + ')' : 'No activity from Muse yet. Ask Muse to use the Agent Station connector.'}</p>
          <div class="row" style="margin-top:10px"><button class="btn small" data-act="task-for" data-id="muse">✍️ Give Muse a task</button><button class="btn ghost small" data-act="bridge-off">Turn off</button></div>`
        : `${b.error ? `<p class="tiny s-error" style="margin:10px 0 0">${esc(b.error)}</p>` : ''}
          <ol class="steps-help">
            <li>Tap <b>🎲 New</b> to make a token (it's copied for you).</li>
            <li>In <b>Netlify</b> → your site → <b>Site configuration → Environment variables</b>, add <code>BRIDGE_TOKEN</code> with that token. Then <b>Deploys → Trigger deploy</b>. Muse can only reach the bridge once the site is <b>public</b>; the token keeps it locked.</li>
            <li>In <b>Muse</b>, add a connector (MCP server):<br>URL <code class="sel">${esc(b.mcpUrl || '/bridge/mcp')}</code><br>Header <code>Authorization: Bearer &lt;your token&gt;</code></li>
            <li>Paste the token below and tap <b>Turn on</b>.</li>
          </ol>
          <form data-form="bridge">
            <label class="field">Bridge token<span class="row"><input name="token" type="password" autocomplete="off" placeholder="${b.hasToken ? '•••••• (saved)' : 'paste or make one'}"><button type="button" class="btn ghost narrow" data-act="bridge-token" aria-label="Make a token">🎲 New</button></span></label>
            <details><summary class="tiny">Bridge address (only if it's not this site)</summary><label class="field" style="margin-top:8px"><input name="url" type="url" value="${esc(b.url || '')}" placeholder="https://your-site.netlify.app/bridge"></label></details>
            <button class="btn" type="submit">Turn on Muse Bridge</button>
          </form>`}
      </div>`;
  }

  function phoneConnectHtml() {
    const b = S.bridge || {}, conns = S.connectors || [];
    return `<h2>🤝 Muse</h2>${museCardHtml()}
      <h2>🔌 Work connectors</h2>
      <p class="muted tiny" style="margin:-4px 2px 10px">Let agents take real actions in your apps. Every connector works when the agent's brain is <b>Claude</b> (Anthropic connects for you). Other brains connect from the phone, which some apps allow and some block.</p>
      ${conns.length ? `<div class="list" style="margin-bottom:10px">${conns.map((c) => `
        <div class="card conn">
          <div class="wf-head"><span class="emo">${(CONN_CATALOG.find((x) => x.kind === c.kind) || CONN_CATALOG.at(-1)).icon}</span><div class="grow"><b>${esc(c.name)}</b><p class="muted tiny">${esc(c.host)} · ${c.browser === 'ok' ? `✅ ${c.tools.length} tools` : c.browser === 'blocked' ? '🔒 Claude brains only' : 'not tested yet'}</p></div>
            <button class="toggle ${c.enabled ? 'on' : ''}" data-act="pconn-toggle" data-id="${esc(c.id)}" role="switch" aria-checked="${c.enabled}" aria-label="${esc(c.name)} on/off"><i></i></button></div>
          ${c.error ? `<p class="muted tiny" style="margin:6px 0 0">${esc(c.error)}</p>` : ''}
          ${c.tools.length ? `<p class="muted tiny" style="margin:6px 0 0">Tools: ${esc(c.tools.slice(0, 8).join(', '))}${c.tools.length > 8 ? '…' : ''}</p>` : ''}
          <div class="row" style="margin-top:8px"><button class="btn ghost small" data-act="pconn-test" data-id="${esc(c.id)}">Test</button><button class="btn ghost small" data-act="pconn-del" data-id="${esc(c.id)}">Remove</button></div>
        </div>`).join('')}</div>` : ''}
      <div class="ggrid">${CONN_CATALOG.map((c) => `<button class="card gcard" data-act="pconn-add" data-id="${c.kind}"><span class="emo big">${c.icon}</span><b>${esc(c.name)}</b><span class="muted tiny">${esc(c.blurb)}</span></button>`).join('')}</div>`;
  }

  const commanderAvatar = (size = 'md', full = false) => (window.AgentStationCommander ? `<span class="avatar art ${size} cmdr">${window.AgentStationCommander.svg({ full })}</span>` : '');
  function greeting() {
    const h = new Date().getHours();
    return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, Commander`;
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
        const look = lookOf(a);
        const face = look
          ? `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="13.5" fill="none" stroke="${ring}" stroke-width="2.5"/><image href="data:image/svg+xml;utf8,${encodeURIComponent(CH.avatarSvg(look, '', { full: false }))}" x="${(ax - 12).toFixed(1)}" y="${(ay - 12).toFixed(1)}" width="24" height="24" clip-path="circle(11px)"/>`
          : `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="9" fill="${colorOf(a.id)}" stroke="${ring}" stroke-width="2.5"/>`;
        nodes += `<g class="node" data-act="agent" data-id="${esc(a.id)}"><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="16" fill="${colorOf(a.id)}" opacity=".18"/>${face}<text x="${ax.toFixed(1)}" y="${(ay + 27).toFixed(1)}">${esc(a.name)}</text></g>`;
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
    { id: 'voice', icon: '🎙️', title: 'Talk to your agents', time: '1 min', body: md('Tap **🎙️** at the top of any screen (or **Talk** on an agent) and just speak.\n\n- The agent works on what you said, then **reads its answer aloud** in a few short sentences. Longer details go into a file you can open.\n- **Hands-free** keeps the conversation going: after each answer it listens again. Say **"goodbye"** to stop.\n- The **🎤** button in the task box lets you dictate a prompt instead of typing.\n- Change the language, voice and speaking speed in **Brain → Connect → Voice**.\n\nIt\'s free: your phone recognizes speech and speaks with its own voices. (Firefox users: the station can transcribe with open-source Whisper instead.)') },
    { id: 'characters', icon: '✨', title: 'Characters & free voices', time: '2 min', body: md('Build your own agent with **🛠️ Build** on the Station tab: design its look, name, job, personality sliders, brain and voice, then watch it get assembled at its desk. Tap **🎨 Customize** on any agent to change it later. Or tap **✨ Gallery** to add a ready-made character: **Novi** (research), **Zipp** (fact-checks), **Professor Hootley** (tutor), **Kit** (study buddy), **Confetti** (social posts), **Luma** (stories), **Pip** (budgets), **Mira** (email), **Wrenna** (tech help), **Rova** (travel), **Basil** (cooking) and **Calma** (routines).\n\n**Free to use, no copyright worries:** the characters and avatars were made for Agent Station and are released under **CC0**. Use, change and share them, even commercially.\n\n**Voices:** each character has a suggested **studio voice** from Kokoro, an open-source model licensed **Apache-2.0** (free for any use). Install it on the server computer with `pip install kokoro`, then run `python voice_server.py` in `server/voice-clone`. Without it, characters use your device voice at their own pitch.\n\nChange any agent\'s voice: tap the agent → **Speaking voice**.') },
    { id: 'muse', icon: '🤝', title: 'Work with Muse', time: '3 min', body: md('Connect your **Muse** agent and it joins your production floor:\n\n- **You → Muse:** give Muse a task like any agent (Tasks tab, its desk, or voice). It travels to Muse; the answer comes back here.\n- **Muse → your agents:** Muse can see your station, give your agents tasks, run your workflows and get the results.\n- **Muse\'s work shows live** at its desk and in Live activity.\n\n**Set up once** (Brain → Connect → 🤝 Muse): make a token, add it in Netlify as `BRIDGE_TOKEN` and redeploy, make the site public (the token keeps the bridge locked), then add the connector in Muse with the address shown and `Authorization: Bearer <token>`.\n\nYour agents run inside this app, so **Muse\'s requests start when the app is open**.') },
    { id: 'clone', icon: '🧬', title: 'Clone a voice (free)', time: '2 min', body: md('Your agents can speak with a **cloned voice**, such as your own, so voice chat sounds like a real person.\n\n1. On the server computer, start the free cloner once: `cd server/voice-clone`, `pip install -r requirements.txt`, `python voice_server.py`. It uses **Chatterbox**, an open-source model that runs on your machine.\n2. In **Brain → Connect → Voice**, tap **Clone a voice**, confirm consent, and read the short script aloud (about 20 seconds).\n3. Tap an agent → **Speaking voice** → pick the new voice.\n\n**Rules that matter:** only clone your own voice or someone who agreed. The sample must be recorded live with a spoken consent line, and existing recordings can\'t be uploaded. Never use a cloned voice to trick or impersonate anyone; in many places that\'s illegal. Every clip has an inaudible AI watermark. Delete a voice anytime.') },
    { id: 'phone', icon: '📱', title: 'Run agents on your phone', time: '2 min', body: md('Agents run **inside this app**: no computer needed. They just need a **brain** (an AI model). Open ⚙️ → **On this phone**, then **Brain → Connect → Set up brains**:\n\n- **On this phone (free, private, offline):** download a free model once: Qwen, Llama, Gemma, SmolLM, DeepSeek or TinyLlama (0.5–2 GB, use Wi-Fi). 🛠 models use tools; 💬 models just chat. It runs on your phone\'s processor (and graphics chip when available) and uses tools natively. Small models are great for writing, planning and simple lookups.\n- **Free online:** paste a free key from **openrouter.ai** or **console.groq.com**. Bigger, smarter models; needs internet.\n- **Claude:** paste your key for the strongest agent with real web search (paid per use).\n\nYour tasks, memories, skills, files and workflows are saved on the phone. **Keep the app open** while agents work. Phones pause apps in the background, so the app keeps your screen awake during tasks.\n\nConnectors and voice cloning need a computer (see *Connect real agents*).') },
    { id: 'connect', icon: '🔌', title: 'Connect a computer (power mode)', time: '5 min', body: md('Optional: run the station server on a computer for extras the phone can\'t do: **MCP connectors**, **studio voices** and **voice cloning**, and bigger local models via Ollama.\n\n1. Choose a brain: install **Ollama** (free, ollama.com) and run `ollama pull qwen3:8b`, **or** get a Claude key at console.anthropic.com, **or** a free OpenRouter/Groq key.\n2. On a computer with Node.js 18+, open the `agent-station/server` folder and run:\n```\nnpm install\nnpm start\n```\n(For Claude: `ANTHROPIC_API_KEY=your-key npm start`. For OpenRouter: `OPENROUTER_API_KEY=… npm start`.)\n3. Open the address it prints (on your phone, use the computer\'s Wi-Fi IP, e.g. `http://192.168.1.20:8787`).\n4. The app connects automatically. Install it: **Share → Add to Home Screen**.\n\nRunning it somewhere public? Set `STATION_TOKEN` and enter the same token in ⚙️ Settings.') },
    { id: 'safety', icon: '🛡️', title: 'Safety & costs', time: '1 min', body: md('- **Costs:** Ollama and other free models cost nothing. Claude tasks use tokens billed to your API key. The Spend tile shows an estimate. Research tasks cost more than short writing tasks.\n- **Check facts:** agents cite sources — open the links for anything important.\n- **Privacy:** don\'t paste passwords, card numbers or other people\'s private data.\n- **Stay in charge:** agents only write files inside the station; they can\'t send emails or buy things.') },
  ];

  /* ============================================================= sheets */
  function equipCard(a, st) {
    if (!S.equipment || a.external) return '';
    const have = Array.isArray(st?.equipment) ? st.equipment : Object.keys(S.equipment);
    return `<div class="card equipcard"><div class="muted tiny">🧰 What ${esc(a.name)} can do (equipment in ${esc(st?.name || 'its room')})</div>
      <div class="eqlist">${Object.entries(S.equipment).map(([k, e]) => `<div class="eqrow ${have.includes(k) ? 'on' : 'off'}"><span>${e.icon}</span><span class="grow"><b>${esc(e.label)}</b> <small class="muted">${esc(e.what)}</small></span><span class="tiny">${have.includes(k) ? '✅' : 'not installed'}</span></div>`).join('')}</div>
      ${S.mode === 'phone' ? '<p class="muted tiny" style="margin:6px 0 0">Change it on the Station tab → 🧱 Edit rooms. Equipment in a room is what its agents are allowed to use.</p>' : ''}</div>`;
  }
  function agentSheet(a) {
    const st = S.stations.find((s) => s.id === a.station);
    const tasks = S.tasks.filter((t) => t.agent === a.id);
    const mems = S.memories.filter((m) => m.agent === a.id).slice(0, 5);
    const skills = S.skills.filter((s) => s.author === a.id);
    return `
      <div class="agent static">${avatar(a)}<div><h3>${esc(a.name)}</h3><p class="muted">${esc(a.role)} · ${esc(st ? st.name : a.station)}</p></div>${pill(a.status)}</div>
      <div class="card" style="margin-top:14px"><div class="muted tiny">Right now</div><div style="margin-top:4px">${esc(a.task || '—')}</div>${bar(a.status === 'running' ? a.progress : 0)}</div>
      ${equipCard(a, st)}
      <div class="kv">
        <div><span>Tasks done</span><b>${S.tasks.filter((t) => t.agent === a.id && t.status === 'done').length}</b></div>
        <div><span>Spend</span><b>$${(a.cost || 0).toFixed(2)}</b></div>
        <div><span>Skills learned</span><b>${skills.length}</b></div>
        <div><span>Memories</span><b>${S.memories.filter((m) => m.agent === a.id).length}</b></div>
      </div>
      <label class="field">🗣️ Speaking voice<select data-change="agent-voice" data-id="${esc(a.id)}">
        <option value="">Device voice${lookOf(a) && CH.byId(a.avatar) ? ` (${esc(a.name)}'s pitch)` : ''}</option>
        ${S.studio?.voices?.length ? `<optgroup label="Studio voices (free · Apache-2.0)">${S.studio.voices.map((v) => `<option value="studio:${esc(v.id)}" ${`studio:${v.id}` === a.voiceId ? 'selected' : ''}>${esc(v.name)}: ${esc(v.accent)}, ${esc(v.style)}</option>`).join('')}</optgroup>` : ''}
        ${S.voices?.length ? `<optgroup label="Cloned voices">${S.voices.map((v) => `<option value="${esc(v.id)}" ${v.id === a.voiceId ? 'selected' : ''}>🧬 ${esc(v.name)}</option>`).join('')}</optgroup>` : ''}
        ${a.voiceId && !studioVoice(a.voiceId) && !S.voices?.some((v) => v.id === a.voiceId) ? `<option value="${esc(a.voiceId)}" selected>${esc(a.voiceId)} (voice server offline)</option>` : ''}
      </select></label>
      ${!S.studio?.voices?.length && isServer() ? '<p class="muted tiny" style="margin:-8px 0 12px">Want natural free voices? See Brain → Connect → Voice.</p>' : ''}
      ${a.external ? '<p class="muted tiny">🤝 Muse uses its own brain and tools. Tasks you give it travel over the Muse Bridge, and its answers come back here.</p>' : `<label class="field">🧠 AI model<select data-change="agent-model" data-id="${esc(a.id)}">${modelOptions(a.modelChosen, true)}</select></label>`}
      ${isChatOnly(a.model) ? `<p class="muted tiny" style="margin:-8px 0 12px">💬 ${esc(a.name)} is on a chat-only brain: it answers directly but can't save files or memories, or use plugins. Pick a 🛠 model for those.</p>` : ''}
      <div class="row"><button class="btn" data-act="task-for" data-id="${esc(a.id)}">✍️ Task</button><button class="btn ghost" data-act="voice-open" data-id="${esc(a.id)}">🎙️ Talk</button><button class="btn ghost" data-act="forge" data-id="${esc(a.id)}">🎨 Customize</button></div>
      ${a.instructions ? `<h2>How ${esc(a.name)} works</h2><div class="card"><p class="muted">${esc(a.instructions)}</p></div>` : ''}
      <h2>📜 ${esc(a.name)}'s log <span class="muted">${tasks.length}</span></h2>
      <div class="list agentlog">${tasks.map((t) => histRow(t, false)).join('') || empty('No tasks yet')}</div>
      ${mems.length ? `<h2>What ${esc(a.name)} remembers</h2><div class="card">${md(mems.map((m) => '- ' + m.fact).join('\n'))}</div>` : ''}`;
  }

  function taskSheet(t) {
    const a = agentById(t.agent) || { id: t.agent, name: t.agent };
    return `
      <div class="wf-head">${avatar(a)}<div class="grow"><h3>${esc(a.name)}</h3><p class="muted">${esc(t.title || 'Task')} · ${ago(t.createdAt)}</p></div>${pill(t.status)}</div>
      ${t.ask && t.status === 'running' ? askCard(t) : ''}
      <h2>Your prompt</h2><div class="card"><p class="prewrap">${esc(t.prompt)}</p></div>
      <h2>Timeline</h2>
      <div class="card"><ol class="timeline">${(t.log || []).map((l) => `<li><span class="mono muted">${clock(l.ts)}</span> ${esc(l.msg)}</li>`).join('') || `<li class="muted">${t.status === 'queued' ? 'Waiting for the agent to finish its current task…' : 'Starting…'}</li>`}${t.status === 'running' ? '<li class="pulse-dot">working…</li>' : ''}</ol></div>
      ${t.result ? `<h2>${t.status === 'error' ? 'What went wrong' : 'Result'}</h2><div class="card ${t.status === 'error' ? 'err' : ''}">${md(t.result)}</div>` : ''}
      ${t.files?.length ? `<h2>Files</h2><div class="list">${t.files.map((f) => `<button class="card file" data-act="file" data-id="${esc(f)}"><span class="emo">📄</span><b class="grow">${esc(f)}</b><span class="muted">open ›</span></button>`).join('')}</div>` : ''}
      ${t.status === 'done' || t.status === 'error' ? `<div class="row" style="margin-top:16px"><button class="btn" data-act="follow-up" data-id="${esc(t.id)}">↩ Follow up</button><button class="btn ghost" data-act="teach" data-id="${esc(t.id)}">🎓 Save as skill</button></div>
        ${S.mode === 'phone' ? (inHistory(t) ? `<button class="btn ghost" style="margin-top:8px" data-act="task-restore" data-id="${esc(t.id)}">↩ Put back in Tasks</button>` : `<button class="btn ghost" style="margin-top:8px" data-act="task-archive" data-id="${esc(t.id)}">🗄 Move to history</button>`) : ''}` : ''}
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
      <p class="muted">${S.mode === 'demo' ? 'Now: <b>demo mode</b> (simulated).' : S.mode === 'phone' ? 'Now: agents run <b>on this phone</b>.' : `Now: connected to a station server${lastOk ? ', last update ' + clock(lastOk) : ''}.`} ${lastErr ? `<span class="s-error">Error: ${esc(lastErr)}</span>` : ''}</p>
      <label class="field">Where do agents run?<select name="source">
        <option value="phone" ${isPhone() ? 'selected' : ''}>On this phone (no computer needed)</option>
        <option value="server" ${isServer() ? 'selected' : ''}>On my computer (station server: adds connectors and voice cloning)</option>
        <option value="demo" ${cfg.source === 'demo' ? 'selected' : ''}>Demo (pretend agents)</option></select></label>
      <p class="muted tiny" style="margin:-6px 0 12px">The fields below are only for the computer option.</p>
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
    if (sh.kind === 'voice') html = voiceSheet();
    if (sh.kind === 'clone') html = cloneSheet();
    if (sh.kind === 'gallery') html = gallerySheet();
    if (sh.kind === 'forge') html = forgeSheet();
    if (sh.kind === 'brain') html = brainSheet();
    if (sh.kind === 'outbox') html = outboxSheet();
    if (sh.kind === 'muse') html = `<h3>🤝 Connect Muse</h3><p class="muted">Link your Muse agent so it works with your agents here.</p>${S.mode === 'phone' ? museCardHtml() : '<p class="muted tiny">The Muse Bridge runs in the phone app (the Netlify site). Open the app from your Netlify address to connect Muse.</p>'}`;
    if (sh.kind === 'welcome') html = welcomeSheet();
    if (sh.kind === 'character') { const c = CH.byId(sh.id); if (!c) return closeSheet(); html = characterSheet(c); }
    if (sh.kind === 'approvals') html = approvalsSheet();
    if (sh.kind === 'line') html = lineSheet();
    if (sh.kind === 'events') html = `<h3>All activity</h3><div class="feed" style="margin-top:12px">${eventsHtml(S.events)}</div>`;
    if (sh._last !== html) {
      $('#sheetBody').innerHTML = html; sh._last = html;
      const vt = $('#sheetBody .vturns'); if (vt) vt.scrollTop = vt.scrollHeight; // newest voice turn in view
    }
  }
  function openSheet(kind, id, html) {
    ui.sheet = { kind, id, html };
    $('#sheet').hidden = false;
    $('.sheet-panel').scrollTop = 0;
    renderSheet();
  }
  function closeSheet() {
    if (ui.sheet?.kind === 'brain' && !store.get('toured', false)) setTimeout(startTour, 400); if (ui.sheet?.kind === 'voice') endVoice(); if (ui.sheet?.kind === 'clone' && cl.recording) cl.rec?.stop(); ui.sheet = null; $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; }

  /* ============================================================ render */
  const regionCache = new Map();
  function render() {
    $('#view').innerHTML = VIEWS[ui.tab]();
    regionCache.clear();
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
    update();
  }
  function stationView() {
    const host = $('#svhost'), V = window.AgentStationView; if (!host || !V) return;
    V.mount(host, {
      onAgent: (id) => ACTIONS.agent(id),
      onOutbox: () => ACTIONS.outbox(),
      onCommander: () => toast('That\'s you, Commander 🫡 Your crew is on it.'),
      commanderSprite: (frame) => window.AgentStationCommander?.svg({ full: true, bare: true, frame }),
      sprite: (a, frame) => { const look = a.id === 'npc' ? a.look : lookOf(a); return look ? CH.avatarSvg(look, '', { full: true, bare: true, frame }) : null; },
    });
    V.setData({ stations: S.stations || [], agents: S.agents || [], tasks: S.tasks || [], workflows: S.workflows || [], files: S.files || [], outboxNew: (S.files || []).filter((f) => f.updatedAt > outboxSeen()).length });
  }
  function update() {
    try { stationView(); } catch (e) { console.warn('station view', e); }
    for (const el of $$('#view [data-region]')) {
      if (el.contains(document.activeElement) && /^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) continue; // don't yank a control the user is using
      if (ui.dragging && el.dataset.region === 'ffloor') continue;
      const html = REGIONS[el.dataset.region]?.() ?? '';
      if (regionCache.get(el) !== html) { el.innerHTML = html; regionCache.set(el, html); }
    }
    const typing = document.activeElement?.closest?.('#sheetBody form') || (document.activeElement?.tagName === 'SELECT' && document.activeElement.closest('#sheetBody'));
    if (ui.sheet && !typing) renderSheet();
    $('#sourceLabel').textContent = S.mode === 'demo' ? 'Demo mode' : S.mode === 'phone' ? 'Running on this phone' : (() => { try { return cfg.base ? new URL(cfg.base).host : location.host; } catch { return 'My station'; } })();
    const badge = $('#liveBadge');
    badge.className = 'live' + (lastErr ? ' error' : S.mode === 'demo' ? ' demo' : '');
    $('#liveText').textContent = lastErr ? 'OFFLINE' : S.mode === 'demo' ? 'DEMO' : S.mode === 'phone' ? 'ON PHONE' : 'LIVE';
    keepAwake(S.tasks.some((t) => t.status === 'running' || t.status === 'queued') && S.mode === 'phone');
    voiceCheck();
    readResultsCheck();
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

  /* ============================================================= voice */
  // Speech-to-text: the browser's built-in recognizer (Safari, Chrome, Edge: free,
  // nothing to install). Fallback: record audio and let the station server
  // transcribe it with Whisper (open-source). Text-to-speech: the device's voices.
  const voiceCfg = Object.assign({ lang: navigator.language || 'en-US', voice: '', rate: 1, handsFree: true, readResults: false }, store.get('voice', {}));
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canTTS = 'speechSynthesis' in window;
  const canServerSTT = () => isServer() && !!S.voice?.stt && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;
  const canListen = () => !!SR || canServerSTT();
  const vc = { state: 'idle', agent: '', turns: [], pending: null, interim: '', stop: null, error: '', speakId: 0 };
  const VOICE_LANGS = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Español'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-BR', 'Português (BR)'], ['nl-NL', 'Nederlands'], ['hi-IN', 'हिन्दी'], ['zh-CN', '中文'], ['ja-JP', '日本語'], ['ko-KR', '한국어'], ['ar-SA', 'العربية'], ['tl-PH', 'Filipino'], ['vi-VN', 'Tiếng Việt']];

  function plainSpeech(src) {
    let t = String(src || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
      .replace(/https?:\/\/\S+/g, 'a link')
      .replace(/^\s*\|.*\|\s*$/gm, ' ')
      .replace(/^\s*(#+|[-*•]|\d+[.)])\s+/gm, '')
      .replace(/\*\*|__/g, '')                         // bold markers
      .replace(/(^|[\s(])[*_](?=\S)|(?<=\S)[*_](?=[\s).,!?:;]|$)/g, '$1') // italic markers, but keep 3*4 and snake_case
      .replace(/[`>#|]/g, '')
      .replace(/\s+/g, ' ').trim();
    if (t.length > 700) t = t.slice(0, 700).replace(/[^.!?]*$/, '') + ' The full answer is on your screen.';
    return t;
  }

  // One shared audio element, unlocked on the user's first tap (iOS blocks audio started later otherwise).
  const player = new Audio();
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    player.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    player.play().catch(() => {});
  }
  const cloneReady = () => isServer() && !!S.clone?.available;
  const studioReady = () => isServer() && !!S.studio?.available;
  const studioVoice = (id) => S.studio?.voices?.find((v) => `studio:${v.id}` === id);
  // The server voice an agent should use right now, or '' for the device voice.
  const voiceOf = (agentId) => {
    const v = agentById(agentId)?.voiceId || '';
    if (v.startsWith('studio:')) return studioReady() ? v : '';
    return v && cloneReady() && S.voices?.some((x) => x.id === v) ? v : '';
  };
  const voiceLabel = (v) => {
    if (!v) return 'Device voice';
    if (v.startsWith('studio:')) { const sv = studioVoice(v); return sv ? `${sv.name} (${sv.accent}, studio)` : v.slice(7); }
    const c = S.voices?.find((x) => x.id === v); return c ? `🧬 ${c.name}` : 'Device voice';
  };
  const pitchOf = (agentId) => agentById(agentId)?.pitch || CH.byId(agentById(agentId)?.avatar)?.pitch || 1;
  const splitSpeech = (text, max = 220) => {
    const parts = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
    const chunks = []; let cur = '';
    for (const p of parts) { if ((cur + p).length > max && cur) { chunks.push(cur.trim()); cur = ''; } cur += p; }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks;
  };

  async function speakCloned(text, voiceId, id) {
    // Generate sentence by sentence and start playing the first one while the next is made.
    const fetchClip = (chunk) => {
      const headers = { 'Content-Type': 'application/json' };
      if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
      return fetch(apiUrl('speak'), { method: 'POST', headers, body: JSON.stringify({ text: chunk, voice: voiceId, language: voiceCfg.lang.slice(0, 2), speed: +voiceCfg.rate || 1 }) })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return r.blob(); });
    };
    const chunks = splitSpeech(text, 260);
    let next = fetchClip(chunks[0]);
    for (let i = 0; i < chunks.length; i++) {
      const blob = await next;
      if (i + 1 < chunks.length) next = fetchClip(chunks[i + 1]);
      if (id !== vc.speakId) return;
      const url = URL.createObjectURL(blob);
      await new Promise((res) => { player.onended = player.onerror = res; player.src = url; player.playbackRate = voiceId.startsWith('studio:') ? 1 : +voiceCfg.rate || 1; player.play().catch(res); });
      URL.revokeObjectURL(url);
      if (id !== vc.speakId) return;
    }
  }

  function speak(text, agentId) {
    if (!text) return Promise.resolve();
    const id = ++vc.speakId;
    const cloned = agentId ? voiceOf(agentId) : '';
    if (cloned) {
      if (canTTS) speechSynthesis.cancel();
      return speakCloned(text, cloned, id).catch((e) => {
        if (id !== vc.speakId) return;
        toast(`Cloned voice unavailable (${e.message}). Using the device voice.`, 'bad');
        return speakDevice(text, ++vc.speakId, pitchOf(agentId));
      });
    }
    return speakDevice(text, id, agentId ? pitchOf(agentId) : 1);
  }

  function speakDevice(text, id, pitch = 1) {
    if (!canTTS) return Promise.resolve();
    speechSynthesis.cancel();
    const chunks = splitSpeech(text); // sentence by sentence: some browsers cut off long utterances
    const v = speechSynthesis.getVoices().find((x) => x.name === voiceCfg.voice);
    return chunks.reduce((prev, chunk) => prev.then(() => new Promise((res) => {
      if (id !== vc.speakId) return res();
      const u = new SpeechSynthesisUtterance(chunk.trim());
      if (v) u.voice = v;
      u.lang = v?.lang || voiceCfg.lang; u.rate = +voiceCfg.rate || 1; u.pitch = pitch;
      u.onend = u.onerror = () => res();
      speechSynthesis.speak(u);
    })), Promise.resolve());
  }
  function stopSpeaking() { vc.speakId++; if (canTTS) speechSynthesis.cancel(); try { player.pause(); } catch { /* nothing playing */ } }

  function listen(onInterim) {
    if (SR) {
      return new Promise((resolve, reject) => {
        const r = new SR();
        r.lang = voiceCfg.lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
        let final = '';
        r.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) final += t; else interim += t; }
          onInterim?.((final + interim).trim());
        };
        r.onerror = (e) => {
          if (e.error === 'no-speech' || e.error === 'aborted') return resolve('');
          reject(new Error(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access is blocked. Allow the microphone for this site in your browser settings.' : `Speech recognition error: ${e.error}`));
        };
        r.onend = () => resolve(final.trim());
        vc.stop = () => { try { r.stop(); } catch { /* already stopped */ } };
        try { r.start(); } catch (e) { reject(e); }
      });
    }
    if (canServerSTT()) return recordAndTranscribe(onInterim);
    return Promise.reject(new Error(isServer() ? 'This browser has no speech recognition. Use Safari or Chrome, or turn on server transcription (WHISPER_URL or GROQ_API_KEY).' : 'This browser has no speech recognition. Try Safari or Chrome.'));
  }

  async function recordAndTranscribe(onInterim) {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { throw new Error('Microphone access is blocked. Allow the microphone for this site in your browser settings.'); }
    const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // Stop automatically after ~1.4s of silence (or 30s max).
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let spoke = false, quietSince = now(); const t0 = now();
    const done = new Promise((res) => (rec.onstop = res));
    const tick = setInterval(() => {
      an.getByteTimeDomainData(buf);
      const vol = Math.max(...buf.map((v) => Math.abs(v - 128)));
      if (vol > 12) { spoke = true; quietSince = now(); }
      if ((spoke && now() - quietSince > 1400) || (!spoke && now() - t0 > 7000) || now() - t0 > 30000) rec.state === 'recording' && rec.stop();
    }, 100);
    vc.stop = () => rec.state === 'recording' && rec.stop();
    rec.start();
    onInterim?.('🎙️ Listening… (stops when you pause)');
    await done;
    clearInterval(tick); stream.getTracks().forEach((t) => t.stop()); ctx.close();
    if (!spoke || !chunks.length) return '';
    onInterim?.('✍️ Transcribing…');
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    const headers = { 'Content-Type': blob.type };
    if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
    const res = await fetch(apiUrl('transcribe?lang=' + encodeURIComponent(voiceCfg.lang.slice(0, 2))), { method: 'POST', headers, body: blob });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Transcription failed (HTTP ${res.status})`);
    return j.text || '';
  }

  function setVoice(state, extra = {}) { const was = vc.state; Object.assign(vc, { state, ...extra }); if (ui.sheet?.kind === 'voice') renderSheet(); if ((was === 'speaking') !== (state === 'speaking')) render(); }

  function openVoice(agentId) {
    unlockAudio();
    vc.agent = agentById(agentId)?.id || vc.agent || ui.draftAgent || S.agents[0]?.id;
    vc.error = ''; vc.interim = '';
    openSheet('voice');
    if (canTTS) speechSynthesis.getVoices(); // warm up voice list
    if (canListen()) voiceTurn(); // the tap that opened this counts as permission to use the mic
  }
  function endVoice() {
    stopSpeaking(); vc.stop?.(); vc.pending = null;
    setVoice('idle', { interim: '' });
  }

  async function voiceTurn() {
    if (vc.state === 'listening') { vc.stop?.(); return; }
    stopSpeaking();
    setVoice('listening', { interim: '', error: '' });
    let text = '';
    try { text = await listen((t) => { vc.interim = t; if (ui.sheet?.kind === 'voice') renderSheet(); }); }
    catch (e) { return setVoice('idle', { error: e.message }); }
    if (ui.sheet?.kind !== 'voice') return;
    if (!text) return setVoice('idle', { interim: '', error: "I didn't catch that. Tap the mic and try again." });
    vc.turns.push({ who: 'you', text });
    if (/^(stop|goodbye|bye|end( the)? chat|that'?s all|thank you,? that'?s all)[.!]?$/i.test(text.trim())) {
      setVoice('speaking', { interim: '' });
      vc.turns.push({ who: 'agent', text: 'Okay, talk soon!' });
      await speak('Okay, talk soon!', vc.agent);
      return setVoice('idle');
    }
    const history = vc.turns.slice(-7, -1).map((t) => `${t.who === 'you' ? 'User' : agentName(vc.agent)}: ${t.text}`).join('\n');
    const prompt = (history ? `Earlier in this voice chat:\n${history}\n\nThe user now says: ` : '') + text;
    setVoice('thinking', { interim: '' });
    try {
      const t = await call('POST', 'tasks', { agent: vc.agent, prompt, voice: true, title: `🎙️ ${text.slice(0, 80)}` });
      vc.pending = t.id;
      refresh();
    } catch (e) { setVoice('idle', { error: e.message }); }
  }

  // Called after every refresh: when the agent finishes, read the answer aloud.
  async function voiceCheck() {
    if (!vc.pending) return;
    const t = S.tasks.find((x) => x.id === vc.pending);
    if (!t || (t.status !== 'done' && t.status !== 'error')) return;
    vc.pending = null;
    const reply = t.status === 'error' ? `Sorry, something went wrong. ${t.result || ''}` : plainSpeech(t.result);
    vc.turns.push({ who: 'agent', text: reply, task: t.id });
    setVoice('speaking');
    await speak(reply, vc.agent);
    if (ui.sheet?.kind !== 'voice' || vc.state !== 'speaking') return;
    if (voiceCfg.handsFree && canListen()) voiceTurn(); else setVoice('idle');
  }

  function voiceSheet() {
    const a = agentById(vc.agent) || S.agents[0] || { id: '', name: 'Agent' };
    const label = {
      listening: '🎙️ Listening… tap the orb when you\'re done',
      thinking: `💭 ${esc(a.name)} is working${a.task && a.status === 'running' ? `: ${esc(a.task)}` : '…'}`,
      speaking: `🔊 ${esc(a.name)} is answering`,
      idle: canListen() ? 'Tap the orb and start talking' : 'Voice input isn\'t available in this browser',
    }[vc.state];
    return `<div class="voice">
      <div class="wf-head"><h3 class="grow">🎙️ Voice chat</h3><select class="vagent" data-change="voice-agent" aria-label="Agent">${S.agents.map((x) => `<option value="${esc(x.id)}" ${x.id === a.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="vchar">${avatar(a, 'xl', { alive: true, speaking: vc.state === 'speaking' })}</div>
      <button class="orb-btn ${vc.state}" data-act="voice-mic" aria-label="${vc.state === 'listening' ? 'Stop listening' : 'Talk'}"><span class="orb-core">${vc.state === 'speaking' ? '🔊' : vc.state === 'thinking' ? '💭' : '🎤'}</span></button>
      <p class="vstate">${label}</p>
      ${vc.interim ? `<p class="interim">“${esc(vc.interim)}”</p>` : ''}
      ${vc.error ? `<p class="tiny s-error center">${esc(vc.error)}</p>` : ''}
      <div class="vturns">${vc.turns.slice(-8).map((t) => `<div class="bubble ${t.who === 'you' ? 'you' : 'bot'}">${esc(t.text)}${t.task ? ` <button class="link tiny" data-act="task" data-id="${esc(t.task)}">details</button>` : ''}</div>`).join('') || `<p class="muted tiny center">Try: “What's a good 20-minute dinner?” or “Plan my Saturday.” Say “goodbye” to finish.</p>`}</div>
      <div class="row vctl">
        <label class="hf"><input type="checkbox" data-change="handsfree" ${voiceCfg.handsFree ? 'checked' : ''}> Hands-free</label>
        ${vc.state === 'speaking' ? '<button class="btn ghost small" data-act="voice-hush">⏹ Stop talking</button>' : ''}
        ${vc.turns.length ? '<button class="btn ghost small" data-act="voice-clear">New chat</button>' : ''}
      </div>
      <p class="muted tiny center">${SR ? 'Speech is recognized by your device, free.' : canServerSTT() ? `Speech is transcribed by your station (${esc(S.voice?.sttProvider || 'Whisper')}).` : ''} Replies are short so they're easy to listen to.</p>
    </div>`;
  }


  /* ------------------------------------------------------- agent builder */
  const TRAITS = [['warm', 'Formal', 'Warm'], ['detail', 'Brief', 'Detailed'], ['playful', 'Serious', 'Playful'], ['bold', 'Careful', 'Bold']];
  const NAME_IDEAS = ['Sprocket', 'Maple', 'Comet', 'Pebble', 'Indigo', 'Cobalt', 'Willow', 'Zephyr', 'Clover', 'Marlo', 'Tilly', 'Bram', 'Vega', 'Juno', 'Ziggy', 'Opal', 'Rusty', 'Mochi', 'Nimbus', 'Fable'];
  const ROLE_IDEAS = [
    { role: 'Research helper', icon: '🔎', station: 'research', base: 'You find reliable information, compare sources, and summarize clearly with links.' },
    { role: 'Writer', icon: '✍️', station: 'studio', base: 'You write clear, friendly emails, posts and documents in the tone the user asks for.' },
    { role: 'Planner', icon: '🗺️', station: 'ops', base: 'You turn goals into practical step-by-step plans, checklists and schedules.' },
    { role: 'Study tutor', icon: '🎓', station: 'studio', base: 'You explain topics step by step for a beginner and check understanding with quick questions.' },
    { role: 'Budget helper', icon: '💰', station: 'ops', base: 'You build simple budgets and compare prices, showing the math with the calculator. General information, not financial advice.' },
    { role: 'Creative partner', icon: '💡', station: 'studio', base: 'You brainstorm ideas, names, stories and plans with energy and originality.' },
  ];
  const FORGE_STEPS = ['🎨 Look', '🪪 Identity', '🎛️ Personality', '🧠 Brain', '🚀 Build'];
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randomLook = (robot = true) => {
    const O = CH.OPTIONS, R = robot ? CH.ROBOT : O;
    return { shape: rnd(R.shape), eyes: rnd(R.eyes), mouth: rnd(R.mouth), top: rnd(R.top), body: rnd(robot ? R.body : O.body), bg: rnd(O.bg), fg: rnd(robot ? O.fg.slice(0, 9) : O.fg), accent: rnd(O.accent), cheeks: !robot && Math.random() < 0.4 };
  };

  const randomHuman = (base = {}) => ({ kind: 'human', skin: rnd(CH.OPTIONS.skin), hair: rnd(CH.OPTIONS.hair), hairColor: rnd(CH.OPTIONS.hairColor), face: rnd(CH.OPTIONS.face), eyes: rnd(CH.HUMAN.eyes), mouth: rnd(CH.HUMAN.mouth), top: 'none', body: 'none', shape: 'round',
    bg: base.bg || rnd(CH.OPTIONS.bg), fg: rnd(CH.OPTIONS.fg), accent: base.accent || rnd(CH.OPTIONS.accent), cheeks: Math.random() < 0.3 });

  function personalityText(t, name) {
    const lines = [];
    lines.push(t.warm >= 65 ? 'be warm, kind and encouraging' : t.warm <= 35 ? 'be professional and to the point' : 'be friendly but focused');
    lines.push(t.detail >= 65 ? 'give thorough, detailed answers with examples' : t.detail <= 35 ? 'keep answers short: a few sentences or bullets' : 'keep answers clear and reasonably concise');
    lines.push(t.playful >= 65 ? 'add a little light humor' : t.playful <= 35 ? 'stay serious and factual' : 'keep a relaxed, natural tone');
    lines.push(t.bold >= 65 ? 'be decisive: recommend one clear option' : t.bold <= 35 ? 'be careful: point out risks and anything uncertain' : 'weigh the options, then suggest a sensible choice');
    return `Style: ${name || 'This agent'} should ${lines.join('; ')}.`;
  }
  const forgeInstructions = (f) => [f.base.trim(), personalityText(f.traits, f.name), f.notes.trim()].filter(Boolean).join('\n');

  function openForge(agentId) {
    const a = agentId && agentById(agentId);
    ui.forge = a ? {
      step: 0, editId: a.id, look: { ...(lookOf(a) || randomLook()) }, name: a.name, role: a.role, station: a.station,
      base: String(a.instructions || '').split('\n').filter((l) => !l.startsWith('Style:')).join('\n'), notes: '',
      traits: { warm: 50, detail: 50, playful: 50, bold: 50, ...(a.traits || {}) }, model: a.modelChosen || '', pitch: a.pitch || pitchOf(a.id),
    } : {
      step: 0, editId: '', look: randomLook(), name: rnd(NAME_IDEAS), role: '', station: S.stations[0]?.id || 'research', base: '', notes: '',
      traits: { warm: 60, detail: 50, playful: 45, bold: 50 }, model: '', pitch: 1,
    };
    if (ui.sheet) closeSheet();
    openSheet('forge');
  }

  const forgeAvatar = (look, cls = '', extra = '') => `<span class="avatar art ${cls} ${extra}">${CH.avatarSvg(CH.cleanLook(look), '')}</span>`;
  function forgePreview(f) {
    return `<div class="fpreview">${forgeAvatar(f.look, 'xl', `alive${ui.forgeSpeak ? ' speaking' : ''}`)}<div><b>${esc(f.name || 'New agent')}</b><small>${esc(f.role || 'Pick a job')}</small></div></div>`;
  }
  function partRow(label, key, list) {
    const f = ui.forge;
    return `<div class="frow"><div class="flabel">${label}</div><div class="fopts">${(list || CH.OPTIONS[key]).map((v) =>
      `<button type="button" class="fopt ${f.look[key] === v ? 'on' : ''}" data-act="fb-pick" data-id="${key}:${v}" aria-label="${label} ${v}">${forgeAvatar({ ...f.look, [key]: v }, 'sm')}</button>`).join('')}</div></div>`;
  }
  function swatchRow(label, key) {
    const f = ui.forge;
    return `<div class="frow"><div class="flabel">${label}</div><div class="fopts">${CH.OPTIONS[key].map((v) =>
      `<button type="button" class="swatch ${f.look[key] === v ? 'on' : ''}" style="background:${v}" data-act="fb-pick" data-id="${key}:${v}" aria-label="${label} ${v}"></button>`).join('')}</div></div>`;
  }

  function forgeSheet() {
    const f = ui.forge; if (!f) return '';
    const steps = `<div class="fsteps">${FORGE_STEPS.map((t, i) => `<button type="button" class="fstep ${i === f.step ? 'on' : i < f.step ? 'done' : ''}" data-act="fb-step" data-id="${i}">${t}</button>`).join('')}</div>`;
    let body = '';
    if (f.step === 0) {
      const human = f.look.kind === 'human';
      body = `<div class="flabel">Quick looks</div>
        <div class="fpresets">${CH.PRESETS.map((p) => `<button type="button" class="fpreset" data-act="fb-preset" data-id="${esc(p.id)}" aria-label="Use the ${esc(p.name)} look">${forgeAvatar(p.look, 'sm')}<span>${esc(p.name)}</span></button>`).join('')}</div>
        <div class="row fkind" role="group" aria-label="Robot or person"><button type="button" class="chip ${human ? '' : 'active'}" data-act="fb-kind" data-id="robot">🤖 Robot</button><button type="button" class="chip ${human ? 'active' : ''}" data-act="fb-kind" data-id="human">🧑 Person</button></div>
        <div class="row" style="margin:8px 0">${human
          ? '<button type="button" class="btn small" data-act="fb-random" data-id="human">🎲 Random person</button>'
          : '<button type="button" class="btn small" data-act="fb-random" data-id="robot">🤖 Random robot</button><button type="button" class="btn ghost small" data-act="fb-random" data-id="classic">🎲 Random classic</button>'}</div>
        ${human
          ? `${partRow('Face shape', 'face')}${swatchRow('Skin tone', 'skin')}${partRow('Hair style', 'hair')}${swatchRow('Hair color', 'hairColor')}${partRow('Eyes', 'eyes', CH.HUMAN.eyes)}${partRow('Mouth', 'mouth', CH.HUMAN.mouth)}${swatchRow('Shirt color', 'fg')}${swatchRow('Backdrop', 'bg')}`
          : `${partRow('Helmet / head', 'shape')}${partRow('Optics / eyes', 'eyes')}${partRow('Jaw / mouth', 'mouth')}${partRow('Top gear', 'top')}${partRow('Armor', 'body')}
        ${swatchRow('Armor color', 'fg')}${swatchRow('Backdrop', 'bg')}${swatchRow('Glow / accent', 'accent')}`}
        <label class="hf" style="margin-top:6px"><input type="checkbox" data-fbcheck="cheeks" ${f.look.cheeks ? 'checked' : ''}> Rosy cheeks</label>`;
    } else if (f.step === 1) {
      body = `<label class="field">Name<span class="row"><input data-fb="name" maxlength="40" value="${esc(f.name)}" placeholder="e.g. Sprocket"><button type="button" class="btn ghost narrow" data-act="fb-name" aria-label="Random name">🎲</button></span></label>
        <div class="flabel">Job</div>
        <div class="fjobs">${ROLE_IDEAS.map((r, i) => `<button type="button" class="chip ${f.role === r.role ? 'active' : ''}" data-act="fb-role" data-id="${i}">${r.icon} ${esc(r.role)}</button>`).join('')}</div>
        <label class="field" style="margin-top:10px">Or describe the job yourself<input data-fb="role" maxlength="60" value="${esc(f.role)}" placeholder="e.g. Garden helper"></label>
        <label class="field">What does it do? (one or two sentences)<textarea data-fb="base" rows="3" placeholder="You help me plan my garden: what to plant, when to water…">${esc(f.base)}</textarea></label>
        <div class="flabel">Station</div>
        <div class="fjobs">${S.stations.map((st) => `<button type="button" class="chip ${f.station === st.id ? 'active' : ''}" data-act="fb-station" data-id="${esc(st.id)}">${esc(st.name)}</button>`).join('')}</div>`;
    } else if (f.step === 2) {
      body = `${TRAITS.map(([k, lo, hi]) => `<div class="trait"><div class="tlabels"><span>${lo}</span><span>${hi}</span></div><input type="range" min="0" max="100" step="5" value="${f.traits[k]}" data-fbtrait="${k}" aria-label="${lo} to ${hi}"></div>`).join('')}
        <div class="card ptext" id="forgePersona">${esc(personalityText(f.traits, f.name))}</div>
        <label class="field" style="margin-top:10px">Anything else it should always do? (optional)<textarea data-fb="notes" rows="2" placeholder="e.g. Always answer in Spanish. Use metric units.">${esc(f.notes)}</textarea></label>`;
    } else if (f.step === 3) {
      body = `<label class="field">🧠 Brain (AI model)<select data-fbsel="model">${modelOptions(f.model, true)}</select></label>
        ${S.mode === 'phone' ? '<button type="button" class="link" data-act="brain">Download more free brains ›</button>' : ''}
        <div class="trait" style="margin-top:14px"><div class="tlabels"><span>🔈 Deeper voice</span><span>Higher voice 🔊</span></div><input type="range" min="0.6" max="1.6" step="0.05" value="${f.pitch}" data-fbpitch="1" aria-label="Voice pitch"></div>
        <button type="button" class="btn ghost" data-act="fb-hear">▶ Hear ${esc(f.name || 'it')}</button>`;
    } else {
      const st = S.stations.find((x) => x.id === f.station);
      body = `<div class="card fsummary">
          <div class="frow2"><span>Job</span><b>${esc(f.role || 'Assistant')}</b></div>
          <div class="frow2"><span>Station</span><b>${esc(st?.name || f.station)}</b></div>
          <div class="frow2"><span>Brain</span><b>${esc(f.model ? shortModel(f.model) : 'Station default')}${f.model && isChatOnly(f.model) ? ' · 💬' : ' · 🛠'}</b></div>
          ${TRAITS.map(([k, lo, hi]) => `<div class="frow2"><span>${lo} ↔ ${hi}</span><span class="tbar"><i style="width:${f.traits[k]}%"></i></span></div>`).join('')}
        </div>
        <p class="muted tiny">${esc(forgeInstructions(f))}</p>
        <button type="button" class="btn big" data-act="fb-build">${f.editId ? '💾 Save changes' : `🚀 Build ${esc(f.name || 'agent')}`}</button>`;
    }
    const nav = `<div class="row fnav">${f.step ? '<button type="button" class="btn ghost" data-act="fb-prev">‹ Back</button>' : ''}${f.step < FORGE_STEPS.length - 1 ? '<button type="button" class="btn" data-act="fb-next">Next ›</button>' : ''}</div>`;
    return `<form data-form="forge" class="forge" onsubmit="return false"><h3>🛠️ ${f.editId ? 'Customize' : 'Agent Builder'}</h3>
      <div id="forgePreview">${forgePreview(f)}</div>${steps}<div class="fbody">${body}</div>${nav}
      ${ui.forgeBuilding ? `<div class="assembling transforming"><div class="parts">${forgeAvatar(f.look, 'xl')}</div><p class="tsteps"><span>🔩 Bolting on armor…</span><span>👁️ Calibrating optics…</span><span>⚡ ${esc(f.name)} online!</span></p></div>` : ''}</form>`;
  }

  async function forgeBuild() {
    const f = ui.forge; if (!f) return;
    if (!f.name.trim()) { f.step = 1; renderSheet(); return toast('Give your agent a name', 'bad'); }
    ui.forgeBuilding = true; renderSheet();
    await new Promise((r) => setTimeout(r, 2200)); // let the transform animation play
    const body = { name: f.name.trim(), role: f.role.trim() || 'Assistant', station: f.station, instructions: forgeInstructions(f), look: CH.cleanLook(f.look), traits: f.traits, pitch: f.pitch, model: f.model };
    const a = await act(() => (f.editId ? call('PATCH', `agents/${encodeURIComponent(f.editId)}`, body) : call('POST', 'agents', body)), f.editId ? 'Changes saved 🎨' : `${f.name} is ready for work 🚀`);
    ui.forgeBuilding = false;
    if (!a) return renderSheet();
    ui.forge = null; closeSheet();
    ui.flashAgent = a.id || f.editId; setTimeout(() => { ui.flashAgent = null; regionCache.clear(); update(); }, 4000);
    if (ui.tab !== 'station') go('station'); else { regionCache.clear(); update(); }
    setTimeout(() => { const el = document.querySelector(`#floor [data-id="${CSS.escape(ui.flashAgent || '')}"]`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 250);
  }

  // live updates while typing / sliding, without re-rendering the whole sheet
  function forgeLive() {
    const f = ui.forge; if (!f) return;
    const p = $('#forgePreview'); if (p) p.innerHTML = forgePreview(f);
    const t = $('#forgePersona'); if (t) t.textContent = personalityText(f.traits, f.name);
  }

  /* ------------------------------------------------- brains (on phone) */
  let wakeLock = null;
  async function keepAwake(on) {
    // Phones pause web apps when the screen locks, so keep it on while agents work.
    try {
      if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener?.('release', () => { wakeLock = null; }); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch { wakeLock = null; }
  }

  function brainSheet() {
    const d = S.device || {}, k = S.keys || {};
    const pct = Math.round((d.progress || 0) * 100);
    return `<div class="brain"><h3>🧠 Give your agents a brain</h3>
      <p class="muted">Agents run <b>inside this app</b>. Pick one or more brains. You can mix them per agent.</p>
      <button class="btn ghost" data-act="muse-open" style="margin:6px 0 4px">🤝 Connect Muse</button>

      <h2>📱 On this phone: free, private, offline</h2>
      ${d.supported !== false ? `<p class="muted tiny" style="margin:-4px 2px 10px">Free models that run right on your phone${d.webgpu ? ' (using its graphics chip)' : ''}. Download once over Wi-Fi; after that they work without internet. Keep the app open while it downloads. Smaller = faster.</p>
        ${[[true, '🛠 Uses tools: files, memory, skills, weather, Wikipedia…'], [false, '💬 Chat only: answers, writing, ideas and conversation']].map(([tools, title]) => `
        <p class="tiny dgroup">${title}</p>
        <div class="list">${(d.models || []).filter((m) => m.tools === tools).map((m) => {
          const done = d.downloaded?.[m.model];
          const busy = d.loading && (d.loadingModel || ui.loadingModel) === m.model;
          return `<div class="card dmodel">
            <div class="wf-head"><span class="emo">${done ? '✅' : '⬇️'}</span><div class="grow"><b>${esc(m.label)}</b> <span class="muted tiny">${esc(m.size)}</span> <span class="mbadge ${m.tools ? 'free' : ''}">${m.tools ? '🛠 TOOLS' : '💬 CHAT'}</span><p class="muted tiny">${esc(m.note)} · ${esc(m.license)}</p></div></div>
            ${busy ? `<div class="bar dl"><i style="width:${pct}%"></i></div><p class="muted tiny">${pct}% · ${esc((d.text || '').slice(0, 90))}</p>`
              : done ? `<div class="row" style="margin-top:8px"><button class="btn ghost small" data-act="use-model" data-id="device:${esc(m.model)}">${S.defaultModel === 'device:' + m.model ? '★ Default brain' : 'Make default'}</button><button class="btn ghost small" data-act="forget-model" data-id="${esc(m.model)}">Remove</button></div>`
              : `<button class="btn small" data-act="download-model" data-id="${esc(m.model)}" ${d.loading ? 'disabled' : ''} style="margin-top:8px">Download &amp; use</button>`}
          </div>`; }).join('')}</div>`).join('')}
        ${d.error ? `<p class="tiny s-error">${esc(d.error)}</p>` : ''}`
      : `<div class="card warn"><p class="tiny" style="margin:0">This browser is too old to run AI models on the phone. Update Chrome (Android) or Safari (iPhone), or use a free online brain below.</p></div>`}

      <h2>🌐 Free online brains</h2>
      <form data-form="keys" class="card">
        <label class="field">OpenRouter key ${k.openrouter ? '<span class="mbadge free">SAVED</span>' : ''}<input name="openrouter" type="password" autocomplete="off" placeholder="${k.openrouter ? '•••••• (leave blank to keep)' : 'sk-or-…'}"></label>
        <p class="muted tiny" style="margin:-8px 0 12px">Free account at <b>openrouter.ai</b> → Keys. Models ending in “:free” cost nothing.</p>
        <label class="field">Groq key ${k.groq ? '<span class="mbadge free">SAVED</span>' : ''}<input name="groq" type="password" autocomplete="off" placeholder="${k.groq ? '•••••• (leave blank to keep)' : 'gsk_…'}"></label>
        <p class="muted tiny" style="margin:-8px 0 12px">Free account at <b>console.groq.com</b> → API Keys.</p>
        <p class="tiny dgroup" style="margin-top:4px">💳 Paid brains (strongest at real work)</p>
        ${PAID_FIELDS.map(([id, label, ph, help]) => `<label class="field">${label} key ${k[id] ? '<span class="mbadge">SAVED</span>' : ''}<input name="${id}" type="password" autocomplete="off" placeholder="${k[id] ? '•••••• (leave blank to keep)' : ph}"></label><p class="muted tiny" style="margin:-8px 0 12px">${help}</p>`).join('')}
        <details><summary class="tiny"><b>Model names (only if a list stays empty)</b></summary>
          <p class="muted tiny" style="margin:8px 0">Some services don't let a phone browser list their models. Type the model you want, e.g. the name shown in that provider's docs.</p>
          ${PAID_FIELDS.filter(([id]) => id !== 'perplexity').map(([id, label]) => `<label class="field">${label} model<input name="${id}Model" autocomplete="off" placeholder="model name"></label>`).join('')}
        </details>
        <details><summary class="tiny"><b>Claude or a custom server</b></summary>
          <label class="field" style="margin-top:10px">Claude API key ${k.anthropic ? '<span class="mbadge">SAVED</span>' : ''}<input name="anthropic" type="password" autocomplete="off" placeholder="${k.anthropic ? '•••••• (leave blank to keep)' : 'sk-ant-…'}"></label>
          <p class="muted tiny" style="margin:-8px 0 12px">From console.anthropic.com. Paid per use; adds real web search.</p>
          <label class="field">OpenAI-compatible server URL<input name="customUrl" type="url" placeholder="https://…/v1" value="${esc(typeof k.customUrl === 'string' ? k.customUrl : '')}"></label>
          <label class="field">Its key (optional)<input name="customKey" type="password" autocomplete="off"></label>
        </details>
        <p class="muted tiny">🔒 Keys are stored only on this phone and sent only to that service.</p>
        <div class="row"><button class="btn" type="submit">Save keys</button>${Object.values(k).some(Boolean) ? '<button type="button" class="btn ghost narrow" data-act="clear-keys">Clear all</button>' : ''}</div>
      </form>
      ${S.models.length ? `<label class="field" style="margin-top:14px">Default brain for all agents<select data-change="default-model">${modelOptions(S.defaultModel, false)}</select></label>` : ''}
      <p class="muted tiny center">Keep the app open while agents work. Phones pause apps in the background.</p>
    </div>`;
  }

  function welcomeSheet() {
    return `<div class="welcome"><div class="center"><span class="core big"></span></div>
      <h3 class="center">Welcome to Agent Station</h3>
      <p class="muted center">Your own team of AI agents that research, write, plan, remember and learn. How should they think?</p>
      <button class="card choice" data-act="welcome-phone"><span class="emo">📱</span><div class="grow"><b>Run them on this phone</b><p class="muted tiny">Free. No computer needed. Download a free Qwen model, or use a free online one.</p></div><span class="mbadge free">RECOMMENDED</span></button>
      <button class="card choice" data-act="welcome-demo"><span class="emo">🎮</span><div class="grow"><b>Just look around first</b><p class="muted tiny">Demo mode with pretend agents. Switch anytime in ⚙️.</p></div></button>
      <button class="card choice" data-act="welcome-server"><span class="emo">💻</span><div class="grow"><b>Connect my computer</b><p class="muted tiny">For power users running the station server (connectors, voice cloning).</p></div></button>
    </div>`;
  }

  /* ------------------------------------------------------- characters */
  function gallerySheet() {
    const tags = [...new Set(CH.CHARACTERS.map((c) => c.tag))].sort((a, b) => (b === 'Robots') - (a === 'Robots'));
    return `<h3>✨ Character gallery</h3>
      <p class="muted">Original characters you can add as agents. Free to use: the characters and avatars are CC0, and their studio voices are Apache-2.0.</p>
      <button class="card gcard custom builder-cta" data-act="forge"><span class="emo">🛠️</span><div class="grow"><b>Build your own agent</b><p class="muted tiny">Design its look, name, job, personality, brain and voice</p></div><span class="muted">›</span></button>
      ${tags.map((t) => `<h2>${esc(t)}</h2><div class="ggrid">${CH.CHARACTERS.filter((c) => c.tag === t).map((c) => `
        <button class="card gcard" data-act="character" data-id="${c.id}">${charAvatar(c, 'lg')}<b>${esc(c.name)}</b><span class="muted tiny">${esc(c.role)}</span>
        ${S.agents.some((a) => a.avatar === c.id) ? '<span class="mbadge free">ON STATION</span>' : ''}</button>`).join('')}</div>`).join('')}
      <p class="muted tiny center" style="margin-top:14px">All characters were made for Agent Station and released under CC0: use, change and share them freely.</p>`;
  }

  function characterSheet(c) {
    const sv = S.studio?.voices?.find((v) => v.id === c.voice);
    const voiceLine = studioReady() && sv ? `🎙️ Voice: <b>${esc(sv.name)}</b>, ${esc(sv.accent)}, ${esc(sv.style)} <span class="mbadge free">FREE</span>` : `🎙️ Voice: your device's voice${S.mode === 'demo' || !isServer() ? '' : ' (install studio voices for a natural voice)'}`;
    return `<div class="charsheet">
      <div class="center">${charAvatar(c, 'xl')}</div>
      <h3 class="center">${esc(c.name)}</h3>
      <p class="muted center" style="margin:0">${esc(c.role)} · ${esc(c.vibe)}</p>
      <div class="card quote">“${esc(c.greeting)}”</div>
      <p class="tiny" style="margin:0">${voiceLine}</p>
      <button class="btn ghost" data-act="char-hear" data-id="${c.id}">▶ Hear ${esc(c.name)}</button>
      <details class="card"><summary class="tiny"><b>How ${esc(c.name)} works</b></summary><p class="muted tiny">${esc(c.instructions)}</p></details>
      <label class="field">AI model<select id="charModel">${modelOptions('', true)}</select></label>
      <button class="btn" data-act="char-add" data-id="${c.id}">+ Add ${esc(c.name)} to my station</button>
      <p class="muted tiny center">Free to use under CC0 · you can rename or edit it later</p>
    </div>`;
  }

  async function addCharacter(id) {
    const c = CH.byId(id); if (!c) return;
    const station = S.stations.some((s) => s.id === c.station) ? c.station : S.stations[0]?.id;
    const voiceId = studioReady() && S.studio.voices.some((v) => v.id === c.voice) ? `studio:${c.voice}` : '';
    const a = await act(() => call('POST', 'agents', { name: c.name, role: c.role, station, instructions: c.instructions, avatar: c.id, voiceId, model: $('#charModel')?.value || '' }), `${c.name} joined your station 🎉`);
    if (a) { closeSheet(); if (ui.tab !== 'station') go('station'); setTimeout(() => openSheet('agent', a.id), 300); }
  }

  /* ---------------------------------------------------------- cloning */
  const CLONE_SCRIPT = (speaker) => `I, ${speaker || '[your name]'}, agree to let my Agent Station assistants speak with a copy of my voice. ` +
    'The quick brown fox jumps over the lazy dog. On sunny mornings I like to walk to the market, buy fresh bread and a little coffee, and plan the day ahead. ' +
    'Sometimes things get busy, but a calm voice and a clear plan always help.';
  const cl = { step: 1, speaker: '', name: '', rec: null, blob: null, wav: null, url: '', secs: 0, timer: null, recording: false, saving: false };

  function cloneSheet() {
    if (cl.step === 1) return `<form data-form="clone1"><h3>🧬 Clone a voice</h3>
      <p class="muted">Your agents can answer in a cloned voice, made free and on your own computer by the open-source Chatterbox model.</p>
      <div class="card warn"><b>Consent comes first</b><p class="muted tiny" style="margin:6px 0 0">Only clone <b>your own voice</b>, or someone who has said yes. The speaker records the sample live and reads a consent statement; existing recordings can't be uploaded. Never use a cloned voice to deceive or impersonate anyone. Generated audio carries an inaudible AI watermark.</p></div>
      <label class="field" style="margin-top:12px">Speaker's full name<input name="speaker" required maxlength="60" value="${esc(cl.speaker)}" placeholder="The person whose voice this is"></label>
      <label class="field">Name for this voice<input name="name" required maxlength="40" value="${esc(cl.name)}" placeholder="e.g. My voice"></label>
      <label class="hf"><input type="checkbox" name="mine" required> This is my voice, or the speaker is here and agrees</label>
      <label class="hf" style="margin-top:8px"><input type="checkbox" name="fair" required> I won't use it to impersonate or deceive anyone</label>
      <button class="btn" type="submit" style="margin-top:14px">Next: record ›</button></form>`;
    if (cl.step === 2) return `<div class="clone"><h3>🎙️ Record ${esc(cl.speaker)}'s voice</h3>
      <p class="muted">In a quiet room, ${esc(cl.speaker)} reads this aloud in a natural voice (about 20 seconds):</p>
      <div class="card script">${esc(CLONE_SCRIPT(cl.speaker))}</div>
      <button class="orb-btn small ${cl.recording ? 'listening' : ''}" data-act="clone-rec" aria-label="${cl.recording ? 'Stop recording' : 'Start recording'}"><span class="orb-core">${cl.recording ? '⏹' : '⏺'}</span></button>
      <p class="vstate">${cl.recording ? `Recording… ${cl.secs}s (tap to stop)` : cl.wav ? `Recorded ${cl.secs}s ✓` : 'Tap to start recording'}</p>
      ${cl.wav && !cl.recording ? `<audio controls src="${cl.url}" style="width:100%"></audio>
        <div class="row" style="margin-top:10px"><button class="btn ghost" data-act="clone-rec">↺ Re-record</button><button class="btn" data-act="clone-save" ${cl.saving ? 'disabled' : ''}>${cl.saving ? 'Saving…' : 'Save voice'}</button></div>` : ''}
      <p class="muted tiny center">Tip: hold the phone about 20 cm away. Avoid music and echoey rooms.</p></div>`;
    return '';
  }

  function floatTo16BitWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
    const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
    return new Blob([buf], { type: 'audio/wav' });
  }

  async function toWav(blob) {
    // Decode whatever the browser recorded (webm/mp4) and re-encode as 24 kHz mono WAV.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const rate = 24000, len = Math.ceil(audio.duration * rate);
    const off = new OfflineAudioContext(1, len, rate);
    const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
    const out = await off.startRendering();
    return { wav: floatTo16BitWav(out.getChannelData(0), rate), secs: Math.round(audio.duration) };
  }

  async function cloneRecord() {
    if (cl.recording) { cl.rec?.stop(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } }); }
    catch { return toast('Microphone access is blocked. Allow it in your browser settings.', 'bad'); }
    const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      clearInterval(cl.timer); stream.getTracks().forEach((t) => t.stop());
      cl.recording = false;
      try {
        const { wav, secs } = await toWav(new Blob(chunks, { type: rec.mimeType }));
        if (cl.url) URL.revokeObjectURL(cl.url);
        Object.assign(cl, { wav, secs, url: URL.createObjectURL(wav) });
        if (secs < 10) toast('That was short. Read the whole script for the best clone.', 'bad');
      } catch (e) { toast(`Couldn't process the recording: ${e.message}`, 'bad'); }
      renderSheet();
    };
    Object.assign(cl, { rec, recording: true, secs: 0, wav: null });
    cl.timer = setInterval(() => { cl.secs++; if (cl.secs >= 60) rec.stop(); renderSheet(); }, 1000);
    rec.start();
    renderSheet();
  }

  async function cloneSave() {
    if (!cl.wav) return;
    cl.saving = true; renderSheet();
    try {
      const q = new URLSearchParams({ speaker: cl.speaker, name: cl.name, consent: 'yes', statement: CLONE_SCRIPT(cl.speaker).split('. ')[0] + '.' });
      const headers = { 'Content-Type': 'audio/wav' };
      if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
      const r = await fetch(apiUrl('voices?' + q), { method: 'POST', headers, body: cl.wav });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      toast(`Voice “${j.name}” saved 🧬 Pick it for an agent`);
      Object.assign(cl, { step: 1, wav: null, saving: false });
      closeSheet(); await refresh();
    } catch (e) { cl.saving = false; renderSheet(); toast(e.message, 'bad'); }
  }

  function studioCardHtml() {
    const ready = studioReady();
    return `<div class="card" style="margin-top:10px">
      <div class="wf-head"><span class="emo">🎧</span><div class="grow"><b>Studio voices</b> <span class="mbadge free">FREE · APACHE-2.0</span><p class="muted tiny">14 natural voices from Kokoro, an open-source model. Free for personal and commercial use, and runs on your computer, even without a graphics card.</p></div></div>
      ${ready ? `<div class="vgrid">${S.studio.voices.map((v) => `<button class="vchip" data-act="studio-preview" data-id="${esc(v.id)}"><b>▶ ${esc(v.name)}</b><span class="muted tiny">${esc(v.accent)} · ${esc(v.style)}</span></button>`).join('')}</div>
        <p class="muted tiny" style="margin:8px 0 0">Give an agent one of these: tap the agent → Speaking voice.</p>`
      : `<p class="muted tiny" style="margin:8px 0 0">${S.mode !== 'server' ? '⚪ Needs the station server on a computer. On the phone, agents speak with your device voice at their own pitch.' : '⚪ Not running. On the server computer: <code>cd server/voice-clone</code>, <code>pip install kokoro</code>, <code>python voice_server.py</code>'}</p>`}
    </div>`;
  }

  function cloneCardHtml() {
    const voices = S.voices || [];
    const ready = cloneReady();
    return `<div class="card" style="margin-top:10px">
      <div class="wf-head"><span class="emo">🧬</span><div class="grow"><b>Voice cloner</b> <span class="mbadge free">FREE · OPEN SOURCE</span><p class="muted tiny">Give agents a real voice: yours, or someone who agreed. Runs on your computer with Chatterbox.</p></div></div>
      <p class="muted tiny" style="margin:8px 0">${ready ? `✅ Cloner running on ${esc(S.clone.device || 'your computer')}${S.clone.device === 'cpu' ? ' (CPU: replies take a few seconds per sentence)' : ''}` : S.mode !== 'server' ? '⚪ Needs the station server on a computer (cloning is too heavy for a phone).' : '⚪ Cloning not running. On the server computer: <code>cd server/voice-clone</code>, <code>pip install -r requirements.txt</code>, <code>python voice_server.py</code>'}</p>
      ${voices.map((v) => `<div class="mem vrow"><span class="emo">🗣️</span><div class="grow"><b>${esc(v.name)}</b><p class="muted tiny">Speaker: ${esc(v.speaker)} · ${v.seconds}s sample · ${ago(v.createdAt)} · used by ${S.agents.filter((a) => a.voiceId === v.id).map((a) => esc(a.name)).join(', ') || 'no agent yet'}</p></div>
        <button class="icon-btn" data-act="clone-preview" data-id="${esc(v.id)}" aria-label="Preview" ${ready ? '' : 'disabled'}>▶</button>
        <button class="icon-btn" data-act="clone-del" data-id="${esc(v.id)}" aria-label="Delete voice">✕</button></div>`).join('')}
      <button class="btn ${voices.length ? 'ghost' : ''}" data-act="clone-start" ${isServer() ? '' : 'disabled'} style="margin-top:8px">+ Clone a voice</button>
      ${voices.length ? '<p class="muted tiny" style="margin:8px 0 0">Choose who speaks with which voice: tap an agent on the Station tab → Speaking voice.</p>' : ''}
    </div>`;
  }

  function voiceSettingsHtml() {
    const voices = canTTS ? speechSynthesis.getVoices() : [];
    const sttLine = SR ? '✅ On-device speech recognition (free)' : canServerSTT() ? `✅ Station transcription: ${esc(S.voice?.sttProvider)}` : isServer() ? '⚪ No speech recognition in this browser. Use Safari/Chrome, or set WHISPER_URL / GROQ_API_KEY on the server' : '⚪ No speech recognition in this browser. Try Safari or Chrome';
    return `<div class="card">
      <div class="wf-head"><span class="emo">🎙️</span><div class="grow"><b>Voice chat</b><p class="muted tiny">Talk to any agent and hear it answer. Tap 🎙️ at the top of the screen.</p></div><button class="btn small" data-act="voice-open">Try it</button></div>
      <p class="muted tiny" style="margin:10px 0 4px">${sttLine}<br>${canTTS ? '✅ Spoken replies with your device\'s voices (free)' : '⚪ This browser can\'t speak replies'}</p>
      <label class="field">Language you speak<select data-change="voice-lang">${VOICE_LANGS.map(([k, n]) => `<option value="${k}" ${k === voiceCfg.lang ? 'selected' : ''}>${n}</option>`).join('')}${VOICE_LANGS.some(([k]) => k === voiceCfg.lang) ? '' : `<option value="${esc(voiceCfg.lang)}" selected>${esc(voiceCfg.lang)}</option>`}</select></label>
      ${canTTS ? `<label class="field">Reply voice<select data-change="voice-voice"><option value="">Automatic</option>${voices.filter((v) => v.lang.slice(0, 2) === voiceCfg.lang.slice(0, 2)).map((v) => `<option value="${esc(v.name)}" ${v.name === voiceCfg.voice ? 'selected' : ''}>${esc(v.name)}${v.localService ? '' : ' (online)'}</option>`).join('')}</select></label>
      <label class="field">Speaking speed: <b>${(+voiceCfg.rate).toFixed(1)}×</b><input type="range" min="0.6" max="1.6" step="0.1" value="${esc(voiceCfg.rate)}" data-change="voice-rate"></label>
      <label class="hf"><input type="checkbox" data-change="read-results" ${voiceCfg.readResults ? 'checked' : ''}> Read every finished task aloud</label>
      <button class="btn ghost" data-act="voice-test" style="margin-top:10px">🔊 Test voice</button>` : ''}
    </div>${studioCardHtml()}${cloneCardHtml()}`;
  }

  async function dictate() {
    const btn = $('[data-act=dictate]');
    if (vc.dictating) { vc.stop?.(); return; }
    const ta = $('#draft'); if (!ta) return;
    const base = ta.value.trim() ? ta.value.trimEnd() + ' ' : '';
    vc.dictating = true; btn?.classList.add('rec');
    try {
      const text = await listen((t) => { ta.value = base + t; });
      ta.value = base + text;
    } catch (e) { toast(e.message, 'bad'); ta.value = base.trimEnd(); }
    finally {
      vc.dictating = false; $('[data-act=dictate]')?.classList.remove('rec');
      ui.draft = ta.value; store.set('draft', ui.draft); $('#coach').innerHTML = coachHtml(ui.draft);
    }
  }

  // Optionally read finished tasks aloud (outside voice chat).
  const spokenTasks = new Set();
  function readResultsCheck() {
    for (const t of S.tasks) {
      if (t.status !== 'done' && t.status !== 'error') continue;
      if (!spokenTasks.has(t.id)) {
        const fresh = t.finishedAt && now() - t.finishedAt < 15000;
        spokenTasks.add(t.id);
        if (voiceCfg.readResults && fresh && !t.voice && ui.sheet?.kind !== 'voice') speak(`${agentName(t.agent)} finished. ${plainSpeech(t.result)}`, t.agent);
      }
    }
  }

  /* ============================================================ actions */
  const ACTIONS = {
    'approvals-open': () => openSheet('approvals'),
    'ap-approve': (id) => { const t = $(`textarea[data-apid="${CSS.escape(id)}"]`); act(() => call('POST', `approvals/${encodeURIComponent(id)}`, { decision: 'approve', text: t ? t.value : '' }), 'Approved. Copy it and post it yourself.'); },
    'ap-reject': (id) => act(() => call('POST', `approvals/${encodeURIComponent(id)}`, { decision: 'reject' }), 'Rejected'),
    'ap-posted': (id) => act(() => call('POST', `approvals/${encodeURIComponent(id)}`, { decision: 'posted' }), 'Marked as posted'),
    'ap-copy': async (id) => { const it = (S.approvals || []).find((x) => x.id === id); try { await navigator.clipboard.writeText(it ? it.text : ''); toast('Copied'); } catch { toast('Press and hold the text to copy', 'bad'); } },
    'room-add': () => { const n = prompt('Name your new space station'); if (n && n.trim()) act(() => call('POST', 'stations', { name: n.trim() }), '🚀 Station launched: construction drones are on it'); },
    'room-del': (id) => { if (confirm('Remove this room?')) act(() => call('DELETE', `stations/${encodeURIComponent(id)}`), 'Room removed'); },
    'line-build': () => { ui.lineAgents = []; ui.lineName = ''; openSheet('line'); },
    'line-pick': (id) => { const l = ui.lineAgents || (ui.lineAgents = []); const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); else l.push(id); const n = $('#lineName'); if (n) ui.lineName = n.value; renderSheet(); },
    'line-save': () => { const l = ui.lineAgents || []; const n = $('#lineName'); const name = (n && n.value.trim()) || l.map(agentName).join(' ➜ '); closeSheet(); act(() => call('POST', 'workflows', { name, description: 'Production line', steps: l.map((id, i) => ({ name: agentName(id), agent: id, instructions: i === 0 ? 'Do your part of the job described in the input.' : 'Take the previous step\'s result and do your part. Improve and build on it.' })) }), 'Line built. Run it from the Flows tab.'); },
    'go-tasks': () => go('tasks'),
    agent: (id) => openSheet('agent', id),
    'ask-pick': (v) => { const [id, i] = String(v).split('|'); const t = S.tasks.find((x) => x.id === id); const ans = t?.ask?.options?.[+i]; if (ans) act(() => call('POST', `tasks/${encodeURIComponent(id)}/answer`, { answer: ans }), 'Sent ✓'); },
    outbox: () => { if (ui.sheet) closeSheet(); openSheet('outbox'); store.set('outboxSeen', Date.now()); setTimeout(() => { regionCache.clear(); update(); }, 400); },
    async 'file-share'(name) {
      try {
        const text = await call('GET', 'files/' + encodeURIComponent(name));
        if (navigator.share) { await navigator.share({ title: name, text }); return; }
        await navigator.clipboard.writeText(text); toast('Copied, paste it anywhere');
      } catch (e) { if (e?.name !== 'AbortError') toast(e.message || 'Could not share', 'bad'); }
    },
    'equip-toggle': (v) => {
      const [id, k] = String(v).split(':'); const st = S.stations.find((x) => x.id === id); if (!st || !S.equipment?.[k]) return;
      const cur = Array.isArray(st.equipment) ? [...st.equipment] : Object.keys(S.equipment);
      const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
      const e = S.equipment[k];
      act(() => call('PATCH', `stations/${encodeURIComponent(id)}`, { equipment: next }), `${e.icon} ${e.label} ${cur.includes(k) ? 'removed from' : 'installed in'} ${st.name}`);
    },
    'sv-fit': () => window.AgentStationView?.fit(),
    'sv-full': () => { const c = $('.svcard'); if (!c) return; const on = c.classList.toggle('svfull'); document.body.classList.toggle('noscroll', on); const b = c.querySelector('[data-act=sv-full]'); if (b) b.textContent = on ? '✕ Close' : '⛶ Full screen'; setTimeout(() => window.AgentStationView?.fit(), 50); },
    task: (id) => openSheet('task', id),
    'archive-done': () => act(() => call('POST', 'tasks/archive', {}), 'Finished tasks moved to 📚 Task history'),
    'task-archive': (id) => { closeSheet(); act(() => call('POST', `tasks/${encodeURIComponent(id)}/archive`, {}), 'Moved to 📚 Task history'); },
    'task-restore': (id) => { closeSheet(); act(() => call('POST', `tasks/${encodeURIComponent(id)}/restore`, {}), 'Back in your tasks'); },
    'hist-agent': (id) => { ui.histAgent = id; ui.histOpen = true; regionCache.clear(); update(); },
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
    'new-agent': () => openSheet('gallery'),
    'bridge-token': () => {
      const t = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
      const inp = $('form[data-form=bridge] input[name=token]'); if (inp) { inp.type = 'text'; inp.value = t; inp.select(); }
      navigator.clipboard?.writeText(t).then(() => toast('Token copied. Add it to Netlify and to Muse'), () => toast('Token made. Copy it from the box'));
    },
    'bridge-off': () => act(() => call('POST', 'bridge', { enabled: false }), 'Muse Bridge off'),
    'pconn-add': (kind) => {
      const c = CONN_CATALOG.find((x) => x.kind === kind); if (!c) return;
      openSheet('form', null, `<form data-form="pconn" data-kind="${c.kind}"><h3>${c.icon} Connect ${esc(c.name)}</h3><p class="muted">${esc(c.blurb)}</p>
        <div class="card" style="margin:10px 0"><p class="tiny" style="margin:0">${c.help}</p></div>
        <label class="field">Name<input name="name" maxlength="40" value="${esc(c.via ? c.name : c.name)}"></label>
        ${c.url ? `<input type="hidden" name="url" value="${esc(c.url)}">` : `<label class="field">${esc(c.urlLabel)}<input name="url" type="url" required placeholder="https://…"></label>`}
        ${c.tokenLabel ? `<label class="field">${esc(c.tokenLabel)}<input name="token" type="password" autocomplete="off" ${c.kind === 'github' ? 'required' : ''}></label>` : ''}
        <p class="muted tiny">🔒 Stored only on this phone. ${c.kind === 'url' || c.kind === 'github' ? 'Give tokens the least access they need.' : 'Your Zapier URL works like a password: keep it private.'}</p>
        <button class="btn" type="submit">Connect</button></form>`);
    },
    'pconn-toggle': (id) => { const c = (S.connectors || []).find((x) => x.id === id); act(() => call('POST', `phone-connectors/${id}/toggle`, { enabled: !c?.enabled }), c?.enabled ? 'Connector off' : 'Connector on'); },
    'pconn-test': async (id) => { toast('Testing…'); const r = await act(() => call('POST', `phone-connectors/${id}/test`)); if (r) toast(r.ok ? `Works from the phone: ${r.tools} tools ✅` : r.error, r.ok ? '' : 'bad'); },
    'pconn-del': (id) => { if (confirm('Remove this connector from the phone?')) act(() => call('DELETE', `phone-connectors/${id}`), 'Removed'); },
    forge: (id) => openForge(id),
    'fb-step': (i) => { ui.forge.step = +i; renderSheet(); $('.sheet-panel').scrollTop = 0; },
    'fb-next': () => { ui.forge.step = Math.min(FORGE_STEPS.length - 1, ui.forge.step + 1); renderSheet(); $('.sheet-panel').scrollTop = 0; },
    'fb-prev': () => { ui.forge.step = Math.max(0, ui.forge.step - 1); renderSheet(); $('.sheet-panel').scrollTop = 0; },
    'fb-pick': (v) => { const [k, val] = v.split(':'); ui.forge.look[k] = val; renderSheet(); },
    'fb-random': (kind) => { ui.forge.look = kind === 'human' ? randomHuman(ui.forge.look) : randomLook(kind !== 'classic'); renderSheet(); },
    'fb-preset': (id) => { const p = CH.PRESETS.find((x) => x.id === id); if (p) { ui.forge.look = { ...CH.cleanLook(p.look) }; renderSheet(); } },
    'fb-kind': (k) => { const f = ui.forge, isHuman = f.look.kind === 'human'; if ((k === 'human') === isHuman) return; if (k === 'human') { f._robot = { ...f.look }; f.look = f._person || randomHuman(f.look); } else { f._person = { ...f.look }; f.look = f._robot || randomLook(true); } renderSheet(); },
    'fb-name': () => { ui.forge.name = rnd(NAME_IDEAS); renderSheet(); },
    'fb-role': (i) => { const r = ROLE_IDEAS[+i]; Object.assign(ui.forge, { role: r.role, base: r.base, station: S.stations.some((s) => s.id === r.station) ? r.station : ui.forge.station }); renderSheet(); },
    'fb-station': (id) => { ui.forge.station = id; renderSheet(); },
    'fb-hear': () => { const f = ui.forge; const set = (v) => { ui.forgeSpeak = v; const p = $('#forgePreview'); if (p && ui.forge) p.innerHTML = forgePreview(ui.forge); }; set(true); Promise.resolve(speakDevice(`Hi! I'm ${f.name || 'your new agent'}${f.role ? `, your ${f.role.toLowerCase()}` : ''}. Ready when you are.`, ++vc.speakId, f.pitch)).finally(() => set(false)); },
    'fb-build': () => forgeBuild(),
    brain: () => { if (isPhone()) return openSheet('brain'); closeSheet(); ui.brain = 'connect'; go('brain'); },
    'download-model': (id) => {
      ui.loadingModel = id;
      toast('Downloading… keep the app open (use Wi-Fi)');
      act(() => call('POST', 'brain/device', { model: id })).then(() => renderSheet());
      const watch = setInterval(async () => {
        await refresh();
        const d = S.device || {};
        if (!d.loading && (d.downloaded?.[id] || d.error)) {
          clearInterval(watch); ui.loadingModel = null; renderSheet();
          if (d.downloaded?.[id]) toast('Brain ready! Your agents can work offline now 🎉'); else toast(d.error, 'bad');
        }
      }, 350);
    },
    'use-model': (id) => act(() => call('PATCH', 'settings', { defaultModel: id }), 'Default brain set'),
    'forget-model': (id) => act(() => call('POST', 'brain/forget-device', { model: id }), 'Removed from the list (your browser may keep the cached files)'),
    'clear-keys': () => { if (confirm('Remove all saved keys from this phone?')) act(() => call('POST', 'brain/keys', { clear: true, customUrl: '' }), 'Keys removed'); },
    'welcome-phone': async () => { cfg.source = 'phone'; store.set('cfg', cfg); closeSheet(); await refresh(); render(); schedule(); openSheet('brain'); },
    'welcome-demo': async () => { cfg.source = 'demo'; store.set('cfg', cfg); closeSheet(); await refresh(); render(); schedule(); if (!store.get('toured', false)) setTimeout(startTour, 400); },
    'welcome-server': () => { cfg.source = 'server'; store.set('cfg', cfg); closeSheet(); ACTIONS.settings(); },
    character: (id) => openSheet('character', id),
    'char-add': (id) => addCharacter(id),
    'char-hear': (id) => {
      unlockAudio();
      const c = CH.byId(id); if (!c) return;
      const sid = ++vc.speakId;
      if (studioReady() && S.studio.voices.some((v) => v.id === c.voice)) speakCloned(c.greeting, `studio:${c.voice}`, sid).catch((e) => { toast(e.message, 'bad'); speakDevice(c.greeting, ++vc.speakId, c.pitch); });
      else speakDevice(c.greeting, sid, c.pitch);
    },
    'studio-preview': (id) => {
      unlockAudio();
      const v = S.studio?.voices?.find((x) => x.id === id); if (!v) return;
      speakCloned(`Hi, I'm ${v.name}. I could be the voice of one of your agents.`, `studio:${id}`, ++vc.speakId).catch((e) => toast(e.message, 'bad'));
    },
    'pick-look': (id) => { const f = $('#sheetBody form[data-form=agent]'); if (!f) return; f.avatar.value = id; $$('.look', f).forEach((b) => b.classList.toggle('active', b.dataset.id === id)); },
    'custom-agent-form': () => openSheet('form', null, `<form data-form="agent"><h3>✏️ Create your own agent</h3><p class="muted">Pick a look, give it a name and a job, and a few sentences on how to work.</p>
      <input type="hidden" name="avatar" value="">
      <div class="looks">${[['', null], ...CH.CHARACTERS.map((c) => [c.id, c])].map(([id, c]) => `<button type="button" class="look ${id ? '' : 'active'}" data-act="pick-look" data-id="${id}" aria-label="${c ? esc(c.name) + ' look' : 'Letter tile'}">${c ? charAvatar(c, 'sm') : '<span class="avatar sm" style="background:#38e8ff">A</span>'}</button>`).join('')}</div>
      <div class="chips" style="margin-bottom:12px">${ROLE_PRESETS.map((p, i) => `<button type="button" class="chip" data-act="preset" data-id="${i}">${esc(p.role)}</button>`).join('')}</div>
      <label class="field">Name<input name="name" required maxlength="40" placeholder="e.g. Nova"></label>
      <label class="field">Role<input name="role" maxlength="60" placeholder="e.g. Customer support helper"></label>
      <label class="field">Station<select name="station">${S.stations.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field">How should it work?<textarea name="instructions" rows="4" placeholder="You help me… Always… Never…"></textarea></label>
      <label class="field">AI model<select name="model">${modelOptions('', true)}</select></label>
      <button class="btn" type="submit">Add to station</button></form>`),
    preset: (i) => { const p = ROLE_PRESETS[+i], f = $('#sheetBody form'); f.role.value = p.role; f.instructions.value = p.instructions; if (!f.name.value) f.name.focus(); },
    'muse-open': () => { if (ui.sheet && ui.sheet.kind !== 'muse') closeSheet(); openSheet('muse'); },
    'voice-open': (id) => { if (ui.sheet && ui.sheet.kind !== 'voice') closeSheet(); openVoice(id); },
    'voice-mic': () => voiceTurn(),
    'clone-start': () => { if (!cloneReady()) toast('Start the voice cloner on your server first. You can still record now.', 'bad'); Object.assign(cl, { step: 1, wav: null }); openSheet('clone'); },
    'clone-rec': () => cloneRecord(),
    'clone-save': () => cloneSave(),
    'clone-preview': (id) => {
      unlockAudio();
      const v = S.voices.find((x) => x.id === id); if (!v) return;
      const id2 = ++vc.speakId;
      toast('Generating a preview…');
      speakCloned(`Hi, this is the ${v.name} voice. This is how your agents will sound.`, id, id2).catch((e) => toast(e.message, 'bad'));
    },
    'clone-del': (id) => { const v = S.voices.find((x) => x.id === id); if (v && confirm(`Delete the “${v.name}” voice and its recording?`)) act(() => call('DELETE', 'voices/' + encodeURIComponent(id)), 'Voice deleted'); },
    'voice-hush': () => { stopSpeaking(); setVoice('idle'); },
    'voice-clear': () => { endVoice(); vc.turns = []; renderSheet(); },
    'voice-test': () => speakDevice(`Hi! I'm ${agentName(ui.draftAgent)}. This is how I'll sound when I answer you.`, ++vc.speakId),
    dictate: () => dictate(),
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
    async ask(f) {
      const v = f.answer.value.trim(); if (!v) return toast('Type an answer, or tap an option', 'bad');
      await act(() => call('POST', `tasks/${encodeURIComponent(f.dataset.id)}/answer`, { answer: v }), 'Sent ✓');
    },
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
      const ok = await act(() => call('POST', 'agents', { name: f.name.value.trim(), role: f.role.value.trim(), station: f.station.value, instructions: f.instructions.value.trim(), model: f.model.value, avatar: f.avatar?.value || '' }), 'Agent added 🎉');
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
    async bridge(f) {
      const r = await act(() => call('POST', 'bridge', { token: f.token.value.trim(), url: f.url?.value.trim() || '', enabled: true }));
      if (r) toast(r.ok ? 'Muse Bridge connected 🤝 Muse is on your floor' : `Saved, but not connected yet: ${r.error}`, r.ok ? '' : 'bad');
    },
    async pconn(f) {
      const r = await act(() => call('POST', 'phone-connectors', { kind: f.dataset.kind, name: f.name.value.trim(), url: f.url.value.trim(), token: f.token?.value.trim() || '' }));
      if (r) { closeSheet(); toast(r.ok ? `Connected: ${r.tools} tools ✅` : 'Saved. It will work with Claude brains (the phone can\'t reach it directly)', r.ok ? '' : 'bad'); }
    },
    async keys(f) {
      const body = {};
      for (const n of ['openrouter', 'groq', 'anthropic', 'customKey', ...PAID_FIELDS.map(([id]) => id), ...PAID_FIELDS.map(([id]) => `${id}Model`)]) if (f[n]?.value.trim()) body[n] = f[n].value.trim();
      if (f.customUrl) body.customUrl = f.customUrl.value.trim();
      const r = await act(() => call('POST', 'brain/keys', body), 'Keys saved on this phone');
      if (r) { f.reset(); toast(r.count ? `${r.count} model(s) ready ✅` : 'Saved, but no models were found yet. Check the key.', r.count ? '' : 'bad'); renderSheet(); }
    },
    clone1(f) {
      cl.speaker = f.speaker.value.trim(); cl.name = f.name.value.trim();
      if (!cl.speaker || !cl.name || !f.mine.checked || !f.fair.checked) return toast('Fill in both names and confirm consent', 'bad');
      cl.step = 2; renderSheet();
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
      else {
        toast(isServer() ? 'Connected to your station ✅' : isPhone() ? 'Agents now run on this phone 📱' : 'Demo mode on');
        closeSheet(); render();
        if (isPhone() && !S.models.length) setTimeout(() => openSheet('brain'), 300);
      }
      schedule();
    },
  };

  /* ============================================================== tour */
  const TOUR = [
    { title: 'Welcome to Agent Station 👋', text: 'This is mission control for your AI team. In about a minute you will know how to give agents real work, run team workflows, and teach them things.' },
    { tab: 'station', target: '#statsRow', title: 'Live numbers', text: 'How many agents are working, tasks finished, what they have learned, and spend — updated live.' },
    { tab: 'station', target: '#prodLine', title: 'The production line', text: 'Every task travels down the line: Queue → Working → Done. Tap any package to see its progress and result.' },
    { tab: 'station', target: '#floor .desk', title: 'Workstations', text: 'Each agent works at a desk in its station. A lit, typing monitor means it is working; the bubble says what it is doing right now. Tap a desk to look inside or give that agent a task.' },
    { tab: 'tasks', target: '#composer', title: 'Give a task', text: 'Pick an agent, describe what you want, press Send. You will see every step it takes, then the result and any files it saved.' },
    { tab: 'tasks', target: '#templates', title: 'Templates', text: 'Not sure what to write? Tap a template, then replace the [brackets] with your details.' },
    { tab: 'tasks', target: '#coach', title: 'Prompt coach', text: 'Lights up as your prompt gets clearer: Goal, Context, Format, Done when. “✨ Improve my prompt” rewrites a rough idea for you.' },
    { tab: 'flows', target: '#flowList .card', title: 'Assembly lines', text: 'Workflows are assembly lines: each machine is an agent doing one step, and the 📦 moves along as work is handed over. Press Run to start one.' },
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
  document.addEventListener('toggle', (e) => { if (e.target.matches?.('details[data-toggle=hist]')) ui.histOpen = e.target.open; }, true);
  // Factory floor: press and drag a room, it snaps to the grid.
  document.addEventListener('pointerdown', (e) => {
    const tile = e.target.closest?.('.ftile'); if (!tile || e.target.closest('button')) return;
    const grid = $('#fgrid'); if (!grid) return;
    const r0 = grid.getBoundingClientRect(), t0 = tile.getBoundingClientRect(), id = tile.dataset.room;
    const dx = e.clientX - t0.left, dy = e.clientY - t0.top; let moved = false;
    ui.dragging = true; tile.setPointerCapture?.(e.pointerId);
    const move = (ev) => { moved = true; tile.classList.add('drag'); tile.style.transform = `translate(${ev.clientX - dx - t0.left}px,${ev.clientY - dy - t0.top}px)`; };
    const up = (ev) => {
      tile.removeEventListener('pointermove', move); tile.removeEventListener('pointerup', up); tile.removeEventListener('pointercancel', up);
      ui.dragging = false;
      if (moved) {
        const rows = getComputedStyle(grid).gridTemplateRows.split(' ').length, cw = r0.width / FLOOR_COLS, ch = r0.height / rows;
        const c = Math.max(0, Math.min(FLOOR_COLS - 1, Math.floor((ev.clientX - r0.left) / cw))), r = Math.max(0, Math.min(rows - 1, Math.floor((ev.clientY - r0.top) / ch)));
        const L = floorLayout(); const pos = floorPos(S.stations);
        const other = Object.keys(pos).find((k) => k !== id && pos[k].c === c && pos[k].r === r);
        if (other) L[other] = pos[id]; // swap places with the room that was there
        L[id] = { c, r }; store.set('floor', L);
      }
      regionCache.clear(); update();
    };
    tile.addEventListener('pointermove', move); tile.addEventListener('pointerup', up); tile.addEventListener('pointercancel', up);
  });
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
    if (ui.forge && e.target.closest?.('form[data-form=forge]')) {
      if (e.target.dataset.fbsel) ui.forge[e.target.dataset.fbsel] = e.target.value;
      if (e.target.dataset.fbcheck) { ui.forge.look[e.target.dataset.fbcheck] = e.target.checked; renderSheet(); }
      return;
    }
    const k = e.target.dataset?.change;
    if (k === 'default-model') act(() => call('PATCH', 'settings', { defaultModel: e.target.value }), 'Default model updated');
    if (k === 'voice-agent') { vc.agent = e.target.value; vc.turns = []; renderSheet(); }
    if (k === 'handsfree') { voiceCfg.handsFree = e.target.checked; store.set('voice', voiceCfg); }
    if (k === 'read-results') { voiceCfg.readResults = e.target.checked; store.set('voice', voiceCfg); }
    if (k === 'voice-lang') { voiceCfg.lang = e.target.value; voiceCfg.voice = ''; store.set('voice', voiceCfg); regionCache.clear(); update(); }
    if (k === 'voice-voice') { voiceCfg.voice = e.target.value; store.set('voice', voiceCfg); speak('This is my new voice.'); }
    if (k === 'voice-rate') { voiceCfg.rate = +e.target.value; store.set('voice', voiceCfg); regionCache.clear(); update(); }
    if (k === 'agent-voice') act(() => call('PATCH', `agents/${encodeURIComponent(e.target.dataset.id)}`, { voiceId: e.target.value }), 'Speaking voice updated');
    if (k === 'agent-model') act(() => call('PATCH', `agents/${encodeURIComponent(e.target.dataset.id)}`, { model: e.target.value }), 'Model updated');
  });
  document.addEventListener('input', (e) => {
    const t = e.target, f = ui.forge;
    if (f && t.closest?.('form[data-form=forge]')) {
      if (t.dataset.fb) f[t.dataset.fb] = t.value;
      if (t.dataset.fbtrait) f.traits[t.dataset.fbtrait] = +t.value;
      if (t.dataset.fbpitch) f.pitch = +t.value;
      if (t.dataset.fbcheck) { f.look[t.dataset.fbcheck] = t.checked; renderSheet(); }
      if (t.dataset.fbsel) f[t.dataset.fbsel] = t.value;
      forgeLive();
    }
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

  if (canTTS) speechSynthesis.addEventListener?.('voiceschanged', () => { if (ui.tab === 'brain' && ui.brain === 'connect') { regionCache.clear(); update(); } });

  /* ============================================================== boot */
  (async function boot() {
    // First visit: if this page is served by a station server, connect to it automatically.
    let firstRun = false;
    if (!cfg.source) {
      cfg.source = 'phone';
      firstRun = true;
      if (location.protocol.startsWith('http')) {
        try {
          const r = await fetch('api/status', { cache: 'no-store' });
          if (r.ok || r.status === 401) { cfg.source = 'server'; firstRun = false; if (r.status === 401) setTimeout(() => { toast('Your station needs a token — enter it in Settings', 'bad'); ACTIONS.settings(); }, 600); }
        } catch { /* static hosting: stay in demo */ }
      }
      store.set('cfg', cfg);
    }
    if (!VIEWS[ui.tab]) ui.tab = 'station';
    render();
    schedule();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (firstRun) setTimeout(() => openSheet('welcome'), 500);
    else if (!store.get('toured', false)) setTimeout(startTour, 700);
  })();
})();

/* Keep the tab bar clear of badges the host injects at the bottom of the page (e.g. "Powered by Netlify").
   We don't hide them; we measure how much of the bottom edge a foreign element covers and lift our UI above it. */
(() => {
  const OURS = ['header.top', '#view', 'nav.tabs', '#sheet', '#toast', '#stars'];
  const isOurs = (el) => !el || el === document.body || el === document.documentElement || OURS.some((s) => el.closest?.(s));
  function measure() {
    const W = innerWidth, H = innerHeight; let top = H;
    for (let y = H - 3; y > H - 160; y -= 6) {
      for (const fx of [0.12, 0.35, 0.5, 0.65, 0.88]) {
        const el = document.elementFromPoint(W * fx, y);
        if (!isOurs(el)) { top = Math.min(top, y); break; }
      }
    }
    const h = top < H ? Math.ceil(H - top) + 6 : 0;
    const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--badge')) || 0;
    if (Math.abs(h - cur) > 4) document.documentElement.style.setProperty('--badge', h + 'px');
  }
  let t; const soon = () => { clearTimeout(t); t = setTimeout(measure, 150); };
  addEventListener('load', soon); addEventListener('resize', soon);
  [800, 2000, 4000, 8000].forEach((ms) => setTimeout(measure, ms));
  try { new MutationObserver(soon).observe(document.body, { childList: true }); } catch {}
})();
