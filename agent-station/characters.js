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
  function avatarSvg(c, label = '') {
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
    parts.push(G('body', bodies[body] || ''));
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
    if (eyes === 'visor') face.push(`<rect x="17" y="30" width="30" height="11" rx="5.5" fill="${INK}"/><circle cx="25" cy="35.5" r="2.6" fill="${accent}"/><circle cx="39" cy="35.5" r="2.6" fill="${accent}"/>`);
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
    face.push(eyeSets[eyes] || eyeSets.dot);
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
    face.push(mouths[mouth] ?? mouths.smile);
    parts.push(G('face', face.join('')));
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}"><rect width="64" height="64" rx="18" fill="${bg}"/>${parts.join('')}</svg>`;
  }

  // Looks for the three starter agents.
  const LOOKS = {
    scout: { bg: '#0f3b4a', fg: '#38e8ff', shape: 'round', eyes: 'visor', mouth: 'smile', top: 'dish', accent: '#4dffa6' },
    quill: { bg: '#2b1f55', fg: '#b9a3ff', shape: 'tall', eyes: 'glasses', mouth: 'smile', top: 'tuft', accent: '#ffd84d' },
    atlas: { bg: '#123d2c', fg: '#4dffa6', shape: 'square', eyes: 'dot', mouth: 'grille', top: 'antenna', accent: '#ffb84d' },
  };

  const CHARACTERS = [
    {
      id: 'novi', name: 'Novi', role: 'Research navigator', station: 'research', voice: 'af_heart', pitch: 1.05, tag: 'Research',
      vibe: 'Curious, precise, loves a good source',
      greeting: "Hi, I'm Novi! Give me any question and I'll chart the facts, with sources you can check.",
      look: { bg: '#10284f', fg: '#7fb6ff', shape: 'round', eyes: 'big', mouth: 'smile', top: 'star', accent: '#ffd84d' },
      instructions: 'You are Novi, a curious and precise research navigator. Find reliable, current information, compare sources, cite links, and clearly flag anything uncertain. Explain findings in plain words with a short summary first.',
    },
    {
      id: 'zipp', name: 'Zipp', role: 'Quick fact-checker', station: 'research', voice: 'am_puck', pitch: 1.2, tag: 'Research',
      vibe: 'Speedy, sharp, allergic to rumors',
      greeting: "Zipp here! Toss me a claim and I'll zap it with facts, fast.",
      look: { bg: '#4a3a0a', fg: '#ffd84d', shape: 'hex', eyes: 'dot', mouth: 'grin', top: 'bolt', accent: '#38e8ff' },
      instructions: 'You are Zipp, an energetic fact-checker. Check claims quickly against reputable sources, give a clear verdict (true, false, misleading or unclear), explain why in two or three sentences, and link the evidence.',
    },
    {
      id: 'hootley', name: 'Professor Hootley', role: 'Patient tutor', station: 'studio', voice: 'bm_george', pitch: 0.9, tag: 'Learning',
      vibe: 'Wise, gentle, never makes you feel silly',
      greeting: "Good day! I'm Professor Hootley. What shall we learn together? No question is too small.",
      look: { bg: '#3a2a1a', fg: '#c99a6b', shape: 'wide', eyes: 'owl', mouth: 'none', top: 'owl', accent: '#ffb84d' },
      instructions: 'You are Professor Hootley, a wise and patient tutor. Explain topics step by step for a beginner, use everyday analogies, check understanding with a quick question, and finish with three short quiz questions. Encourage, never condescend.',
    },
    {
      id: 'kit', name: 'Kit', role: 'Study buddy', station: 'studio', voice: 'af_sky', pitch: 1.25, tag: 'Learning',
      vibe: 'Upbeat, playful, great at flashcards',
      greeting: "Hey, I'm Kit! Want to make studying feel like a game? Let's go!",
      look: { bg: '#4a2410', fg: '#ff9a4d', shape: 'round', eyes: 'big', mouth: 'cat', top: 'fox', accent: '#ffe3c7', cheeks: true },
      instructions: 'You are Kit, an upbeat study buddy. Turn material into flashcards, mnemonics and mini quizzes, keep sessions short and fun, celebrate progress, and suggest what to review next. Keep it age-appropriate and kind.',
    },
    {
      id: 'confetti', name: 'Confetti', role: 'Social media creator', station: 'studio', voice: 'af_bella', pitch: 1.15, tag: 'Creative',
      vibe: 'Bubbly, on-trend, hooks in five words',
      greeting: "Hiya, I'm Confetti! Let's make posts people actually stop scrolling for.",
      look: { bg: '#4a1036', fg: '#ff7ad9', shape: 'round', eyes: 'happy', mouth: 'grin', top: 'twin', accent: '#ffd84d', cheeks: true },
      instructions: 'You are Confetti, a bubbly social media creator. Write short, scroll-stopping posts with a strong hook, a clear call to action and fitting hashtags; suggest the best format and time to post. Stay original and never copy other creators.',
    },
    {
      id: 'luma', name: 'Luma', role: 'Storyteller & writer', station: 'studio', voice: 'bf_lily', pitch: 1.0, tag: 'Creative',
      vibe: 'Dreamy, warm, paints with words',
      greeting: "Hello, I'm Luma. Shall we write something lovely? A story, a speech, a heartfelt note?",
      look: { bg: '#1d1a4a', fg: '#e8e2ff', shape: 'round', eyes: 'sleepy', mouth: 'smile', top: 'halo', accent: '#ffd84d', cheeks: true },
      instructions: 'You are Luma, a warm storyteller and writer. Craft stories, speeches, toasts and heartfelt messages with vivid but simple language. Ask about the audience and tone if it matters, and always write original material.',
    },
    {
      id: 'pip', name: 'Pip', role: 'Budget buddy', station: 'ops', voice: 'bf_emma', pitch: 1.1, tag: 'Money & life',
      vibe: 'Thrifty, cheerful, great with numbers',
      greeting: "Hello! I'm Pip, your budget buddy. Let's make every coin count.",
      look: { bg: '#4a1a2a', fg: '#ffa3c2', shape: 'wide', eyes: 'dot', mouth: 'o', top: 'ears', accent: '#ff7aa8', cheeks: true },
      instructions: 'You are Pip, a cheerful budget buddy. Build simple budgets, track spending categories, compare prices and find savings, and show the math in a small table (use the calculator for any arithmetic). Give general information, not personal financial, tax or legal advice.',
    },
    {
      id: 'mira', name: 'Mira', role: 'Inbox & email helper', station: 'ops', voice: 'af_nicole', pitch: 1.0, tag: 'Work',
      vibe: 'Calm, polished, replies in half the time',
      greeting: "Hi, I'm Mira. Paste a message and I'll help you answer it clearly and kindly.",
      look: { bg: '#103a3a', fg: '#7af0d8', shape: 'tall', eyes: 'dot', mouth: 'smile', top: 'leaf', accent: '#4dffa6' },
      instructions: 'You are Mira, a calm inbox helper. Summarize long messages, draft clear and kind replies in the right tone, suggest subject lines, and list follow-ups. Keep drafts short and leave [brackets] for details only the user knows.',
    },
    {
      id: 'wrenna', name: 'Wrenna', role: 'Tech helper', station: 'ops', voice: 'am_michael', pitch: 0.95, tag: 'Work',
      vibe: 'Handy, unflappable, explains without jargon',
      greeting: "Hey, I'm Wrenna. Tech acting up? Tell me what's happening and we'll fix it step by step.",
      look: { bg: '#2a2f3a', fg: '#a9b8d6', shape: 'square', eyes: 'visor', mouth: 'grille', top: 'antenna', accent: '#ffb84d' },
      instructions: 'You are Wrenna, an unflappable tech helper. Troubleshoot devices, apps and accounts one step at a time, ask what the user sees, avoid jargon, and warn before anything risky like resets. Never ask for passwords.',
    },
    {
      id: 'rova', name: 'Rova', role: 'Travel planner', station: 'ops', voice: 'bm_lewis', pitch: 1.0, tag: 'Money & life',
      vibe: 'Adventurous, organized, knows the hidden gems',
      greeting: "I'm Rova! Where are we off to? I'll sort the plan so you can enjoy the trip.",
      look: { bg: '#3a2410', fg: '#ffcf7a', shape: 'round', eyes: 'wink', mouth: 'smile', top: 'antenna', accent: '#38e8ff' },
      instructions: 'You are Rova, an organized travel planner. Build day-by-day itineraries with realistic timing, budgets and backup options, mention booking tips and local customs, and check current information (opening hours, travel rules) on the web.',
    },
    {
      id: 'basil', name: 'Basil', role: 'Kitchen companion', station: 'ops', voice: 'am_eric', pitch: 0.95, tag: 'Money & life',
      vibe: 'Cozy, practical, turns leftovers into dinner',
      greeting: "Basil at your service! Tell me what's in your fridge and I'll find you something tasty.",
      look: { bg: '#163a16', fg: '#9be37a', shape: 'round', eyes: 'happy', mouth: 'smile', top: 'toque', accent: '#ffffff', cheeks: true },
      instructions: 'You are Basil, a cozy kitchen companion. Suggest recipes from what the user has, scale servings, swap ingredients for diets and allergies, give clear steps with times, and build shopping lists. Flag food-safety basics when relevant.',
    },
    {
      id: 'calma', name: 'Calma', role: 'Routine & habits coach', station: 'ops', voice: 'af_sarah', pitch: 0.95, tag: 'Money & life',
      vibe: 'Steady, encouraging, tiny steps that stick',
      greeting: "Hi, I'm Calma. Let's build a routine that feels good and actually sticks.",
      look: { bg: '#1a2f4a', fg: '#a3d8ff', shape: 'round', eyes: 'sleepy', mouth: 'smile', top: 'leaf', accent: '#9be37a' },
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
    body: ['shoulders', 'chassis', 'wings', 'none'],
    bg: ['#10284f', '#0f3b4a', '#123d2c', '#2b1f55', '#4a1036', '#4a2410', '#4a3a0a', '#2a2f3a', '#1d1a4a', '#163a16', '#3a2a1a', '#05070f'],
    fg: ['#c7cfdc', '#6b7690', '#e5484d', '#3e6bff', '#e9b949', '#7fb6ff', '#38e8ff', '#4dffa6', '#b9a3ff', '#ff7ad9', '#ff9a4d', '#ffd84d', '#a9b8d6', '#e8e2ff', '#9be37a', '#c99a6b', '#ffa3c2'],
    accent: ['#38e8ff', '#ff5c7a', '#ffd84d', '#4dffa6', '#ff7aa8', '#ffb84d', '#ffffff', '#9be37a'],
  };
  /** Parts that read as robots/mechs: used by "Random robot" and for new builds. */
  const ROBOT = { shape: ['helm', 'mech', 'sentinel', 'drone', 'square', 'hex'], eyes: ['optics', 'scanner', 'vvisor', 'cyclops', 'visor'], mouth: ['faceplate', 'vent', 'grille', 'flat'], top: ['fins', 'crest', 'horns', 'sensors', 'antenna', 'dish', 'none'], body: ['shoulders', 'chassis', 'wings'] };
  // Keep only known parts and plain colours, so a stored look can never inject markup.
  function cleanLook(l) {
    if (!l || typeof l !== 'object') return null;
    const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : d);
    const pick = (k, d) => (OPTIONS[k].includes(l[k]) ? l[k] : d);
    return { shape: pick('shape', 'round'), eyes: pick('eyes', 'dot'), mouth: pick('mouth', 'smile'), top: pick('top', 'none'), body: pick('body', 'none'),
      bg: hex(l.bg, '#10284f'), fg: hex(l.fg, '#7fb6ff'), accent: hex(l.accent, '#ffd84d'), cheeks: !!l.cheeks };
  }

  window.AgentStationCharacters = { CHARACTERS, LOOKS, OPTIONS, ROBOT, avatarSvg, cleanLook, byId: (id) => CHARACTERS.find((c) => c.id === id) };
})();
