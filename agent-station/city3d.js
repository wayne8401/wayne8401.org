/* Space Agency: the 3D City (PC)
 * A real-time 3D city built with three.js (MIT): sunlight and shadows that follow your clock,
 * a physical sky, glass towers reflecting it, lit windows and headlights with bloom at night,
 * cars driving the streets, and your crew as 3D figures walking the sidewalks into their
 * buildings. Same city as the flat view (same saved layout) and the same build tools.
 * Exposes window.SpaceAgencyCity3D = { mount, setData, fit } like the other views.
 */
import * as THREE from 'three';
import { OrbitControls } from './vendor/three/controls/OrbitControls.js';
import { Sky } from './vendor/three/objects/Sky.js';
import { EffectComposer } from './vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/postprocessing/OutputPass.js';

const MODEL = window.SpaceAgencyCityModel;
const { GW, GH, FOOT, LOTS, KEY, TOOLS } = MODEL;
const PPT = 48; // ground texture pixels per tile
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hash = (s) => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const key = (x, y) => x + ',' + y;
const WX = (x) => x - GW / 2, WZ = (y) => y - GH / 2; // tile corner -> world

let host, renderer, scene, camera, controls, composer, bloom, sky, sun, moon, hemi, stars, pmrem, envRT;
let bar, data = null, handlers = {}, city = null, running = false, lastT = 0, visible = true;
let groundMesh, curbs, lamps, lampGlow, ghost, timeMode = 'auto', lastEnvAt = -1e9, nightK = 0;
const bGroups = new Map(); // building id -> group
const walkers = new Map(); let cmdr = null; const cars = []; const trucks = new Map();
const smokers = []; const fountains = []; const trees = []; const blinkers = [];
let tool = 'select', moving = null, hoverTile = null;

/* ------------------------------------------------------------ city model (shared with the flat view) */
function loadCity() { let c = null; try { c = JSON.parse(localStorage.getItem(KEY)); } catch { /* none */ } if (!c || c.v !== 1) c = MODEL.defaultCity(); c.roadSet = new Set(c.roads); return c; }
function saveCity() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, roads: [...city.roadSet], buildings: city.buildings })); } catch { /* private */ } }
const occupied = (x, y, ignore) => city.roadSet.has(key(x, y)) || city.buildings.some((b) => b !== ignore && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
const fits = (x, y, w, h, ignore) => { if (x < 1 || y < 1 || x + w > GW - 1 || y + h > GH - 1) return false; for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (occupied(x + i, y + j, ignore)) return false; return true; };
const nearRoad = (x, y, w, h) => { for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) if (city.roadSet.has(key(x + i, y + j))) return true; return false; };
function findLot(w, h) { for (let r = 0; r < 30; r++) for (let x = GW / 2 - r; x <= GW / 2 + r; x++) for (let y = GH / 2 - r; y <= GH / 2 + r; y++) if (fits(x, y, w, h) && nearRoad(x, y, w, h)) return [x, y]; return null; }
function syncStations(d) {
  let changed = false; const ids = new Set(d.stations.map((s) => 'st:' + s.id));
  city.buildings = city.buildings.filter((b) => !b.station || ids.has(b.id) || (changed = true, false));
  if (!city.buildings.some((b) => b.id === 'warehouse')) { const s = LOTS.find(([x, y]) => fits(x, y, 3, 3)) || findLot(3, 3); if (s) { city.buildings.push({ t: 'warehouse', x: s[0], y: s[1], w: 3, h: 3, id: 'warehouse', outbox: true }); changed = true; } }
  for (const st of d.stations) {
    const id = 'st:' + st.id, b = city.buildings.find((x) => x.id === id), t = MODEL.stationType(st);
    if (b) { if (b.name !== st.name || b.t !== t) { b.name = st.name; b.t = t; changed = true; } continue; }
    const s = LOTS.find(([x, y]) => fits(x, y, 3, 3)) || findLot(3, 3);
    if (s) { city.buildings.push({ t, x: s[0], y: s[1], w: 3, h: 3, id, station: st.id, name: st.name }); changed = true; }
  }
  if (changed) { saveCity(); rebuildBuildings(); }
}

/* ------------------------------------------------------------ roads and paths */
const roadNbrs = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => city.roadSet.has(key(a, b)));
function nearestRoad(tx, ty) { tx = Math.floor(tx); ty = Math.floor(ty); for (let r = 0; r < 14; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if ((Math.abs(dx) === r || Math.abs(dy) === r) && city.roadSet.has(key(tx + dx, ty + dy))) return [tx + dx, ty + dy]; return null; }
function bfs(a, b) {
  if (!a || !b) return null; const start = key(...a), goal = key(...b), prev = new Map([[start, null]]), q = [a];
  while (q.length) { const [x, y] = q.shift(); if (key(x, y) === goal) break; for (const n of roadNbrs(x, y)) { const k = key(...n); if (!prev.has(k)) { prev.set(k, key(x, y)); q.push(n); } } }
  if (!prev.has(goal)) return null; const path = []; for (let k = goal; k; k = prev.get(k)) path.unshift(k.split(',').map(Number)); return path;
}
const doorTile = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h + .12 }); // in tile units
function sidewalkPath(from, to) {
  const tiles = bfs(nearestRoad(from.x, from.y), nearestRoad(to.x, to.y)); if (!tiles) return [to];
  const pts = tiles.map(([x, y], i) => {
    const n = tiles[Math.min(i + 1, tiles.length - 1)], p = tiles[Math.max(i - 1, 0)], dx = Math.sign(n[0] - p[0]), dy = Math.sign(n[1] - p[1]);
    return { x: x + .5 + (dy ? (dy > 0 ? -.58 : .58) : 0), y: y + .5 + (dx ? (dx > 0 ? .58 : -.58) : 0) };
  });
  return [...pts, to];
}

