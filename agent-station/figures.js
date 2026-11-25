/* Agent Station crew figures: tall, slim, shaded walkers (androids in each agent's colours, the
 * Commander, people) with front / back / side views, a stride, sitting and working poses.
 * Shared by the phone's ring station (station-view.js) and Space Agency's city (city-view.js).
 * AgentStationFigures.draw(ctx, walker, timeSeconds, lookFn), .drone(ctx, walker, timeSeconds)
 */
(() => {
  'use strict';
  let lookFn = () => ({});
  const mix = (hex, k) => { // k < 0 darker, k > 0 lighter
    const n = parseInt(String(hex || '#888888').slice(1, 7), 16) || 0x888888;
    const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
    return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
  };
  function palette(w) {
    if (w.commander) return { kind: 'cmdr', skin: '#5e3c2b', top: '#5d6067', legs: '#55585e', shoe: '#3d8bff', cap: '#16181c', accent: '#e9b949', print: '#3d8bff' };
    const l = lookFn(w.agent) || {};
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
    const P = palette(w), H = w.commander ? 38 : 34, s = H / 34 * (w.scale || 1);
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
  window.AgentStationFigures = {
    draw(c, w, t, lf) { if (lf) lookFn = lf; drawFigure(c, w, t); },
    drone: (c, w, t) => drawDrone(c, w, t),
    mix,
  };
})();
