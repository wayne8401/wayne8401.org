/* Agent Station characters: original personas and avatars for your agents.
 *
 * Everything in this file (names, personalities, and the avatar artwork drawn by
 * avatarSvg) was created for Agent Station and is dedicated to the public domain
 * under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Use, change
 * and share them freely, including commercially, no credit needed.
 *
 * Suggested voices are Kokoro-82M studio voices (Apache-2.0). If studio voices
 * aren't installed, characters speak with the device's voice at their own pitch.
 */
(() => {
  'use strict';

  const INK = '#0b1022';

  // Draws an avatar from a small spec. viewBox 64x64.
  // Draws an avatar from a small spec, viewBox 64x64. By default it's a small full-bodied robot;
  // { full: false } draws just the head (for tiny icons).
  function avatarSvg(c, label = '', { full = true, bare = false, mode = 'robot' } = {}) {
    if (c.kind === 'human') return humanAvatar(c, label, { full, bare });
    if (mode === 'vehicle' && (c.body === 'vehicle' || c.body === 'jet')) return vehicleSvg(c, label, bare);
    const { bg, fg, shape = 'round', eyes = 'dot', mouth = 'smile', top = 'none', body = 'none', cheeks = false, accent = '#ffffff' } = c;
    const parts = [];
    const G = (cls, svg) => (svg ? `<g class="p-${cls}">${svg}</g>` : ''); // named layers, so the builder can animate parts flying together
    // armor and frame behind the head (robot builds)
    const bodies = {
      shoulders: `<path d="M2 64 L4 50 Q6 44 14 44 L22 46 L20 64 Z" fill="${fg}"/><path d="M62 64 L60 50 Q58 44 50 44 L42 46 L44 64 Z" fill="${fg}"/><path d="M6 52 L18 49" stroke="${INK}" stroke-width="1.6" opacity=".45"/><path d="M58 52 L46 49" stroke="${INK}" stroke-width="1.6" opacity=".45"/><rect x="8" y="55" width="8" height="3" rx="1.5" fill="${accent}"/><rect x="48" y="55" width="8" height="3" rx="1.5" fill="${accent}"/>`,
      chassis: `<path d="M3 64 L7 50 L18 46 L46 46 L57 50 L61 64 Z" fill="${fg}" opacity=".9"/><path d="M7 50 L18 56 L18 64 M57 50 L46 56 L46 64" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".4"/><rect x="7" y="57" width="7" height="3" rx="1.5" fill="${accent}"/><rect x="50" y="57" width="7" height="3" rx="1.5" fill="${accent}"/>`,
      wings: `<path d="M14 40 L1 26 L4 46 L12 50 Z" fill="${fg}" opacity=".8"/><path d="M50 40 L63 26 L60 46 L52 50 Z" fill="${fg}" opacity=".8"/><path d="M5 31 L12 41" stroke="${accent}" stroke-width="1.6"/><path d="M59 31 L52 41" stroke="${accent}" stroke-width="1.6"/>`,
      none: '',
    };
    const BUST = { vehicle: 'chassis', jet: 'wings' }; // head-only icons show a hint of the armor
    if (!full) parts.push(G('body', bodies[BUST[body] || body] || ''));
    // decorations behind the head
    const tops = {
      antenna: `<line x1="32" y1="17" x2="32" y2="7" stroke="${fg}" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="6" r="4" fill="${accent}"/>`,
      twin: `<line x1="22" y1="18" x2="17" y2="8" stroke="${fg}" stroke-width="3" stroke-linecap="round"/><line x1="42" y1="18" x2="47" y2="8" stroke="${fg}" stroke-width="3" stroke-linecap="round"/><circle cx="17" cy="7" r="3.5" fill="${accent}"/><circle cx="47" cy="7" r="3.5" fill="${accent}"/>`,
      ears: `<circle cx="15" cy="20" r="8" fill="${fg}"/><circle cx="49" cy="20" r="8" fill="${fg}"/><circle cx="15" cy="20" r="4" fill="${accent}"/><circle cx="49" cy="20" r="4" fill="${accent}"/>`,
      fox: `<path d="M12 28 L16 6 L28 20 Z" fill="${fg}"/><path d="M52 28 L48 6 L36 20 Z" fill="${fg}"/><path d="M16 22 L18 12 L24 19 Z" fill="${accent}"/><path d="M48 22 L46 12 L40 19 Z" fill="${accent}"/>`,
      owl: `<path d="M13 24 L15 8 L27 18 Z" fill="${fg}"/><path d="M51 24 L49 8 L37 18 Z" fill="${fg}"/>`,
      leaf: `<path d="M32 18 C30 10 34 5 42 4 C42 12 38 17 32 18 Z" fill="${accent}"/><line x1="32" y1="18" x2="36" y2="10" stroke="${INK}" stroke-width="1.2" opacity=".4"/>`,
      star: `<path d="M32 2 L35 10 L43 10 L37 15 L39 23 L32 18 L25 23 L27 15 L21 10 L29 10 Z" fill="${accent}"/>`,
      bolt: `<path d="M35 2 L25 16 L32 16 L28 26 L40 11 L33 11 Z" fill="${accent}"/>`,
      toque: `<path d="M18 22 C10 18 14 6 23 9 C25 2 39 2 41 9 C50 6 54 18 46 22 Z" fill="#ffffff"/><rect x="19" y="19" width="26" height="6" rx="2" fill="#e8ecf8"/>`,
      tuft: `<path d="M26 18 C24 10 30 8 32 4 C34 8 40 10 38 18 Z" fill="${accent}"/>`,
      halo: `<ellipse cx="32" cy="9" rx="13" ry="4" fill="none" stroke="${accent}" stroke-width="3"/>`,
      dish: `<path d="M20 16 Q32 2 44 16" fill="none" stroke="${fg}" stroke-width="3"/><circle cx="32" cy="9" r="3" fill="${accent}"/>`,
      fins: `<path d="M20 22 L12 3 L26 17 Z" fill="${fg}"/><path d="M44 22 L52 3 L38 17 Z" fill="${fg}"/><path d="M17 12 L22 18" stroke="${accent}" stroke-width="1.6"/><path d="M47 12 L42 18" stroke="${accent}" stroke-width="1.6"/>`,
      crest: `<path d="M28 18 L32 1 L36 18 Z" fill="${fg}"/><path d="M32 5 L32 16" stroke="${accent}" stroke-width="2"/>`,
      sensors: `<rect x="18" y="8" width="4" height="12" rx="1.5" fill="${fg}"/><rect x="42" y="8" width="4" height="12" rx="1.5" fill="${fg}"/><rect x="17" y="5" width="6" height="4" rx="1" fill="${accent}"/><rect x="41" y="5" width="6" height="4" rx="1" fill="${accent}"/>`,
      horns: `<path d="M18 22 L6 10 L10 6 L24 18 Z" fill="${fg}"/><path d="M46 22 L58 10 L54 6 L40 18 Z" fill="${fg}"/><circle cx="8" cy="8" r="2" fill="${accent}"/><circle cx="56" cy="8" r="2" fill="${accent}"/>`,
      none: '',
    };
    parts.push(G('top', tops[top] || ''));
    // head
    const heads = {
      round: `<circle cx="32" cy="38" r="21" fill="${fg}"/>`,
      square: `<rect x="11" y="18" width="42" height="40" rx="13" fill="${fg}"/>`,
      hex: `<path d="M32 16 L51 27 L51 49 L32 60 L13 49 L13 27 Z" fill="${fg}"/>`,
      tall: `<rect x="15" y="15" width="34" height="44" rx="17" fill="${fg}"/>`,
      wide: `<ellipse cx="32" cy="40" rx="24" ry="19" fill="${fg}"/>`,
      // robot helmets
      helm: `<path d="M14 24 L22 15 L42 15 L50 24 L52 44 L44 58 L20 58 L12 44 Z" fill="${fg}"/><path d="M12 44 L20 46 L22 58" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".35"/><path d="M52 44 L44 46 L42 58" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".35"/><path d="M22 15 L32 22 L42 15" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".35"/>`,
      mech: `<rect x="12" y="18" width="40" height="40" rx="5" fill="${fg}"/><rect x="12" y="18" width="40" height="8" rx="3" fill="${INK}" opacity=".25"/><rect x="7" y="32" width="6" height="14" rx="2" fill="${fg}"/><rect x="51" y="32" width="6" height="14" rx="2" fill="${fg}"/><circle cx="16" cy="54" r="1.4" fill="${INK}" opacity=".5"/><circle cx="48" cy="54" r="1.4" fill="${INK}" opacity=".5"/>`,
      sentinel: `<path d="M32 12 L50 22 L50 46 L40 59 L24 59 L14 46 L14 22 Z" fill="${fg}"/><path d="M32 12 L32 26" stroke="${INK}" stroke-width="2" opacity=".35"/><path d="M14 46 L24 44 L24 59" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".35"/><path d="M50 46 L40 44 L40 59" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".35"/>`,
      drone: `<path d="M20 18 L44 18 L54 30 L54 46 L44 58 L20 58 L10 46 L10 30 Z" fill="${fg}"/><path d="M10 34 L4 34 M10 42 L4 42 M54 34 L60 34 M54 42 L60 42" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>`,
    };
    parts.push(G('head', heads[shape] || heads.round));
    const face = [];
    // face plate for some looks
    const visorPlate = eyes === 'visor' ? `<rect x="17" y="30" width="30" height="11" rx="5.5" fill="${INK}"/><circle cx="25" cy="35.5" r="2.6" fill="${accent}"/><circle cx="39" cy="35.5" r="2.6" fill="${accent}"/>` : '';
    const eyeSets = {
      dot: `<circle cx="25" cy="36" r="3.4" fill="${INK}"/><circle cx="39" cy="36" r="3.4" fill="${INK}"/>`,
      big: `<circle cx="24.5" cy="35" r="6.5" fill="#fff"/><circle cx="39.5" cy="35" r="6.5" fill="#fff"/><circle cx="25.5" cy="36" r="3.4" fill="${INK}"/><circle cx="40.5" cy="36" r="3.4" fill="${INK}"/><circle cx="26.6" cy="34.6" r="1.1" fill="#fff"/><circle cx="41.6" cy="34.6" r="1.1" fill="#fff"/>`,
      happy: `<path d="M20 37 Q25 31 30 37" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M34 37 Q39 31 44 37" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      sleepy: `<path d="M20 36 Q25 39 30 36" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M34 36 Q39 39 44 36" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      glasses: `<circle cx="24.5" cy="36" r="6" fill="#fff" stroke="${INK}" stroke-width="2.4"/><circle cx="39.5" cy="36" r="6" fill="#fff" stroke="${INK}" stroke-width="2.4"/><line x1="30.5" y1="36" x2="33.5" y2="36" stroke="${INK}" stroke-width="2.4"/><circle cx="25" cy="36.5" r="2.4" fill="${INK}"/><circle cx="40" cy="36.5" r="2.4" fill="${INK}"/>`,
      wink: `<circle cx="25" cy="36" r="3.4" fill="${INK}"/><path d="M34 37 Q39 32 44 37" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      owl: `<circle cx="24" cy="35" r="8" fill="#fff"/><circle cx="40" cy="35" r="8" fill="#fff"/><circle cx="24" cy="35" r="4" fill="${INK}"/><circle cx="40" cy="35" r="4" fill="${INK}"/><path d="M29 41 L32 46 L35 41 Z" fill="${accent}"/>`,
      visor: '',
      // robot optics
      scanner: `<rect x="15" y="31" width="34" height="8" rx="2" fill="${INK}"/><rect x="19" y="33.5" width="26" height="3" rx="1.5" fill="${accent}"/><rect x="29" y="32.5" width="6" height="5" rx="1" fill="#fff" opacity=".85"/>`,
      optics: `<path d="M17 32 L29 34 L28 39 L18 38 Z" fill="${INK}"/><path d="M47 32 L35 34 L36 39 L46 38 Z" fill="${INK}"/><path d="M19 34 L27 35.3 L26.6 37.4 L19.6 36.8 Z" fill="${accent}"/><path d="M45 34 L37 35.3 L37.4 37.4 L44.4 36.8 Z" fill="${accent}"/>`,
      cyclops: `<circle cx="32" cy="35" r="8" fill="${INK}"/><circle cx="32" cy="35" r="5" fill="${accent}"/><circle cx="32" cy="35" r="2" fill="#fff"/><circle cx="34" cy="33" r="1" fill="#fff" opacity=".8"/>`,
      vvisor: `<path d="M14 29 L32 38 L50 29 L50 35 L32 44 L14 35 Z" fill="${INK}"/><path d="M18 32 L32 39 L46 32" fill="none" stroke="${accent}" stroke-width="2.2" stroke-linejoin="round"/>`,
    };
    face.push(`<g class="p-eyes">${visorPlate}${eyeSets[eyes] || eyeSets.dot}</g>`); // p-eyes blinks
    if (cheeks) face.push(`<circle cx="18.5" cy="44" r="3.2" fill="#ff8fb1" opacity=".75"/><circle cx="45.5" cy="44" r="3.2" fill="#ff8fb1" opacity=".75"/>`);
    const mouths = {
      smile: `<path d="M25 46 Q32 52 39 46" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      grin: `<path d="M23 45 Q32 56 41 45 Z" fill="${INK}"/><path d="M27 48.5 Q32 51 37 48.5" fill="none" stroke="#ff8fb1" stroke-width="2.4" stroke-linecap="round"/>`,
      o: `<circle cx="32" cy="48" r="3.4" fill="${INK}"/>`,
      flat: `<line x1="26" y1="48" x2="38" y2="48" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      cat: `<path d="M25 46 Q28.5 50 32 46 Q35.5 50 39 46" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
      grille: `<rect x="24" y="45" width="16" height="7" rx="2.5" fill="${INK}"/><line x1="29.3" y1="45" x2="29.3" y2="52" stroke="${fg}" stroke-width="1.2"/><line x1="34.7" y1="45" x2="34.7" y2="52" stroke="${fg}" stroke-width="1.2"/>`,
      // robot jaws
      faceplate: `<path d="M20 44 L44 44 L40 55 L24 55 Z" fill="${INK}" opacity=".85"/><path d="M26 47 L38 47 M27 50 L37 50 M28 53 L36 53" stroke="${fg}" stroke-width="1.3" opacity=".8"/>`,
      vent: `<rect x="23" y="45" width="18" height="2.4" rx="1.2" fill="${INK}"/><rect x="24" y="48.8" width="16" height="2.4" rx="1.2" fill="${INK}"/><rect x="25" y="52.6" width="14" height="2.4" rx="1.2" fill="${INK}"/>`,
      none: '',
    };
    face.push(`<g class="p-mouth">${mouths[mouth] ?? mouths.smile}</g>`); // p-mouth moves while speaking
    parts.push(G('face', face.join('')));
    const open = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${bare ? '' : `<rect width="64" height="64" rx="18" fill="${bg}"/>`}`;
    if (!full) return `${open}${parts.join('')}</svg>`;
    return `${open}${robotFrame(fg, accent, body)}<g transform="translate(14.5 -1.5) scale(.55)"><g class="p-sway">${parts.join('')}</g></g></svg>`;
  }


  // ---- People: skin tones, hair styles and face shapes (original flat art, same 64x64 frame as the robots) ----
  const SKINS = ['#ffdfc4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];
  const HAIR_COLORS = ['#1b1b1b', '#4a2c17', '#8a5a2b', '#d9a441', '#c9482c', '#b8b8c8', '#7a4bff', '#ff7ad9'];
  const HAIR_STYLES = ['short', 'long', 'curly', 'afro', 'braids', 'bun', 'ponytail', 'bald'];
  const FACES = ['round', 'oval', 'square', 'heart'];
  const HUMAN = { eyes: ['dot', 'big', 'happy', 'sleepy', 'glasses', 'wink'], mouth: ['smile', 'grin', 'o', 'flat', 'cat'] };

  function humanAvatar(c, label = '', { full = true, bare = false } = {}) {
    const { bg, fg, accent = '#ffd84d', cheeks = false } = c;
    const skin = c.skin || SKINS[1], hc = c.hairColor || HAIR_COLORS[1], style = HAIR_STYLES.includes(c.hair) ? c.hair : 'short', face = FACES.includes(c.face) ? c.face : 'round';
    const G = (cls, svg) => (svg ? `<g class="p-${cls}">${svg}</g>` : '');
    const earX = { round: [12, 52], oval: [14.5, 49.5], square: [12, 52], heart: [13.5, 50.5] }[face];
    const ears = `<circle cx="${earX[0]}" cy="39" r="3.6" fill="${skin}"/><circle cx="${earX[1]}" cy="39" r="3.6" fill="${skin}"/><circle cx="${earX[0]}" cy="39" r="1.5" fill="${INK}" opacity=".15"/><circle cx="${earX[1]}" cy="39" r="1.5" fill="${INK}" opacity=".15"/>`;
    const heads = {
      round: `<circle cx="32" cy="38" r="20" fill="${skin}"/>`,
      oval: `<ellipse cx="32" cy="38" rx="17" ry="21" fill="${skin}"/>`,
      square: `<rect x="13" y="19" width="38" height="38" rx="11" fill="${skin}"/>`,
      heart: `<path d="M13 30 C13 18 51 18 51 30 C51 44 42 57 32 58 C22 57 13 44 13 30 Z" fill="${skin}"/>`,
    };
    const braid = (x) => [42, 48, 54, 60].map((y) => `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="3.2" fill="${hc}"/>`).join('') + `<rect x="${x - 1.2}" y="40" width="2.4" height="22" fill="${INK}" opacity=".18"/>`;
    const back = {
      long: `<path d="M10 34 C8 10 56 10 54 34 L57 60 L43 60 L43 42 L21 42 L21 60 L7 60 Z" fill="${hc}"/>`,
      curly: [[15, 27], [21, 18], [32, 14], [43, 18], [49, 27], [12, 40], [52, 40], [16, 50], [48, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${hc}"/>`).join(''),
      afro: `<circle cx="32" cy="30" r="26" fill="${hc}"/>`,
      bun: `<circle cx="32" cy="11" r="8" fill="${hc}"/><circle cx="32" cy="11" r="3" fill="${INK}" opacity=".15"/>`,
      ponytail: `<path d="M48 26 C63 26 64 46 55 58 C57 46 52 40 46 36 Z" fill="${hc}"/>`,
      braids: braid(13) + braid(51),
    }[style] || '';
    const cap = `<path d="M12 36 C8 8 56 8 52 36 C50 27 44 23 32 23 C20 23 14 27 12 36 Z" fill="${hc}"/>`;
    const front = style === 'bald' ? '' : style === 'curly' ? [[18, 26], [25, 21], [32, 20], [39, 21], [46, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${hc}"/>`).join('') : cap;
    const eyeSets = {
      dot: `<circle cx="25" cy="37" r="3" fill="${INK}"/><circle cx="39" cy="37" r="3" fill="${INK}"/>`,
      big: `<circle cx="25" cy="36.5" r="5.4" fill="#fff"/><circle cx="39" cy="36.5" r="5.4" fill="#fff"/><circle cx="25.6" cy="37.2" r="3" fill="${INK}"/><circle cx="39.6" cy="37.2" r="3" fill="${INK}"/><circle cx="26.5" cy="36" r="1" fill="#fff"/><circle cx="40.5" cy="36" r="1" fill="#fff"/>`,
      happy: `<path d="M20.5 38 Q25 32.5 29.5 38" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><path d="M34.5 38 Q39 32.5 43.5 38" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`,
      sleepy: `<path d="M20.5 37 Q25 40 29.5 37" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><path d="M34.5 37 Q39 40 43.5 37" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`,
      glasses: `<circle cx="24.5" cy="37" r="5.6" fill="#fff" fill-opacity=".85" stroke="${INK}" stroke-width="2.2"/><circle cx="39.5" cy="37" r="5.6" fill="#fff" fill-opacity=".85" stroke="${INK}" stroke-width="2.2"/><line x1="30.1" y1="37" x2="33.9" y2="37" stroke="${INK}" stroke-width="2.2"/><circle cx="25" cy="37.4" r="2.2" fill="${INK}"/><circle cx="40" cy="37.4" r="2.2" fill="${INK}"/>`,
      wink: `<circle cx="25" cy="37" r="3" fill="${INK}"/><path d="M34.5 38 Q39 33 43.5 38" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`,
    };
    const mouths = {
      smile: `<path d="M26 47.5 Q32 52.5 38 47.5" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
      grin: `<path d="M24.5 46.5 Q32 55 39.5 46.5 Z" fill="${INK}"/><path d="M27.5 49.5 Q32 51.5 36.5 49.5" fill="none" stroke="#ff8fb1" stroke-width="2" stroke-linecap="round"/>`,
      o: `<circle cx="32" cy="49" r="3" fill="${INK}"/>`,
      flat: `<line x1="27" y1="49" x2="37" y2="49" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
      cat: `<path d="M26 47.5 Q29 51 32 47.5 Q35 51 38 47.5" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
    };
    const brow = style === 'bald' ? INK : hc;
    const faceSvg = `<g class="p-eyes">${eyeSets[c.eyes] || eyeSets.dot}</g>`
      + `<path d="M20 30 Q25 27 30 30 M34 30 Q39 27 44 30" fill="none" stroke="${brow}" stroke-width="2.2" stroke-linecap="round" opacity="${style === 'bald' ? '.4' : '.9'}"/>`
      + `<path d="M32 40.5 Q30 44.5 33 45.2" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity=".25"/>`
      + (cheeks ? `<circle cx="19" cy="45" r="3.2" fill="#ff8fb1" opacity=".6"/><circle cx="45" cy="45" r="3.2" fill="#ff8fb1" opacity=".6"/>` : '')
      + `<g class="p-mouth">${mouths[c.mouth] || mouths.smile}</g>`;
    const head = [G('top', back), G('head', ears + (heads[face] || heads.round)), G('face', faceSvg), G('top', front)].join('');
    const open = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${bare ? '' : `<rect width="64" height="64" rx="18" fill="${bg}"/>`}`;
    if (!full) return `${open}<path d="M5 64 Q7 51 22 49 L42 49 Q57 51 59 64 Z" fill="${fg}"/><rect x="27" y="48" width="10" height="9" fill="${skin}"/><path d="M27 49 L32 55 L37 49 Z" fill="${INK}" opacity=".18"/>${head}</svg>`;
    return `${open}${humanFrame(skin, fg, accent)}<g transform="translate(14.5 -1.5) scale(.55)"><g class="p-sway">${head}</g></g></svg>`;
  }

  // A person's body under the head: legs, arms, shirt (same layout as robotFrame, so the same animations work).
  function humanFrame(skin, shirt, accent) {
    const pants = '#2b3452', shoe = '#10162a';
    return `<g class="p-body">
      <rect x="23.5" y="46" width="7" height="12" rx="3" fill="${pants}"/><rect x="33.5" y="46" width="7" height="12" rx="3" fill="${pants}"/>
      <rect x="21.5" y="56" width="10" height="4.5" rx="2.2" fill="${shoe}"/><rect x="32.5" y="56" width="10" height="4.5" rx="2.2" fill="${shoe}"/>
      <g class="p-arm-l"><rect x="14" y="32" width="6.4" height="14" rx="3.2" fill="${shirt}"/><circle cx="17.2" cy="47.6" r="2.9" fill="${skin}"/></g>
      <g class="p-arm-r"><rect x="43.6" y="32" width="6.4" height="14" rx="3.2" fill="${shirt}"/><circle cx="46.8" cy="47.6" r="2.9" fill="${skin}"/></g>
      <rect x="28.5" y="27" width="7" height="6" fill="${skin}"/>
      <rect x="20" y="31" width="24" height="17" rx="5" fill="${shirt}"/>
      <path d="M28 31 L32 36.5 L36 31 Z" fill="${skin}"/><rect x="20" y="44" width="24" height="3.5" fill="${INK}" opacity=".18"/><rect x="36" y="38" width="5" height="3" rx="1" fill="${accent}"/>
    </g>`;
  }

  // Vehicle mode for transforming robots: vehicle kit → a car, jet kit → a jet. Original art.
  function vehicleSvg(c, label, bare) {
    const { bg = '#10284f', fg = '#7fb6ff', accent = '#ffd84d', body } = c;
    const back = bare ? '' : `<rect width="64" height="64" rx="18" fill="${bg}"/>`;
    const art = body === 'jet'
      ? `<ellipse cx="32" cy="56" rx="22" ry="2.5" fill="#000" opacity=".25"/>
        <path d="M20 33 L33 33 L23 15 L16 15 Z" fill="${fg}" opacity=".8"/>
        <path d="M5 37 L44 30 Q58 32 61 37 Q58 42 44 44 Z" fill="${fg}"/>
        <path d="M40 31.5 Q50 31.5 55 36 L42 36 Z" fill="#9fd8ff"/>
        <path d="M20 40 L34 40 L24 58 L15 58 Z" fill="${fg}"/><path d="M5 37 L10 24 L15 34 Z" fill="${fg}"/>
        <path d="M22 37 H44" stroke="${accent}" stroke-width="2"/><circle cx="5" cy="37" r="3" fill="${accent}" class="exhaust"/>
        <rect x="28" y="35" width="5" height="4" rx="1" fill="${INK}" opacity=".4"/>`
      : `<ellipse cx="32" cy="55" rx="26" ry="2.5" fill="#000" opacity=".25"/>
        <path d="M17 31 L23 20 L42 20 L49 31 Z" fill="${fg}"/>
        <path d="M21 30 L25.5 22.5 L31 22.5 L31 30 Z" fill="#9fd8ff"/><path d="M34 30 L34 22.5 L40.5 22.5 L45 30 Z" fill="#9fd8ff"/>
        <rect x="6" y="30" width="52" height="16" rx="5" fill="${fg}"/><rect x="8" y="37" width="48" height="2.5" fill="${accent}"/>
        <rect x="53" y="33" width="4" height="4" rx="1" fill="#fff6bf"/><rect x="7" y="33" width="3" height="4" rx="1" fill="#ff5c7a"/>
        <circle cx="18" cy="47" r="6" fill="${INK}"/><circle cx="18" cy="47" r="2.4" fill="${accent}"/>
        <circle cx="46" cy="47" r="6" fill="${INK}"/><circle cx="46" cy="47" r="2.4" fill="${accent}"/>
        <path d="M30 41 L32 43 L34 41" stroke="${INK}" stroke-width="1.4" fill="none" opacity=".5"/>`;
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label} (vehicle mode)">${back}<g class="vmode">${art}</g></svg>`;
  }

  // The small robot body under the head: legs, arms, torso, plus the chosen armor or vehicle kit.
  function robotFrame(fg, accent, body) {
    const shade = (svg) => `<g opacity=".22" fill="${INK}">${svg}</g>`;
    const back = {
      wings: `<path d="M22 33 L3 19 L7 43 Z" fill="${fg}" opacity=".8"/><path d="M42 33 L61 19 L57 43 Z" fill="${fg}" opacity=".8"/><path d="M8 26 L18 35 M56 26 L46 35" stroke="${accent}" stroke-width="1.6"/>`,
      jet: `<path d="M24 35 L1 45 L4 50 L24 43 Z" fill="${fg}"/><path d="M40 35 L63 45 L60 50 L40 43 Z" fill="${fg}"/><path d="M21 32 L15 17 L24 29 Z" fill="${fg}"/><path d="M43 32 L49 17 L40 29 Z" fill="${fg}"/><path d="M4 47 L14 44 M60 47 L50 44" stroke="${accent}" stroke-width="1.6"/>`,
      vehicle: `<circle cx="12.5" cy="33" r="5" fill="${INK}"/><circle cx="12.5" cy="33" r="2" fill="${accent}"/><circle cx="51.5" cy="33" r="5" fill="${INK}"/><circle cx="51.5" cy="33" r="2" fill="${accent}"/>`,
    }[body] || '';
    const frame = `
      <rect x="23" y="46" width="7" height="11" rx="2.5" fill="${fg}"/><rect x="34" y="46" width="7" height="11" rx="2.5" fill="${fg}"/>
      ${shade('<rect x="23" y="51" width="7" height="1.6"/><rect x="34" y="51" width="7" height="1.6"/>')}
      <rect x="20.5" y="55.5" width="11" height="4.5" rx="2.2" fill="${fg}"/><rect x="32.5" y="55.5" width="11" height="4.5" rx="2.2" fill="${fg}"/>
      ${shade('<rect x="20.5" y="58" width="11" height="2" rx="1"/><rect x="32.5" y="58" width="11" height="2" rx="1"/>')}
      <g class="p-arm-l"><rect x="13.5" y="33" width="6.5" height="13" rx="3.2" fill="${fg}"/>${shade('<rect x="13.5" y="39" width="6.5" height="7" rx="3"/>')}<circle cx="16.8" cy="47.6" r="2.7" fill="${fg}"/></g>
      <g class="p-arm-r"><rect x="44" y="33" width="6.5" height="13" rx="3.2" fill="${fg}"/>${shade('<rect x="44" y="39" width="6.5" height="7" rx="3"/>')}<circle cx="47.2" cy="47.6" r="2.7" fill="${fg}"/></g>
      <rect x="28.5" y="28" width="7" height="5" fill="${INK}" opacity=".45"/>
      <rect x="20" y="31" width="24" height="17" rx="5" fill="${fg}"/>
      <rect x="24" y="35" width="16" height="9" rx="2.5" fill="${INK}" opacity=".5"/><circle cx="32" cy="39.5" r="2.6" fill="${accent}"/>
      ${shade('<rect x="24" y="46" width="16" height="2.4" rx="1"/>')}`;
    const front = {
      shoulders: `<path d="M10.5 37 Q10.5 30 18 30 L23.5 31 L22 38 Z" fill="${fg}"/><path d="M53.5 37 Q53.5 30 46 30 L40.5 31 L42 38 Z" fill="${fg}"/>${shade('<path d="M10.5 37 L22 38 L22.3 36 L11 35.2 Z"/><path d="M53.5 37 L42 38 L41.7 36 L53 35.2 Z"/>')}<rect x="13" y="32.5" width="6" height="1.8" rx=".9" fill="${accent}"/><rect x="45" y="32.5" width="6" height="1.8" rx=".9" fill="${accent}"/>`,
      chassis: `<path d="M18.5 31 L45.5 31 L43 45 L21 45 Z" fill="${fg}"/><path d="M24 34 L40 34 L38.4 42 L25.6 42 Z" fill="${INK}" opacity=".55"/><path d="M27 36.5 L37 36.5 M27.5 39.5 L36.5 39.5" stroke="${accent}" stroke-width="1.4"/>`,
      vehicle: `<path d="M22 32.5 L42 32.5 L40 41 L24 41 Z" fill="#9fd8ff" opacity=".9"/><path d="M25 39.5 L29 33.5" stroke="#fff" stroke-width="1.4" opacity=".55"/><circle cx="23.6" cy="44.6" r="1.7" fill="#fff6bf"/><circle cx="40.4" cy="44.6" r="1.7" fill="#fff6bf"/><circle cx="20.5" cy="52" r="4" fill="${INK}"/><circle cx="20.5" cy="52" r="1.6" fill="${accent}"/><circle cx="43.5" cy="52" r="4" fill="${INK}"/><circle cx="43.5" cy="52" r="1.6" fill="${accent}"/>`,
      jet: `<path d="M26 36 L32 41 L38 36" stroke="${accent}" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M26 39.5 L32 44.5 L38 39.5" stroke="${accent}" stroke-width="2" fill="none" stroke-linejoin="round" opacity=".6"/>`,
      wings: '',
    }[body] || '';
    return `<g class="p-body">${back}${frame}${front}</g>`;
  }

  // Looks for the three starter agents.
  const LOOKS = {
    scout: { bg: '#0f3b4a', fg: '#38e8ff', shape: 'helm', eyes: 'visor', mouth: 'vent', top: 'dish', body: 'vehicle', accent: '#4dffa6' },
    quill: { bg: '#2b1f55', fg: '#b9a3ff', shape: 'hex', eyes: 'glasses', mouth: 'grille', top: 'crest', body: 'jet', accent: '#ffd84d' },
    atlas: { bg: '#123d2c', fg: '#4dffa6', shape: 'mech', eyes: 'scanner', mouth: 'faceplate', top: 'antenna', body: 'vehicle', accent: '#ffb84d' },
    muse: { bg: '#1f1a17', fg: '#efe4d6', shape: 'drone', eyes: 'big', mouth: 'smile', top: 'antenna', body: 'chassis', accent: '#ffb7a6', cheeks: true },
    echo: { bg: '#4a1036', fg: '#ff7ad9', shape: 'drone', eyes: 'cyclops', mouth: 'vent', top: 'sensors', body: 'jet', accent: '#38e8ff' },
  };

  const CHARACTERS = [
    {
      id: 'novi', name: 'Novi', role: 'Research navigator', station: 'research', voice: 'af_heart', pitch: 1.05, tag: 'Research',
      vibe: 'Curious, precise, loves a good source',
      greeting: "Hi, I'm Novi! Give me any question and I'll chart the facts, with sources you can check.",
      look: { bg: '#10284f', fg: '#7fb6ff', shape: 'sentinel', eyes: 'optics', mouth: 'vent', top: 'crest', body: 'jet', accent: '#ffd84d' },
      instructions: 'You are Novi, a curious and precise research navigator. Find reliable, current information, compare sources, cite links, and clearly flag anything uncertain. Explain findings in plain words with a short summary first.',
    },
    {
      id: 'zipp', name: 'Zipp', role: 'Quick fact-checker', station: 'research', voice: 'am_puck', pitch: 1.2, tag: 'Research',
      vibe: 'Speedy, sharp, allergic to rumors',
      greeting: "Zipp here! Toss me a claim and I'll zap it with facts, fast.",
      look: { bg: '#4a3a0a', fg: '#ffd84d', shape: 'drone', eyes: 'vvisor', mouth: 'flat', top: 'bolt', body: 'vehicle', accent: '#38e8ff' },
      instructions: 'You are Zipp, an energetic fact-checker. Check claims quickly against reputable sources, give a clear verdict (true, false, misleading or unclear), explain why in two or three sentences, and link the evidence.',
    },
    {
      id: 'hootley', name: 'Professor Hootley', role: 'Patient tutor', station: 'studio', voice: 'bm_george', pitch: 0.9, tag: 'Learning',
      vibe: 'Wise, gentle, never makes you feel silly',
      greeting: "Good day! I'm Professor Hootley. What shall we learn together? No question is too small.",
      look: { bg: '#3a2a1a', fg: '#c99a6b', shape: 'mech', eyes: 'owl', mouth: 'grille', top: 'horns', body: 'wings', accent: '#ffb84d' },
      instructions: 'You are Professor Hootley, a wise and patient tutor. Explain topics step by step for a beginner, use everyday analogies, check understanding with a quick question, and finish with three short quiz questions. Encourage, never condescend.',
    },
    {
      id: 'kit', name: 'Kit', role: 'Study buddy', station: 'studio', voice: 'af_sky', pitch: 1.25, tag: 'Learning',
      vibe: 'Upbeat, playful, great at flashcards',
      greeting: "Hey, I'm Kit! Want to make studying feel like a game? Let's go!",
      look: { bg: '#4a2410', fg: '#ff9a4d', shape: 'helm', eyes: 'big', mouth: 'vent', top: 'fins', body: 'vehicle', accent: '#ffe3c7' },
      instructions: 'You are Kit, an upbeat study buddy. Turn material into flashcards, mnemonics and mini quizzes, keep sessions short and fun, celebrate progress, and suggest what to review next. Keep it age-appropriate and kind.',
    },
    {
      id: 'confetti', name: 'Confetti', role: 'Social media creator', station: 'studio', voice: 'af_bella', pitch: 1.15, tag: 'Creative',
      vibe: 'Bubbly, on-trend, hooks in five words',
      greeting: "Hiya, I'm Confetti! Let's make posts people actually stop scrolling for.",
      look: { bg: '#4a1036', fg: '#ff7ad9', shape: 'drone', eyes: 'happy', mouth: 'grin', top: 'twin', body: 'jet', accent: '#ffd84d' },
      instructions: 'You are Confetti, a bubbly social media creator. Write short, scroll-stopping posts with a strong hook, a clear call to action and fitting hashtags; suggest the best format and time to post. Stay original and never copy other creators.',
    },
    {
      id: 'luma', name: 'Luma', role: 'Storyteller & writer', station: 'studio', voice: 'bf_lily', pitch: 1.0, tag: 'Creative',
      vibe: 'Dreamy, warm, paints with words',
      greeting: "Hello, I'm Luma. Shall we write something lovely? A story, a speech, a heartfelt note?",
      look: { bg: '#1d1a4a', fg: '#e8e2ff', shape: 'hex', eyes: 'sleepy', mouth: 'smile', top: 'halo', body: 'wings', accent: '#ffd84d' },
      instructions: 'You are Luma, a warm storyteller and writer. Craft stories, speeches, toasts and heartfelt messages with vivid but simple language. Ask about the audience and tone if it matters, and always write original material.',
    },
    {
      id: 'pip', name: 'Pip', role: 'Budget buddy', station: 'ops', voice: 'bf_emma', pitch: 1.1, tag: 'Money & life',
      vibe: 'Thrifty, cheerful, great with numbers',
      greeting: "Hello! I'm Pip, your budget buddy. Let's make every coin count.",
      look: { bg: '#4a1a2a', fg: '#ffa3c2', shape: 'mech', eyes: 'scanner', mouth: 'o', top: 'sensors', body: 'chassis', accent: '#ff7aa8' },
      instructions: 'You are Pip, a cheerful budget buddy. Build simple budgets, track spending categories, compare prices and find savings, and show the math in a small table (use the calculator for any arithmetic). Give general information, not personal financial, tax or legal advice.',
    },
    {
      id: 'mira', name: 'Mira', role: 'Inbox & email helper', station: 'ops', voice: 'af_nicole', pitch: 1.0, tag: 'Work',
      vibe: 'Calm, polished, replies in half the time',
      greeting: "Hi, I'm Mira. Paste a message and I'll help you answer it clearly and kindly.",
      look: { bg: '#103a3a', fg: '#7af0d8', shape: 'helm', eyes: 'optics', mouth: 'faceplate', top: 'crest', body: 'shoulders', accent: '#4dffa6' },
      instructions: 'You are Mira, a calm inbox helper. Summarize long messages, draft clear and kind replies in the right tone, suggest subject lines, and list follow-ups. Keep drafts short and leave [brackets] for details only the user knows.',
    },
    {
      id: 'wrenna', name: 'Wrenna', role: 'Tech helper', station: 'ops', voice: 'am_michael', pitch: 0.95, tag: 'Work',
      vibe: 'Handy, unflappable, explains without jargon',
      greeting: "Hey, I'm Wrenna. Tech acting up? Tell me what's happening and we'll fix it step by step.",
      look: { bg: '#2a2f3a', fg: '#a9b8d6', shape: 'mech', eyes: 'visor', mouth: 'grille', top: 'antenna', body: 'shoulders', accent: '#ffb84d' },
      instructions: 'You are Wrenna, an unflappable tech helper. Troubleshoot devices, apps and accounts one step at a time, ask what the user sees, avoid jargon, and warn before anything risky like resets. Never ask for passwords.',
    },
    {
      id: 'rova', name: 'Rova', role: 'Travel planner', station: 'ops', voice: 'bm_lewis', pitch: 1.0, tag: 'Money & life',
      vibe: 'Adventurous, organized, knows the hidden gems',
      greeting: "I'm Rova! Where are we off to? I'll sort the plan so you can enjoy the trip.",
      look: { bg: '#3a2410', fg: '#ffcf7a', shape: 'sentinel', eyes: 'wink', mouth: 'vent', top: 'fins', body: 'jet', accent: '#38e8ff' },
      instructions: 'You are Rova, an organized travel planner. Build day-by-day itineraries with realistic timing, budgets and backup options, mention booking tips and local customs, and check current information (opening hours, travel rules) on the web.',
    },
    {
      id: 'basil', name: 'Basil', role: 'Kitchen companion', station: 'ops', voice: 'am_eric', pitch: 0.95, tag: 'Money & life',
      vibe: 'Cozy, practical, turns leftovers into dinner',
      greeting: "Basil at your service! Tell me what's in your fridge and I'll find you something tasty.",
      look: { bg: '#163a16', fg: '#9be37a', shape: 'drone', eyes: 'happy', mouth: 'smile', top: 'toque', body: 'chassis', accent: '#ffffff' },
      instructions: 'You are Basil, a cozy kitchen companion. Suggest recipes from what the user has, scale servings, swap ingredients for diets and allergies, give clear steps with times, and build shopping lists. Flag food-safety basics when relevant.',
    },
    {
      id: 'calma', name: 'Calma', role: 'Routine & habits coach', station: 'ops', voice: 'af_sarah', pitch: 0.95, tag: 'Money & life',
      vibe: 'Steady, encouraging, tiny steps that stick',
      greeting: "Hi, I'm Calma. Let's build a routine that feels good and actually sticks.",
      look: { bg: '#1a2f4a', fg: '#a3d8ff', shape: 'hex', eyes: 'sleepy', mouth: 'flat', top: 'halo', body: 'chassis', accent: '#9be37a' },
      instructions: 'You are Calma, a steady routine and habits coach. Help plan daily routines, break goals into tiny habits, set gentle reminders and celebrate streaks. Be encouraging, not preachy. You are not a medical or mental-health professional; suggest one for health concerns.',
    },
    {
      id: 'rivet', name: 'Rivet', role: 'Fix-it & DIY mech', station: 'ops', voice: 'am_michael', pitch: 0.8, tag: 'Robots',
      vibe: 'Steady, hands-on, measures twice',
      greeting: 'Rivet online. Tell me what is broken and I will walk you through the fix, one bolt at a time.',
      look: { bg: '#2a2f3a', fg: '#c7cfdc', shape: 'mech', eyes: 'scanner', mouth: 'vent', top: 'sensors', body: 'shoulders', accent: '#ffb84d' },
      instructions: 'You are Rivet, a calm fix-it and DIY robot. Help with home repairs, assembly and maintenance: list tools and parts first, then clear numbered steps, with safety warnings (power off, water off, protective gear). Say when a job needs a licensed professional.',
    },
    {
      id: 'torque', name: 'Torque', role: 'Training coach bot', station: 'ops', voice: 'am_puck', pitch: 0.85, tag: 'Robots',
      vibe: 'High-energy, disciplined, counts every rep',
      greeting: 'Torque here. Systems charged. Let us build you a plan you can actually stick to.',
      look: { bg: '#4a1036', fg: '#e5484d', shape: 'helm', eyes: 'optics', mouth: 'faceplate', top: 'fins', body: 'shoulders', accent: '#ffd84d' },
      instructions: 'You are Torque, an upbeat training-coach robot. Build simple workout plans for the user\'s level and equipment, with sets, reps and rest, plus warm-up and cool-down. Encourage consistency over intensity. You are not a doctor; suggest checking with one before starting if they have health concerns.',
    },
    {
      id: 'cipher', name: 'Cipher', role: 'Security sentinel', station: 'research', voice: 'bm_george', pitch: 0.75, tag: 'Robots',
      vibe: 'Watchful, precise, never panics',
      greeting: 'Cipher, standing guard. Ask me about passwords, scams or keeping your accounts safe.',
      look: { bg: '#05070f', fg: '#3e6bff', shape: 'sentinel', eyes: 'vvisor', mouth: 'grille', top: 'crest', body: 'wings', accent: '#38e8ff' },
      instructions: 'You are Cipher, a calm security-sentinel robot. Give practical online-safety help: spotting scams and phishing, strong passwords and passkeys, two-factor login, privacy settings and what to do after a breach. Be clear and non-alarming. Never ask for the user\'s passwords or codes.',
    },
    {
      id: 'servo', name: 'Servo', role: 'Ops & scheduling drone', station: 'ops', voice: 'af_nicole', pitch: 1.15, tag: 'Robots',
      vibe: 'Quick, tidy, loves a checklist',
      greeting: 'Servo drone ready. Hand me your to-dos and I will sort them into a plan.',
      look: { bg: '#123d2c', fg: '#e9b949', shape: 'drone', eyes: 'cyclops', mouth: 'flat', top: 'antenna', body: 'chassis', accent: '#4dffa6' },
      instructions: 'You are Servo, a quick and tidy operations drone. Turn messy to-do lists into prioritized checklists and schedules, estimate time for each item, and group similar tasks. Ask one short question if the deadline or priority is unclear.',
    },
  ];

  // Parts for the Agent Builder (all original art, CC0).
  const OPTIONS = {
    shape: ['helm', 'mech', 'sentinel', 'drone', 'square', 'hex', 'round', 'tall', 'wide'],
    eyes: ['optics', 'scanner', 'vvisor', 'cyclops', 'visor', 'dot', 'big', 'happy', 'sleepy', 'glasses', 'wink', 'owl'],
    mouth: ['faceplate', 'vent', 'grille', 'flat', 'smile', 'grin', 'o', 'cat', 'none'],
    top: ['fins', 'crest', 'horns', 'sensors', 'antenna', 'twin', 'dish', 'bolt', 'none', 'ears', 'fox', 'owl', 'leaf', 'star', 'toque', 'tuft', 'halo'],
    body: ['vehicle', 'jet', 'shoulders', 'chassis', 'wings', 'none'],
    bg: ['#10284f', '#0f3b4a', '#123d2c', '#2b1f55', '#4a1036', '#4a2410', '#4a3a0a', '#2a2f3a', '#1d1a4a', '#163a16', '#3a2a1a', '#05070f'],
    fg: ['#c7cfdc', '#6b7690', '#e5484d', '#3e6bff', '#e9b949', '#7fb6ff', '#38e8ff', '#4dffa6', '#b9a3ff', '#ff7ad9', '#ff9a4d', '#ffd84d', '#a9b8d6', '#e8e2ff', '#9be37a', '#c99a6b', '#ffa3c2'],
    accent: ['#38e8ff', '#ff5c7a', '#ffd84d', '#4dffa6', '#ff7aa8', '#ffb84d', '#ffffff', '#9be37a'],
    // people
    skin: SKINS, hair: HAIR_STYLES, hairColor: HAIR_COLORS, face: FACES,
  };
  /** One-tap looks for the Forge Look step: original robot builds (a truck bot and a scout bot), plus a few people. */
  const PRESETS = [
    { id: 'hauler', name: 'Hauler (truck bot)', look: { shape: 'square', eyes: 'visor', mouth: 'grille', top: 'antenna', body: 'vehicle', bg: '#10284f', fg: '#7fb6ff', accent: '#e5484d', cheeks: false } },
    { id: 'sprocket', name: 'Sprocket (scout bot)', look: { shape: 'square', eyes: 'big', mouth: 'grin', top: 'antenna', body: 'vehicle', bg: '#05070f', fg: '#ffd84d', accent: '#1a1a1a', cheeks: false } },
    { id: 'person-sam', name: 'Sam', look: { kind: 'human', skin: '#c68642', hair: 'short', hairColor: '#1b1b1b', face: 'square', eyes: 'dot', mouth: 'smile', fg: '#3e6bff', bg: '#10284f', accent: '#ffd84d' } },
    { id: 'person-maya', name: 'Maya', look: { kind: 'human', skin: '#8d5524', hair: 'afro', hairColor: '#1b1b1b', face: 'round', eyes: 'happy', mouth: 'grin', fg: '#ff7ad9', bg: '#4a1036', accent: '#ffd84d', cheeks: true } },
    { id: 'person-ella', name: 'Ella', look: { kind: 'human', skin: '#ffdfc4', hair: 'ponytail', hairColor: '#d9a441', face: 'oval', eyes: 'big', mouth: 'smile', fg: '#4dffa6', bg: '#123d2c', accent: '#ffffff' } },
    { id: 'person-jo', name: 'Jo', look: { kind: 'human', skin: '#f1c27d', hair: 'braids', hairColor: '#4a2c17', face: 'heart', eyes: 'glasses', mouth: 'smile', fg: '#ffb84d', bg: '#2b1f55', accent: '#ffffff' } },
  ];
  /** Parts that read as robots/mechs: used by "Random robot" and for new builds. */
  const ROBOT = { shape: ['helm', 'mech', 'sentinel', 'drone', 'square', 'hex'], eyes: ['optics', 'scanner', 'vvisor', 'cyclops', 'visor'], mouth: ['faceplate', 'vent', 'grille', 'flat'], top: ['fins', 'crest', 'horns', 'sensors', 'antenna', 'dish', 'none'], body: ['vehicle', 'jet', 'shoulders', 'chassis', 'wings'] };
  // Keep only known parts and plain colours, so a stored look can never inject markup.
  function cleanLook(l) {
    if (!l || typeof l !== 'object') return null;
    const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : d);
    const pick = (k, d) => (OPTIONS[k].includes(l[k]) ? l[k] : d);
    const out = { shape: pick('shape', 'round'), eyes: pick('eyes', 'dot'), mouth: pick('mouth', 'smile'), top: pick('top', 'none'), body: pick('body', 'none'),
      bg: hex(l.bg, '#10284f'), fg: hex(l.fg, '#7fb6ff'), accent: hex(l.accent, '#ffd84d'), cheeks: !!l.cheeks };
    if (l.kind === 'human') Object.assign(out, { kind: 'human', skin: hex(l.skin, SKINS[1]), hair: pick('hair', 'short'), hairColor: hex(l.hairColor, HAIR_COLORS[1]), face: pick('face', 'round') });
    return out;
  }

  window.AgentStationCharacters = { CHARACTERS, LOOKS, OPTIONS, ROBOT, HUMAN, PRESETS, avatarSvg, cleanLook, byId: (id) => CHARACTERS.find((c) => c.id === id) };
})();
