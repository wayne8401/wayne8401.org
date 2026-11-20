/* Space Agency: the City View (PC)
 * A buildable, living city drawn on a canvas. Your stations are buildings (Research Lab, Studio,
 * Ops Center, plus HQ for the Commander and a Warehouse for the Outbox), set among homes,
 * factories, shops, parks and trees, joined by streets with cars driving on them. Agents walk the
 * sidewalks to their building and work inside it; delivery trucks carry work between buildings
 * while a production line runs. Build mode lets you lay roads, place homes, factories, shops,
 * trees and parks, move buildings and bulldoze. Day turns to night with the local clock.
 * All art is drawn in code and original. Same API as AgentStationView:
 *   SpaceAgencyCity.mount(host, handlers), .setData(d), .fit()
 */
(() => {
  'use strict';
  const S = 32, GW = 44, GH = 30; // tile size (world px) and map size in tiles
  const KEY = 'as.city.v1';
  const FOOT = { house: [2, 2], shop: [2, 2], factory: [3, 3], office: [3, 3], park: [3, 3], tree: [1, 1], hq: [4, 4], lab: [3, 3], studio: [3, 3], opsctr: [3, 3], warehouse: [3, 3] };
  const TOOLS = [
    ['select', '👆', 'Look around'], ['road', '🛣️', 'Road'], ['house', '🏠', 'Home'], ['shop', '🏪', 'Shop'], ['factory', '🏭', 'Factory'],
    ['office', '🏢', 'Office'], ['park', '⛲', 'Park'], ['tree', '🌳', 'Tree'], ['move', '✋', 'Move a building'], ['bulldoze', '🧹', 'Bulldoze'],
  ];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const hash = (s) => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const key = (x, y) => x + ',' + y;

  let host = null, canvas = null, ctx = null, bar = null, handlers = {}, data = null;
  let city = null, ground = null, groundKey = '';
  const cam = { x: GW * S / 2, y: GH * S / 2, z: 1, fitted: false };
  let tool = 'select', hover = null, moving = null, running = false, lastT = 0, visible = true;
  const walkers = new Map(); let cmdr = null; const cars = []; const trucks = new Map(); const hits = [];

  /* ------------------------------------------------------------ city model */
  function defaultCity() {
    const roads = new Set();
    const rows = [3, 10, 17, 24], cols = [3, 12, 21, 30, 39];
    for (const y of rows) for (let x = 3; x <= 39; x++) roads.add(key(x, y));
    for (const x of cols) for (let y = 3; y <= 24; y++) roads.add(key(x, y));
    const b = [];
    const add = (t, x, y, extra = {}) => b.push({ t, x, y, w: FOOT[t][0], h: FOOT[t][1], id: extra.id || `${t}-${x}-${y}`, ...extra });
    add('hq', 15, 12, { id: 'hq' });
    add('park', 22, 19); add('park', 26, 19, { id: 'park-2' });
    for (const [bx, by] of [[4, 4], [4, 18], [13, 18]]) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) add('house', bx + i * 2, by + j * 3 + (j ? 1 : 0));
    add('factory', 31, 4); add('factory', 35, 4); add('factory', 31, 20); add('factory', 35, 20);
    add('office', 22, 4); add('office', 26, 4); add('shop', 13, 4); add('shop', 19, 4, { id: 'shop-2' });
    for (const [x, y] of [[20, 12], [20, 15], [11, 11], [29, 16], [29, 4], [21, 18], [12, 23], [4, 16], [38, 13], [38, 9], [20, 23], [25, 23], [30, 23]]) add('tree', x, y);
    return { v: 1, roads: [...roads], buildings: b };
  }
  const LOTS = [[23, 12], [5, 12], [26, 12], [8, 12], [14, 5], [16, 19], [23, 5], [32, 12]];
  function loadCity() {
    let c = null; try { c = JSON.parse(localStorage.getItem(KEY)); } catch { /* none */ }
    if (!c || c.v !== 1) c = defaultCity();
    c.roadSet = new Set(c.roads);
    return c;
  }
  function saveCity() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, roads: [...city.roadSet], buildings: city.buildings })); } catch { /* private mode */ } groundKey = ''; }
  const occupied = (x, y, ignore) => city.roadSet.has(key(x, y)) || city.buildings.some((b) => b !== ignore && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  const fits = (x, y, w, h, ignore) => { if (x < 1 || y < 1 || x + w > GW - 1 || y + h > GH - 1) return false; for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (occupied(x + i, y + j, ignore)) return false; return true; };
  function stationType(st) {
    const s = `${st.name} ${st.region || ''}`.toLowerCase();
    if (/research|web|lab|science|data/.test(s)) return 'lab';
    if (/studio|writ|creative|media|social|design/.test(s)) return 'studio';
    return 'opsctr';
  }
  function syncStations(d) { // every station has a building; new stations get a free lot near HQ
    let changed = false;
    const ids = new Set(d.stations.map((s) => 'st:' + s.id));
    city.buildings = city.buildings.filter((b) => !b.station || ids.has(b.id) || (changed = true, false));
    if (!city.buildings.some((b) => b.id === 'warehouse')) {
      const spot = LOTS.find(([x, y]) => fits(x, y, 3, 3)) || findLot(3, 3);
      if (spot) { city.buildings.push({ t: 'warehouse', x: spot[0], y: spot[1], w: 3, h: 3, id: 'warehouse', outbox: true }); changed = true; }
    }
    for (const st of d.stations) {
      const id = 'st:' + st.id, b = city.buildings.find((x) => x.id === id), t = stationType(st);
      if (b) { b.name = st.name; if (b.t !== t) { b.t = t; changed = true; } continue; }
      const spot = LOTS.find(([x, y]) => fits(x, y, 3, 3)) || findLot(3, 3);
      if (spot) { city.buildings.push({ t, x: spot[0], y: spot[1], w: 3, h: 3, id, station: st.id, name: st.name }); changed = true; }
    }
    if (changed) saveCity();
  }
  function findLot(w, h) {
    for (let r = 0; r < 30; r++) for (let x = GW / 2 - r; x <= GW / 2 + r; x++) for (let y = GH / 2 - r; y <= GH / 2 + r; y++) if (fits(x, y, w, h) && nearRoad(x, y, w, h)) return [x, y];
    return null;
  }
  function nearRoad(x, y, w, h) { for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) if (city.roadSet.has(key(x + i, y + j))) return true; return false; }

  /* ------------------------------------------------------------ roads & paths */
  const roadNbrs = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => city.roadSet.has(key(a, b)));
  function nearestRoad(px, py) { // tile coords of the road nearest a world point
    const tx = Math.floor(px / S), ty = Math.floor(py / S);
    for (let r = 0; r < 12; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if ((Math.abs(dx) === r || Math.abs(dy) === r) && city.roadSet.has(key(tx + dx, ty + dy))) return [tx + dx, ty + dy];
    return null;
  }
  function bfs(a, b) {
    if (!a || !b) return null; const start = key(...a), goal = key(...b), prev = new Map([[start, null]]), q = [a];
    while (q.length) { const [x, y] = q.shift(); if (key(x, y) === goal) break; for (const n of roadNbrs(x, y)) { const k = key(...n); if (!prev.has(k)) { prev.set(k, key(x, y)); q.push(n); } } }
    if (!prev.has(goal)) return null; const path = []; for (let k = goal; k; k = prev.get(k)) path.unshift(k.split(',').map(Number)); return path;
  }
  const door = (b) => ({ x: (b.x + b.w / 2) * S, y: (b.y + b.h) * S + 6 });
  function sidewalkPath(fromPt, toPt) { // walk along the sidewalk beside the roads
    const tiles = bfs(nearestRoad(fromPt.x, fromPt.y), nearestRoad(toPt.x, toPt.y));
    if (!tiles) return [toPt];
    const pts = tiles.map(([x, y], i) => {
      const n = tiles[Math.min(i + 1, tiles.length - 1)], p = tiles[Math.max(i - 1, 0)], dx = Math.sign(n[0] - p[0]), dy = Math.sign(n[1] - p[1]);
      const off = S * .42; return { x: (x + .5) * S + (dy ? off : 0) * (dy > 0 ? -1 : 1) * 1, y: (y + .5) * S + (dx ? off : 0) * (dx > 0 ? 1 : -1) };
    });
    return [...pts, toPt];
  }

  /* ------------------------------------------------------------ ground layer (grass, roads, lots) */
  function drawGround() {
    const cv = document.createElement('canvas'), sc = 1.5; cv.width = GW * S * sc; cv.height = GH * S * sc;
    const c = cv.getContext('2d'); c.scale(sc, sc);
    c.fillStyle = '#5f9a4a'; c.fillRect(0, 0, GW * S, GH * S);
    for (let i = 0; i < 2600; i++) { c.fillStyle = Math.random() < .5 ? 'rgba(40,90,30,.25)' : 'rgba(140,190,100,.18)'; c.fillRect(Math.random() * GW * S, Math.random() * GH * S, 2, 2); }
    // building lots get paving
    for (const b of city.buildings) if (b.t !== 'tree' && b.t !== 'park') { c.fillStyle = b.t === 'house' ? '#7fae63' : '#b9b5aa'; c.fillRect(b.x * S - 2, b.y * S - 2, b.w * S + 4, b.h * S + 10); }
    for (const b of city.buildings) if (b.t === 'park') {
      c.fillStyle = '#6fb257'; c.fillRect(b.x * S, b.y * S, b.w * S, b.h * S);
      c.strokeStyle = '#d8cfb4'; c.lineWidth = 6; c.beginPath(); c.moveTo(b.x * S, (b.y + 1.5) * S); c.lineTo((b.x + 3) * S, (b.y + 1.5) * S); c.moveTo((b.x + 1.5) * S, b.y * S); c.lineTo((b.x + 1.5) * S, (b.y + 3) * S); c.stroke();
    }
    // roads: sidewalk edge, asphalt, lane markings, crosswalks at junctions
    for (const k of city.roadSet) { const [x, y] = k.split(',').map(Number); c.fillStyle = '#c9c4b8'; c.fillRect(x * S - 4, y * S - 4, S + 8, S + 8); }
    for (const k of city.roadSet) { const [x, y] = k.split(',').map(Number); c.fillStyle = '#3b3f46'; c.fillRect(x * S, y * S, S, S); }
    for (const k of city.roadSet) {
      const [x, y] = k.split(',').map(Number), n = roadNbrs(x, y), h = n.some(([a]) => a !== x), v = n.some(([, b]) => b !== y);
      c.fillStyle = '#e9c84a';
      if (h && !v) for (let i = 4; i < S; i += 12) c.fillRect(x * S + i, y * S + S / 2 - 1, 6, 2);
      else if (v && !h) for (let i = 4; i < S; i += 12) c.fillRect(x * S + S / 2 - 1, y * S + i, 2, 6);
      else if (h && v && n.length >= 3) { c.fillStyle = 'rgba(255,255,255,.75)'; for (const [a, b] of n) { const cx = (a - x), cy = (b - y); for (let i = 0; i < 5; i++) { if (cx) c.fillRect((x + .5 + cx * .62) * S - 1.5, y * S + 3 + i * 6, 3, 4); else c.fillRect(x * S + 3 + i * 6, (y + .5 + cy * .62) * S - 1.5, 4, 3); } } }
    }
    return { cv, sc };
  }

  /* ------------------------------------------------------------ buildings */
  const STYLE = {
    house: { h: 26, wall: '#e8dcc6', roof: '#b4553f', label: '' }, shop: { h: 30, wall: '#f0ece3', roof: '#4f8fc0', label: '' },
    factory: { h: 46, wall: '#9aa1a9', roof: '#6d747c', label: '' }, office: { h: 92, wall: '#7c93ab', roof: '#5b6e82', label: '' },
    hq: { h: 150, wall: '#2f3d52', roof: '#1f2938', label: 'HQ' }, lab: { h: 70, wall: '#e6eef2', roof: '#a9c3cc', label: '' },
    studio: { h: 62, wall: '#3b2d4f', roof: '#2a2038', label: '' }, opsctr: { h: 84, wall: '#2f5a4b', roof: '#234539', label: '' },
    warehouse: { h: 44, wall: '#b08a5b', roof: '#8a6a44', label: '' },
  };
  function drawBuilding(c, b, t, night, busy) {
    if (b.t === 'tree') { drawTree(c, b, t); return; }
    if (b.t === 'park') { drawPark(c, b, t); return; }
    const st = STYLE[b.t] || STYLE.office, x = b.x * S + 3, y = b.y * S + 4, w = b.w * S - 6, d = b.h * S - 8, H = st.h;
    c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.moveTo(x + w, y + d); c.lineTo(x + w + H * .45, y + d - H * .25); c.lineTo(x + w + H * .45, y - H * .25 + 8); c.lineTo(x + w, y); c.fill(); // shadow
    // front wall
    const fy = y + d - H;
    const wg = c.createLinearGradient(x, 0, x + w, 0); wg.addColorStop(0, shade(st.wall, .12)); wg.addColorStop(1, shade(st.wall, -.18));
    c.fillStyle = wg; c.fillRect(x, fy, w, H);
    // windows
    const lit = night || busy, cols = Math.max(2, Math.floor(w / 16)), rows = Math.max(1, Math.floor((H - 14) / 16));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const wx = x + 5 + i * ((w - 10) / cols), wy = fy + 5 + j * ((H - 14) / rows), ww = (w - 10) / cols - 4, wh = Math.min(10, (H - 14) / rows - 4);
      const on = lit && (hash(b.id + i + ',' + j) % 5 !== 0 || busy);
      c.fillStyle = b.t === 'house' || b.t === 'shop' ? (on ? '#ffd98a' : '#6c8aa3') : on ? (busy ? (Math.sin(t * 4 + i + j) > -.7 ? '#9ff3ff' : '#5bc8e0') : '#ffe2a0') : 'rgba(30,45,65,.75)';
      c.fillRect(wx, wy, ww, wh);
      if (!on) { c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(wx, wy, ww * .35, wh); }
    }
    // door
    c.fillStyle = '#2a2420'; c.fillRect(x + w / 2 - 5, y + d - 13, 10, 13); c.fillStyle = 'rgba(255,220,150,.6)'; if (lit) c.fillRect(x + w / 2 - 4, y + d - 12, 8, 4);
    // roof
    const ry = fy - d * .55;
    if (b.t === 'house') { c.fillStyle = st.roof; c.beginPath(); c.moveTo(x - 3, fy); c.lineTo(x + w / 2, ry - 4); c.lineTo(x + w + 3, fy); c.fill(); c.fillStyle = shade(st.roof, -.25); c.beginPath(); c.moveTo(x + w / 2, ry - 4); c.lineTo(x + w + 3, fy); c.lineTo(x + w / 2, fy); c.fill(); c.fillStyle = '#7a4a3a'; c.fillRect(x + w * .72, ry + 2, 6, 10); smoke(c, x + w * .72 + 3, ry, t, b, .5); return; }
    c.fillStyle = st.roof; c.fillRect(x, ry, w, d * .55); c.fillStyle = shade(st.roof, .15); c.fillRect(x, ry, w, 3);
    if (b.t === 'factory') { for (let i = 0; i < 3; i++) { c.fillStyle = shade(st.roof, i % 2 ? -.15 : .1); c.beginPath(); c.moveTo(x + i * w / 3, ry + d * .55); c.lineTo(x + i * w / 3, ry + 4); c.lineTo(x + (i + 1) * w / 3, ry + d * .55); c.fill(); } c.fillStyle = '#7d4b3b'; c.fillRect(x + w - 14, ry - 30, 10, 34); c.fillStyle = '#d9d2c7'; c.fillRect(x + w - 14, ry - 30, 10, 4); smoke(c, x + w - 9, ry - 30, t, b, 1); }
    if (b.t === 'office') { c.fillStyle = '#9aa7b4'; c.fillRect(x + 6, ry + 5, 10, 7); c.fillRect(x + w - 18, ry + 6, 12, 6); }
    if (b.t === 'shop') { c.fillStyle = '#e5484d'; c.fillRect(x - 2, fy + 2, w + 4, 6); for (let i = 0; i < w; i += 8) { c.fillStyle = '#fff'; c.fillRect(x + i, fy + 2, 4, 6); } }
    if (b.t === 'lab') { c.fillStyle = '#dfe9ee'; c.beginPath(); c.arc(x + w / 2, ry + 10, 13, Math.PI, 0); c.fill(); c.strokeStyle = '#8fb0bb'; c.lineWidth = 1.2; c.stroke(); c.fillStyle = '#d9dde6'; c.beginPath(); c.ellipse(x + w - 12, ry + 6, 8, 6, -.3, 0, 7); c.fill(); }
    if (b.t === 'studio') { c.fillStyle = '#1a1424'; c.fillRect(x + 8, ry - 12, w - 16, 14); c.fillStyle = Math.sin(t * 3) > 0 ? '#ff7ad9' : '#c94fae'; c.font = '700 9px ui-monospace, monospace'; c.textAlign = 'center'; c.fillText('ON AIR', x + w / 2, ry - 2); c.textAlign = 'left'; }
    if (b.t === 'opsctr') { c.strokeStyle = '#9fb0bf'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x + w - 10, ry + 8); c.lineTo(x + w - 10, ry - 16); c.stroke(); c.fillStyle = Math.sin(t * 5) > 0 ? '#ff5c7a' : '#6b2333'; c.fillRect(x + w - 12, ry - 19, 4, 4); }
    if (b.t === 'warehouse') { c.fillStyle = '#6e5435'; c.fillRect(x + 8, y + d - 24, w - 16, 22); for (let i = 0; i < 5; i++) { c.fillStyle = '#5d462c'; c.fillRect(x + 8, y + d - 22 + i * 4, w - 16, 1.5); } }
    if (b.t === 'hq') {
      c.fillStyle = '#c9d4de'; c.beginPath(); c.arc(x + w / 2, ry + d * .27, 16, 0, 7); c.fill(); c.fillStyle = '#1f2938'; c.font = '800 13px sans-serif'; c.textAlign = 'center'; c.fillText('H', x + w / 2, ry + d * .27 + 5); c.textAlign = 'left';
      c.strokeStyle = '#c9d4de'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 10, ry + 4); c.lineTo(x + 10, ry - 22); c.stroke(); c.fillStyle = '#e9b949'; c.beginPath(); c.moveTo(x + 10, ry - 22); c.lineTo(x + 24 + Math.sin(t * 3) * 2, ry - 18); c.lineTo(x + 10, ry - 14); c.fill();
    }
  }
  function smoke(c, x, y, t, b, k) {
    for (let i = 0; i < 4; i++) { const p = ((t * .4 * k + i / 4 + hash(b.id) % 10 / 10) % 1); c.fillStyle = `rgba(220,220,220,${(1 - p) * .45})`; c.beginPath(); c.arc(x + p * 14 * k + Math.sin(t + i) * 2, y - p * 34 * k, 3 + p * 7 * k, 0, 7); c.fill(); }
  }
  function drawTree(c, b, t) {
    const x = (b.x + .5) * S, y = (b.y + .85) * S, sw = Math.sin(t * 1.3 + b.x) * 1.2;
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x + 3, y, 12, 5, 0, 0, 7); c.fill();
    c.fillStyle = '#6b4a32'; c.fillRect(x - 2.5, y - 14, 5, 14);
    const g = c.createRadialGradient(x - 5 + sw, y - 26, 2, x + sw, y - 22, 16); g.addColorStop(0, '#8fd16a'); g.addColorStop(1, '#2f6e2a');
    c.fillStyle = g; c.beginPath(); c.arc(x + sw, y - 22, 13, 0, 7); c.arc(x - 8 + sw, y - 16, 9, 0, 7); c.arc(x + 8 + sw, y - 16, 9, 0, 7); c.fill();
  }
  function drawPark(c, b, t) {
    const cx = (b.x + 1.5) * S, cy = (b.y + 1.5) * S;
    c.fillStyle = '#b9c7cf'; c.beginPath(); c.ellipse(cx, cy, 15, 9, 0, 0, 7); c.fill(); c.fillStyle = '#5fb8e0'; c.beginPath(); c.ellipse(cx, cy, 11, 6, 0, 0, 7); c.fill();
    for (let i = 0; i < 3; i++) { const p = (t * .8 + i / 3) % 1; c.fillStyle = `rgba(220,245,255,${1 - p})`; c.beginPath(); c.arc(cx + Math.sin(i * 2.1) * 3 * p, cy - 4 - p * 14, 1.6, 0, 7); c.fill(); }
    c.fillStyle = '#7a5a3a'; c.fillRect(b.x * S + 8, (b.y + 2.5) * S, 18, 4); c.fillRect((b.x + 3) * S - 26, b.y * S + 10, 18, 4);
  }
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`; }

  /* ------------------------------------------------------------ cars & trucks */
  const CAR_COLORS = ['#e5484d', '#3e6bff', '#f2f2f0', '#e9b949', '#2f3d52', '#4dbb7a', '#9b7bff', '#ff9a4d'];
  function spawnCars() {
    const roads = [...city.roadSet].map((k) => k.split(',').map(Number)); cars.length = 0;
    const n = Math.min(26, Math.round(roads.length / 9));
    for (let i = 0; i < n; i++) { const [x, y] = pick(roads), nb = roadNbrs(x, y); if (!nb.length) continue; const [nx, ny] = pick(nb); cars.push({ x, y, nx, ny, p: Math.random(), v: rnd(1.4, 2.4), col: pick(CAR_COLORS), long: Math.random() < .15 }); }
  }
  function stepCar(car, dt) {
    car.p += car.v * dt;
    while (car.p >= 1) {
      car.p -= 1; const px = car.x, py = car.y; car.x = car.nx; car.y = car.ny;
      let nb = roadNbrs(car.x, car.y).filter(([a, b]) => a !== px || b !== py); if (!nb.length) nb = roadNbrs(car.x, car.y);
      const ahead = nb.find(([a, b]) => a - car.x === car.x - px && b - car.y === car.y - py);
      [car.nx, car.ny] = ahead && Math.random() < .7 ? ahead : pick(nb);
    }
  }
  function carPose(car) {
    const dx = car.nx - car.x, dy = car.ny - car.y, lane = S * .2;
    return { x: (car.x + .5 + dx * car.p) * S - dy * lane, y: (car.y + .5 + dy * car.p) * S + dx * lane, a: Math.atan2(dy, dx) };
  }
  function drawCar(c, car, night, truck) {
    const P = carPose(car), L = truck ? 26 : car.long ? 22 : 16, W = truck ? 11 : 9;
    c.save(); c.translate(P.x, P.y); c.rotate(P.a);
    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-L / 2 + 2, -W / 2 + 2, L, W);
    c.fillStyle = truck ? '#f2f2f0' : car.col; c.beginPath(); c.roundRect?.(-L / 2, -W / 2, L, W, 3); c.fill();
    if (truck) { c.fillStyle = '#38e8ff'; c.fillRect(-L / 2 + 2, -W / 2 + 1, L - 10, 2); c.fillStyle = '#3e6bff'; c.fillRect(L / 2 - 8, -W / 2, 8, W); }
    c.fillStyle = 'rgba(20,35,55,.85)'; c.fillRect(L / 2 - (truck ? 7 : 6), -W / 2 + 1.5, 3, W - 3); if (!truck) c.fillRect(-L / 2 + 2, -W / 2 + 1.5, 2.5, W - 3);
    c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(-L / 2 + 3, -W / 2 + 1, L - 8, 1.5);
    if (night) { c.fillStyle = 'rgba(255,245,190,.9)'; c.fillRect(L / 2 - 1, -W / 2 + 1, 2, 2); c.fillRect(L / 2 - 1, W / 2 - 3, 2, 2); c.fillStyle = 'rgba(255,240,170,.18)'; c.beginPath(); c.moveTo(L / 2, -W / 2); c.lineTo(L / 2 + 26, -W); c.lineTo(L / 2 + 26, W); c.lineTo(L / 2, W / 2); c.fill(); }
    c.fillStyle = '#ff4d5a'; c.fillRect(-L / 2, -W / 2 + 1, 1.5, 2); c.fillRect(-L / 2, W / 2 - 3, 1.5, 2);
    c.restore();
  }
  function syncTrucks(d) { // a delivery truck per running production line, buildings A -> B
    const live = new Set();
    for (const wf of d.workflows || []) if (wf.status === 'running') {
      const sts = [...new Set(wf.steps.map((s) => d.agents.find((a) => a.id === s.agent)?.station))].filter(Boolean);
      const A = city.buildings.find((b) => b.station === sts[0]), B = city.buildings.find((b) => b.station === sts[sts.length - 1]);
      if (!A || !B || A === B) continue; live.add(wf.id);
      if (!trucks.has(wf.id)) { const path = bfs(nearestRoad(door(A).x, door(A).y), nearestRoad(door(B).x, door(B).y)); if (path && path.length > 1) trucks.set(wf.id, { path, i: 0, p: 0 }); }
    }
    for (const k of [...trucks.keys()]) if (!live.has(k)) trucks.delete(k);
  }

  /* ------------------------------------------------------------ people */
  const homeOf = (w) => city.buildings.find((b) => b.id === (w.commander ? 'hq' : 'st:' + (w.agent?.station || ''))) || city.buildings.find((b) => b.id === 'hq');
  function syncPeople(d) {
    const seen = new Set();
    for (const a of d.agents) {
      seen.add(a.id); let w = walkers.get(a.id);
      if (!w) { const b = homeOf({ agent: a }) || city.buildings[0], p = door(b); w = { id: a.id, x: p.x + rnd(-20, 20), y: p.y + rnd(6, 20), path: [], wait: rnd(0, 3), dir: 1, face: 'down', scale: .95 }; walkers.set(a.id, w); }
      w.agent = a;
      const work = a.status === 'running' || a.status === 'waiting', home = homeOf(w);
      if (work && home && !w.goingIn && !w.inside) { w.goingIn = home.id; w.path = sidewalkPath(w, door(home)); w.wait = 0; }
      if (!work && w.inside === home?.id && w.forWork) { w.inside = null; w.forWork = false; const p = door(home); w.x = p.x; w.y = p.y + 4; w.wait = rnd(1, 3); w.path = []; }
    }
    for (const id of [...walkers.keys()]) if (!seen.has(id)) walkers.delete(id);
    if (!cmdr) { const hq = city.buildings.find((b) => b.id === 'hq'); if (hq) { const p = door(hq); cmdr = { commander: true, x: p.x, y: p.y + 10, path: [], wait: 2, dir: 1, face: 'down', scale: 1 }; } }
  }
  function nextStop(w) {
    const r = Math.random(), places = city.buildings.filter((b) => b.t !== 'tree');
    let b = w.commander ? (r < .4 ? city.buildings.find((x) => x.id === 'hq') : pick(places.filter((x) => x.station || x.t === 'park'))) : r < .3 ? homeOf(w) : pick(places);
    if (!b) return;
    if (b.t === 'park') { w.path = sidewalkPath(w, { x: (b.x + rnd(.6, 2.4)) * S, y: (b.y + rnd(.6, 2.4)) * S }); w.enter = null; }
    else { w.path = sidewalkPath(w, door(b)); w.enter = Math.random() < .55 ? b.id : null; }
  }
  function stepPerson(w, dt) {
    if (w.inside) { w.wait -= dt; if (!w.forWork && w.wait <= 0) { const b = city.buildings.find((x) => x.id === w.inside); w.inside = null; if (b) { const p = door(b); w.x = p.x; w.y = p.y + 4; } w.wait = rnd(1, 3); } return; }
    if (!w.path.length) {
      w.moving = false;
      if (w.goingIn) { w.inside = w.goingIn; w.forWork = true; w.goingIn = null; return; }
      if (w.enter) { w.inside = w.enter; w.enter = null; w.wait = rnd(4, 10); return; }
      if (!w.chatUntil && Math.random() < dt * .1) w.face = pick(['down', 'side', 'up', 'down']);
      w.wait -= dt; if (w.wait <= 0) { nextStop(w); w.wait = rnd(2.5, 6); }
      return;
    }
    w.chatUntil = 0;
    const t = w.path[0], dx = t.x - w.x, dy = t.y - w.y, dist = Math.hypot(dx, dy), sp = (w.commander ? 24 : 22) * dt;
    if (Math.abs(dx) > .4) w.dir = dx > 0 ? 1 : -1;
    w.face = Math.abs(dx) > Math.abs(dy) * .8 ? 'side' : dy > 0 ? 'down' : 'up';
    if (dist <= sp) { w.x = t.x; w.y = t.y; w.path.shift(); } else { w.x += dx / dist * sp; w.y += dy / dist * sp; }
    w.phase = (w.phase || 0) + sp / 4; w.moving = true;
  }

  /* ------------------------------------------------------------ frame */
  function label(c, text, x, y, { color = '#8affc1', bg = 'rgba(6,18,14,.9)', border = '#2e5a46', size = 7, align = 'center' } = {}) {
    c.font = `600 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    const w = c.measureText(text).width + 8, h = size + 6, lx = align === 'center' ? x - w / 2 : x;
    c.fillStyle = bg; c.fillRect(lx, y, w, h); c.strokeStyle = border; c.lineWidth = 1; c.strokeRect(lx + .5, y + .5, w - 1, h - 1);
    c.fillStyle = color; c.textBaseline = 'middle'; c.fillText(text, lx + 4, y + h / 2 + .5); c.textBaseline = 'alphabetic';
  }
  function nightLevel() { const d = new Date(), h = d.getHours() + d.getMinutes() / 60; if (h >= 7 && h <= 18) return 0; if (h > 18 && h < 20) return (h - 18) / 2; if (h > 5 && h < 7) return (7 - h) / 2; return 1; }
  function frame(now) {
    if (!running) return; requestAnimationFrame(frame);
    if (!visible || document.hidden || !city) return;
    const dt = Math.min(.05, (now - (lastT || now)) / 1000); lastT = now; const t = now / 1000;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); if (!cam.fitted) fit(); }
    if (!ground || groundKey !== JSON.stringify([city.buildings.map((b) => [b.t, b.x, b.y]), city.roadSet.size])) { ground = drawGround(); groundKey = JSON.stringify([city.buildings.map((b) => [b.t, b.x, b.y]), city.roadSet.size]); if (!cars.length) spawnCars(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const night = handlers.forceNight ? 1 : nightLevel(), isNight = night > .5;
    ctx.fillStyle = '#20301c'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(ground.cv, 0, 0, GW * S, GH * S);
    const d = data || { agents: [], tasks: [], stations: [], workflows: [], files: [] };
    for (const car of cars) stepCar(car, dt);
    for (const tr of trucks.values()) { tr.p += dt * 1.6; while (tr.p >= 1) { tr.p -= 1; tr.i = (tr.i + 1) % (tr.path.length - 1); } }
    const people = [...walkers.values(), ...(cmdr ? [cmdr] : [])];
    for (const w of people) stepPerson(w, dt);
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j]; if (a.inside || b.inside || a.moving || b.moving) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 24 && !a.chatUntil && !b.chatUntil && Math.random() < dt * .3) { a.chatUntil = b.chatUntil = t + rnd(2.5, 4); a.face = b.face = 'side'; a.dir = b.x > a.x ? 1 : -1; b.dir = -a.dir; a.wait = Math.max(a.wait, 3); b.wait = Math.max(b.wait, 3); a.talkFirst = true; b.talkFirst = false; }
    }
    for (const w of people) if (w.chatUntil && t > w.chatUntil) w.chatUntil = 0;
    // everything that stands up, painted back to front
    const busyOf = (b) => b.station && d.agents.some((a) => a.station === b.station && a.status === 'running');
    const things = [];
    for (const b of city.buildings) things.push({ y: (b.y + b.h) * S, draw: () => drawBuilding(ctx, b, t, isNight, busyOf(b)) });
    for (const car of cars) { const P = carPose(car); things.push({ y: P.y, draw: () => drawCar(ctx, car, isNight) }); }
    for (const tr of trucks.values()) { const a = tr.path[tr.i], b = tr.path[tr.i + 1] || a, car = { x: a[0], y: a[1], nx: b[0], ny: b[1], p: tr.p }; things.push({ y: carPose(car).y, draw: () => drawCar(ctx, car, isNight, true) }); }
    hits.length = 0;
    for (const w of people) if (!w.inside) things.push({ y: w.y, draw: () => { window.AgentStationFigures?.draw(ctx, w, t, (a) => handlers.look?.(a)); personExtras(w, t); } });
    things.sort((p, q) => p.y - q.y); for (const th of things) th.draw();
    // night falls: a blue tint, then lights glow through it
    if (night > 0) {
      ctx.fillStyle = `rgba(8,16,48,${.5 * night})`; ctx.fillRect(0, 0, GW * S, GH * S);
      ctx.globalCompositeOperation = 'lighter';
      for (const k of city.roadSet) { const [x, y] = k.split(',').map(Number); if ((x + y) % 4) continue; const g = ctx.createRadialGradient((x + .5) * S, (y + .5) * S, 1, (x + .5) * S, (y + .5) * S, 30); g.addColorStop(0, `rgba(255,220,140,${.22 * night})`); g.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = g; ctx.fillRect(x * S - 30, y * S - 30, S + 60, S + 60); }
      ctx.globalCompositeOperation = 'source-over';
    }
    // signs over the station buildings, HQ and the warehouse
    for (const b of city.buildings) {
      const cx = (b.x + b.w / 2) * S, top = b.y * S + b.h * S - (STYLE[b.t]?.h || 0) - (b.h * S) * .55 - 22 - (b.station && b.x % 2 ? 30 : 0);
      if (b.station) {
        const crew = d.agents.filter((a) => a.station === b.station), ids = new Set(crew.map((a) => a.id)), mine = d.tasks.filter((x) => ids.has(x.agent));
        label(ctx, (b.name || '').toUpperCase(), cx, top - 14, { size: 7.5 });
        label(ctx, `${mine.length} RUNS · ${mine.filter((x) => x.status === 'done').length} SHIPPED · ${mine.filter((x) => x.status === 'error').length} FAILED`, cx, top, { size: 6.5 });
        const inside = [...walkers.values()].filter((w) => w.inside === b.id && w.forWork);
        inside.forEach((w, i) => label(ctx, `${w.agent.name.toUpperCase()} · ${(w.agent.task || 'working').slice(0, 26)}`, cx, top + 14 + i * 13, { size: 6, color: '#9ff3ff', bg: 'rgba(8,20,32,.9)', border: '#2e5a6a' }));
        hits.push({ building: b, x: b.x * S, y: b.y * S - 40, w: b.w * S, h: b.h * S + 40 });
      } else if (b.id === 'hq') { label(ctx, 'HQ · COMMANDER', cx, top, { size: 7.5, color: '#ffe3a3', bg: 'rgba(40,28,6,.9)', border: '#b8892a' }); hits.push({ building: b, x: b.x * S, y: b.y * S - 40, w: b.w * S, h: b.h * S + 40 }); }
      else if (b.outbox) { const n = (d.files || []).length; label(ctx, `OUTBOX · ${n}${d.outboxNew ? ` · ${d.outboxNew} NEW` : ''}`, cx, top, { size: 7, color: '#ffd9a8', bg: 'rgba(30,20,10,.9)', border: '#8a6a3e' }); hits.push({ building: b, x: b.x * S, y: b.y * S - 30, w: b.w * S, h: b.h * S + 30 }); }
    }
    // build-mode preview
    if (hover && tool !== 'select') {
      const [w, h] = FOOT[tool] || (moving ? [moving.w, moving.h] : [1, 1]);
      const ok = tool === 'bulldoze' || tool === 'move' && !moving ? true : tool === 'road' ? !occupied(hover.x, hover.y) : fits(hover.x, hover.y, w, h, moving);
      ctx.fillStyle = ok ? 'rgba(77,255,166,.3)' : 'rgba(255,92,122,.35)'; ctx.strokeStyle = ok ? '#4dffa6' : '#ff5c7a'; ctx.lineWidth = 2;
      ctx.fillRect(hover.x * S, hover.y * S, w * S, h * S); ctx.strokeRect(hover.x * S + 1, hover.y * S + 1, w * S - 2, h * S - 2);
    }
    ctx.restore();
  }
  function personExtras(w, t) {
    const sz = (w.commander ? 38 : 34) * (w.scale || 1);
    if (w.commander) { label(ctx, 'COMMANDER', w.x, w.y - sz - 12, { size: 5.5, color: '#ffe3a3', bg: 'rgba(40,28,6,.88)', border: '#b8892a' }); hits.push({ commander: true, x: w.x - 8, y: w.y - sz, w: 16, h: sz }); return; }
    hits.push({ id: w.id, x: w.x - 8, y: w.y - sz, w: 16, h: sz });
    if (w.chatUntil && w.talkFirst === (Math.floor(t * 1.2) % 2 === 0)) {
      const bx = w.x + (w.dir > 0 ? 3 : -3), by = w.y - sz - 7;
      ctx.fillStyle = 'rgba(240,244,255,.95)'; ctx.beginPath(); ctx.ellipse(bx, by, 5.5, 3.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a1c22'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(bx - 2.4 + i * 2.4, by, .7, 0, 7); ctx.fill(); }
    }
  }

  /* ------------------------------------------------------------ camera, input, build mode */
  function fit() { const W = canvas.clientWidth || 800, H = canvas.clientHeight || 600; cam.z = Math.max(.35, Math.min(2, Math.min(W / (GW * S), H / (GH * S)) * 1.15)); cam.x = GW * S / 2; cam.y = GH * S / 2; cam.fitted = true; clampCam(); }
  function clampCam() { const W = canvas.clientWidth / cam.z, H = canvas.clientHeight / cam.z; cam.x = W >= GW * S ? GW * S / 2 : Math.max(W / 2, Math.min(GW * S - W / 2, cam.x)); cam.y = H >= GH * S ? GH * S / 2 : Math.max(H / 2, Math.min(GH * S - H / 2, cam.y)); }
  const toWorld = (sx, sy) => ({ x: (sx - canvas.clientWidth / 2) / cam.z + cam.x, y: (sy - canvas.clientHeight / 2) / cam.z + cam.y });
  function zoomAt(sx, sy, f) { const a = toWorld(sx, sy); cam.z = Math.max(.35, Math.min(3, cam.z * f)); const b = toWorld(sx, sy); cam.x += a.x - b.x; cam.y += a.y - b.y; clampCam(); }
  function applyTool(tx, ty) {
    if (tool === 'road') { if (!occupied(tx, ty) && tx > 0 && ty > 0 && tx < GW - 1 && ty < GH - 1) { city.roadSet.add(key(tx, ty)); saveCity(); spawnCars(); } return; }
    if (tool === 'bulldoze') {
      const b = city.buildings.find((x) => tx >= x.x && tx < x.x + x.w && ty >= x.y && ty < x.y + x.h);
      if (b) { if (b.station || b.id === 'hq' || b.outbox) { handlers.toast?.('Station buildings, HQ and the Outbox can be moved, not bulldozed'); return; } city.buildings = city.buildings.filter((x) => x !== b); saveCity(); return; }
      if (city.roadSet.delete(key(tx, ty))) { saveCity(); spawnCars(); }
      return;
    }
    if (tool === 'move') {
      if (!moving) { moving = city.buildings.find((x) => tx >= x.x && tx < x.x + x.w && ty >= x.y && ty < x.y + x.h) || null; if (moving) handlers.toast?.('Now click where it should go'); return; }
      if (fits(tx, ty, moving.w, moving.h, moving)) { moving.x = tx; moving.y = ty; saveCity(); moving = null; } else handlers.toast?.("It doesn't fit there");
      return;
    }
    const f = FOOT[tool]; if (!f) return;
    if (fits(tx, ty, f[0], f[1])) { city.buildings.push({ t: tool, x: tx, y: ty, w: f[0], h: f[1], id: `${tool}-${tx}-${ty}-${Date.now() % 1e5}` }); saveCity(); } else handlers.toast?.("That spot isn't free");
  }
  function buildBar() {
    bar = document.createElement('div'); bar.className = 'citybar';
    bar.innerHTML = TOOLS.map(([id, icon, name]) => `<button type="button" data-tool="${id}" title="${name}" aria-label="${name}" class="${id === tool ? 'on' : ''}">${icon}<span>${name}</span></button>`).join('') + '<button type="button" data-tool="reset" title="Start the city over" aria-label="Reset city">↺<span>Reset</span></button>';
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]'); if (!b) return;
      if (b.dataset.tool === 'reset') { if (confirm('Start the city over? Your buildings and roads go back to the starting layout.')) { localStorage.removeItem(KEY); city = loadCity(); if (data) syncStations(data); groundKey = ''; spawnCars(); } return; }
      tool = b.dataset.tool; moving = null; bar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.tool === tool));
      canvas.style.cursor = tool === 'select' ? 'grab' : 'crosshair';
    });
    host.appendChild(bar);
  }
  function bindInput() {
    const pts = new Map(); let moved = 0, pinch = 0, painting = false;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const tileAt = (e) => { const p = toWorld(pos(e).x, pos(e).y); return { x: Math.floor(p.x / S), y: Math.floor(p.y / S) }; };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, pos(e)); moved = 0; painting = tool === 'road' && pts.size === 1; if (painting) { const tl = tileAt(e); applyTool(tl.x, tl.y); } if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); painting = false; } });
    canvas.addEventListener('pointermove', (e) => {
      hover = tileAt(e);
      if (!pts.has(e.pointerId)) return;
      const p = pos(e), prev = pts.get(e.pointerId); pts.set(e.pointerId, p);
      if (painting) { applyTool(hover.x, hover.y); return; }
      if (pts.size === 1) { cam.x -= (p.x - prev.x) / cam.z; cam.y -= (p.y - prev.y) / cam.z; moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y); clampCam(); }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; const dd = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dd / pinch); pinch = dd; moved += 10; }
    });
    canvas.addEventListener('pointerleave', () => { hover = null; });
    canvas.addEventListener('pointerup', (e) => {
      if (pts.size === 1 && moved < 8 && !painting) {
        if (tool !== 'select') { const tl = tileAt(e); applyTool(tl.x, tl.y); }
        else {
          const p = toWorld(pos(e).x, pos(e).y), h = hits.slice().reverse().find((h) => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h);
          if (h?.commander) handlers.onCommander?.(); else if (h?.id) handlers.onAgent?.(h.id);
          else if (h?.building?.outbox) handlers.onOutbox?.(); else if (h?.building?.station) { const a = data?.agents.find((x) => x.station === h.building.station); if (a) handlers.onAgent?.(a.id); }
          else if (h?.building?.id === 'hq') handlers.onCommander?.();
        }
      }
      pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; painting = false;
    });
    canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = 0; painting = false; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    canvas.addEventListener('dblclick', () => fit());
  }

  /* ------------------------------------------------------------ public API */
  function setData(d) { data = d; if (!city) city = loadCity(); syncStations(d); syncPeople(d); syncTrucks(d); }
  function mount(el, h) {
    handlers = h || handlers;
    if (host === el && canvas?.isConnected) return;
    host = el; if (!city) city = loadCity();
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.className = 'sv-canvas city'; canvas.setAttribute('aria-label', 'Your city: drag to look around, scroll to zoom, tap a building or a person. Use the build bar to lay roads and place buildings.');
      ctx = canvas.getContext('2d'); bindInput();
      if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }).observe(canvas);
    }
    el.appendChild(canvas); if (!bar) buildBar(); else el.appendChild(bar); cam.fitted = false;
    if (!running) { running = true; requestAnimationFrame(frame); }
  }
  window.SpaceAgencyCity = { mount, setData, fit: () => { cam.fitted = false; fit(); } };
  window.SpaceAgencyCityModel = { defaultCity, FOOT, LOTS, KEY, TOOLS, GW, GH, stationType };
})();
