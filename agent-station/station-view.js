/* Agent Station: Station View
 * A top-down, game-style view of your orbital ring station drawn on a canvas.
 * A central Command Dome with round, glass-domed pods arranged around it on an outer ring,
 * joined by glass tube walkways. Each pod is one of your stations; your agents walk around as robots,
 * sit at their desks while they work, and machines/belts run while work happens.
 * All art here is drawn in code and is original (CC0), like the rest of Agent Station.
 *
 * API: AgentStationView.mount(hostEl, { onAgent(id), sprite(agent) -> svgString })
 *      AgentStationView.setData({ stations, agents, tasks, workflows })
 */
(() => {
  'use strict';
  const T = 16; // one floor tile, in world pixels
  const ROOM_H = 13 * T, CORR_H = 4 * T, BEVEL = 2 * T, WALL = 10;
  const FLOORS = ['metal', 'wood', 'grate', 'steel'];
  const INK = '#0b1022';

  let host = null, canvas = null, ctx = null, handlers = {}, data = null;
  let world = null, staticLayer = null, staticKey = '';
  const cam = { x: 0, y: 0, z: 1, fitted: false };
  const bots = new Map(); // agent id -> walker state
  const npcs = [];
  let cmdr = null; // the owner's own avatar walks the station too
  const sprites = new Map(); // svg -> Image
  let running = false, lastT = 0, visible = true;

  /* ------------------------------------------------------------ helpers */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const hash = (s) => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  function spriteImg(svg) {
    if (!svg) return null;
    let img = sprites.get(svg);
    if (!img) {
      img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg width="128" height="128" '));
      sprites.set(svg, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  /* ------------------------------------------------------------ layout */
  function kindOf(st) {
    const s = `${st.name} ${st.region || ''}`.toLowerCase();
    if (/research|web|lab|science|data/.test(s)) return 'research';
    if (/studio|writ|creative|media|social|design/.test(s)) return 'studio';
    if (/ops|plan|deck|command|control|schedul/.test(s)) return 'ops';
    return 'other';
  }
  function build(d) {
    const stations = d.stations.slice(0, 10);
    const hub = { id: '__lounge', name: 'COMMAND DOME', deco: 'lounge', floor: 'hub', R: 10.5 * T, cx: 0, cy: 0, hub: true };
    const pods = stations.map((st) => {
      const crew = Math.min(Math.max(d.agents.filter((a) => a.station === st.id).length, 1), 4);
      const k = kindOf(st);
      return { id: st.id, name: st.name.toUpperCase(), region: (st.region || '').toUpperCase(), kind: k, floor: k === 'studio' ? 'warm' : k === 'ops' ? 'violet' : k === 'research' ? 'teal' : 'cool', R: Math.max(10 * T, (crew * 5 + 3) * T / 1.36), custom: st.custom, equipment: Array.isArray(st.equipment) ? st.equipment : null };
    });
    pods.push({ id: '__outbox', name: 'OUTBOX', deco: 'storage', outbox: true, floor: 'cool', R: 7.2 * T });
    pods.push({ id: '__bayL', name: 'HANGAR', deco: 'storage', floor: 'cool', R: 7.2 * T });
    const N = pods.length, Rmax = Math.max(...pods.map((x) => x.R));
    const D = Math.max(hub.R + 6 * T + Rmax, (Rmax + 2.5 * T) / Math.sin(Math.PI / N));
    pods.forEach((pd, i) => { pd.ang = -Math.PI / 2 + i * 2 * Math.PI / N; pd.cx = Math.cos(pd.ang) * D; pd.cy = Math.sin(pd.ang) * D; });
    const rooms = [hub, ...pods];
    for (const r of rooms) { const a = r.R * .68; r.x = r.cx - a; r.y = r.cy - a; r.w = r.h = 2 * a; r.top = r.hub ? true : r.cy <= 0; }
    for (const r of rooms) furnish(r, d);
    const ext = D + Rmax + 6 * T;
    return { rooms, hub, ring: D, bounds: { x: -ext, y: -ext, w: ext * 2, h: ext * 2 } };
  }
  function furnish(r, d) {
    r.items = []; r.desks = []; r.lamps = [];
    const ix = r.x + 2 * T, iw = r.w - 4 * T;

    if (r.deco === 'lounge') {
      r.items.push({ t: 'easel', x: r.x + r.w / 2 - T, y: r.y + 2.2 * T });
      r.items.push({ t: 'shelf', x: ix + T, y: r.y + 4.5 * T }, { t: 'cabinet', x: ix + T, y: r.y + 7.5 * T });
      r.items.push({ t: 'table', x: r.x + r.w / 2 + 2 * T, y: r.y + 7.5 * T });
      r.items.push({ t: 'couch', x: r.x + 2.5 * T, y: r.y + 2.2 * T }, { t: 'plant', x: r.x + 2.5 * T, y: r.y + 10.5 * T }, { t: 'plant', x: r.x + r.w - 3.5 * T, y: r.y + 2.4 * T });
      return;
    }
    if (r.deco === 'storage') {
      if (!r.outbox) for (let i = 0; i < 4; i++) r.items.push({ t: 'crate', x: r.x + 1.5 * T + (i % 2) * 2.4 * T, y: r.y + 2 * T + Math.floor(i / 2) * 2.4 * T });
      r.items.push({ t: 'console', x: r.x + 2 * T, y: r.y + 7 * T });
      return;
    }
    // station room: props on the back wall, desks in the middle, machine + belt near the door side
    const back = r.top ? r.y + 2.3 * T : r.y + r.h - 3.8 * T; // wall away from the corridor
    const deskY = r.y + (r.top ? 5.2 * T : 4.6 * T);
    const lineY = r.top ? r.y + r.h - 4.2 * T : r.y + 9.4 * T;
    const EQ_PROP = { dish: 'dish', console: 'console', shelf: 'shelf', board: 'board', ring: 'ring', uplink: 'uplink' };
    const props = r.equipment ? (r.equipment.map((k) => EQ_PROP[k]).filter(Boolean).length ? r.equipment.map((k) => EQ_PROP[k]).filter(Boolean) : ['crate'])
      : ({ research: ['dish', 'console', 'dish'], studio: ['ring', 'shelf', 'plant'], ops: ['board', 'console', 'crate'], other: ['console', 'plant', 'crate'] }[r.kind] || ['console']);
    props.forEach((t, i) => r.items.push({ t, x: ix + T + i * Math.max(3 * T, (iw - 4 * T) / Math.max(1, props.length - 1)), y: back }));
    r.items.push({ t: 'plant', x: r.x + r.w - 2.6 * T, y: back + (r.top ? 0 : -T) });
    const crew = d.agents.filter((a) => a.station === r.id).slice(0, 4);
    crew.forEach((a, i) => r.desks.push({ agent: a.id, x: ix + 1.5 * T + i * 5 * T, y: deskY }));
    // empty chairs to fill the room a little
    for (let i = crew.length; i < Math.min(4, Math.floor((iw - 2 * T) / (5 * T))); i++) r.items.push({ t: 'chair', x: ix + 2.5 * T + i * 5 * T, y: deskY + 1.6 * T });
    r.machine = { x: r.x + r.w - 7 * T, y: lineY };
    r.belt = { x: r.x + 2.5 * T, y: lineY + 0.9 * T, w: r.w - 9.8 * T };
  }

  /* ------------------------------------------------------------ static drawing */
  function roomPath(c, r, inset = 0) { c.beginPath(); c.arc(r.cx, r.cy, Math.max(1, r.R - inset), 0, Math.PI * 2); }
  const inRoom = (r, x, y) => Math.hypot(x - r.cx, y - r.cy) < r.R - 2;
  const FLOOR = { hub: ['#c3cdd6', '#a9b6c2'], teal: ['#b4ccd0', '#97b3b9'], warm: ['#d3c6b8', '#b9aa9a'], violet: ['#bfbed8', '#a3a2c2'], cool: ['#bcc6d0', '#a1adb9'] };
  function hexFloor(c, kind, x, y, w, h) {
    const [base, line] = FLOOR[kind] || FLOOR.cool, sz = T * .82, hw = Math.sqrt(3) * sz;
    c.fillStyle = base; c.fillRect(x, y, w, h);
    c.strokeStyle = line; c.lineWidth = 1;
    for (let row = 0, yy = y - sz; yy < y + h + sz; row++, yy += sz * 1.5) {
      for (let xx = x - hw + (row % 2 ? hw / 2 : 0); xx < x + w + hw; xx += hw) {
        c.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, px = xx + Math.cos(a) * sz, py = yy + Math.sin(a) * sz; k ? c.lineTo(px, py) : c.moveTo(px, py); }
        c.closePath(); c.stroke();
      }
    }
  }
  function drawRim(c, r, doors) {
    const R = r.R;
    c.lineWidth = WALL + 7; c.strokeStyle = 'rgba(5,10,20,.65)'; roomPath(c, r, -2); c.stroke();
    c.lineWidth = WALL; c.strokeStyle = '#e6edf3'; roomPath(c, r); c.stroke();
    c.lineWidth = 2; c.strokeStyle = '#9fb0bf'; roomPath(c, r, -WALL / 2 + 1); c.stroke();
    c.save(); c.shadowColor = '#38e8ff'; c.shadowBlur = 8; c.lineWidth = 2; c.strokeStyle = '#38e8ff'; roomPath(c, r, WALL / 2 + 1.5); c.stroke(); c.restore();
    // porthole windows around the rim
    const n = Math.max(10, Math.round(R / (2.2 * T)) * 2);
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n; if (doors.some((da) => Math.abs(Math.atan2(Math.sin(a - da), Math.cos(a - da))) < .32)) continue;
      c.save(); c.translate(r.cx + Math.cos(a) * R, r.cy + Math.sin(a) * R); c.rotate(a);
      c.fillStyle = '#1a2a3d'; c.fillRect(-2, -T * .55, 4, T * 1.1); c.fillStyle = 'rgba(120,200,255,.55)'; c.fillRect(-1, -T * .4, 1.6, T * .5); c.restore();
    }
    for (const da of doors) { // door: a gap in the rim with a teal frame
      c.save(); c.translate(r.cx, r.cy); c.rotate(da);
      c.fillStyle = (FLOOR[r.floor] || FLOOR.cool)[0]; c.fillRect(R - WALL, -1.75 * T, WALL * 2, 3.5 * T);
      c.fillStyle = '#38e8ff'; c.fillRect(R - WALL, -1.75 * T - 2, WALL * 2, 2); c.fillRect(R - WALL, 1.75 * T, WALL * 2, 2); c.restore();
    }
    // the dome: a soft glass sheen over the top-left of the pod
    c.save(); c.strokeStyle = 'rgba(255,255,255,.09)'; c.lineWidth = R * .22; c.beginPath(); c.arc(r.cx, r.cy, R * .74, Math.PI * 1.02, Math.PI * 1.48); c.stroke(); c.restore();
  }
  function drawTube(c, w, pod) {
    const hub = w.hub, a = pod.ang, from = hub.R - 2, to = w.ring - pod.R + 2, half = 1.75 * T;
    c.save(); c.translate(hub.cx, hub.cy); c.rotate(a);
    c.fillStyle = 'rgba(5,10,20,.6)'; c.fillRect(from, -half - 6, to - from, half * 2 + 12);
    c.fillStyle = '#a9b8c4'; c.fillRect(from, -half, to - from, half * 2);
    c.strokeStyle = '#97a7b4'; c.lineWidth = 1; for (let x = from; x < to; x += T) { c.beginPath(); c.moveTo(x, -half); c.lineTo(x, half); c.stroke(); }
    c.fillStyle = '#e6edf3'; c.fillRect(from, -half - 4, to - from, 4); c.fillRect(from, half, to - from, 4);
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(from, -half + 3, to - from, 3); // glass reflection
    c.fillStyle = '#38e8ff'; for (let x = from + T; x < to - T; x += 1.6 * T) c.fillRect(x, -1, T * .6, 2); // guide lights
    c.restore();
  }
  const ITEM = {
    desk(c, x, y, on) {
      c.fillStyle = 'rgba(10,20,40,.25)'; c.fillRect(x - 2, y + 3, 3.4 * T + 4, 1.6 * T);
      c.fillStyle = '#e8eef3'; c.beginPath(); c.roundRect?.(x, y, 3.4 * T, 1.3 * T, 4); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(x + 3, y + 1, 3.4 * T - 6, 3);
      c.fillStyle = '#aebccb'; c.fillRect(x + 2, y + 1.3 * T, 3.4 * T - 4, 5); c.fillStyle = '#38e8ff'; c.fillRect(x + 4, y + 1.3 * T + 1.5, 3.4 * T - 8, 1.2);
      c.fillStyle = '#0b1022'; c.fillRect(x + 1.1 * T, y - 6, 1.2 * T, 10);
      c.fillStyle = on ? '#4dffa6' : '#1d2b45'; c.fillRect(x + 1.1 * T + 2, y - 4, 1.2 * T - 4, 6);
      c.fillStyle = '#2b2f38'; c.fillRect(x + 0.4 * T, y + 4, 0.5 * T, 3); // keyboard-ish details
    },
    chair(c, x, y) {
      c.fillStyle = 'rgba(10,20,40,.25)'; c.beginPath(); c.ellipse(x + 8, y + 15, 9, 4, 0, 0, 7); c.fill();
      c.fillStyle = '#d7e0e8'; c.beginPath(); c.ellipse(x + 8, y + 4.5, 7, 4.5, 0, 0, 7); c.fill(); c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x + 8, y + 10.5, 8, 4.2, 0, 0, 7); c.fill();
      c.fillStyle = '#38e8ff'; c.fillRect(x + 5, y + 2, 6, 1.2);
    },
    dish(c, x, y) {
      c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(x + 14, y + 26, 14, 5, 0, 0, 7); c.fill();
      c.fillStyle = '#4a5163'; c.fillRect(x + 10, y + 16, 8, 10);
      c.fillStyle = '#d9dde6'; c.beginPath(); c.ellipse(x + 14, y + 12, 15, 12, -.3, 0, 7); c.fill();
      c.strokeStyle = '#8a93a6'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x + 14, y + 12, 15, 12, -.3, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(x + 14, y + 12); c.lineTo(x + 22, y + 3); c.stroke(); c.fillStyle = '#8a93a6'; c.fillRect(x + 12, y + 10, 4, 4);
    },
    console(c, x, y) {
      c.fillStyle = 'rgba(10,20,40,.25)'; c.fillRect(x - 2, y + 6, 3 * T + 4, T + 6);
      c.fillStyle = '#dfe6ec'; c.fillRect(x, y, 3 * T, T + 4); c.fillStyle = '#ffffff'; c.fillRect(x, y, 3 * T, 3);
      c.fillStyle = '#0b1022'; c.fillRect(x + 6, y + 5, 3 * T - 12, 8);
      c.fillStyle = '#2f8f6a'; c.fillRect(x + 8, y + 7, 10, 2); c.fillRect(x + 8, y + 10, 18, 1.5);
      c.fillStyle = '#e5484d'; c.fillRect(x + 3 * T - 8, y + 6, 3, 3); c.fillStyle = '#e9b949'; c.fillRect(x + 4, y + 6, 3, 3);
    },
    shelf(c, x, y) {
      c.fillStyle = '#4a3324'; c.fillRect(x, y, 3 * T, 1.6 * T); c.fillStyle = '#2a1d14'; c.fillRect(x + 2, y + 2, 3 * T - 4, 1.6 * T - 4);
      const cols = ['#a33a3a', '#3a5aa3', '#b8933a', '#3a8a5a', '#7a5aa3', '#b86a3a'];
      for (let i = 0; i < 9; i++) { c.fillStyle = cols[i % cols.length]; c.fillRect(x + 4 + i * 4.6, y + 4 + (i % 3), 3.4, 1.6 * T - 9 - (i % 3)); }
    },
    cabinet(c, x, y) { c.fillStyle = '#4a5160'; c.fillRect(x, y, 3.6 * T, T + 2); for (let i = 0; i < 3; i++) { c.fillStyle = '#5b6372'; c.fillRect(x + 3 + i * 1.2 * T, y + 3, 1.2 * T - 4, T - 4); c.fillStyle = '#a9b2c2'; c.fillRect(x + 0.45 * T + i * 1.2 * T, y + 8, 6, 1.5); } },
    table(c, x, y) {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x + 2, y + 6, 26, 9, 0, 0, 7); c.fill();
      c.fillStyle = '#5a3d2b'; c.beginPath(); c.ellipse(x, y, 24, 11, 0, 0, 7); c.fill(); c.fillStyle = '#6e4b35'; c.beginPath(); c.ellipse(x, y - 1, 22, 9, 0, 0, 7); c.fill();
      for (const dx of [-36, 30]) { c.fillStyle = '#8a2b2b'; c.fillRect(x + dx, y - 10, 8, 14); c.fillStyle = '#a83a3a'; c.fillRect(x + dx, y - 10, 8, 4); }
    },
    couch(c, x, y) { c.fillStyle = '#2b3140'; c.fillRect(x, y, 4 * T, 1.4 * T); c.fillStyle = '#3a4357'; c.fillRect(x + 3, y + 3, 4 * T - 6, 1.4 * T - 8); c.fillStyle = '#232836'; c.fillRect(x, y, 4, 1.4 * T); c.fillRect(x + 4 * T - 4, y, 4, 1.4 * T); },
    easel(c, x, y) {
      c.strokeStyle = '#8a6a3e'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 4, y + 30); c.lineTo(x + 16, y); c.lineTo(x + 28, y + 30); c.stroke();
      c.fillStyle = '#efe6d4'; c.fillRect(x + 4, y + 2, 24, 18); c.fillStyle = '#3a3226'; c.beginPath(); c.arc(x + 16, y + 9, 3.5, 0, 7); c.fill(); c.fillRect(x + 10, y + 13, 12, 6);
      c.fillStyle = '#8a6a3e'; c.fillRect(x + 2, y + 20, 28, 3); c.fillStyle = '#e5484d'; c.fillRect(x + 30, y + 22, 3, 3); c.fillStyle = '#3e6bff'; c.fillRect(x + 34, y + 22, 3, 3);
    },
    plant(c, x, y) {
      c.fillStyle = '#5a3d2b'; c.fillRect(x + 3, y + 10, 10, 8); c.fillStyle = '#3a8a4a';
      for (const [dx, dy, r] of [[8, 6, 6], [3, 9, 4], [13, 9, 4], [8, 2, 4]]) { c.beginPath(); c.arc(x + dx, y + dy, r, 0, 7); c.fill(); }
      c.fillStyle = '#4fb862'; c.beginPath(); c.arc(x + 7, y + 4, 2.5, 0, 7); c.fill();
    },
    crate(c, x, y) { c.fillStyle = 'rgba(10,20,40,.25)'; c.fillRect(x + 2, y + 3, 1.8 * T, 1.8 * T); c.fillStyle = '#f2f5f8'; c.fillRect(x, y, 1.8 * T, 1.8 * T); c.fillStyle = '#c9d4de'; c.fillRect(x, y + 1.8 * T - 5, 1.8 * T, 5); c.fillStyle = '#38e8ff'; c.fillRect(x + 3, y + 5, 1.8 * T - 6, 2); c.strokeStyle = '#aab8c5'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, 1.8 * T - 1, 1.8 * T - 1); },
    board(c, x, y) {
      c.fillStyle = '#e9edf3'; c.fillRect(x, y, 3.4 * T, 1.9 * T); c.strokeStyle = '#8a93a6'; c.lineWidth = 2; c.strokeRect(x, y, 3.4 * T, 1.9 * T);
      c.fillStyle = '#3e6bff'; c.fillRect(x + 6, y + 14, 5, 12); c.fillRect(x + 14, y + 9, 5, 17); c.fillRect(x + 22, y + 18, 5, 8);
      c.strokeStyle = '#e5484d'; c.beginPath(); c.moveTo(x + 32, y + 24); c.lineTo(x + 40, y + 12); c.lineTo(x + 48, y + 18); c.stroke();
      for (const [dx, col] of [[34, '#ffd84d'], [44, '#4dffa6']]) { c.fillStyle = col; c.fillRect(x + dx, y + 3, 7, 6); }
    },
    ring(c, x, y) {
      c.strokeStyle = '#fff6e8'; c.lineWidth = 4; c.beginPath(); c.arc(x + 16, y + 12, 11, 0, 7); c.stroke();
      c.fillStyle = '#0b1022'; c.fillRect(x + 12, y + 6, 8, 12); c.fillStyle = '#38e8ff'; c.fillRect(x + 13, y + 8, 6, 8);
      c.strokeStyle = '#8a93a6'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 16, y + 24); c.lineTo(x + 16, y + 34); c.moveTo(x + 16, y + 28); c.lineTo(x + 9, y + 34); c.moveTo(x + 16, y + 28); c.lineTo(x + 23, y + 34); c.stroke();
    },
    uplink(c, x, y) {
      c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(x + 10, y + 30, 11, 4, 0, 0, 7); c.fill();
      c.fillStyle = '#4a5163'; c.fillRect(x + 4, y + 24, 12, 6); c.strokeStyle = '#8a93a6'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 10, y + 24); c.lineTo(x + 10, y + 2); c.moveTo(x + 4, y + 10); c.lineTo(x + 16, y + 10); c.moveTo(x + 6, y + 17); c.lineTo(x + 14, y + 17); c.stroke();
      c.fillStyle = '#38e8ff'; c.fillRect(x + 8, y, 4, 4);
    },
    machine(c, x, y) {
      c.fillStyle = 'rgba(10,20,40,.28)'; c.fillRect(x - 2, y + 5, 4.2 * T + 4, 2.4 * T);
      c.fillStyle = '#e3eaf0'; c.beginPath(); c.roundRect?.(x, y, 4.2 * T, 2.2 * T, 6); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(x + 4, y + 1.5, 4.2 * T - 8, 4);
      c.strokeStyle = '#38e8ff'; c.lineWidth = 1.6; c.beginPath(); c.roundRect?.(x + 2, y + 2, 4.2 * T - 4, 2.2 * T - 4, 5); c.stroke();
      c.fillStyle = '#25384c'; c.beginPath(); c.roundRect?.(x + 0.9 * T, y + 7, 2.4 * T, 1.3 * T, 4); c.fill();
      for (let i = 0; i < 5; i++) { c.fillStyle = '#5fd6f0'; c.fillRect(x + 0.9 * T + 4 + i * 7, y + 10, 4, 1.3 * T - 6); }
    },
  };
  function drawStatic(w, d) {
    const W = Math.ceil(w.bounds.w), H = Math.ceil(w.bounds.h), scale = 2;
    const cv = document.createElement('canvas'); cv.width = W * scale; cv.height = H * scale;
    const c = cv.getContext('2d'); c.scale(scale, scale); c.translate(-w.bounds.x, -w.bounds.y);
    // the outer ring truss that holds the pods in orbit
    c.lineWidth = 3.2 * T; c.strokeStyle = '#151d29'; c.beginPath(); c.arc(0, 0, w.ring, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2.2 * T; c.strokeStyle = '#223042'; c.beginPath(); c.arc(0, 0, w.ring, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 1; c.strokeStyle = '#33465c'; for (let k = -1; k <= 1; k += 2) { c.beginPath(); c.arc(0, 0, w.ring + k * .7 * T, 0, Math.PI * 2); c.stroke(); }
    for (let i = 0; i < 96; i++) { const a = i * Math.PI / 48; c.fillStyle = i % 4 ? '#2c3d52' : '#38e8ff'; c.fillRect(Math.cos(a) * w.ring - 1.5, Math.sin(a) * w.ring - 1.5, 3, 3); }
    for (const r of w.rooms) if (!r.hub) drawTube(c, w, r);
    for (const r of w.rooms) {
      c.save(); roomPath(c, r); c.clip(); hexFloor(c, r.floor, r.cx - r.R, r.cy - r.R, r.R * 2, r.R * 2);
      const g = c.createRadialGradient(r.cx, r.cy, T, r.cx, r.cy, r.R);
      g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(.7, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(10,20,40,.38)'); c.fillStyle = g; c.fillRect(r.cx - r.R, r.cy - r.R, r.R * 2, r.R * 2);
      if (r.hub) { // the Command Dome emblem
        c.strokeStyle = 'rgba(56,232,255,.35)'; c.lineWidth = 2; for (const k of [.32, .4]) { c.beginPath(); c.arc(r.cx, r.cy + 1.2 * T, r.R * k, 0, Math.PI * 2); c.stroke(); }
        c.fillStyle = 'rgba(233,185,73,.55)'; c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? T * .9 : T * 2; c.lineTo(r.cx + Math.cos(a) * rr, r.cy + 1.2 * T + Math.sin(a) * rr); } c.closePath(); c.fill();
      }
      c.restore();
      for (const it of r.items) ITEM[it.t]?.(c, it.x, it.y);
      for (const dk of r.desks) { ITEM.chair(c, dk.x + 1.2 * T, dk.y + 1.7 * T); }
      if (r.machine) { ITEM.machine(c, r.machine.x, r.machine.y); }
      if (r.belt) { c.fillStyle = '#5b6b7a'; c.fillRect(r.belt.x - 2, r.belt.y - 2, r.belt.w + 4, T * 0.9 + 4); c.fillStyle = '#8796a4'; c.fillRect(r.belt.x, r.belt.y, r.belt.w, T * 0.9); }
      drawRim(c, r, r.hub ? w.rooms.filter((x) => !x.hub).map((x) => x.ang) : [r.ang + Math.PI]);
    }
    return { cv, scale };
  }

  /* ------------------------------------------------------------ walkers */
  function roomById(id) { return world.rooms.find((r) => r.id === id); }
  function insidePoint(r) {
    if (r.deco === 'storage') return { x: r.x + rnd(2 * T, r.w - 2 * T), y: r.y + rnd(2 * T, r.h - 2 * T) };
    return { x: r.x + rnd(2.5 * T, r.w - 2.5 * T), y: r.y + rnd(3.2 * T, r.h - 2.5 * T) };
  }
  const unit = (r) => (r.hub ? { x: 0, y: 1 } : { x: -Math.cos(r.ang), y: -Math.sin(r.ang) }); // from a pod toward the hub
  function doorIn(r) { const u = unit(r); return { x: r.cx + u.x * (r.R - 2 * T), y: r.cy + u.y * (r.R - 2 * T) }; }
  function doorOut(r) { const u = unit(r); return { x: r.cx + u.x * (r.R + 1.5 * T), y: r.cy + u.y * (r.R + 1.5 * T) }; }
  function hubEdge(r) { const h = world.hub; return { x: h.cx + Math.cos(r.ang) * (h.R - 2 * T), y: h.cy + Math.sin(r.ang) * (h.R - 2 * T) }; }
  function route(from, toRoom, toPt) {
    const pts = [], fr = roomById(from.room);
    if (!fr || fr.id !== toRoom.id) {
      if (fr && !fr.hub) pts.push(doorIn(fr), doorOut(fr), hubEdge(fr));
      if (!toRoom.hub) pts.push(hubEdge(toRoom), doorOut(toRoom), doorIn(toRoom));
    }
    pts.push(toPt);
    return pts;
  }
  function syncBots(d) {
    const seen = new Set();
    for (const a of d.agents) {
      const home = roomById(a.station); if (!home) continue;
      seen.add(a.id);
      let b = bots.get(a.id);
      if (!b) { const p = insidePoint(home); b = { id: a.id, x: p.x, y: p.y, room: home.id, path: [], wait: rnd(0, 2), dir: 1, sitting: false }; bots.set(a.id, b); }
      b.agent = a; b.home = home.id;
      const desk = home.desks.find((dk) => dk.agent === a.id);
      const work = a.status === 'running' || a.status === 'waiting';
      if (work && desk && !b.goingToDesk && !b.sitting) { b.goingToDesk = true; b.path = route(b, home, { x: desk.x + 1.7 * T, y: desk.y + 2.1 * T }); b.wait = 0; }
      if (!work && (b.sitting || b.goingToDesk)) { b.sitting = false; b.goingToDesk = false; b.wait = rnd(.5, 2); b.path = []; }
    }
    for (const id of [...bots.keys()]) if (!seen.has(id)) bots.delete(id);
    if (!cmdr && handlers.commanderSprite) { const r = roomById('__lounge') || world.rooms[0]; const p = insidePoint(r); cmdr = { commander: true, x: p.x, y: p.y, room: r.id, home: r.id, path: [], wait: 1.5, dir: 1 }; }
    // a maintenance drone per few rooms keeps the place alive
    const want = Math.max(2, Math.ceil(world.rooms.length / 2));
    while (npcs.length < want) { const r = pick(world.rooms); const p = insidePoint(r); npcs.push({ npc: true, x: p.x, y: p.y, room: r.id, path: [], wait: rnd(0, 3), dir: 1 }); }
  }
  const clampIn = (r, p) => ({ x: Math.max(r.x + 2.2 * T, Math.min(r.x + r.w - 2.2 * T, p.x)), y: Math.max(r.y + 3.2 * T, Math.min(r.y + r.h - 2 * T, p.y)) });
  const USABLE = new Set(['dish', 'console', 'board', 'shelf', 'ring', 'uplink', 'easel']);
  function useSpot(r) { // a piece of equipment to go and work at
    const items = (r.items || []).filter((it) => USABLE.has(it.t)).map((it) => ({ x: it.x + (it.t === 'dish' || it.t === 'uplink' ? .9 * T : 1.6 * T), y: it.y + 2.7 * T }));
    if (r.machine) items.push({ x: r.machine.x + 2.1 * T, y: r.machine.y + 3 * T });
    return items.length ? clampIn(r, pick(items)) : null;
  }
  function nextIdleTarget(b) {
    const home = roomById(b.home || b.room) || world.rooms[0];
    if (!b.npc && Math.random() < (b.commander ? .25 : .45)) { // go and work at a piece of equipment
      const r = b.commander ? pick(world.rooms.filter((x) => !x.deco)) || home : home, spot = useSpot(r);
      if (spot) { b.path = route(b, r, spot); b.useAfter = true; return; }
    }
    const roll = Math.random();
    let r = home;
    if (b.commander) r = roll < .5 ? (roomById('__lounge') || home) : pick(world.rooms.filter((x) => !x.deco) .concat(world.rooms));
    else if (b.npc || roll > .72) r = pick(world.rooms);
    else if (roll > .55) r = roomById('__lounge') || home;
    b.path = route(b, r, insidePoint(r));
  }
  function stepWalker(b, dt) {
    if (b.sitting) return;
    if (!b.path.length) {
      if (b.goingToDesk) { b.sitting = true; b.goingToDesk = false; b.face = 'up'; b.moving = false; return; }
      if (b.arrived) { b.arrived = false; if (b.useAfter) { b.using = true; b.useAfter = false; b.face = 'up'; b.wait = rnd(4, 9); } else { b.face = Math.random() < .7 ? 'down' : 'side'; b.wait = rnd(3, 7); } }
      b.moving = false;
      if (!b.using && !b.chatUntil && Math.random() < dt * .12) b.face = pick(['down', 'side', 'down', 'up']); // glance around
      b.wait -= dt; if (b.wait <= 0) { b.using = false; nextIdleTarget(b); }
      return;
    }
    b.using = false; b.chatUntil = 0;
    const t = b.path[0], dx = t.x - b.x, dy = t.y - b.y, dist = Math.hypot(dx, dy), sp = (b.npc ? 18 : b.commander ? 27 : 25) * dt;
    if (Math.abs(dx) > .5) b.dir = dx > 0 ? 1 : -1;
    b.face = Math.abs(dx) > Math.abs(dy) * .8 ? 'side' : dy > 0 ? 'down' : 'up';
    if (dist <= sp) { b.x = t.x; b.y = t.y; b.path.shift(); if (!b.path.length) b.arrived = true; const r = world.rooms.find((rm) => inRoom(rm, b.x, b.y)); if (r) b.room = r.id; }
    else { b.x += dx / dist * sp; b.y += dy / dist * sp; }
    b.phase = (b.phase || 0) + sp / 4.2; // steps follow the distance walked, so feet don't slide
    b.moving = dist > sp;
  }

  /* ------------------------------------------------------------ per-frame drawing */
  function label(c, text, x, y, { color = '#8affc1', bg = 'rgba(6,18,14,.88)', border = '#2e5a46', size = 7, align = 'left' } = {}) {
    c.font = `600 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    const w = c.measureText(text).width + 8, h = size + 6, lx = align === 'center' ? x - w / 2 : x;
    c.fillStyle = bg; c.fillRect(lx, y, w, h); c.strokeStyle = border; c.lineWidth = 1; c.strokeRect(lx + .5, y + .5, w - 1, h - 1);
    c.fillStyle = color; c.textBaseline = 'middle'; c.fillText(text, lx + 4, y + h / 2 + .5);
    return w;
  }
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible || document.hidden || !world || !staticLayer) return;
    const dt = Math.min(.05, (now - (lastT || now)) / 1000); lastT = now;
    const t = now / 1000;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); if (!cam.fitted) fit(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // space background with slow parallax
    ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, W, H);
    drawStars(ctx, W, H, t); drawPlanet(ctx, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    const b = world.bounds;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(staticLayer.cv, b.x, b.y, staticLayer.cv.width / staticLayer.scale, staticLayer.cv.height / staticLayer.scale);
    const d = data;
    // per-room live bits: monitors, belts, boxes, labels
    for (const r of world.rooms) {
      if (r.outbox) {
        const n = (d.files || []).length, fresh = d.outboxNew || 0;
        for (let i = 0; i < Math.min(n, 6); i++) { const cx = r.x + 1.4 * T + (i % 3) * 2.1 * T, cy = r.y + 2.6 * T + Math.floor(i / 3) * 2.2 * T; ITEM.crate(ctx, cx, cy); if (i < fresh) { ctx.fillStyle = Math.sin(t * 5 + i) > 0 ? '#4dffa6' : '#1f6b47'; ctx.fillRect(cx + 2, cy + 2, 4, 4); } }
        label(ctx, `OUTBOX · ${n}`, r.x + 1.4 * T, r.y + 1.1 * T, { color: '#ffd9a8', bg: 'rgba(30,20,10,.85)', border: '#8a6a3e', size: 7 });
        if (fresh) label(ctx, `${fresh} NEW`, r.x + 1.4 * T, r.y + r.h - 1.6 * T, { color: '#8affc1', size: 7 });
        continue;
      }
      if (r.deco) { label(ctx, r.name, r.x + 2 * T, r.y + 1.7 * T, { color: '#cfd6e4', bg: 'rgba(12,14,20,.75)', border: '#3a3f4c', size: 7 }); continue; }
      const crew = d.agents.filter((a) => a.station === r.id), ids = new Set(crew.map((a) => a.id));
      const busy = crew.some((a) => a.status === 'running');
      const mine = d.tasks.filter((x) => ids.has(x.agent));
      for (const dk of r.desks) { const a = crew.find((x) => x.id === dk.agent); ITEM.desk(ctx, dk.x, dk.y, a && a.status === 'running' && Math.sin(t * 6 + dk.x) > -.6); }
      if (r.belt) {
        ctx.save(); ctx.beginPath(); ctx.rect(r.belt.x, r.belt.y, r.belt.w, T * .9); ctx.clip();
        const off = busy ? (t * 28) % 10 : 0;
        ctx.strokeStyle = busy ? '#6e7790' : '#4a4f5a'; ctx.lineWidth = 1.5;
        for (let x = r.belt.x - 10 + off; x < r.belt.x + r.belt.w + 10; x += 10) { ctx.beginPath(); ctx.moveTo(x, r.belt.y + 2); ctx.lineTo(x + 4, r.belt.y + T * .45); ctx.lineTo(x, r.belt.y + T * .9 - 2); ctx.stroke(); }
        if (busy) for (let i = 0; i < 3; i++) { const bx = r.belt.x + ((t * 22 + i * r.belt.w / 3) % (r.belt.w + 12)) - 12; ctx.fillStyle = '#b8895a'; ctx.fillRect(bx, r.belt.y + 2, 10, T * .9 - 4); ctx.strokeStyle = '#6b4a32'; ctx.strokeRect(bx + .5, r.belt.y + 2.5, 9, T * .9 - 5); }
        ctx.restore();
      }
      if (r.machine) { ctx.fillStyle = busy ? (Math.sin(t * 8) > 0 ? '#4dffa6' : '#1f6b47') : '#e5484d'; ctx.fillRect(r.machine.x + 4.2 * T - 7, r.machine.y + 4, 4, 4); }
      // title + stats
      label(ctx, `${r.name}${r.region ? ' · ' + r.region : ''}`, r.x + 2 * T, r.top ? r.y + 1.75 * T : r.y + 1.75 * T, { size: 7.5 });
      const shipped = mine.filter((x) => x.status === 'done').length, failed = mine.filter((x) => x.status === 'error').length, pending = mine.filter((x) => x.status === 'queued' || x.status === 'waiting').length;
      const sy = r.top ? r.y + r.h - 2.5 * T : r.y + r.h - 2.2 * T;
      label(ctx, `${mine.length} RUNS · ${shipped} SHIPPED · ${failed} FAILED`, r.x + 2 * T, sy, { size: 7 });
      if (pending) { ctx.font = '600 8px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#e9b949'; ctx.fillText(`${pending} pending`, r.machine.x, sy + 6); }
      const line = (d.workflows || []).find((wf) => wf.steps.some((s, i) => i < wf.steps.length - 1 && ids.has(s.agent) && !ids.has(wf.steps[i + 1].agent)));
      if (line && r.machine) {
        const i = line.steps.findIndex((s, j) => j < line.steps.length - 1 && ids.has(s.agent) && !ids.has(line.steps[j + 1].agent));
        const next = d.agents.find((a) => a.id === line.steps[i + 1].agent), to = d.stations.find((s) => s.id === next?.station);
        label(ctx, `SENDS TO LINE ${(to?.name || '').toUpperCase()} · ${line.name.toUpperCase()}`.slice(0, 48), r.machine.x + 2.1 * T, r.machine.y - 1.1 * T, { size: 6.5, align: 'center' });
      }
      for (const dk of r.desks) {
        const a = crew.find((x) => x.id === dk.agent); if (!a) continue;
        label(ctx, a.name.toUpperCase(), dk.x + 1.7 * T, dk.y - 1.3 * T, { color: '#dce6ff', bg: 'rgba(14,22,38,.92)', border: '#3a4a6a', size: 6.5, align: 'center' });
      }
      if (busy) { ctx.fillStyle = 'rgba(77,255,166,.05)'; roomPath(ctx, r); ctx.fill(); }
    }
    // workflow couriers along the corridor
    for (const wf of d.workflows || []) if (wf.status === 'running') {
      const rs = [...new Set(wf.steps.map((s) => d.agents.find((a) => a.id === s.agent)?.station))].map(roomById).filter(Boolean);
      if (rs.length < 2) continue;
      const pts = [doorOut(rs[0]), hubEdge(rs[0]), hubEdge(rs[rs.length - 1]), doorOut(rs[rs.length - 1])];
      const segs = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y)), total = segs.reduce((m, v) => m + v, 0) || 1;
      let left = ((t * .18 + hash(wf.id) % 10 / 10) % 1) * total, si = 0; while (si < segs.length - 1 && left > segs[si]) left -= segs[si++];
      const f = segs[si] ? left / segs[si] : 0, x = pts[si].x + (pts[si + 1].x - pts[si].x) * f, y = pts[si].y + (pts[si + 1].y - pts[si].y) * f - 3;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x - 6, y + 7, 14, 3); ctx.fillStyle = '#b8895a'; ctx.fillRect(x - 6, y - 4, 12, 10); ctx.strokeStyle = '#6b4a32'; ctx.strokeRect(x - 5.5, y - 3.5, 11, 9);
    }
    // walkers, painted back-to-front
    const all = [...bots.values(), ...npcs, ...(cmdr ? [cmdr] : [])];
    for (const w of all) stepWalker(w, dt);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.npc || b.npc || a.moving || b.moving || a.sitting || b.sitting || a.using || b.using) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 30 && !a.chatUntil && !b.chatUntil && Math.random() < dt * .35) {
        a.chatUntil = b.chatUntil = t + rnd(2.5, 4.5); a.face = b.face = 'side'; a.dir = b.x > a.x ? 1 : -1; b.dir = -a.dir;
        a.wait = Math.max(a.wait, 3); b.wait = Math.max(b.wait, 3); a.talkFirst = true; b.talkFirst = false;
      }
    }
    for (const w of all) if (w.chatUntil && t > w.chatUntil) w.chatUntil = 0;
    all.sort((p, q) => p.y - q.y);
    hits.length = 0;
    for (const w of all) drawWalker(ctx, w, t);
    ctx.restore();
    // vignette
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const hits = [];
  const mix = (hex, k) => { // k < 0 darker, k > 0 lighter
    const n = parseInt(String(hex || '#888888').slice(1, 7), 16) || 0x888888;
    const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
    return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
  };
  function palette(w) {
    if (w.commander) return { kind: 'cmdr', skin: '#5e3c2b', top: '#5d6067', legs: '#55585e', shoe: '#3d8bff', cap: '#16181c', accent: '#e9b949', print: '#3d8bff' };
    const l = handlers.look?.(w.agent) || {};
    if (l.kind === 'human') return { kind: 'human', skin: l.skin || '#8d5524', top: l.fg || '#3e6bff', legs: '#3a3f4c', shoe: '#1c2230', hair: l.hairColor || '#1b1b1b', accent: l.accent || '#ffd84d' };
    const fg = l.fg || '#c7cfdc';
    return { kind: 'bot', skin: fg, top: fg, legs: mix(fg, -.3), shoe: mix(fg, -.55), joint: '#262b36', accent: l.accent || '#38e8ff' };
  }
  const limb = (c, x1, y1, x2, y2, wd, col) => {
    c.strokeStyle = col; c.lineWidth = wd; c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = wd * .32; c.beginPath(); c.moveTo(x1 - wd * .22, y1); c.lineTo(x2 - wd * .22, y2); c.stroke();
  };
  function torso(c, cx, top, bot, wt, wb, col, P, view) {
    const g = c.createLinearGradient(cx - wt / 2, 0, cx + wt / 2, 0);
    g.addColorStop(0, mix(col.startsWith('#') ? col : '#888888', .35)); g.addColorStop(.45, col); g.addColorStop(1, mix(col.startsWith('#') ? col : '#888888', -.45));
    c.fillStyle = g; c.beginPath();
    c.moveTo(cx - wt / 2 + 1.2, top); c.lineTo(cx + wt / 2 - 1.2, top); c.quadraticCurveTo(cx + wt / 2, top, cx + wt / 2, top + 1.6);
    c.lineTo(cx + wb / 2, bot); c.lineTo(cx - wb / 2, bot); c.lineTo(cx - wt / 2, top + 1.6); c.quadraticCurveTo(cx - wt / 2, top, cx - wt / 2 + 1.2, top); c.fill();
    if (P.kind === 'bot' && view === 'down') { c.fillStyle = '#0b1022'; c.globalAlpha = .45; c.fillRect(cx - 2.4, top + 3, 4.8, 3.6); c.globalAlpha = 1; c.fillStyle = P.accent; c.beginPath(); c.arc(cx, top + 4.8, 1.1, 0, 7); c.fill(); c.globalAlpha = .3; c.beginPath(); c.arc(cx, top + 4.8, 2.4, 0, 7); c.fill(); c.globalAlpha = 1; }
    if (P.kind === 'bot' && view === 'up') { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(cx - 2.6, top + 2, 5.2, 6); }
    if (P.kind === 'cmdr') {
      c.fillStyle = P.accent; c.fillRect(cx - wt / 2 + .4, top, 2.2, .9); c.fillRect(cx + wt / 2 - 2.6, top, 2.2, .9); // gold shoulder stripes
      if (view === 'down') { c.fillStyle = '#f2f2f0'; c.fillRect(cx - 1.4, top + 2.6, 2.8, .9); c.fillStyle = P.print; c.fillRect(cx - 3, top + 4, 6, 1.6); c.fillStyle = '#f2f2f0'; c.fillRect(cx - 2.6, top + 6.1, 5.2, .5); }
    }
  }
  function headDraw(c, cx, cy, r, P, view, dir) {
    const g = c.createRadialGradient(cx - r * .45, cy - r * .5, r * .15, cx, cy, r * 1.05);
    const base = P.kind === 'bot' ? P.skin : P.skin;
    g.addColorStop(0, mix(base, .45)); g.addColorStop(.55, base); g.addColorStop(1, mix(base, -.4));
    c.fillStyle = g;
    if (P.kind === 'bot') { c.beginPath(); c.ellipse(cx, cy, r * .95, r * 1.05, 0, 0, 7); c.fill(); }
    else { c.beginPath(); c.ellipse(cx, cy, r * .82, r, 0, 0, 7); c.fill(); }
    if (P.kind === 'bot') {
      if (view === 'down') { c.fillStyle = '#0b1022'; c.fillRect(cx - r * .8, cy - r * .35, r * 1.6, r * .62); c.fillStyle = P.accent; c.fillRect(cx - r * .62, cy - r * .2, r * 1.24, r * .3); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(cx - r * .55, cy - r * .2, r * .3, r * .14); }
      else if (view === 'side') { c.fillStyle = '#0b1022'; c.fillRect(cx + r * .1, cy - r * .35, r * .9, r * .62); c.fillStyle = P.accent; c.fillRect(cx + r * .3, cy - r * .2, r * .6, r * .3); }
      else { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(cx - r * .5, cy - r * .1, r, r * .5); }
      c.strokeStyle = mix(P.skin, -.3); c.lineWidth = .7; c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx, cy - r - 2); c.stroke(); c.fillStyle = P.accent; c.beginPath(); c.arc(cx, cy - r - 2.2, .8, 0, 7); c.fill();
      return;
    }
    if (view === 'down') { // face
      c.fillStyle = '#1a120d'; c.fillRect(cx - 1.6, cy - .1, .9, .9); c.fillRect(cx + .7, cy - .1, .9, .9);
      if (P.kind === 'cmdr') { c.fillStyle = 'rgba(20,14,10,.45)'; c.beginPath(); c.ellipse(cx, cy + r * .72, r * .38, r * .26, 0, 0, 7); c.fill(); }
    } else if (view === 'side') { c.fillStyle = '#1a120d'; c.fillRect(cx + r * .35, cy - .1, .9, .9); }
    if (P.kind === 'cmdr') { // black snapback with the gold star
      c.fillStyle = P.cap; c.beginPath(); c.ellipse(cx, cy - r * .35, r * .92, r * .72, 0, Math.PI, 0); c.fill();
      if (view === 'side') { c.fillRect(cx, cy - r * .42, r * 1.75, r * .32); }
      else if (view === 'down') { c.fillStyle = '#0d0e11'; c.fillRect(cx - r * 1.05, cy - r * .45, r * 2.1, r * .34); c.fillStyle = P.accent; c.beginPath(); c.arc(cx, cy - r * .78, .65, 0, 7); c.fill(); }
      else { c.fillStyle = '#2a2d34'; c.fillRect(cx - r * .3, cy - r * .3, r * .6, r * .22); }
    } else { // hair
      c.fillStyle = P.hair; c.beginPath(); c.ellipse(cx, cy - r * .3, r * .86, r * .75, 0, Math.PI, 0); c.fill();
      if (view === 'up') { c.beginPath(); c.ellipse(cx, cy, r * .84, r * .95, 0, 0, 7); c.fill(); }
    }
  }
  function drawFigure(c, w, t) {
    const P = palette(w), H = w.commander ? 38 : 34, s = H / 34;
    const view = w.sitting || w.using ? 'up' : (w.face || 'down');
    const cyc = (w.phase || 0) * Math.PI / 2, sw = w.moving ? Math.sin(cyc) : 0;
    const bob = w.moving ? -Math.abs(Math.cos(cyc)) * .9 : Math.sin(t * 2 + w.x * .1) * .22;
    c.save(); c.translate(w.x, w.y); c.scale(s, s);
    c.fillStyle = 'rgba(0,0,0,.38)'; c.beginPath(); c.ellipse(0, 0, 6.5, 2.2, 0, 0, 7); c.fill();
    if (view === 'side' && w.dir < 0) c.scale(-1, 1);
    const hipY = -15 + bob, shY = -26 + bob, headY = -30.8 + bob;
    if (w.sitting) { // seated at the desk, back to us, typing
      const sy = 6, tap = Math.sin(t * 14) * .6;
      limb(c, -4.6, shY + sy, -3, shY + sy + 6 + tap, 2.6, mix(P.top, -.15)); limb(c, 4.6, shY + sy, 3, shY + sy + 6 - tap, 2.6, mix(P.top, -.15));
      torso(c, 0, shY + sy - 1, hipY + sy + 2, 10, 8.6, P.top, P, 'up');
      headDraw(c, 0, headY + sy, 3.9, P, 'up', 1);
      c.restore(); return;
    }
    if (view === 'side') {
      const legA = sw * .5, armA = -sw * .55;
      const foot = (a) => [Math.sin(a) * 15, hipY + Math.cos(a) * 15];
      const back = foot(-legA), front = foot(legA);
      limb(c, 0, shY + .5, Math.sin(-armA) * 10.5, shY + .5 + Math.cos(armA) * 10.5, 2.4, mix(P.top, -.3)); // far arm
      limb(c, 0, hipY, back[0], back[1] - 1, 3.2, mix(P.legs.startsWith('#') ? P.legs : '#555555', -.25)); c.fillStyle = mix(P.shoe.startsWith('#') ? P.shoe : '#333333', -.2); c.beginPath(); c.ellipse(back[0] + 1.4, back[1] - .6, 2.4, 1.2, 0, 0, 7); c.fill();
      torso(c, .2, shY - 1, hipY + 1.2, 6.8, 6, P.top, P, 'side');
      limb(c, 0, hipY, front[0], front[1] - 1, 3.4, P.legs); c.fillStyle = P.shoe; c.beginPath(); c.ellipse(front[0] + 1.4, front[1] - .6, 2.5, 1.25, 0, 0, 7); c.fill();
      headDraw(c, .6, headY, 3.8, P, 'side', 1);
      const hand = [Math.sin(armA) * 10.5, shY + .5 + Math.cos(armA) * 10.5];
      limb(c, 0, shY + .5, hand[0], hand[1], 2.6, P.top); c.fillStyle = P.kind === 'bot' ? P.joint : P.skin; c.beginPath(); c.arc(hand[0], hand[1] + .6, 1.3, 0, 7); c.fill();
    } else { // front ('down') or back ('up')
      const liftL = Math.max(0, sw) * 2.4, liftR = Math.max(0, -sw) * 2.4;
      limb(c, -2.3, hipY, -2.4, -1 - liftL, 3.4, P.legs); limb(c, 2.3, hipY, 2.4, -1 - liftR, 3.4, P.legs);
      c.fillStyle = P.shoe; c.beginPath(); c.ellipse(-2.5, -.8 - liftL, 2.1, 1.3, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(2.5, -.8 - liftR, 2.1, 1.3, 0, 0, 7); c.fill();
      const use = w.using ? Math.sin(t * 9) * 1.2 : 0;
      const aL = w.using ? 6.5 + use : 10.5 - sw * 1.6, aR = w.using ? 6.5 - use : 10.5 + sw * 1.6;
      const armCol = view === 'down' ? P.top : mix(P.top.startsWith('#') ? P.top : '#888888', -.1);
      limb(c, -5.4, shY + .6, -6.2 + (w.using ? 2.6 : 0), shY + .6 + aL, 2.5, armCol); limb(c, 5.4, shY + .6, 6.2 - (w.using ? 2.6 : 0), shY + .6 + aR, 2.5, armCol);
      c.fillStyle = P.kind === 'bot' ? P.joint : P.skin;
      c.beginPath(); c.arc(-6.2 + (w.using ? 2.6 : 0), shY + 1.2 + aL, 1.3, 0, 7); c.fill(); c.beginPath(); c.arc(6.2 - (w.using ? 2.6 : 0), shY + 1.2 + aR, 1.3, 0, 7); c.fill();
      torso(c, 0, shY - 1, hipY + 1.2, 10.4, 8.4, P.top, P, view);
      c.fillStyle = P.kind === 'bot' ? P.joint : P.skin; c.fillRect(-1.1, headY + 2.6, 2.2, 2.4);
      headDraw(c, 0, headY, 3.9, P, view, 1);
      if (w.using) { c.fillStyle = P.accent; c.globalAlpha = .5 + .5 * Math.sin(t * 12); c.fillRect(-1, shY - 2.5, 2, 2); c.globalAlpha = 1; }
    }
    c.restore();
  }
  function drawDrone(c, w, t) { // small hovering maintenance drone
    const hov = Math.sin(t * 3 + w.x) * 1.5;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(w.x, w.y, 5, 1.8, 0, 0, 7); c.fill();
    const y = w.y - 12 + hov, g = c.createRadialGradient(w.x - 2, y - 2, .5, w.x, y, 6);
    g.addColorStop(0, '#f4f6fb'); g.addColorStop(.6, '#a9b2c2'); g.addColorStop(1, '#4a5163');
    c.fillStyle = g; c.beginPath(); c.ellipse(w.x, y, 5.5, 3.6, 0, 0, 7); c.fill();
    c.fillStyle = '#0b1022'; c.fillRect(w.x - 2.6 + (w.dir > 0 ? 1 : -1), y - 1, 5.2, 1.6); c.fillStyle = '#38e8ff'; c.fillRect(w.x - 1.6 + (w.dir > 0 ? 1.4 : -1.4), y - .8, 2, 1.2);
    c.strokeStyle = '#8a93a6'; c.lineWidth = .8; c.beginPath(); c.moveTo(w.x - 6.5, y - 3.2); c.lineTo(w.x + 6.5, y - 3.2); c.stroke();
    c.fillStyle = `rgba(56,232,255,${.25 + .25 * Math.sin(t * 20)})`; c.beginPath(); c.ellipse(w.x, y + 4, 2.4, 1, 0, 0, 7); c.fill();
  }
  function drawWalker(c, w, t) {
    if (w.npc) { drawDrone(c, w, t); return; }
    drawFigure(c, w, t);
    const sz = w.commander ? 38 : 34;
    if (w.chatUntil && w.talkFirst === (Math.floor(t * 1.2) % 2 === 0)) { // speech bubble, taking turns
      const bx = w.x + (w.dir > 0 ? 4 : -4), by = w.y - sz - 9;
      c.fillStyle = 'rgba(240,244,255,.95)'; c.beginPath(); c.ellipse(bx, by, 7, 4.4, 0, 0, 7); c.fill();
      c.beginPath(); c.moveTo(bx - 2, by + 3.4); c.lineTo(bx - (w.dir > 0 ? 3.6 : -.4), by + 7); c.lineTo(bx + 1.5, by + 3.6); c.fill();
      c.fillStyle = '#1a1c22'; for (let i = 0; i < 3; i++) { c.globalAlpha = .4 + .6 * ((Math.floor(t * 5) + i) % 3 === 0); c.beginPath(); c.arc(bx - 3 + i * 3, by, .9, 0, 7); c.fill(); } c.globalAlpha = 1;
    }
    if (w.commander) { label(c, 'COMMANDER', w.x, w.y - sz - 13, { color: '#ffe3a3', bg: 'rgba(40,28,6,.88)', border: '#b8892a', size: 6, align: 'center' }); hits.push({ commander: true, x: w.x, y: w.y - sz / 2, r: 12 }); return; }
    hits.push({ id: w.id, x: w.x, y: w.y - sz / 2, r: 12 });
    const asking = data?.tasks?.some((x) => x.agent === w.id && x.status === 'running' && x.ask);
    if (asking) {
      const by = w.y - sz - 12 - Math.abs(Math.sin(t * 3)) * 2;
      c.fillStyle = '#ffc85a'; c.beginPath(); c.arc(w.x, by, 6.5, 0, 7); c.fill(); c.fillStyle = '#1a1c22';
      c.font = '800 9px ui-monospace, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', w.x, by + .5); c.textAlign = 'left';
    } else if (w.sitting && w.agent?.status === 'running') { // typing dots
      for (let i = 0; i < 3; i++) { c.fillStyle = `rgba(138,255,193,${.35 + .65 * ((Math.floor(t * 4) + i) % 3 === 0)})`; c.fillRect(w.x - 5 + i * 4, w.y - sz - 4, 2.5, 2.5); }
    }
  }
  const NPC_LOOK = { bg: '#000000', fg: '#c7cfdc', shape: 'round', eyes: 'visor', mouth: 'none', top: 'antenna', body: 'none', accent: '#38e8ff' };
  let stars = null;
  function drawPlanet(c, W, H) { // a planet's curved horizon below the station
    const R = Math.max(W, H) * 1.6, cx = W * .5 - cam.x * .02, cy = H + R * .78 - cam.y * .02;
    const g = c.createRadialGradient(cx - R * .2, cy - R * .9, R * .1, cx, cy, R);
    g.addColorStop(0, '#2f6fb0'); g.addColorStop(.55, '#123a66'); g.addColorStop(1, '#050d1c');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(120,200,255,.35)'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, R + 2, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  }
  function drawStars(c, W, H, t) {
    if (!stars) stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.4 + .3, p: Math.random() * 6 }));
    const g1 = c.createRadialGradient(W * .2, H * .85, 0, W * .2, H * .85, Math.max(W, H) * .55); g1.addColorStop(0, 'rgba(120,40,160,.35)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
    const g2 = c.createRadialGradient(W * .85, H * .1, 0, W * .85, H * .1, Math.max(W, H) * .45); g2.addColorStop(0, 'rgba(40,90,160,.28)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g1; c.fillRect(0, 0, W, H); c.fillStyle = g2; c.fillRect(0, 0, W, H);
    for (const s of stars) {
      const x = ((s.x * W - cam.x * .05 * s.s) % W + W) % W, y = ((s.y * H - cam.y * .05 * s.s) % H + H) % H;
      c.globalAlpha = .45 + .55 * Math.abs(Math.sin(t * .6 + s.p)); c.fillStyle = '#fff'; c.fillRect(x, y, s.s, s.s);
    }
    c.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ camera + input */
  function fit() {
    if (!world || !canvas) return;
    const W = canvas.clientWidth || 360, H = canvas.clientHeight || 400, b = world.bounds;
    // phones: fill the height and let people pan sideways; big screens: show (almost) everything
    const zh = H / (b.h * .92), zw = W / (b.w * .98);
    cam.z = W >= 900 ? Math.min(H / b.h, W / b.w) * .94 : Math.min(1, W / (34 * T)); // phones: the dome and its neighbours; big screens: the whole ring
    cam.z = Math.max(.35, Math.min(2.5, cam.z));
    cam.x = 0; cam.y = W >= 900 ? 0 : -4 * T; cam.fitted = true; clampCam();
  }
  function clampCam() {
    const b = world.bounds, W = canvas.clientWidth / cam.z, H = canvas.clientHeight / cam.z;
    cam.x = W >= b.w ? b.x + b.w / 2 : Math.max(b.x + W / 2, Math.min(b.x + b.w - W / 2, cam.x));
    cam.y = H >= b.h ? b.y + b.h / 2 : Math.max(b.y + H / 2, Math.min(b.y + b.h - H / 2, cam.y));
  }
  const toWorld = (sx, sy) => ({ x: (sx - canvas.clientWidth / 2) / cam.z + cam.x, y: (sy - canvas.clientHeight / 2) / cam.z + cam.y });
  function zoomAt(sx, sy, f) {
    const before = toWorld(sx, sy);
    cam.z = Math.max(.35, Math.min(3, cam.z * f));
    const after = toWorld(sx, sy); cam.x += before.x - after.x; cam.y += before.y - after.y; clampCam();
  }
  function bindInput() {
    const pts = new Map(); let moved = 0, pinch = 0;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, pos(e)); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = pos(e), prev = pts.get(e.pointerId); pts.set(e.pointerId, p);
      if (pts.size === 1) { cam.x -= (p.x - prev.x) / cam.z; cam.y -= (p.y - prev.y) / cam.z; moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y); clampCam(); }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch); pinch = dist; moved += 10; }
    });
    const up = (e) => {
      if (pts.size === 1 && moved < 8) { // tap: open the robot under the finger
        const p = toWorld(pos(e).x, pos(e).y);
        const h = hits.slice().reverse().find((h) => Math.hypot(h.x - p.x, h.y - p.y) < h.r + 4);
        if (h?.commander) handlers.onCommander?.();
        else if (h) handlers.onAgent?.(h.id);
        else { const ob = world.rooms.find((r) => r.outbox && inRoom(r, p.x, p.y)); if (ob) handlers.onOutbox?.(); }
      }
      pts.delete(e.pointerId); if (pts.size < 2) pinch = 0;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = 0; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    canvas.addEventListener('dblclick', () => fit());
  }

  /* ------------------------------------------------------------ public API */
  function layoutKey(d) {
    return JSON.stringify([d.stations.map((s) => [s.id, s.name, s.region, s.equipment]), d.agents.map((a) => [a.id, a.station])]);
  }
  function setData(d) {
    data = d;
    const key = layoutKey(d);
    if (key !== staticKey) {
      staticKey = key; world = build(d); staticLayer = drawStatic(world, d);
      cmdr = null;
      for (const b of bots.values()) { const r = roomById(b.home); if (r) { const p = insidePoint(r); Object.assign(b, { x: p.x, y: p.y, room: r.id, path: [], sitting: false, goingToDesk: false }); } }
      npcs.length = 0; if (cam.fitted) clampCam();
    }
    syncBots(d);
  }
  function mount(el, h) {
    handlers = h || handlers;
    if (host === el && canvas?.isConnected) return;
    host = el;
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.className = 'sv-canvas'; canvas.setAttribute('aria-label', 'Station view: drag to look around, pinch or scroll to zoom, tap a robot to open it');
      ctx = canvas.getContext('2d'); bindInput();
      if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }).observe(canvas);
    }
    el.appendChild(canvas); cam.fitted = false;
    if (!running) { running = true; requestAnimationFrame(frame); }
  }
  window.AgentStationView = { mount, setData, fit: () => { cam.fitted = false; fit(); } };
})();