/* ------------------------------------------------------------ textures */
function canvasTex(w, h, draw, { srgb = true, repeat } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function noise(g, w, h, n, cols, size = 2) { for (let i = 0; i < n; i++) { g.fillStyle = pick(cols); g.fillRect(Math.random() * w, Math.random() * h, size, size); } }
function groundTexture() {
  return canvasTex(GW * PPT, GH * PPT, (g, W, H) => {
    g.fillStyle = '#4f8a3c'; g.fillRect(0, 0, W, H); noise(g, W, H, 60000, ['rgba(30,70,20,.35)', 'rgba(120,170,80,.25)', 'rgba(70,120,45,.4)'], 3);
    const P = PPT;
    for (const b of city.buildings) {
      if (b.t === 'tree') continue;
      if (b.t === 'park') { g.fillStyle = '#5c9e45'; g.fillRect(b.x * P, b.y * P, b.w * P, b.h * P); g.strokeStyle = '#cfc4a6'; g.lineWidth = P * .22; g.beginPath(); g.moveTo(b.x * P + 6, (b.y + 1.5) * P); g.lineTo((b.x + 3) * P - 6, (b.y + 1.5) * P); g.moveTo((b.x + 1.5) * P, b.y * P + 6); g.lineTo((b.x + 1.5) * P, (b.y + 3) * P - 6); g.stroke(); continue; }
      g.fillStyle = b.t === 'house' ? '#6f9a52' : '#a8a499'; g.fillRect(b.x * P - 3, b.y * P - 3, b.w * P + 6, b.h * P + 6);
      if (b.t !== 'house') noise(g, W, H, 0, []);
      if (b.t === 'house') { g.fillStyle = '#9c9488'; g.fillRect((b.x + b.w / 2) * P - 6, (b.y + b.h - .3) * P, 12, .4 * P); } // garden path
    }
    // sidewalks along the roads, then asphalt
    for (const k of city.roadSet) { const [x, y] = k.split(',').map(Number); g.fillStyle = '#b9b4a8'; g.fillRect(x * P - P * .22, y * P - P * .22, P * 1.44, P * 1.44); }
    for (const k of city.roadSet) { const [x, y] = k.split(',').map(Number); g.fillStyle = '#34373c'; g.fillRect(x * P, y * P, P, P); }
    noise(g, W, H, 40000, ['rgba(0,0,0,.18)', 'rgba(255,255,255,.05)'], 2);
    for (const k of city.roadSet) {
      const [x, y] = k.split(',').map(Number), n = roadNbrs(x, y), h = n.some(([a]) => a !== x), v = n.some(([, b]) => b !== y);
      g.fillStyle = 'rgba(233,200,74,.9)';
      if (h && !v) for (let i = 4; i < P; i += 16) g.fillRect(x * P + i, y * P + P / 2 - 1.5, 9, 3);
      else if (v && !h) for (let i = 4; i < P; i += 16) g.fillRect(x * P + P / 2 - 1.5, y * P + i, 3, 9);
      else if (n.length >= 3) { g.fillStyle = 'rgba(240,240,240,.85)'; for (const [a, b] of n) for (let i = 0; i < 6; i++) { if (a !== x) g.fillRect((x + .5 + (a - x) * .58) * P - 2.5, y * P + 4 + i * 7, 5, 4); else g.fillRect(x * P + 4 + i * 7, (y + .5 + (b - y) * .58) * P - 2.5, 4, 5); } }
    }
  });
}
const facadeCache = new Map();
function facade(kind, floors, seed) { // one bay wide, all floors tall: color map + emissive (lit windows)
  const ck = kind + floors + ':' + (seed % 7); if (facadeCache.has(ck)) return facadeCache.get(ck);
  const F = { house: ['#e8dcc6', '#6c8aa3', 1], shop: ['#efe9df', '#6c8aa3', 1], factory: ['#8c939b', '#4c5d6e', 2], office: ['#5d7590', '#9fc3e0', 4], glass: ['#2e4560', '#7fb0d8', 4], hq: ['#1f2a3a', '#9fd0ff', 4], lab: ['#e3ecf0', '#8fb7c8', 2], studio: ['#2d2240', '#ff7ad9', 2], opsctr: ['#244a3d', '#7fe0b8', 3], warehouse: ['#a5814f', '#5c4a33', 1] }[kind] || ['#888', '#9cf', 2];
  const W = 128, FH = 64, H = floors * FH;
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = F[0]; g.fillRect(0, 0, W, H); noise(g, W, H, 900, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.06)'], 2);
    for (let f = 0; f < floors; f++) {
      const y0 = H - (f + 1) * FH;
      g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, y0, W, 3);
      for (let i = 0; i < F[2]; i++) { const ww = W / F[2], x = i * ww + ww * .14, w = ww * .72; g.fillStyle = F[1]; g.fillRect(x, y0 + 14, w, FH - 26); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x, y0 + 14, w * .3, FH - 26); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y0 + FH - 13, w, 3); }
    }
  }, { repeat: true });
  const emi = canvasTex(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    let s = seed;
    for (let f = 0; f < floors; f++) for (let i = 0; i < F[2]; i++) {
      s = (s * 1103515245 + 12345) >>> 0; if (s % 10 < 4) continue;
      const ww = W / F[2], x = i * ww + ww * .14, w = ww * .72, y0 = H - (f + 1) * FH;
      g.fillStyle = kind === 'studio' ? '#ff9ae4' : s % 3 ? '#ffd38a' : '#fff2cf'; g.fillRect(x, y0 + 14, w, FH - 26);
    }
  }, { repeat: true });
  const out = { map, emi }; facadeCache.set(ck, out); return out;
}
function textSprite(lines, { color = '#8affc1', bg = 'rgba(6,18,14,.88)', border = '#2e5a46', scale = 1 } = {}) {
  const font = 30, pad = 14, lh = font + 10, c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `600 ${font}px ui-monospace, Menlo, Consolas, monospace`;
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width)) + pad * 2), h = lines.length * lh + pad;
  c.width = w; c.height = h; g.font = `600 ${font}px ui-monospace, Menlo, Consolas, monospace`;
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = border; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  lines.forEach((l, i) => { g.fillStyle = i ? '#cfe' : color; g.fillText(l, pad, pad / 2 + lh * (i + 1) - 12); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(w / 120 * scale, h / 120 * scale, 1); s.renderOrder = 10; s.userData.text = lines.join('|');
  return s;
}
const softDot = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });

/* ------------------------------------------------------------ materials & geometry helpers */
const MAT = {};
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: 0, ...o });
function mesh(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, recv = true } = {}) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = cast; m.receiveShadow = recv; return m; }
function boxFacade(w, d, h, kind, seed, roofMat) { // a box whose four walls carry the facade, scaled to bays and floors
  const floors = Math.max(1, Math.round(h / .42)), f = facade(kind, floors, seed);
  const side = (bays) => { const m = f.map.clone(), e = f.emi.clone(); m.needsUpdate = e.needsUpdate = true; m.repeat.set(Math.max(1, Math.round(bays)), 1); e.repeat.set(Math.max(1, Math.round(bays)), 1); return std('#ffffff', { map: m, emissiveMap: e, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: kind === 'glass' || kind === 'hq' ? .18 : .85, metalness: kind === 'glass' || kind === 'hq' ? .6 : 0, envMapIntensity: kind === 'glass' || kind === 'hq' ? 1.4 : .6 }); };
  const sx = side(w / .9), sz = side(d / .9), roof = roofMat || std('#5b6168', { roughness: .9 });
  const m = mesh(new THREE.BoxGeometry(w, h, d), [sz, sz, roof, roof, sx, sx], { y: h / 2 });
  m.userData.windowMats = [sx, sz];
  return m;
}
function gable(w, d, h, mat) { // a pitched roof as a triangular prism along x
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(0, h); s.lineTo(d / 2, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
  return mesh(g, mat);
}
function addSmoke(group, x, y, z, k = 1) { const puffs = []; for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: '#d8d8d8', transparent: true, depthWrite: false, opacity: .4 })); s.position.set(x, y, z); group.add(s); puffs.push(s); } smokers.push({ puffs, x, y, z, k, seed: Math.random() * 10, group }); }

