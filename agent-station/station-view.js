/* Agent Station: Station View
 * A top-down, game-style view of your space station drawn on a canvas.
 * Each station is a room off a central corridor; your agents walk around as robots,
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
    const rooms = [];
    // lounge (decorative) first on the top row, then stations alternate bottom/top
    const rows = { top: [], bottom: [] };
    rows.top.push({ id: '__lounge', name: 'LOUNGE', deco: 'lounge', floor: 'wood', w: 18 * T });
    stations.forEach((st, i) => {
      const crew = d.agents.filter((a) => a.station === st.id).length;
      const w = Math.max(16, 6 + 5 * Math.min(Math.max(crew, 1), 4)) * T;
      const k = kindOf(st);
      const floor = k === 'studio' ? 'wood' : k === 'ops' ? 'grate' : k === 'research' ? 'metal' : FLOORS[hash(st.id) % FLOORS.length];
      (i % 2 ? rows.top : rows.bottom).push({ id: st.id, name: st.name.toUpperCase(), region: (st.region || '').toUpperCase(), kind: k, floor, w, custom: st.custom, equipment: Array.isArray(st.equipment) ? st.equipment : null });
    });
    const corrY = ROOM_H + 2 * T;
    const startX = 12 * T;
    const place = (list, top) => {
      let x = startX + (top ? 0 : 6 * T);
      for (const r of list) {
        r.x = x; r.y = top ? corrY - ROOM_H : corrY + CORR_H; r.h = ROOM_H; r.top = top;
        r.door = { x: r.x + Math.round(r.w / 2 / T) * T - T, w: 2 * T };
        x += r.w + 2 * T;
        rooms.push(r);
      }
      return x;
    };
    const endTop = place(rows.top, true), endBottom = place(rows.bottom, false);
    const corrX = 8 * T, corrW = Math.max(endTop, endBottom) - corrX + 4 * T;
    // storage bays capping both ends of the corridor
    rooms.push({ id: '__bayL', name: 'STORAGE', deco: 'storage', floor: 'grate', x: corrX - 9 * T, y: corrY - 3 * T, w: 9 * T, h: 10 * T, side: 'left' });
    rooms.push({ id: '__outbox', name: 'OUTBOX', deco: 'storage', outbox: true, floor: 'steel', x: corrX + corrW, y: corrY - 3 * T, w: 9 * T, h: 10 * T, side: 'right' });
    for (const r of rooms) furnish(r, d);
    const minX = corrX - 9 * T - 4 * T, maxX = corrX + corrW + 9 * T + 4 * T;
    return { rooms, corr: { x: corrX, y: corrY, w: corrW, h: CORR_H }, bounds: { x: minX, y: -2 * T, w: maxX - minX, h: corrY + CORR_H + ROOM_H + 4 * T } };
  }
  function furnish(r, d) {
    r.items = []; r.desks = []; r.lamps = [];
    const ix = r.x + 2 * T, iw = r.w - 4 * T;
    for (let x = r.x + 3 * T; x < r.x + r.w - 2 * T; x += 4 * T) r.lamps.push({ x, y: r.y + T * 0.9 });
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
  function roomPath(c, r, inset = 0) {
    const b = r.deco === 'storage' ? T : BEVEL, x = r.x + inset, y = r.y + inset, w = r.w - inset * 2, h = r.h - inset * 2;
    c.beginPath();
    c.moveTo(x + b, y); c.lineTo(x + w - b, y); c.lineTo(x + w, y + b); c.lineTo(x + w, y + h - b);
    c.lineTo(x + w - b, y + h); c.lineTo(x + b, y + h); c.lineTo(x, y + h - b); c.lineTo(x, y + b); c.closePath();
  }
  function floorFill(c, kind, x, y, w, h, seed) {
    const S = { metal: ['#2b2e35', '#24272d', '#353943'], wood: ['#3b2d22', '#30251c', '#4a3828'], grate: ['#2c2b22', '#25241c', '#3a3826'], steel: ['#33373f', '#2b2f36', '#41464f'] }[kind] || ['#2b2e35', '#24272d', '#353943'];
    c.fillStyle = S[0]; c.fillRect(x, y, w, h);
    if (kind === 'wood') {
      for (let yy = y, row = 0; yy < y + h; yy += T * 0.75, row++) {
        let off = ((row * 37 + seed) % 5) * T * 0.8;
        for (let xx = x - off; xx < x + w; xx += T * 4) {
          c.fillStyle = (row + Math.floor(xx / T)) % 3 ? S[0] : S[2]; c.globalAlpha = .55; c.fillRect(xx, yy, T * 4 - 1, T * 0.75 - 1); c.globalAlpha = 1;
          c.fillStyle = S[1]; c.fillRect(xx + T * 4 - 1, yy, 1, T * 0.75);
        }
        c.fillStyle = S[1]; c.fillRect(x, yy + T * 0.75 - 1, w, 1);
      }
    } else if (kind === 'grate') {
      c.strokeStyle = S[2]; c.lineWidth = 1;
      for (let xx = x; xx < x + w; xx += T) { c.beginPath(); c.moveTo(xx + .5, y); c.lineTo(xx + .5, y + h); c.stroke(); }
      for (let yy = y; yy < y + h; yy += T) { c.beginPath(); c.moveTo(x, yy + .5); c.lineTo(x + w, yy + .5); c.stroke(); }
      c.globalAlpha = .25; c.strokeStyle = '#0d0d08';
      for (let k = -h; k < w; k += 5) { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + k + h, y + h); c.stroke(); }
      c.globalAlpha = 1;
    } else {
      const P = 2 * T;
      for (let yy = y; yy < y + h; yy += P) for (let xx = x; xx < x + w; xx += P) {
        c.fillStyle = ((xx / P + yy / P) | 0) % 2 ? S[0] : S[2]; c.globalAlpha = .35; c.fillRect(xx + 1, yy + 1, P - 2, P - 2); c.globalAlpha = 1;
        c.strokeStyle = S[1]; c.lineWidth = 1.5; c.strokeRect(xx + .75, yy + .75, P - 1.5, P - 1.5);
        c.fillStyle = '#555b66'; for (const [dx, dy] of [[3, 3], [P - 4, 3], [3, P - 4], [P - 4, P - 4]]) c.fillRect(xx + dx, yy + dy, 1.5, 1.5);
      }
    }
  }
  function wallFace(c, r) { // the back wall's inner face: panels + little amber lights, gives the 3/4 depth look
    const y = r.y + 2, h = T * 1.4;
    c.save(); roomPath(c, r, 2); c.clip();
    c.fillStyle = '#20232a'; c.fillRect(r.x, y, r.w, h);
    for (let x = r.x + T; x < r.x + r.w - T; x += 2 * T) {
      c.fillStyle = '#2b2f38'; c.fillRect(x + 2, y + 3, 2 * T - 4, h - 6);
      c.strokeStyle = '#3c414c'; c.lineWidth = 1; c.strokeRect(x + 2.5, y + 3.5, 2 * T - 5, h - 7);
    }
    for (const l of r.lamps) { c.fillStyle = '#e9b949'; c.fillRect(l.x - 4, y + 4, 8, 3); }
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(r.x, y + h, r.w, 4);
    c.restore();
  }
  function hazard(c, x, y, w, h) {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = '#1a1c22'; c.fillRect(x, y, w, h); c.fillStyle = '#d9a73e';
    for (let k = -h; k < w + h; k += 8) { c.beginPath(); c.moveTo(x + k, y + h); c.lineTo(x + k + 4, y + h); c.lineTo(x + k + 4 + h, y); c.lineTo(x + k + h, y); c.fill(); }
    c.restore();
  }
  function drawWalls(c, r) {
    roomPath(c, r); c.lineJoin = 'round';
    c.strokeStyle = '#15171c'; c.lineWidth = WALL + 6; c.stroke();
    c.strokeStyle = '#4a4f5a'; c.lineWidth = WALL; c.stroke();
    c.strokeStyle = '#6a707c'; c.lineWidth = 2; roomPath(c, r, -WALL / 2 + 1); c.stroke();
    c.strokeStyle = '#2a2d34'; c.lineWidth = 2; roomPath(c, r, WALL / 2 - 1); c.stroke();
    // rivets along the wall
    c.fillStyle = '#7a808c';
    for (let x = r.x + 2 * T; x < r.x + r.w - 2 * T; x += T * 1.5) { c.fillRect(x, r.y - 1, 2, 2); c.fillRect(x, r.y + r.h - 1, 2, 2); }
  }
  function cutDoor(c, r, corr) {
    if (r.deco === 'storage') {
      const x = r.side === 'left' ? r.x + r.w - WALL : r.x - WALL, y = corr.y + 6, h = corr.h - 12;
      floorFill(c, 'steel', x, y, WALL * 2, h, 1); hazard(c, x, y, WALL * 2, 3); hazard(c, x, y + h - 3, WALL * 2, 3); return;
    }
    const y = r.top ? r.y + r.h - WALL : r.y - WALL;
    floorFill(c, 'steel', r.door.x, y, r.door.w, WALL * 2, 3);
    hazard(c, r.door.x - 3, y, 3, WALL * 2); hazard(c, r.door.x + r.door.w, y, 3, WALL * 2);
  }
  const ITEM = {
    desk(c, x, y, on) {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 2, y + 2, 3.4 * T + 4, 1.6 * T);
      c.fillStyle = '#4d5462'; c.fillRect(x, y, 3.4 * T, 1.3 * T); c.fillStyle = '#5f6776'; c.fillRect(x, y, 3.4 * T, 4);
      c.fillStyle = '#353b47'; c.fillRect(x, y + 1.3 * T, 3.4 * T, 5);
      c.fillStyle = '#0b1022'; c.fillRect(x + 1.1 * T, y - 6, 1.2 * T, 10);
      c.fillStyle = on ? '#4dffa6' : '#1d2b45'; c.fillRect(x + 1.1 * T + 2, y - 4, 1.2 * T - 4, 6);
      c.fillStyle = '#2b2f38'; c.fillRect(x + 0.4 * T, y + 4, 0.5 * T, 3); // keyboard-ish details
    },
    chair(c, x, y) {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x + 8, y + 15, 9, 4, 0, 0, 7); c.fill();
      c.fillStyle = '#1f2633'; c.fillRect(x + 1, y, 14, 9); c.fillStyle = '#2d3646'; c.fillRect(x, y + 7, 16, 7); c.fillStyle = '#3b465a'; c.fillRect(x + 2, y + 1, 12, 3);
    },
    dish(c, x, y) {
      c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(x + 14, y + 26, 14, 5, 0, 0, 7); c.fill();
      c.fillStyle = '#4a5163'; c.fillRect(x + 10, y + 16, 8, 10);
      c.fillStyle = '#d9dde6'; c.beginPath(); c.ellipse(x + 14, y + 12, 15, 12, -.3, 0, 7); c.fill();
      c.strokeStyle = '#8a93a6'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x + 14, y + 12, 15, 12, -.3, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(x + 14, y + 12); c.lineTo(x + 22, y + 3); c.stroke(); c.fillStyle = '#8a93a6'; c.fillRect(x + 12, y + 10, 4, 4);
    },
    console(c, x, y) {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 2, y + 6, 3 * T + 4, T + 6);
      c.fillStyle = '#3a404c'; c.fillRect(x, y, 3 * T, T + 4); c.fillStyle = '#4c5361'; c.fillRect(x, y, 3 * T, 3);
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
    crate(c, x, y) { c.fillStyle = '#7a5a34'; c.fillRect(x, y, 1.8 * T, 1.8 * T); c.strokeStyle = '#4a361e'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, 1.8 * T - 2, 1.8 * T - 2); c.beginPath(); c.moveTo(x + 2, y + 2); c.lineTo(x + 1.8 * T - 2, y + 1.8 * T - 2); c.stroke(); },
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
      c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x - 2, y + 4, 4.2 * T + 4, 2.4 * T);
      c.fillStyle = '#5c6478'; c.fillRect(x, y, 4.2 * T, 2.2 * T); c.fillStyle = '#6e7790'; c.fillRect(x, y, 4.2 * T, 5);
      c.strokeStyle = '#d9a73e'; c.lineWidth = 2; c.setLineDash([5, 3]); c.strokeRect(x + 1, y + 1, 4.2 * T - 2, 2.2 * T - 2); c.setLineDash([]);
      c.fillStyle = '#2b3142'; c.fillRect(x + 0.9 * T, y + 7, 2.4 * T, 1.3 * T);
      for (let i = 0; i < 5; i++) { c.fillStyle = '#8a93a6'; c.fillRect(x + 0.9 * T + 4 + i * 7, y + 10, 4, 1.3 * T - 6); }
    },
  };
  function drawStatic(w, d) {
    const pad = 0, W = Math.ceil(w.bounds.w), H = Math.ceil(w.bounds.h), scale = 2;
    const cv = document.createElement('canvas'); cv.width = W * scale; cv.height = H * scale;
    const c = cv.getContext('2d'); c.scale(scale, scale); c.translate(-w.bounds.x + pad, -w.bounds.y + pad);
    // corridor
    const k = w.corr;
    floorFill(c, 'steel', k.x, k.y, k.w, k.h, 2);
    c.fillStyle = '#4a4f5a'; c.fillRect(k.x, k.y - WALL / 2, k.w, WALL); c.fillRect(k.x, k.y + k.h - WALL / 2, k.w, WALL);
    c.fillStyle = '#6a707c'; c.fillRect(k.x, k.y - WALL / 2, k.w, 2); c.fillRect(k.x, k.y + k.h + WALL / 2 - 2, k.w, 2);
    for (let x = k.x + T; x < k.x + k.w; x += 3 * T) { c.fillStyle = '#e9b949'; c.fillRect(x, k.y + 3, 6, 2); }
    c.fillStyle = 'rgba(77,255,166,.12)'; c.fillRect(k.x, k.y + k.h / 2 - 1, k.w, 2); // guide line
    for (const r of w.rooms) {
      c.save(); roomPath(c, r); c.clip(); floorFill(c, r.floor, r.x, r.y, r.w, r.h, hash(r.id) % 7);
      // light pools and dark corners
      const g = c.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, T, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * .7);
      g.addColorStop(0, 'rgba(255,230,180,.06)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
      c.restore();
      if (r.deco !== 'storage') wallFace(c, r);
      for (const it of r.items) ITEM[it.t]?.(c, it.x, it.y);
      for (const dk of r.desks) { ITEM.chair(c, dk.x + 1.2 * T, dk.y + 1.7 * T); }
      if (r.machine) { ITEM.machine(c, r.machine.x, r.machine.y); }
      if (r.belt) { c.fillStyle = '#1a1c22'; c.fillRect(r.belt.x - 2, r.belt.y - 2, r.belt.w + 4, T * 0.9 + 4); c.fillStyle = '#353a45'; c.fillRect(r.belt.x, r.belt.y, r.belt.w, T * 0.9); }
      drawWalls(c, r); cutDoor(c, r, k);
    }
    // corridor walls get cut where doors meet it
    for (const r of w.rooms) if (!r.deco || r.deco === 'lounge') {
      const y = r.top ? k.y - WALL / 2 : k.y + k.h - WALL / 2;
      floorFill(c, 'steel', r.door.x, y, r.door.w, WALL, 4);
    }
    return { cv, scale };
  }

  /* ------------------------------------------------------------ walkers */
  function roomById(id) { return world.rooms.find((r) => r.id === id); }
  function insidePoint(r) {
    if (r.deco === 'storage') return { x: r.x + rnd(2 * T, r.w - 2 * T), y: r.y + rnd(2 * T, r.h - 2 * T) };
    return { x: r.x + rnd(2.5 * T, r.w - 2.5 * T), y: r.y + rnd(3.2 * T, r.h - 2.5 * T) };
  }
  function doorIn(r) { return r.deco === 'storage' ? { x: r.side === 'left' ? r.x + r.w - 2 * T : r.x + 2 * T, y: world.corr.y + world.corr.h / 2 } : { x: r.door.x + r.door.w / 2, y: r.top ? r.y + r.h - 1.5 * T : r.y + 1.5 * T }; }
  function doorOut(r) { return r.deco === 'storage' ? { x: r.side === 'left' ? r.x + r.w + T : r.x - T, y: world.corr.y + world.corr.h / 2 } : { x: r.door.x + r.door.w / 2, y: world.corr.y + world.corr.h / 2 + (r.top ? -6 : 6) }; }
  function route(from, toRoom, toPt) {
    const pts = [];
    if (from.room !== toRoom.id) {
      const fr = roomById(from.room);
      if (fr) { pts.push(doorIn(fr), doorOut(fr)); }
      pts.push(doorOut(toRoom), doorIn(toRoom));
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
  function nextIdleTarget(b) {
    const home = roomById(b.home || b.room) || world.rooms[0];
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
      if (b.goingToDesk) { b.sitting = true; b.goingToDesk = false; return; }
      b.wait -= dt; if (b.wait <= 0) { nextIdleTarget(b); b.wait = rnd(1.5, 4.5); }
      return;
    }
    const t = b.path[0], dx = t.x - b.x, dy = t.y - b.y, dist = Math.hypot(dx, dy), sp = (b.npc ? 22 : 34) * dt;
    if (Math.abs(dx) > .5) b.dir = dx > 0 ? 1 : -1;
    if (dist <= sp) { b.x = t.x; b.y = t.y; b.path.shift(); const r = world.rooms.find((r) => b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h); if (r) b.room = r.id; }
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
    drawStars(ctx, W, H, t);
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
      const a = doorOut(rs[0]), z = doorOut(rs[rs.length - 1]), p = (t * .18 + hash(wf.id) % 10 / 10) % 1;
      const x = a.x + (z.x - a.x) * p, y = world.corr.y + world.corr.h / 2 - 3;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x - 6, y + 7, 14, 3); ctx.fillStyle = '#b8895a'; ctx.fillRect(x - 6, y - 4, 12, 10); ctx.strokeStyle = '#6b4a32'; ctx.strokeRect(x - 5.5, y - 3.5, 11, 9);
    }
    // walkers, painted back-to-front
    const all = [...bots.values(), ...npcs, ...(cmdr ? [cmdr] : [])];
    for (const w of all) stepWalker(w, dt);
    all.sort((p, q) => p.y - q.y);
    hits.length = 0;
    for (const w of all) drawWalker(ctx, w, t);
    ctx.restore();
    // vignette
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const hits = [];
  function drawWalker(c, w, t) {
    const sz = w.npc ? 18 : w.commander ? 40 : 35, bob = 0;
    const frame = w.moving ? Math.floor(w.phase || 0) % 4 : w.sitting ? 'sit' : 'stand';
    const breathe = w.moving ? 1 : 1 + Math.sin(t * 2.2 + (w.x + w.y) * .05) * .014;
    c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(w.x, w.y, sz * .32, sz * .12, 0, 0, 7); c.fill();
    let img = null;
    if (w.commander) img = spriteImg(handlers.commanderSprite?.(frame));
    else if (w.npc) img = spriteImg(handlers.sprite?.({ id: 'npc', look: NPC_LOOK }, frame));
    else img = spriteImg(handlers.sprite?.(w.agent, frame));
    c.save(); c.translate(w.x, w.y - bob); if (w.dir < 0) c.scale(-1, 1);
    if (img) c.drawImage(img, -sz / 2, -sz * breathe, sz, sz * breathe);
    else { c.fillStyle = '#d9dde6'; c.fillRect(-4, -sz * .8, 8, sz * .8); c.beginPath(); c.arc(0, -sz * .85, 4, 0, 7); c.fill(); }
    c.restore();
    if (w.commander) { label(c, 'COMMANDER', w.x, w.y - sz - 12, { color: '#ffe3a3', bg: 'rgba(40,28,6,.88)', border: '#b8892a', size: 6, align: 'center' }); hits.push({ commander: true, x: w.x, y: w.y - sz / 2, r: sz * .6 }); return; }
    if (!w.npc) {
      hits.push({ id: w.id, x: w.x, y: w.y - sz / 2, r: sz * .6 });
      const asking = data?.tasks?.some((x) => x.agent === w.id && x.status === 'running' && x.ask);
      if (asking) {
        const by = w.y - sz - 14 - Math.abs(Math.sin(t * 3)) * 2;
        c.fillStyle = '#ffc85a'; c.beginPath(); c.arc(w.x, by, 7, 0, 7); c.fill(); c.fillStyle = '#1a1c22';
        c.font = '800 10px ui-monospace, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', w.x, by + .5); c.textAlign = 'left';
      } else if (w.sitting && w.agent?.status === 'running') { // typing dots
        for (let i = 0; i < 3; i++) { c.fillStyle = `rgba(138,255,193,${.35 + .65 * ((Math.floor(t * 4) + i) % 3 === 0)})`; c.fillRect(w.x - 6 + i * 5, w.y - sz - 6, 3, 3); }
      }
    }
  }
  const NPC_LOOK = { bg: '#000000', fg: '#c7cfdc', shape: 'round', eyes: 'visor', mouth: 'none', top: 'antenna', body: 'none', accent: '#38e8ff' };
  let stars = null;
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
    cam.z = W >= 900 ? Math.min(zh, Math.max(zw, zh * .7)) : Math.min(zh, W / (30 * T)); // phones: about one and a half rooms across
    cam.z = Math.max(.35, Math.min(2.5, cam.z));
    const lounge = roomById('__lounge');
    cam.x = W >= 900 ? b.x + b.w / 2 : (lounge ? lounge.x + lounge.w : b.x + b.w / 2);
    cam.y = b.y + b.h / 2; cam.fitted = true; clampCam();
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
        else { const ob = world.rooms.find((r) => r.outbox && p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h); if (ob) handlers.onOutbox?.(); }
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
