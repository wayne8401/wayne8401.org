/* Agent Station — mobile dashboard for AI agents, workflows and stations.
 * Data comes from either the built-in demo simulator or a JSON endpoint you
 * point it at in Setup (see README.md for the expected shape). */
(() => {
  'use strict';

  const COLORS = ['#38e8ff', '#9b7bff', '#4dffa6', '#ffb84d', '#ff7ad9', '#7aa8ff'];
  const LEVEL = { info: '#38e8ff', success: '#4dffa6', warn: '#ffb84d', error: '#ff5c7a' };
  const STATUS = ['running', 'waiting', 'idle', 'error', 'done'];
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('as.' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('as.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const cfg = Object.assign({ source: 'demo', url: '', token: '', interval: 5 }, store.get('cfg', {}));
  const ui = { tab: store.get('tab', 'station'), stationFilter: 'all', wfFilter: 'active', openAgent: null };
  let state = { stations: [], agents: [], workflows: [], events: [] };
  let timer = null, paused = false, lastOk = null, lastErr = null, seenEvents = new Set();

  /* ---------------- Demo simulator ---------------- */
  const demo = (() => {
    const now = Date.now();
    const s = {
      stations: [
        { id: 'alpha', name: 'Alpha · Research', region: 'us-east' },
        { id: 'beta', name: 'Beta · Build', region: 'eu-west' },
        { id: 'gamma', name: 'Gamma · Ops', region: 'ap-south' },
      ],
      agents: [
        ['scout', 'Scout', 'Web researcher', 'alpha', 'claude-sonnet-5-5'],
        ['sage', 'Sage', 'Summariser', 'alpha', 'claude-haiku-5-5'],
        ['forge', 'Forge', 'Code writer', 'beta', 'claude-opus-5-5'],
        ['lint', 'Sentinel', 'Code reviewer', 'beta', 'claude-sonnet-5-5'],
        ['pilot', 'Pilot', 'Deploy runner', 'gamma', 'claude-haiku-5-5'],
        ['echo', 'Echo', 'Support triage', 'gamma', 'claude-sonnet-5-5'],
      ].map(([id, name, role, station, model], i) => ({
        id, name, role, station, model, status: ['running', 'running', 'running', 'waiting', 'idle', 'running'][i],
        task: '', progress: Math.random() * 60, tokens: 20000 + Math.floor(Math.random() * 90000),
        cost: +(Math.random() * 3).toFixed(2), uptime: now - (1 + i) * 3.7e6, history: Array.from({ length: 24 }, () => Math.random()),
      })),
      workflows: [
        wf('wf1', 'Market research brief', 'schedule · 09:00', ['Collect sources|scout', 'Extract facts|scout', 'Summarise|sage', 'Publish report|sage']),
        wf('wf2', 'Feature PR pipeline', 'github · issue #42', ['Plan change|forge', 'Write code|forge', 'Review diff|lint', 'Run tests|pilot', 'Deploy preview|pilot']),
        wf('wf3', 'Support inbox sweep', 'webhook · new ticket', ['Classify ticket|echo', 'Draft reply|echo', 'Human approval|echo']),
        wf('wf4', 'Nightly data sync', 'schedule · 02:00', ['Pull data|pilot', 'Validate|lint', 'Load warehouse|pilot'], 'done'),
      ],
      events: [],
    };
    s.workflows[0].steps[0].status = 'done';
    s.workflows[1].steps[0].status = 'done';
    s.workflows[1].steps[1].status = 'running';
    s.workflows[0].steps[1].status = 'running';
    s.workflows[2].steps[0].status = 'running';
    const tasks = {
      scout: ['Crawling 14 sources on agent pricing', 'Reading analyst report PDF', 'Cross-checking citations'],
      sage: ['Condensing findings to 1-page brief', 'Writing executive summary'],
      forge: ['Implementing OAuth callback handler', 'Refactoring queue worker', 'Writing unit tests'],
      lint: ['Waiting for diff from Forge', 'Reviewing 6 changed files'],
      pilot: ['Standing by', 'Running test suite (212 tests)', 'Deploying preview build'],
      echo: ['Classifying 8 new tickets', 'Drafting reply to billing question'],
    };
    const lines = [
      ['info', 'scout', 'Fetched 3 new sources'], ['success', 'forge', 'Committed 2 files to feature branch'],
      ['info', 'sage', 'Draft summary at 620 words'], ['warn', 'echo', 'Ticket flagged for human review'],
      ['success', 'lint', 'Review passed with 1 suggestion'], ['error', 'pilot', 'Test "auth.spec" failed — retrying'],
      ['info', 'pilot', 'Preview deployed to staging'], ['warn', 'scout', 'Rate-limited by source, backing off 30s'],
    ];

    function wf(id, name, trigger, steps, status = 'running') {
      return {
        id, name, trigger, status, startedAt: Date.now() - Math.random() * 3.6e6,
        steps: steps.map(x => { const [n, a] = x.split('|'); return { name: n, agent: a, status: status === 'done' ? 'done' : 'pending', duration: status === 'done' ? 20 + Math.random() * 200 : 0 }; }),
      };
    }

    function tick() {
      const t = Date.now();
      s.agents.forEach(a => {
        if (a.status === 'running') {
          a.progress = Math.min(100, a.progress + Math.random() * 9);
          a.tokens += Math.floor(Math.random() * 1800);
          a.cost = +(a.cost + Math.random() * 0.03).toFixed(2);
          if (a.progress >= 100) { a.progress = 0; a.task = pick(tasks[a.id]); }
        } else if (Math.random() < .12) {
          a.status = a.status === 'error' ? 'running' : pick(['running', 'running', 'waiting', 'idle']);
        }
        if (a.status === 'running' && Math.random() < .015) a.status = 'error';
        if (!a.task || Math.random() < .05) a.task = pick(tasks[a.id]);
        a.history.push(a.status === 'running' ? .4 + Math.random() * .6 : Math.random() * .2); a.history.shift();
      });
      s.workflows.forEach(w => {
        w.steps.forEach(st => { if (st.status === 'running') st.duration += 2 + Math.random() * 4; });
        const cur = w.steps.findIndex(st => st.status === 'running');
        if (cur >= 0 && Math.random() < .18) {
          w.steps[cur].status = 'done';
          if (w.steps[cur + 1]) w.steps[cur + 1].status = 'running';
          else { w.status = 'done'; push('success', w.steps[cur].agent, `Workflow “${w.name}” completed`); }
        }
        if (w.status === 'done' && Math.random() < .03) {
          w.status = 'running'; w.startedAt = t;
          w.steps.forEach((st, i) => { st.status = i ? 'pending' : 'running'; st.duration = 0; });
          push('info', w.steps[0].agent, `Workflow “${w.name}” triggered (${w.trigger})`);
        }
      });
      if (Math.random() < .6) { const [l, a, m] = pick(lines); push(l, a, m); }
      return JSON.parse(JSON.stringify(s));
    }
    function push(level, agent, msg) {
      s.events.unshift({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), ts: Date.now(), level, agent, msg });
      s.events.length = Math.min(s.events.length, 80);
    }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    for (let i = 0; i < 6; i++) tick();
    return { tick };
  })();

  /* ---------------- Data loading ---------------- */
  async function load() {
    if (paused) return;
    try {
      let data;
      if (cfg.source === 'demo') data = demo.tick();
      else {
        const headers = { Accept: 'application/json' };
        if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
        const res = await fetch(cfg.url, { headers, cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = normalise(await res.json());
      }
      state = data; lastOk = Date.now(); lastErr = null;
    } catch (e) { lastErr = e.message || String(e); }
    render();
  }

  function normalise(d) {
    const arr = v => Array.isArray(v) ? v : [];
    const agents = arr(d.agents).map((a, i) => ({
      id: String(a.id ?? i), name: a.name ?? `Agent ${i + 1}`, role: a.role ?? '', station: a.station ?? 'default',
      status: STATUS.includes(a.status) ? a.status : 'idle', task: a.task ?? '', progress: +a.progress || 0,
      tokens: +a.tokens || 0, cost: +a.cost || 0, model: a.model ?? '', uptime: a.uptime ? +new Date(a.uptime) : null,
      history: arr(a.history).map(Number),
    }));
    let stations = arr(d.stations).map(s => ({ id: String(s.id), name: s.name ?? s.id, region: s.region ?? '' }));
    if (!stations.length) stations = [...new Set(agents.map(a => a.station))].map(id => ({ id, name: id, region: '' }));
    return {
      stations, agents,
      workflows: arr(d.workflows).map((w, i) => ({
        id: String(w.id ?? i), name: w.name ?? `Workflow ${i + 1}`, trigger: w.trigger ?? '', status: w.status ?? 'running',
        startedAt: w.startedAt ? +new Date(w.startedAt) : null,
        steps: arr(w.steps).map(s => ({ name: s.name ?? 'Step', agent: s.agent ?? '', status: s.status ?? 'pending', duration: +s.duration || 0 })),
      })),
      events: arr(d.events).map((e, i) => ({ id: e.id ?? `${e.ts}-${i}`, ts: +new Date(e.ts ?? Date.now()), level: LEVEL[e.level] ? e.level : 'info', agent: e.agent ?? '', msg: e.msg ?? e.message ?? '' })),
    };
  }

  function schedule() {
    clearInterval(timer);
    timer = setInterval(load, Math.max(2, +cfg.interval || 5) * 1000);
    load();
  }

  /* ---------------- Helpers ---------------- */
  const agentById = id => state.agents.find(a => a.id === id);
  const colorOf = id => COLORS[Math.max(0, state.agents.findIndex(a => a.id === id)) % COLORS.length];
  const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
  const fmtDur = s => s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
  const ago = t => t ? fmtDur(Math.max(0, (Date.now() - t) / 1000)) + ' ago' : '—';
  const time = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const pill = s => `<span class="pill s-${esc(s)}">${esc(s)}</span>`;
  const avatar = a => `<span class="avatar" style="background:${colorOf(a.id)}">${esc(a.name.slice(0, 1))}</span>`;
  const spark = h => {
    if (!h || h.length < 2) return '';
    const pts = h.map((v, i) => `${(i / (h.length - 1) * 100).toFixed(1)},${(52 - Math.max(0, Math.min(1, v)) * 46).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 100 56" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#38e8ff" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  };

  /* ---------------- Views ---------------- */
  function viewStation() {
    const A = state.agents;
    const running = A.filter(a => a.status === 'running').length;
    const errors = A.filter(a => a.status === 'error').length;
    const activeWf = state.workflows.filter(w => w.status === 'running').length;
    const tokens = A.reduce((s, a) => s + a.tokens, 0), cost = A.reduce((s, a) => s + a.cost, 0);
    const list = ui.stationFilter === 'all' ? A : A.filter(a => a.station === ui.stationFilter);
    return `
      <div class="stats">
        <div class="card stat"><div class="label">Agents online</div><div class="value">${running}<span class="muted" style="font-size:15px"> / ${A.length}</span></div><div class="sub">${errors ? `<span class="s-error">${errors} need attention</span>` : 'All systems nominal'}</div></div>
        <div class="card stat"><div class="label">Active workflows</div><div class="value">${activeWf}</div><div class="sub">${state.workflows.length} total</div></div>
        <div class="card stat"><div class="label">Tokens today</div><div class="value">${fmtNum(tokens)}</div><div class="sub">across ${state.stations.length} stations</div></div>
        <div class="card stat"><div class="label">Spend</div><div class="value">$${cost.toFixed(2)}</div><div class="sub">estimated</div></div>
      </div>
      <h2>Station map</h2>
      <div class="card">${orbit()}</div>
      <h2>Agents</h2>
      <div class="chips">
        <button class="chip ${ui.stationFilter === 'all' ? 'active' : ''}" data-station="all">All</button>
        ${state.stations.map(s => `<button class="chip ${ui.stationFilter === s.id ? 'active' : ''}" data-station="${esc(s.id)}">${esc(s.name)}</button>`).join('')}
      </div>
      <div class="list" style="margin-top:10px">
        ${list.map(a => `
          <button class="card agent" data-agent="${esc(a.id)}">
            ${avatar(a)}
            <div><div class="name">${esc(a.name)} <span class="muted">· ${esc(a.role)}</span></div>
              <div class="task">${esc(a.task || '—')}</div>
              <div class="bar"><i style="width:${a.status === 'running' ? a.progress : 0}%"></i></div></div>
            ${pill(a.status)}
          </button>`).join('') || '<div class="empty">No agents on this station</div>'}
      </div>`;
  }

  function orbit() {
    const S = state.stations, cx = 150, cy = 150;
    let svg = `<circle class="ring" cx="${cx}" cy="${cy}" r="62"/><circle class="ring" cx="${cx}" cy="${cy}" r="122"/>`;
    let nodes = '';
    S.forEach((st, i) => {
      const ang = (i / S.length) * Math.PI * 2 - Math.PI / 2;
      const sx = cx + Math.cos(ang) * 62, sy = cy + Math.sin(ang) * 62;
      const members = state.agents.filter(a => a.station === st.id);
      const hot = members.some(a => a.status === 'running');
      svg += `<line class="link ${hot ? 'hot' : ''}" x1="${cx}" y1="${cy}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}"/>`;
      nodes += `<g class="node" data-station="${esc(st.id)}"><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="13" fill="#0b1022" stroke="#9b7bff" stroke-width="2"/><text x="${sx.toFixed(1)}" y="${(sy + 3.5).toFixed(1)}">${esc(st.name.slice(0, 1))}</text></g>`;
      members.forEach((a, j) => {
        const spread = Math.PI * 2 / Math.max(S.length, 1);
        const aa = ang + (j - (members.length - 1) / 2) * (spread / Math.max(members.length, 2)) * .9;
        const ax = cx + Math.cos(aa) * 122, ay = cy + Math.sin(aa) * 122;
        const c = { running: '#4dffa6', waiting: '#ffb84d', error: '#ff5c7a', done: '#38e8ff' }[a.status] || '#8592b8';
        svg += `<line class="link ${a.status === 'running' ? 'hot' : ''}" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}"/>`;
        nodes += `<g class="node" data-agent="${esc(a.id)}"><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="15" fill="${colorOf(a.id)}" opacity=".18"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="9" fill="${colorOf(a.id)}" stroke="${c}" stroke-width="2.5"/><text x="${ax.toFixed(1)}" y="${(ay + 27).toFixed(1)}">${esc(a.name)}</text></g>`;
      });
    });
    return `<div class="orbit"><svg viewBox="-10 -10 320 320" role="img" aria-label="Station map">${svg}
      <circle cx="${cx}" cy="${cy}" r="24" fill="rgba(56,232,255,.12)" stroke="#38e8ff" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="#38e8ff"/><text class="hub-label" x="${cx}" y="${cy + 40}">CORE</text>${nodes}</svg></div>`;
  }

  function viewWorkflows() {
    const f = ui.wfFilter;
    const list = state.workflows.filter(w => f === 'all' || (f === 'active' ? w.status === 'running' : w.status === f));
    return `
      <h2 style="margin-top:4px">Workflows</h2>
      <div class="chips">${['active', 'done', 'error', 'all'].map(k => `<button class="chip ${f === k ? 'active' : ''}" data-wf="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <div class="list" style="margin-top:10px">
        ${list.map(w => {
          const done = w.steps.filter(s => s.status === 'done').length;
          return `<div class="card">
            <div class="wf-head"><div><h3>${esc(w.name)}</h3><p class="muted">${esc(w.trigger)}${w.startedAt ? ' · started ' + ago(w.startedAt) : ''}</p></div>${pill(w.status)}</div>
            <div class="bar"><i style="width:${w.steps.length ? done / w.steps.length * 100 : 0}%"></i></div>
            <ol class="steps">${w.steps.map(s => {
              const a = agentById(s.agent);
              return `<li class="step ${esc(s.status)}" ${a ? `data-agent="${esc(a.id)}"` : ''}>
                <span class="mark">${s.status === 'done' ? '✓' : s.status === 'error' ? '!' : ''}</span>
                <div><div class="title">${esc(s.name)}</div><div class="who">${esc(a ? a.name : s.agent)}</div></div>
                <span class="t">${s.duration ? fmtDur(s.duration) : ''}</span></li>`;
            }).join('')}</ol></div>`;
        }).join('') || '<div class="empty">No workflows here</div>'}
      </div>`;
  }

  function viewActivity() {
    const fresh = [];
    const html = state.events.map(e => {
      const isNew = !seenEvents.has(e.id); if (isNew) fresh.push(e.id);
      const a = agentById(e.agent);
      return `<div class="card event ${isNew && seenEvents.size ? 'new' : ''}">
        <span class="lvl" style="background:${LEVEL[e.level]}"></span>
        <div><div class="msg">${esc(e.msg)}</div><div class="meta mono">${time(e.ts)} · ${esc(a ? a.name : e.agent || 'system')} · ${esc(e.level)}</div></div></div>`;
    }).join('');
    fresh.forEach(id => seenEvents.add(id));
    return `<h2 style="margin-top:4px">Live activity</h2><div class="feed">${html || '<div class="empty">Waiting for events…</div>'}</div>`;
  }

  function viewSettings() {
    return `
      <h2 style="margin-top:4px">Data source</h2>
      <form class="card" id="cfgForm">
        <label class="field">Source
          <select name="source"><option value="demo" ${cfg.source === 'demo' ? 'selected' : ''}>Demo simulator</option><option value="url" ${cfg.source === 'url' ? 'selected' : ''}>My agent API (JSON)</option></select></label>
        <label class="field">Endpoint URL<input name="url" type="url" inputmode="url" placeholder="https://my-server.example/agents/status" value="${esc(cfg.url)}"></label>
        <label class="field">Bearer token (optional, stored only on this device)<input name="token" type="password" autocomplete="off" value="${esc(cfg.token)}"></label>
        <label class="field">Refresh every (seconds)<input name="interval" type="number" min="2" max="300" value="${esc(cfg.interval)}"></label>
        <div class="row"><button class="btn" type="submit">Save &amp; connect</button><button class="btn ghost" type="button" id="pauseBtn">${paused ? 'Resume' : 'Pause'}</button></div>
        <p class="muted" style="margin-top:12px">${lastErr ? `<span class="s-error">Last error: ${esc(lastErr)}</span>` : lastOk ? `Last update ${time(lastOk)}` : ''}</p>
      </form>
      <h2>Expected JSON</h2>
      <div class="card"><p class="muted">Your endpoint should return (all fields optional):</p>
<pre class="code">{
  "stations": [{"id":"alpha","name":"Alpha","region":"us-east"}],
  "agents": [{"id":"scout","name":"Scout","role":"Researcher",
    "station":"alpha","status":"running","task":"Reading docs",
    "progress":42,"tokens":12000,"cost":0.4,"model":"claude-sonnet-5-5"}],
  "workflows": [{"id":"wf1","name":"Brief","status":"running",
    "trigger":"schedule","steps":[{"name":"Collect",
    "agent":"scout","status":"done","duration":31}]}],
  "events": [{"ts":"2026-11-17T09:00:00Z","level":"info",
    "agent":"scout","msg":"Fetched 3 sources"}]
}</pre>
        <p class="muted" style="margin-top:8px">status: running · waiting · idle · error · done — level: info · success · warn · error. The server must allow CORS from this app's origin.</p></div>
      <h2>Install on your phone</h2>
      <div class="card"><p class="muted">iPhone: Safari → Share → <b>Add to Home Screen</b>. Android: Chrome menu → <b>Install app</b>. It then opens full-screen like a native app.</p></div>`;
  }

  function agentSheet(a) {
    const flows = state.workflows.filter(w => w.steps.some(s => s.agent === a.id));
    const st = state.stations.find(s => s.id === a.station);
    const recent = state.events.filter(e => e.agent === a.id).slice(0, 6);
    return `
      <div class="agent" style="cursor:default">${avatar(a)}<div><h3>${esc(a.name)}</h3><p class="muted">${esc(a.role)} · ${esc(st ? st.name : a.station)}</p></div>${pill(a.status)}</div>
      <div class="card" style="margin-top:14px"><div class="muted">Current task</div><div style="margin-top:4px">${esc(a.task || '—')}</div><div class="bar"><i style="width:${a.status === 'running' ? a.progress : 0}%"></i></div></div>
      <div class="kv">
        <div><span>Tokens</span><b>${fmtNum(a.tokens)}</b></div><div><span>Spend</span><b>$${a.cost.toFixed(2)}</b></div>
        <div><span>Model</span><b style="font-size:13px">${esc(a.model || '—')}</b></div><div><span>Uptime</span><b>${a.uptime ? fmtDur((Date.now() - a.uptime) / 1000) : '—'}</b></div>
      </div>
      ${a.history.length ? `<div class="card"><div class="muted">Activity (last ${a.history.length} ticks)</div>${spark(a.history)}</div>` : ''}
      <h2>Workflows</h2>
      <div class="list">${flows.map(w => `<div class="card"><div class="wf-head"><span>${esc(w.name)}</span>${pill(w.status)}</div></div>`).join('') || '<div class="empty">Not part of any workflow</div>'}</div>
      <h2>Recent events</h2>
      <div class="feed">${recent.map(e => `<div class="card event"><span class="lvl" style="background:${LEVEL[e.level]}"></span><div><div class="msg">${esc(e.msg)}</div><div class="meta mono">${time(e.ts)}</div></div></div>`).join('') || '<div class="empty">No recent events</div>'}</div>`;
  }

  /* ---------------- Render + events ---------------- */
  function render() {
    const views = { station: viewStation, workflows: viewWorkflows, activity: viewActivity, settings: viewSettings };
    // Don't clobber the settings form while the user is typing in it.
    if (!(ui.tab === 'settings' && document.activeElement?.closest?.('#cfgForm'))) {
      $('#view').innerHTML = views[ui.tab]();
    }
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
    $('#sourceLabel').textContent = cfg.source === 'demo' ? 'Demo feed' : (() => { try { return new URL(cfg.url).host; } catch { return 'Custom API'; } })();
    const badge = $('#liveBadge');
    badge.className = 'live' + (paused ? ' paused' : lastErr ? ' error' : '');
    $('#liveText').textContent = paused ? 'PAUSED' : lastErr ? 'OFFLINE' : 'LIVE';
    if (ui.openAgent) {
      const a = agentById(ui.openAgent);
      if (a) $('#sheetBody').innerHTML = agentSheet(a); else closeSheet();
    }
  }

  function openSheet(id) { ui.openAgent = id; $('#sheet').hidden = false; render(); }
  function closeSheet() { ui.openAgent = null; $('#sheet').hidden = true; }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-tab],[data-agent],[data-station],[data-wf],[data-close],#pauseBtn');
    if (!t) return;
    if (t.dataset.tab) { ui.tab = t.dataset.tab; store.set('tab', ui.tab); window.scrollTo(0, 0); render(); }
    else if (t.dataset.close !== undefined) closeSheet();
    else if (t.dataset.agent) openSheet(t.dataset.agent);
    else if (t.dataset.station) { ui.stationFilter = t.dataset.station; render(); }
    else if (t.dataset.wf) { ui.wfFilter = t.dataset.wf; render(); }
    else if (t.id === 'pauseBtn') { paused = !paused; t.blur(); render(); if (!paused) load(); }
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'cfgForm') return;
    e.preventDefault();
    const f = new FormData(e.target);
    Object.assign(cfg, { source: f.get('source'), url: f.get('url').trim(), token: f.get('token'), interval: +f.get('interval') || 5 });
    if (cfg.source === 'url' && !cfg.url) { lastErr = 'Enter an endpoint URL'; cfg.source = 'demo'; }
    store.set('cfg', cfg); seenEvents.clear(); document.activeElement.blur(); schedule();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

  /* ---------------- Starfield ---------------- */
  (function stars() {
    const c = $('#stars'), x = c.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pts = [];
    const size = () => {
      c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
      pts = Array.from({ length: 110 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, r: Math.random() * 1.3 + .2, s: Math.random() * .25 + .05 }));
    };
    const draw = () => {
      x.clearRect(0, 0, c.width, c.height);
      const g = x.createRadialGradient(c.width * .8, 0, 0, c.width * .8, 0, c.width);
      g.addColorStop(0, 'rgba(155,123,255,.14)'); g.addColorStop(1, 'transparent');
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#cfe6ff';
      pts.forEach(p => { if (!reduce) { p.y += p.s; if (p.y > c.height) p.y = 0; } x.globalAlpha = .3 + p.r / 2; x.beginPath(); x.arc(p.x, p.y, p.r * devicePixelRatio, 0, 7); x.fill(); });
      x.globalAlpha = 1;
      if (!reduce) requestAnimationFrame(draw);
    };
    addEventListener('resize', () => { size(); if (reduce) draw(); }); size(); draw();
  })();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  schedule();
})();