/* ------------------------------------------------------------ buildings */
const STATION_TINT = { lab: '#dfe9ee', studio: '#3b2d4f', opsctr: '#2f5a4b' };
function buildBuilding(b) {
  const g = new THREE.Group(), w = b.w - .16, d = b.h - .16, seed = hash(b.id);
  g.position.set(WX(b.x + b.w / 2), 0, WZ(b.y + b.h / 2)); g.userData.b = b;
  const plinth = mesh(new THREE.BoxGeometry(b.w - .04, .05, b.h - .04), std(b.t === 'house' ? '#7aa35c' : '#9a968c', { roughness: 1 }), { y: .025, cast: false }); if (b.t !== 'tree' && b.t !== 'park') g.add(plinth);
  const wm = []; let top = 1;
  switch (b.t) {
    case 'house': {
      const body = boxFacade(w * .8, d * .62, .62, 'house', seed); body.position.z -= d * .1; g.add(body); wm.push(...body.userData.windowMats);
      const roofCol = ['#a4493a', '#7d5a46', '#4f5a66', '#9c6a3a'][seed % 4];
      const r = gable(w * .86, d * .7, .38, std(roofCol, { roughness: .85 })); r.position.set(0, .62, -d * .1); g.add(r);
      g.add(mesh(new THREE.BoxGeometry(.12, .3, .12), std('#7a4a3a'), { x: w * .22, y: .9, z: -d * .18 })); addSmoke(g, w * .22, 1.08, -d * .18, .5);
      g.add(mesh(new THREE.BoxGeometry(.16, .26, .02), std('#3a2a20'), { y: .13, z: d * .21 - .01 }));
      for (const sx of [-1, 1]) g.add(tree3d(sx * w * .36, d * .34, .55));
      top = 1.1; break;
    }
    case 'shop': {
      const body = boxFacade(w, d * .8, .7, 'shop', seed); g.add(body); wm.push(...body.userData.windowMats);
      const stripes = canvasTex(64, 16, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fff' : ['#e5484d', '#3e6bff', '#2f9e5a'][seed % 3]; c.fillRect(i * 8, 0, 8, 16); } });
      g.add(mesh(new THREE.BoxGeometry(w * .96, .03, .32), std('#fff', { map: stripes }), { y: .56, z: d * .4 + .14, rx: .35 }));
      g.add(mesh(new THREE.BoxGeometry(w * .5, .12, .03), std('#222', { emissive: '#ffd38a', emissiveIntensity: 0 }), { y: .76, z: d * .4 + .02 }));
      top = .9; break;
    }
    case 'factory': {
      const body = boxFacade(w, d, .85, 'factory', seed, std('#6d747c')); g.add(body); wm.push(...body.userData.windowMats);
      for (let i = 0; i < 3; i++) { const r = gable(w, d / 3, .32, std(i % 2 ? '#5f666e' : '#79808a', { roughness: .7, metalness: .3 })); r.rotation.y = 0; r.position.set(0, .85, -d / 2 + d / 6 + i * d / 3); g.add(r); }
      const stack = mesh(new THREE.CylinderGeometry(.09, .12, 1.4, 12), std('#7d4b3b'), { x: w * .36, y: .7 + .7, z: -d * .3 }); g.add(stack);
      g.add(mesh(new THREE.CylinderGeometry(.1, .1, .06, 12), std('#d9d2c7'), { x: w * .36, y: 2.12, z: -d * .3 }));
      addSmoke(g, w * .36, 2.2, -d * .3, 1);
      top = 2.2; break;
    }
    case 'office': {
      const h = 2.2 + (seed % 4) * .55, body = boxFacade(w * .86, d * .86, h, seed % 2 ? 'glass' : 'office', seed); g.add(body); wm.push(...body.userData.windowMats);
      g.add(mesh(new THREE.BoxGeometry(w * .3, .2, d * .3), std('#9aa7b4', { metalness: .4 }), { y: h + .1, x: -w * .15 }));
      top = h + .3; break;
    }
    case 'hq': {
      const h = 5.2, body = boxFacade(w * .7, d * .7, h, 'hq', seed); g.add(body); wm.push(...body.userData.windowMats);
      g.add(mesh(new THREE.BoxGeometry(w * .95, .5, d * .95), std('#2a3546', { metalness: .3, roughness: .5 }), { y: .25 }));
      const pad = canvasTex(128, 128, (c) => { c.fillStyle = '#3a3f46'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#e9b949'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.stroke(); c.fillStyle = '#fff'; c.font = '800 70px sans-serif'; c.textAlign = 'center'; c.fillText('H', 64, 88); });
      g.add(mesh(new THREE.CylinderGeometry(w * .3, w * .3, .06, 32), [std('#555'), std('#fff', { map: pad }), std('#555')], { y: h + .03 }));
      g.add(mesh(new THREE.CylinderGeometry(.015, .015, .9, 6), std('#ccd'), { x: w * .3, y: h + .45, z: d * .3 }));
      const flag = mesh(new THREE.PlaneGeometry(.36, .22), std('#e9b949', { side: THREE.DoubleSide, emissive: '#e9b949', emissiveIntensity: .15 }), { x: w * .3 + .19, y: h + .78, z: d * .3, cast: true }); g.add(flag); g.userData.flag = flag;
      const beacon = mesh(new THREE.SphereGeometry(.05, 12, 8), std('#ff2030', { emissive: '#ff2030', emissiveIntensity: 2 }), { x: -w * .3, y: h + .12, z: -d * .3, cast: false }); g.add(beacon); blinkers.push(beacon);
      top = h + 1; break;
    }
    case 'lab': {
      const body = boxFacade(w * .9, d * .8, 1.3, 'lab', seed, std('#cfdbe1')); g.add(body); wm.push(...body.userData.windowMats);
      g.add(mesh(new THREE.SphereGeometry(w * .22, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), std('#eef4f7', { roughness: .3, metalness: .2 }), { y: 1.3, x: -w * .12 }));
      const dish = new THREE.Group(); dish.position.set(w * .26, 1.3, d * .1);
      dish.add(mesh(new THREE.CylinderGeometry(.03, .05, .3, 8), std('#99a'), { y: .15 }));
      const bowl = mesh(new THREE.SphereGeometry(.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), std('#e8ecf2', { side: THREE.DoubleSide, roughness: .4 }), { y: .42, rx: Math.PI * .8 }); dish.add(bowl);
      g.add(dish); g.userData.dish = dish; top = 2.1; break;
    }
    case 'studio': {
      const body = boxFacade(w * .9, d * .8, 1.2, 'studio', seed, std('#2a2038')); g.add(body); wm.push(...body.userData.windowMats);
      const sign = canvasTex(256, 64, (c) => { c.fillStyle = '#140d1d'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#ff7ad9'; c.font = '800 44px ui-monospace, monospace'; c.textAlign = 'center'; c.fillText('ON AIR', 128, 48); });
      const s = mesh(new THREE.BoxGeometry(w * .6, .26, .04), std('#140d1d', { map: sign, emissiveMap: sign, emissive: '#ffffff', emissiveIntensity: 1.6 }), { y: 1.42, z: d * .3 }); g.add(s); g.userData.onair = s;
      g.add(mesh(new THREE.BoxGeometry(w * .9 + .02, .04, d * .8 + .02), std('#ff7ad9', { emissive: '#ff7ad9', emissiveIntensity: 1.2 }), { y: 1.18, cast: false }));
      top = 1.8; break;
    }
    case 'opsctr': {
      const body = boxFacade(w * .82, d * .82, 2.6, 'opsctr', seed, std('#234539')); g.add(body); wm.push(...body.userData.windowMats);
      g.add(mesh(new THREE.CylinderGeometry(.02, .03, 1.2, 6), std('#bcc6d0', { metalness: .6 }), { x: w * .25, y: 3.2, z: -d * .2 }));
      const b2 = mesh(new THREE.SphereGeometry(.05, 12, 8), std('#ff5c7a', { emissive: '#ff5c7a', emissiveIntensity: 2 }), { x: w * .25, y: 3.82, z: -d * .2, cast: false }); g.add(b2); blinkers.push(b2);
      top = 3.9; break;
    }
    case 'warehouse': {
      const body = boxFacade(w, d * .85, .9, 'warehouse', seed, std('#8a6a44')); g.add(body); wm.push(...body.userData.windowMats);
      for (let i = 0; i < 2; i++) g.add(mesh(new THREE.BoxGeometry(w * .3, .55, .03), std('#6e5435', { roughness: .6, metalness: .3 }), { x: (i ? .2 : -.2) * w * 1.2, y: .28, z: d * .425 + .01 }));
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(.2, .2, .2), std('#b8895a'), { x: -w * .35 + i * .26, y: .1, z: d * .45 + .2 }));
      top = 1.1; break;
    }
    case 'park': {
      const f = new THREE.Group();
      f.add(mesh(new THREE.CylinderGeometry(.48, .52, .14, 32), std('#b9c4cc'), { y: .07 }));
      const water = mesh(new THREE.CylinderGeometry(.42, .42, .02, 32), std('#3f8fc0', { roughness: .05, metalness: .2, envMapIntensity: 1.5 }), { y: .14, cast: false }); f.add(water);
      f.add(mesh(new THREE.CylinderGeometry(.05, .08, .4, 12), std('#c9d2d8'), { y: .3 }));
      g.add(f); const drops = []; for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: '#e8f6ff', transparent: true, depthWrite: false, opacity: .8 })); s.scale.set(.05, .05, 1); f.add(s); drops.push(s); }
      fountains.push({ drops, f });
      for (const [x, z, r] of [[-1, -1, 0], [1, -1, 0], [-1, 1, 1], [1, 1, 1]]) { const bench = new THREE.Group(); bench.position.set(x * .95, 0, z * .95); bench.rotation.y = r ? Math.PI : 0; bench.add(mesh(new THREE.BoxGeometry(.36, .03, .1), std('#7a5a3a'), { y: .1 })); bench.add(mesh(new THREE.BoxGeometry(.36, .1, .02), std('#7a5a3a'), { y: .16, z: -.05 })); g.add(bench); }
      for (const [x, z] of [[-1.2, 0], [1.2, 0], [0, -1.25], [0, 1.25]]) g.add(tree3d(x, z, .9));
      top = .6; break;
    }
    case 'tree': g.add(tree3d(0, 0, 1)); top = 1; break;
    default: { const body = boxFacade(w * .8, d * .8, 1, 'office', seed); g.add(body); wm.push(...body.userData.windowMats); }
  }
  g.userData.windowMats = wm; g.userData.top = top;
  if (b.station || b.id === 'hq' || b.outbox) g.traverse((o) => { if (o.isMesh) o.userData.pickBuilding = b; });
  return g;
}
function tree3d(x, z, s = 1) {
  const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(s * rnd(.85, 1.15));
  MAT.trunk ||= std('#6b4a32'); MAT.leaves ||= [std('#3f7f34'), std('#4d8f3a'), std('#356f2d'), std('#5a9a3e')];
  t.add(mesh(new THREE.CylinderGeometry(.035, .05, .34, 7), MAT.trunk, { y: .17 }));
  const crown = new THREE.Group(); crown.position.y = .34;
  for (let i = 0; i < 4; i++) { const geo = new THREE.IcosahedronGeometry(rnd(.13, .2), 1); const pos = geo.attributes.position; for (let k = 0; k < pos.count; k++) pos.setXYZ(k, pos.getX(k) * rnd(.9, 1.1), pos.getY(k) * rnd(.9, 1.1), pos.getZ(k) * rnd(.9, 1.1)); geo.computeVertexNormals(); crown.add(mesh(geo, pick(MAT.leaves), { x: rnd(-.1, .1), y: rnd(.05, .22), z: rnd(-.1, .1) })); }
  t.add(crown); trees.push({ crown, seed: Math.random() * 6 });
  return t;
}
function rebuildBuildings() {
  for (const g of bGroups.values()) { scene.remove(g); g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
  bGroups.clear(); smokers.length = 0; fountains.length = 0; trees.length = 0; blinkers.length = 0;
  for (const b of city.buildings) { const g = buildBuilding(b); scene.add(g); bGroups.set(b.id, g); }
  rebuildGround();
}

/* ------------------------------------------------------------ ground, curbs, street lamps */
function rebuildGround() {
  if (groundMesh) { scene.remove(groundMesh); groundMesh.material.map.dispose(); }
  const tex = groundTexture();
  groundMesh = mesh(new THREE.PlaneGeometry(GW, GH), std('#ffffff', { map: tex, roughness: .95 }), { rx: -Math.PI / 2, cast: false }); scene.add(groundMesh);
  if (curbs) scene.remove(curbs); if (lamps) scene.remove(lamps); if (lampGlow) scene.remove(lampGlow);
  const edges = [];
  for (const k of city.roadSet) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!city.roadSet.has(key(x + dx, y + dy))) edges.push([x, y, dx, dy]); }
  curbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, .05, .05), std('#cfcabd'), edges.length); curbs.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  edges.forEach(([x, y, dx, dy], i) => { e.set(0, dx ? Math.PI / 2 : 0, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(WX(x + .5 + dx * .5), .025, WZ(y + .5 + dy * .5)), q, new THREE.Vector3(1, 1, 1)); curbs.setMatrixAt(i, m4); });
  scene.add(curbs);
  const spots = edges.filter(([x, y]) => (x * 7 + y * 3) % 5 === 0);
  lamps = new THREE.Group();
  const poleG = new THREE.CylinderGeometry(.012, .016, .62, 6), armG = new THREE.BoxGeometry(.16, .015, .015), headG = new THREE.BoxGeometry(.07, .025, .04);
  MAT.pole ||= std('#4a4f56', { metalness: .6, roughness: .4 }); MAT.bulb ||= std('#fff1c9', { emissive: '#ffd48a', emissiveIntensity: 0 });
  const glowGeo = new THREE.PlaneGeometry(1.1, 1.1), glows = [];
  for (const [x, y, dx, dy] of spots) {
    const px = WX(x + .5 + dx * .62), pz = WZ(y + .5 + dy * .62), l = new THREE.Group(); l.position.set(px, 0, pz); l.rotation.y = Math.atan2(-dx, -dy) + Math.PI / 2;
    l.add(mesh(poleG, MAT.pole, { y: .31 })); l.add(mesh(armG, MAT.pole, { y: .61, x: .07 })); l.add(mesh(headG, MAT.bulb, { y: .6, x: .14, cast: false }));
    lamps.add(l); glows.push([px - dx * .25, pz - dy * .25]);
  }
  scene.add(lamps);
  lampGlow = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ map: softDot, color: '#ffcf7a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), glows.length);
  glows.forEach(([x, z], i) => { m4.compose(new THREE.Vector3(x, .02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)); lampGlow.setMatrixAt(i, m4); });
  scene.add(lampGlow);
  spawnCars();
}

