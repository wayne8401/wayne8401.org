/* Agent Station: the Commander, the owner's own avatar.
 * An original illustration drawn from the owner's photos: slim face with a short goatee and
 * stubble, black snapback, gray "365 HUSTLE" sweatsuit with blue lettering, blue-and-gray
 * sneakers, plus Commander touches (gold star on the cap, gold shoulder stripes).
 * No third-party logos. Exposes AgentStationCommander.svg({ full, bare }).
 */
(() => {
  'use strict';
  const C = {
    skin: '#5e3c2b', skinLit: '#74503b', skinDk: '#46291c', lip: '#3d2419', lipLow: '#6a4232',
    hair: '#16110e', cap: '#16181c', capLit: '#24272d', brim: '#0d0e11',
    shirt: '#5d6067', shirtDk: '#4b4e54', shirtLit: '#6c7077', pants: '#585b61', pantsDk: '#474a50',
    blue: '#3d8bff', blueDk: '#2a67d6', white: '#f2f2f0', shoeGray: '#9aa1ab', sole: '#1c2230', gold: '#e9b949', goldDk: '#b8892a',
  };

  // Face + cap, drawn in a 64x64 box centred on x=32 (re-used for the bust and, scaled, for the full body).
  function head() {
    return `
      <ellipse cx="22.6" cy="34" rx="3.2" ry="4.4" fill="${C.skin}"/><ellipse cx="41.4" cy="34" rx="3.2" ry="4.4" fill="${C.skin}"/>
      <ellipse cx="22.8" cy="34.2" rx="1.4" ry="2.2" fill="${C.skinDk}" opacity=".5"/><ellipse cx="41.2" cy="34.2" rx="1.4" ry="2.2" fill="${C.skinDk}" opacity=".5"/>
      <path d="M23.5 26 Q23 44 28 50 Q32 54 36 50 Q41 44 40.5 26 Z" fill="${C.skin}"/>
      <path d="M36.5 27 Q40.5 30 40 40 Q39 46 36 50 Q38.5 42 38 33 Z" fill="${C.skinDk}" opacity=".35"/>
      <path d="M26 28 Q27 40 30 46" stroke="${C.skinLit}" stroke-width="1.6" fill="none" opacity=".45"/>
      <path d="M24.5 23 Q32 21 39.5 23 L39.6 27 Q32 25.4 24.4 27 Z" fill="${C.hair}" opacity=".9"/>
      <path d="M26.2 30.5 Q28.5 29.9 30.8 30.5" stroke="${C.hair}" stroke-width="1.05" fill="none" stroke-linecap="round"/>
      <path d="M33.2 30.5 Q35.5 29.9 37.8 30.5" stroke="${C.hair}" stroke-width="1.05" fill="none" stroke-linecap="round"/>
      <path d="M26 33.3 Q28.5 31.5 31 33.3 Q28.5 34.8 26 33.3 Z" fill="#f4ede6"/><path d="M33 33.3 Q35.5 31.5 38 33.3 Q35.5 34.8 33 33.3 Z" fill="#f4ede6"/>
      <circle cx="28.5" cy="33.2" r="1.35" fill="#2a1a12"/><circle cx="35.5" cy="33.2" r="1.35" fill="#2a1a12"/>
      <circle cx="28.9" cy="32.8" r=".35" fill="#fff" opacity=".8"/><circle cx="35.7" cy="32.8" r=".35" fill="#fff" opacity=".8"/>
      <path d="M26.3 32.6 Q28.5 31.2 30.7 32.6" stroke="${C.skinDk}" stroke-width=".8" fill="none"/><path d="M33.3 32.6 Q35.5 31.2 37.7 32.6" stroke="${C.skinDk}" stroke-width=".8" fill="none"/>
      <path d="M32 33.5 Q31.4 38 30.4 39.6 Q32 40.6 33.6 39.6" stroke="${C.skinDk}" stroke-width=".9" fill="none" opacity=".8"/>
      <ellipse cx="30.3" cy="39.8" rx="1" ry=".55" fill="${C.skinDk}" opacity=".8"/><ellipse cx="33.7" cy="39.8" rx="1" ry=".55" fill="${C.skinDk}" opacity=".8"/>
      <path d="M28.3 42.6 Q32 41.2 35.7 42.6 Q32 43.4 28.3 42.6 Z" fill="${C.lip}"/>
      <path d="M28.6 42.8 Q32 45.6 35.4 42.8 Q32 43.6 28.6 42.8 Z" fill="${C.lipLow}"/>
      <path d="M27.2 41.8 Q32 40.4 36.8 41.8" stroke="${C.hair}" stroke-width=".9" fill="none" opacity=".45"/>
      <path d="M29 46 Q32 51.6 35 46 Q34 49.5 32 49.8 Q30 49.5 29 46 Z" fill="${C.hair}" opacity=".55"/>
      <path d="M25 41 Q27 49 32 51 Q37 49 39 41 Q37.5 47 32 49 Q26.5 47 25 41 Z" fill="${C.hair}" opacity=".18"/>
      <!-- black snapback with a gold Commander star -->
      <path d="M22.4 27 L22.8 20 Q23.6 15.2 32 14.8 Q40.4 15.2 41.2 20 L41.6 27 Z" fill="${C.cap}"/>
      <path d="M22.8 20.2 Q32 18.8 41.2 20.2" stroke="${C.capLit}" stroke-width=".5" fill="none" opacity=".6"/>
      <path d="M27 15.6 L26.4 27 M37 15.6 L37.6 27" stroke="${C.capLit}" stroke-width=".55" fill="none"/>
      <rect x="31" y="14.3" width="2" height="1" rx=".5" fill="${C.capLit}"/>
      <path d="M32 17.4 L32.95 19.7 L35.4 19.8 L33.5 21.3 L34.15 23.7 L32 22.3 L29.85 23.7 L30.5 21.3 L28.6 19.8 L31.05 19.7 Z" fill="${C.gold}" stroke="${C.goldDk}" stroke-width=".35"/>
      <path d="M17.6 26.6 Q32 25.2 46.4 26.6 L46.8 29.4 Q32 28 17.2 29.4 Z" fill="${C.brim}"/>
      <path d="M17.4 29.2 Q32 27.8 46.6 29.2" stroke="#3a3d45" stroke-width=".7" fill="none"/>
      <path d="M22.4 27 Q32 25.9 41.6 27" stroke="#2c2f36" stroke-width=".5" fill="none"/>`;
  }

  function svg({ full = true, bare = false, label = 'Commander' } = {}) {
    const back = bare ? '' : `<rect width="64" height="64" rx="18" fill="#10284f"/><circle cx="32" cy="30" r="26" fill="#3d8bff" opacity=".12"/>`;
    if (!full) { // bust: head + shoulders, for small icons
      return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${back}
        <path d="M10 64 Q11 52 22 50 L42 50 Q53 52 54 64 Z" fill="${C.shirt}"/>
        <path d="M26 50 Q32 54 38 50" stroke="${C.white}" stroke-width="2" fill="none"/>
        <rect x="12" y="52.5" width="9" height="2.6" rx="1" fill="${C.gold}" transform="rotate(-12 16 54)"/><rect x="43" y="52.5" width="9" height="2.6" rx="1" fill="${C.gold}" transform="rotate(12 48 54)"/>
        <rect x="29" y="44" width="6" height="7" fill="${C.skinDk}"/>
        <g transform="translate(-1.2 -2.6) scale(1.04)">${head()}</g></svg>`;
    }
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${back}
      <ellipse cx="32" cy="61" rx="13" ry="2.2" fill="#000" opacity=".25"/>
      <!-- sweatpants -->
      <path d="M22 44 L31.6 44 L31 57 L23 57 Z" fill="${C.pants}"/><path d="M32.4 44 L42 44 L41 57 L33 57 Z" fill="${C.pants}"/>
      <path d="M38 45 L41.6 45 L40.8 56" stroke="${C.pantsDk}" stroke-width="1.4" fill="none"/>
      <rect x="23" y="55" width="8" height="2.4" rx="1" fill="${C.pantsDk}"/><rect x="33" y="55" width="8" height="2.4" rx="1" fill="${C.pantsDk}"/>
      <rect x="23.6" y="46" width="5.6" height="3.2" rx=".6" fill="${C.blue}"/><rect x="24.2" y="49.6" width="4.4" height=".9" fill="${C.white}"/>
      <!-- blue + gray sneakers -->
      <path d="M20.6 60 Q20.4 56.6 23.6 56.4 L31 56.4 L31.6 60 Z" fill="${C.blue}"/><path d="M32.4 60 L33 56.4 L40.4 56.4 Q43.6 56.6 43.4 60 Z" fill="${C.blue}"/>
      <path d="M21 58.2 L25.5 58.2 M38.5 58.2 L43 58.2" stroke="${C.shoeGray}" stroke-width="1.6"/>
      <rect x="20.4" y="59.4" width="11.4" height="1.6" rx=".8" fill="${C.sole}"/><rect x="32.2" y="59.4" width="11.4" height="1.6" rx=".8" fill="${C.sole}"/>
      <path d="M26 57.2 L29.6 57.2 M34.4 57.2 L38 57.2" stroke="${C.white}" stroke-width=".7" stroke-dasharray="1 .8"/>
      <!-- sweatshirt -->
      <path d="M19.6 28.4 Q14.8 28.8 14.2 34 L13.4 44.6 L18.6 44.8 L19.8 34 Z" fill="${C.shirtDk}"/><path d="M44.4 28.4 Q49.2 28.8 49.8 34 L50.6 44.6 L45.4 44.8 L44.2 34 Z" fill="${C.shirtDk}"/>
      <path d="M18.6 29.4 Q19.4 27.4 23 27.2 L41 27.2 Q44.6 27.4 45.4 29.4 L45.8 46 L18.2 46 Z" fill="${C.shirt}"/>
      <rect x="18.6" y="43.6" width="26.8" height="2.6" rx="1" fill="${C.shirtDk}"/>
      <rect x="13" y="43.4" width="6" height="2.4" rx="1" fill="${C.pantsDk}"/><rect x="45" y="43.4" width="6" height="2.4" rx="1" fill="${C.pantsDk}"/>
      <ellipse cx="16" cy="47.6" rx="2.3" ry="2.6" fill="${C.skin}"/><ellipse cx="48" cy="47.6" rx="2.3" ry="2.6" fill="${C.skin}"/>
      <!-- 365 HUSTLE (the owner's own brand) -->
      <text x="32" y="33.6" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="3.6" fill="${C.white}">365</text>
      <text x="32" y="38.4" text-anchor="middle" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-style="italic" font-size="5" fill="${C.blue}" letter-spacing="-.2">HUSTLE</text>
      <path d="M26 39.2 Q32 38.4 38.4 39" stroke="${C.blue}" stroke-width=".8" fill="none"/>
      <text x="32" y="41.6" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="1.7" fill="${C.white}">FOCUS FUELS FORTUNE</text>
      <!-- Commander shoulder stripes -->
      <rect x="17.2" y="27.8" width="5.6" height="1.6" rx=".6" fill="${C.gold}"/><rect x="41.2" y="27.8" width="5.6" height="1.6" rx=".6" fill="${C.gold}"/>
      <path d="M28 27.4 Q32 30.2 36 27.4" stroke="${C.white}" stroke-width="1.4" fill="none"/>
      <rect x="29.2" y="24.2" width="5.6" height="3.8" fill="${C.skinDk}"/>
      <g transform="translate(12.2 -5.4) scale(.62)">${head()}</g></svg>`;
  }
  window.AgentStationCommander = { svg, name: 'Commander' };
})();