/* ------------------------------------------------------------ cars & trucks */
const CAR_COLORS = ['#c8102e', '#1f4fd1', '#f2f2f0', '#e0b030', '#22262c', '#2f8f5a', '#7a5bd1', '#e06a2a', '#9aa3ad'];
function carModel(color, truck) {
  const g = new THREE.Group(), L = truck ? .52 : .36, W = truck ? .2 : .17, paint = std(color, { roughness: .25, metalness: .55, envMapIntensity: 1.2 });
  g.add(mesh(new THREE.BoxGeometry(L, .08, W), paint, { y: .07 }));
  if (truck) { g.add(mesh(new THREE.BoxGeometry(L * .66, .2, W), std('#f4f6f8', { roughness: .5 }), { x: -L * .17, y: .2 })); g.add(mesh(new THREE.BoxGeometry(L * .3, .14, W * .96), paint, { x: L * .32, y: .17 })); const stripe = mesh(new THREE.BoxGeometry(L * .66, .03, W + .004), std('#38e8ff', { emissive: '#38e8ff', emissiveIntensity: .4 }), { x: -L * .17, y: .17, cast: false }); g.add(stripe); }
  else { g.add(mesh(new THREE.BoxGeometry(L * .55, .07, W * .92), std('#1b2430', { roughness: .1, metalness: .8, envMapIntensity: 1.5 }), { x: -L * .04, y: .145 })); }
  MAT.tire ||= std('#141414', { roughness: .9 });
  const wg = new THREE.CylinderGeometry(.035, .035, .03, 12); for (const [x, z] of [[L * .32, W / 2], [L * .32, -W / 2], [-L * .32, W / 2], [-L * .32, -W / 2]]) g.add(mesh(wg, MAT.tire, { x, y: .035, z, rx: Math.PI / 2 }));
  const head = std('#ffffff', { emissive: '#fff4d0', emissiveIntensity: .2 }), tail = std('#550000', { emissive: '#ff2a2a', emissiveIntensity: .3 });
  for (const z of [W * .33, -W * .33]) { g.add(mesh(new THREE.BoxGeometry(.01, .025, .035), head, { x: L / 2, y: .08, z, cast: false })); g.add(mesh(new THREE.BoxGeometry(.01, .025, .035), tail, { x: -L / 2, y: .08, z, cast: false })); }
  const beam = mesh(new THREE.PlaneGeometry(.7, .4), new THREE.MeshBasicMaterial({ map: softDot, color: '#fff0c0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), { x: L / 2 + .3, y: .012, rx: -Math.PI / 2, cast: false, recv: false });
  g.add(beam); g.userData = { head, tail, beam };
  return g;
}
function spawnCars() {
  for (const c of cars) scene.remove(c.g); cars.length = 0;
  const roads = [...city.roadSet].map((k) => k.split(',').map(Number)), n = Math.min(34, Math.round(roads.length / 7));
  for (let i = 0; i < n; i++) { const [x, y] = pick(roads), nb = roadNbrs(x, y); if (!nb.length) continue; const [nx, ny] = pick(nb); const g = carModel(pick(CAR_COLORS)); scene.add(g); cars.push({ x, y, nx, ny, p: Math.random(), v: rnd(.9, 1.5), g, yaw: 0 }); }
}
function stepCar(c, dt) {
  c.p += c.v * dt;
  while (c.p >= 1) { c.p -= 1; const px = c.x, py = c.y; c.x = c.nx; c.y = c.ny; let nb = roadNbrs(c.x, c.y).filter(([a, b]) => a !== px || b !== py); if (!nb.length) nb = roadNbrs(c.x, c.y); const ahead = nb.find(([a, b]) => a - c.x === c.x - px && b - c.y === c.y - py); [c.nx, c.ny] = ahead && Math.random() < .7 ? ahead : pick(nb); }
  const dx = c.nx - c.x, dy = c.ny - c.y, lane = .22, target = Math.atan2(-dy, dx);
  let dYaw = target - c.yaw; dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw)); c.yaw += dYaw * Math.min(1, dt * 8);
  c.g.position.set(WX(c.x + .5 + dx * c.p) - dy * lane, 0, WZ(c.y + .5 + dy * c.p) + dx * lane); c.g.rotation.y = c.yaw;
}
function syncTrucks(d) {
  const live = new Set();
  for (const wf of d.workflows || []) if (wf.status === 'running') {
    const sts = [...new Set(wf.steps.map((s) => d.agents.find((a) => a.id === s.agent)?.station))].filter(Boolean);
    const A = city.buildings.find((b) => b.station === sts[0]), B = city.buildings.find((b) => b.station === sts[sts.length - 1]);
    if (!A || !B || A === B) continue; live.add(wf.id);
    if (!trucks.has(wf.id)) { const da = doorTile(A), db = doorTile(B), path = bfs(nearestRoad(da.x, da.y), nearestRoad(db.x, db.y)); if (path && path.length > 1) { const g = carModel('#3e6bff', true); scene.add(g); trucks.set(wf.id, { path, i: 0, p: 0, g, yaw: 0 }); } }
  }
  for (const [k, t] of trucks) if (!live.has(k)) { scene.remove(t.g); trucks.delete(k); }
}

/* ------------------------------------------------------------ people (3D figures) */
function personModel(w) {
  const look = w.commander ? null : (handlers.look?.(w.agent) || {}), g = new THREE.Group();
  const human = w.commander || look.kind === 'human';
  const top = w.commander ? '#5d6067' : human ? (look.fg || '#3e6bff') : (look.fg || '#c7cfdc');
  const legs = w.commander ? '#55585e' : human ? '#3a3f4c' : new THREE.Color(top).multiplyScalar(.7).getStyle();
  const skin = w.commander ? '#5e3c2b' : human ? (look.skin || '#8d5524') : top;
  const shoe = w.commander ? '#3d8bff' : human ? '#1c2230' : '#262b36';
  const bot = !human, mTop = std(top, { roughness: bot ? .35 : .8, metalness: bot ? .5 : 0 }), mLeg = std(legs, { roughness: bot ? .4 : .85, metalness: bot ? .4 : 0 }), mSkin = std(skin, { roughness: bot ? .3 : .7, metalness: bot ? .5 : 0 }), mShoe = std(shoe);
  const limb = (r, len, mat) => { const p = new THREE.Group(); p.add(mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat, { y: -len / 2 - r })); return p; };
  const hipY = .2, shY = .36;
  const legL = limb(.026, .15, mLeg), legR = limb(.026, .15, mLeg); legL.position.set(-.034, hipY, 0); legR.position.set(.034, hipY, 0);
  for (const L of [legL, legR]) L.add(mesh(new THREE.BoxGeometry(.05, .03, .08), mShoe, { y: -.2, z: .014 }));
  const torso = mesh(new THREE.CapsuleGeometry(.055, .12, 4, 10), mTop, { y: .29 }); torso.scale.set(1, 1, .7);
  const armL = limb(.02, .13, mTop), armR = limb(.02, .13, mTop); armL.position.set(-.075, shY, 0); armR.position.set(.075, shY, 0);
  for (const A of [armL, armR]) A.add(mesh(new THREE.SphereGeometry(.022, 8, 6), mSkin, { y: -.18 }));
  const head = mesh(new THREE.SphereGeometry(.048, 16, 12), mSkin, { y: .45 });
  g.add(legL, legR, torso, armL, armR, head);
  if (bot) { const accent = look.accent || '#38e8ff'; head.add(mesh(new THREE.BoxGeometry(.07, .022, .03), std(accent, { emissive: accent, emissiveIntensity: 1.6 }), { z: .036, cast: false })); torso.add(mesh(new THREE.SphereGeometry(.014, 8, 6), std(accent, { emissive: accent, emissiveIntensity: 2 }), { z: .05, y: .03, cast: false })); head.add(mesh(new THREE.CylinderGeometry(.004, .004, .05, 4), std('#999'), { y: .065 })); }
  else if (w.commander) {
    head.add(mesh(new THREE.SphereGeometry(.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#16181c'), { y: .006 }));
    head.add(mesh(new THREE.BoxGeometry(.06, .006, .05), std('#0d0e11'), { y: .01, z: .045 }));
    head.add(mesh(new THREE.SphereGeometry(.008, 6, 4), std('#e9b949', { emissive: '#e9b949', emissiveIntensity: .6 }), { y: .045, z: .036, cast: false }));
    for (const s of [-1, 1]) torso.add(mesh(new THREE.BoxGeometry(.03, .008, .02), std('#e9b949', { emissive: '#e9b949', emissiveIntensity: .3 }), { x: s * .045, y: .1, cast: false }));
    torso.add(mesh(new THREE.BoxGeometry(.06, .02, .002), std('#3d8bff'), { z: .039, y: .02, cast: false }));
  } else head.add(mesh(new THREE.SphereGeometry(.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), std(look.hairColor || '#1b1b1b'), { y: .008 }));
  g.userData = { legL, legR, armL, armR, torso };
  g.scale.setScalar(w.commander ? 1.12 : 1.05);
  g.traverse((o) => { if (o.isMesh) o.userData.pickWalker = w; });
  return g;
}
const homeOf = (w) => city.buildings.find((b) => b.id === (w.commander ? 'hq' : 'st:' + (w.agent?.station || ''))) || city.buildings.find((b) => b.id === 'hq');
function syncPeople(d) {
  const seen = new Set();
  for (const a of d.agents) {
    seen.add(a.id); let w = walkers.get(a.id);
    const lookKey = JSON.stringify(handlers.look?.(a) || {});
    if (!w) { const b = homeOf({ agent: a }) || city.buildings[0], p = doorTile(b); w = { id: a.id, x: p.x + rnd(-.3, .3), y: p.y + rnd(.1, .3), path: [], wait: rnd(0, 3), yaw: 0 }; walkers.set(a.id, w); }
    w.agent = a;
    if (w.lookKey !== lookKey) { if (w.g) scene.remove(w.g); w.lookKey = lookKey; w.g = personModel(w); scene.add(w.g); }
    const work = a.status === 'running' || a.status === 'waiting', home = homeOf(w);
    if (work && home && !w.goingIn && !w.inside) { w.goingIn = home.id; w.path = sidewalkPath(w, doorTile(home)); }
    if (!work && w.inside === home?.id && w.forWork) { w.inside = null; w.forWork = false; const p = doorTile(home); w.x = p.x; w.y = p.y; w.wait = rnd(1, 3); w.path = []; }
  }
  for (const [id, w] of walkers) if (!seen.has(id)) { scene.remove(w.g); walkers.delete(id); }
  if (!cmdr) { const hq = city.buildings.find((b) => b.id === 'hq'); if (hq) { const p = doorTile(hq); cmdr = { commander: true, x: p.x, y: p.y, path: [], wait: 2, yaw: 0 }; cmdr.g = personModel(cmdr); scene.add(cmdr.g); } }
}
function nextStop(w) {
  const r = Math.random(), places = city.buildings.filter((b) => b.t !== 'tree');
  const b = w.commander ? (r < .4 ? city.buildings.find((x) => x.id === 'hq') : pick(places.filter((x) => x.station || x.t === 'park'))) : r < .3 ? homeOf(w) : pick(places);
  if (!b) return;
  if (b.t === 'park') { w.path = sidewalkPath(w, { x: b.x + rnd(.5, 2.5), y: b.y + rnd(.5, 2.5) }); w.enter = null; }
  else { w.path = sidewalkPath(w, doorTile(b)); w.enter = Math.random() < .55 ? b.id : null; }
}
function stepPerson(w, dt, t) {
  const U = w.g.userData;
  if (w.inside) { w.g.visible = false; w.wait -= dt; if (!w.forWork && w.wait <= 0) { const b = city.buildings.find((x) => x.id === w.inside); w.inside = null; if (b) { const p = doorTile(b); w.x = p.x; w.y = p.y; } w.wait = rnd(1, 3); } return; }
  w.g.visible = true;
  let moving = false;
  if (!w.path.length) {
    if (w.goingIn) { w.inside = w.goingIn; w.forWork = true; w.goingIn = null; return; }
    if (w.enter) { w.inside = w.enter; w.enter = null; w.wait = rnd(4, 10); return; }
    w.wait -= dt; if (w.wait <= 0) { nextStop(w); w.wait = rnd(2.5, 6); }
  } else {
    const p = w.path[0], dx = p.x - w.x, dy = p.y - w.y, dist = Math.hypot(dx, dy), sp = (w.commander ? .55 : .5) * dt;
    if (dist <= sp) { w.x = p.x; w.y = p.y; w.path.shift(); } else { w.x += dx / dist * sp; w.y += dy / dist * sp; moving = true; const target = Math.atan2(dx, dy); let d = target - w.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); w.yaw += d * Math.min(1, dt * 10); }
    w.phase = (w.phase || 0) + sp * 11;
  }
  const s = moving ? Math.sin(w.phase) : 0;
  U.legL.rotation.x = s * .6; U.legR.rotation.x = -s * .6; U.armL.rotation.x = -s * .5; U.armR.rotation.x = s * .5;
  const bob = moving ? Math.abs(Math.cos(w.phase)) * .012 : Math.sin(t * 2 + w.x) * .003;
  w.g.position.set(WX(w.x), bob, WZ(w.y)); w.g.rotation.y = w.yaw;
}

/* ------------------------------------------------------------ labels over buildings */
const labels = new Map();
function setLabel(id, lines, style, y, b) {
  let s = labels.get(id); const text = lines.join('|');
  if (s && s.userData.text === text) return;
  if (s) { scene.remove(s); s.material.map.dispose(); }
  s = textSprite(lines, style); s.position.set(WX(b.x + b.w / 2), y, WZ(b.y + b.h / 2)); scene.add(s); labels.set(id, s);
}
function updateLabels(d) {
  const keep = new Set();
  for (const b of city.buildings) {
    const g = bGroups.get(b.id); if (!g) continue; const y = g.userData.top + .45;
    if (b.station) {
      const crew = d.agents.filter((a) => a.station === b.station), ids = new Set(crew.map((a) => a.id)), mine = d.tasks.filter((x) => ids.has(x.agent));
      const inside = [...walkers.values()].filter((w) => w.inside === b.id && w.forWork).map((w) => `${w.agent.name.toUpperCase()} · ${(w.agent.task || 'working').slice(0, 24)}`);
      setLabel(b.id, [(b.name || '').toUpperCase(), `${mine.length} RUNS · ${mine.filter((x) => x.status === 'done').length} SHIPPED · ${mine.filter((x) => x.status === 'error').length} FAILED`, ...inside], {}, y + .25 * inside.length, b); keep.add(b.id);
    } else if (b.id === 'hq') { setLabel(b.id, ['HQ · COMMANDER'], { color: '#ffe3a3', bg: 'rgba(40,28,6,.9)', border: '#b8892a' }, y, b); keep.add(b.id); }
    else if (b.outbox) { setLabel(b.id, [`OUTBOX · ${(d.files || []).length}${d.outboxNew ? ` · ${d.outboxNew} NEW` : ''}`], { color: '#ffd9a8', bg: 'rgba(30,20,10,.9)', border: '#8a6a3e' }, y, b); keep.add(b.id); }
  }
  for (const [id, s] of labels) if (!keep.has(id)) { scene.remove(s); labels.delete(id); }
}

/* ------------------------------------------------------------ sky, sun, night */
function hourNow() { if (timeMode === 'day') return 13.5; if (timeMode === 'night') return 22; if (timeMode === 'sunset') return 18.6; const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
function updateSky(t) {
  const h = hourNow(), dayFrac = (h - 6) / 12; // 0 at 6am, 1 at 6pm
  const elev = Math.sin(Math.PI * Math.max(-.25, Math.min(1.25, dayFrac))) * 62; // degrees
  const azim = 100 + dayFrac * 160;
  const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim), dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms.sunPosition.value.copy(dir);
  const day = THREE.MathUtils.clamp((elev + 4) / 14, 0, 1); nightK = 1 - day;
  sun.position.copy(dir).multiplyScalar(40); sun.intensity = 2.6 * day; sun.color.setHSL(.09, .6 - .45 * Math.min(1, elev / 30), .55 + .2 * Math.min(1, elev / 30));
  moon.intensity = .35 * nightK; hemi.intensity = .25 + .55 * day;
  renderer.toneMappingExposure = .35 + .3 * day;
  scene.fog.color.setHSL(.6, .3, .05 + .55 * day * .9);
  stars.material.opacity = nightK * .9;
  bloom.strength = .25 + .9 * nightK;
  if (Math.abs(t - lastEnvAt) > 30 || Math.abs((sky.userData.lastDay ?? -1) - day) > .08) { // refresh reflections now and then
    sky.userData.lastDay = day; lastEnvAt = t;
    const envScene = new THREE.Scene(); envScene.add(sky.clone());
    if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene); scene.environment = envRT.texture;
  }
  scene.background = null;
}
function updateNightMaterials(t, d) {
  const n = nightK;
  for (const [id, g] of bGroups) {
    const b = g.userData.b, busy = b.station && d.agents.some((a) => a.station === b.station && a.status === 'running');
    for (const m of g.userData.windowMats || []) { m.emissiveIntensity = n * 1.4 + (busy ? .9 + Math.sin(t * 4) * .2 : 0); m.emissive.set(busy && n < .5 ? '#9ff3ff' : '#ffd9a0'); }
    if (g.userData.flag) g.userData.flag.rotation.y = Math.sin(t * 3) * .25;
    if (g.userData.dish) g.userData.dish.rotation.y = t * .3;
    if (g.userData.onair) g.userData.onair.material.emissiveIntensity = Math.sin(t * 3) > 0 ? 1.8 : .5;
  }
  MAT.bulb && (MAT.bulb.emissiveIntensity = n * 3);
  if (lampGlow) lampGlow.material.opacity = n * .55;
  for (const c of [...cars, ...trucks.values()]) { const U = c.g.userData; U.head.emissiveIntensity = .2 + n * 3; U.tail.emissiveIntensity = .3 + n * 1.5; U.beam.material.opacity = n * .5; }
  for (const bl of blinkers) bl.material.emissiveIntensity = Math.sin(t * 4 + bl.id) > .6 ? 3 : .2;
}

/* ------------------------------------------------------------ frame */
function frame(now) {
  if (!running) return; requestAnimationFrame(frame);
  if (!visible || document.hidden || !renderer) return;
  const dt = Math.min(.05, (now - (lastT || now)) / 1000); lastT = now; const t = now / 1000;
  resize();
  updateSky(t); const d = data || { agents: [], tasks: [], stations: [], workflows: [], files: [] };
  updateNightMaterials(t, d);
  for (const c of cars) stepCar(c, dt);
  for (const tr of trucks.values()) { tr.p += dt * 1.1; while (tr.p >= 1) { tr.p -= 1; tr.i = (tr.i + 1) % (tr.path.length - 1); } const a = tr.path[tr.i], b = tr.path[tr.i + 1] || a; stepCar(Object.assign(tr, { x: a[0], y: a[1], nx: b[0], ny: b[1], v: 0 }), 0); }
  for (const w of walkers.values()) stepPerson(w, dt, t); if (cmdr) stepPerson(cmdr, dt, t);
  for (const s of smokers) s.puffs.forEach((p, i) => { const k = ((t * .25 * s.k + i / s.puffs.length + s.seed) % 1); p.position.set(s.x + k * .25 * s.k + Math.sin(t + i) * .03, s.y + k * .9 * s.k, s.z); p.scale.setScalar(.08 + k * .3 * s.k); p.material.opacity = (1 - k) * .45; });
  for (const f of fountains) f.drops.forEach((p, i) => { const k = ((t * .9 + i / f.drops.length) % 1), a = i * 2.4; p.position.set(Math.cos(a) * k * .28, .5 + k * .35 - k * k * .75, Math.sin(a) * k * .28); p.material.opacity = (1 - k) * .9; });
  for (const tr of trees) tr.crown.rotation.z = Math.sin(t * 1.1 + tr.seed) * .035;
  updateLabels(d);
  controls.update();
  composer.render();
}
function resize() {
  const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
  const pr = Math.min(2, window.devicePixelRatio || 1);
  if (resize.w === W && resize.h === H) return;
  resize.w = W; resize.h = H; renderer.setPixelRatio(pr); renderer.setSize(W, H, false); composer.setSize(W, H); bloom.setSize(W, H);
  camera.aspect = W / H; camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------ build mode & picking */
const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function screenRay(e) { const r = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera); }
function tileAt(e) { screenRay(e); const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(groundPlane, p)) return null; return { x: Math.floor(p.x + GW / 2), y: Math.floor(p.z + GH / 2) }; }
function applyTool(tx, ty) {
  if (tool === 'road') { if (!occupied(tx, ty) && tx > 0 && ty > 0 && tx < GW - 1 && ty < GH - 1) { city.roadSet.add(key(tx, ty)); saveCity(); rebuildGround(); } return; }
  if (tool === 'bulldoze') {
    const b = city.buildings.find((x) => tx >= x.x && tx < x.x + x.w && ty >= x.y && ty < x.y + x.h);
    if (b) { if (b.station || b.id === 'hq' || b.outbox) { handlers.toast?.('Station buildings, HQ and the Outbox can be moved, not bulldozed'); return; } city.buildings = city.buildings.filter((x) => x !== b); saveCity(); rebuildBuildings(); return; }
    if (city.roadSet.delete(key(tx, ty))) { saveCity(); rebuildGround(); } return;
  }
  if (tool === 'move') {
    if (!moving) { moving = city.buildings.find((x) => tx >= x.x && tx < x.x + x.w && ty >= x.y && ty < x.y + x.h) || null; if (moving) handlers.toast?.('Now click where it should go'); return; }
    if (fits(tx, ty, moving.w, moving.h, moving)) { moving.x = tx; moving.y = ty; saveCity(); rebuildBuildings(); moving = null; } else handlers.toast?.("It doesn't fit there"); return;
  }
  const f = FOOT[tool]; if (!f) return;
  if (fits(tx, ty, f[0], f[1])) { city.buildings.push({ t: tool, x: tx, y: ty, w: f[0], h: f[1], id: `${tool}-${tx}-${ty}-${Date.now() % 1e5}` }); saveCity(); rebuildBuildings(); } else handlers.toast?.("That spot isn't free");
}
function updateGhost() {
  if (!hoverTile || tool === 'select') { ghost.visible = false; return; }
  const [w, h] = moving ? [moving.w, moving.h] : FOOT[tool] || [1, 1];
  const ok = tool === 'bulldoze' || (tool === 'move' && !moving) ? true : tool === 'road' ? !occupied(hoverTile.x, hoverTile.y) : fits(hoverTile.x, hoverTile.y, w, h, moving);
  ghost.visible = true; ghost.scale.set(w, 1, h); ghost.position.set(WX(hoverTile.x + w / 2), .3, WZ(hoverTile.y + h / 2)); ghost.material.color.set(ok ? '#4dffa6' : '#ff5c7a');
}
function setTool(id) {
  tool = id; moving = null; bar.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x.dataset.tool === tool));
  controls.mouseButtons.LEFT = tool === 'select' ? THREE.MOUSE.ROTATE : null; renderer.domElement.style.cursor = tool === 'select' ? 'grab' : 'crosshair'; updateGhost();
}
function buildBar() {
  bar = document.createElement('div'); bar.className = 'citybar';
  bar.innerHTML = TOOLS.map(([id, icon, name]) => `<button type="button" data-tool="${id}" title="${name}" aria-label="${name}" class="${id === tool ? 'on' : ''}">${icon}<span>${name}</span></button>`).join('')
    + '<button type="button" data-time="1" title="Time of day" aria-label="Time of day">🌗<span>Time: auto</span></button><button type="button" data-tool-reset="1" title="Start the city over" aria-label="Reset city">↺<span>Reset</span></button>';
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.time) { timeMode = { auto: 'day', day: 'sunset', sunset: 'night', night: 'auto' }[timeMode]; b.querySelector('span').textContent = `Time: ${timeMode}`; lastEnvAt = -1e9; return; }
    if (b.dataset.toolReset) { if (confirm('Start the city over? Your buildings and roads go back to the starting layout.')) { localStorage.removeItem(KEY); city = loadCity(); if (data) syncStations(data); rebuildBuildings(); } return; }
    setTool(b.dataset.tool);
  });
  host.appendChild(bar);
}
function bindInput() {
  const el = renderer.domElement; let down = null, painting = false;
  el.addEventListener('pointermove', (e) => { hoverTile = tileAt(e); updateGhost(); if (painting && hoverTile) applyTool(hoverTile.x, hoverTile.y); });
  el.addEventListener('pointerleave', () => { hoverTile = null; updateGhost(); });
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; if (e.button === 0 && tool === 'road') { painting = true; const tl = tileAt(e); if (tl) applyTool(tl.x, tl.y); } });
  el.addEventListener('pointerup', (e) => {
    const tap = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && e.button === 0; down = null;
    if (painting) { painting = false; return; }
    if (!tap) return;
    if (tool !== 'select') { const tl = tileAt(e); if (tl) applyTool(tl.x, tl.y); return; }
    screenRay(e); const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.userData.pickWalker || h.object.userData.pickBuilding);
    if (!hit) return; const w = hit.object.userData.pickWalker, b = hit.object.userData.pickBuilding;
    if (w?.commander || b?.id === 'hq') handlers.onCommander?.(); else if (w) handlers.onAgent?.(w.id); else if (b?.outbox) handlers.onOutbox?.();
    else if (b?.station) { const a = data?.agents.find((x) => x.station === b.station); if (a) handlers.onAgent?.(a.id); }
  });
}
function fit() { controls.target.set(0, 0, 1.5); camera.position.set(0, 20, 24); controls.update(); }

/* ------------------------------------------------------------ setup & API */
function init(el) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'sv-canvas city3d'; renderer.domElement.setAttribute('aria-label', 'Your 3D city: drag to rotate, right-drag to pan, scroll to zoom, tap a building or a person');
  scene = new THREE.Scene(); scene.fog = new THREE.Fog('#a8c4e0', 38, 90);
  camera = new THREE.PerspectiveCamera(38, 16 / 9, .1, 400);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = 1.32; controls.minDistance = 3; controls.maxDistance = 60; controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  sky = new Sky(); sky.scale.setScalar(450); Object.assign(sky.material.uniforms, {}); sky.material.uniforms.turbidity.value = 6; sky.material.uniforms.rayleigh.value = 1.6; sky.material.uniforms.mieCoefficient.value = .005; sky.material.uniforms.mieDirectionalG.value = .8; scene.add(sky);
  pmrem = new THREE.PMREMGenerator(renderer);
  hemi = new THREE.HemisphereLight('#cfe4ff', '#4a5a3a', .6); scene.add(hemi);
  sun = new THREE.DirectionalLight('#fff2dd', 2.5); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); const sc = sun.shadow.camera; sc.left = -28; sc.right = 28; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 120; sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; scene.add(sun);
  moon = new THREE.DirectionalLight('#9db8ff', .3); moon.position.set(-20, 30, -10); scene.add(moon);
  const sg = new THREE.BufferGeometry(), sp = []; for (let i = 0; i < 1500; i++) { const v = new THREE.Vector3().randomDirection(); if (v.y < .05) v.y = Math.abs(v.y) + .05; v.multiplyScalar(300); sp.push(v.x, v.y, v.z); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })); scene.add(stars);
  const outer = mesh(new THREE.PlaneGeometry(400, 400), std('#3d6a30', { roughness: 1 }), { rx: -Math.PI / 2, y: -.02, cast: false }); scene.add(outer);
  ghost = new THREE.Mesh(new THREE.BoxGeometry(1, .6, 1), new THREE.MeshBasicMaterial({ color: '#4dffa6', transparent: true, opacity: .35, depthWrite: false })); ghost.visible = false; scene.add(ghost);
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .4, .5, .82); composer.addPass(bloom); composer.addPass(new OutputPass());
  city = loadCity(); rebuildBuildings(); fit(); bindInput();
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); }).observe(el);
}
function mount(el, h) {
  handlers = h || handlers;
  if (host === el && renderer?.domElement.isConnected) return;
  host = el;
  if (!renderer) init(el);
  el.appendChild(renderer.domElement); if (!bar) buildBar(); else el.appendChild(bar);
  if (!running) { running = true; requestAnimationFrame(frame); }
}
function setData(d) { data = d; if (!city || !scene) return; syncStations(d); syncPeople(d); syncTrucks(d); }

try {
  const probe = document.createElement('canvas'); if (!probe.getContext('webgl2')) throw new Error('No WebGL2');
  window.SpaceAgencyCity3D = { mount, setData, fit: () => fit() };
} catch (e) { console.warn('3D city unavailable, using the flat city:', e.message); window.SA3D_FAILED = true; }
