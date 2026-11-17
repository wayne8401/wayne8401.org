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
    const { bg, fg, shape = 'round', eyes = 'dot', mouth = 'smile', top = 'none', cheeks = false, accent = '#ffffff' } = c;
    const parts = [];
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
      none: '',
    };
    parts.push(tops[top] || '');
    // head
    const heads = {
      round: `<circle cx="32" cy="38" r="21" fill="${fg}"/>`,
      square: `<rect x="11" y="18" width="42" height="40" rx="13" fill="${fg}"/>`,
      hex: `<path d="M32 16 L51 27 L51 49 L32 60 L13 49 L13 27 Z" fill="${fg}"/>`,
      tall: `<rect x="15" y="15" width="34" height="44" rx="17" fill="${fg}"/>`,
      wide: `<ellipse cx="32" cy="40" rx="24" ry="19" fill="${fg}"/>`,
    };
    parts.push(heads[shape] || heads.round);
    // face plate for some looks
    if (eyes === 'visor') parts.push(`<rect x="17" y="30" width="30" height="11" rx="5.5" fill="${INK}"/><circle cx="25" cy="35.5" r="2.6" fill="${accent}"/><circle cx="39" cy="35.5" r="2.6" fill="${accent}"/>`);
    const eyeSets = {
      dot: `<circle cx="25" cy="36" r="3.4" fill="${INK}"/><circle cx="39" cy="36" r="3.4" fill="${INK}"/>`,
      big: `<circle cx="24.5" cy="35" r="6.5" fill="#fff"/><circle cx="39.5" cy="35" r="6.5" fill="#fff"/><circle cx="25.5" cy="36" r="3.4" fill="${INK}"/><circle cx="40.5" cy="36" r="3.4" fill="${INK}"/><circle cx="26.6" cy="34.6" r="1.1" fill="#fff"/><circle cx="41.6" cy="34.6" r="1.1" fill="#fff"/>`,
      happy: `<path d="M20 37 Q25 31 30 37" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M34 37 Q39 31 44 37" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      sleepy: `<path d="M20 36 Q25 39 30 36" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M34 36 Q39 39 44 36" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      glasses: `<circle cx="24.5" cy="36" r="6" fill="#fff" stroke="${INK}" stroke-width="2.4"/><circle cx="39.5" cy="36" r="6" fill="#fff" stroke="${INK}" stroke-width="2.4"/><line x1="30.5" y1="36" x2="33.5" y2="36" stroke="${INK}" stroke-width="2.4"/><circle cx="25" cy="36.5" r="2.4" fill="${INK}"/><circle cx="40" cy="36.5" r="2.4" fill="${INK}"/>`,
      wink: `<circle cx="25" cy="36" r="3.4" fill="${INK}"/><path d="M34 37 Q39 32 44 37" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      owl: `<circle cx="24" cy="35" r="8" fill="#fff"/><circle cx="40" cy="35" r="8" fill="#fff"/><circle cx="24" cy="35" r="4" fill="${INK}"/><circle cx="40" cy="35" r="4" fill="${INK}"/><path d="M29 41 L32 46 L35 41 Z" fill="${accent}"/>`,
      visor: '',
    };
    parts.push(eyeSets[eyes] || eyeSets.dot);
    if (cheeks) parts.push(`<circle cx="18.5" cy="44" r="3.2" fill="#ff8fb1" opacity=".75"/><circle cx="45.5" cy="44" r="3.2" fill="#ff8fb1" opacity=".75"/>`);
    const mouths = {
      smile: `<path d="M25 46 Q32 52 39 46" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      grin: `<path d="M23 45 Q32 56 41 45 Z" fill="${INK}"/><path d="M27 48.5 Q32 51 37 48.5" fill="none" stroke="#ff8fb1" stroke-width="2.4" stroke-linecap="round"/>`,
      o: `<circle cx="32" cy="48" r="3.4" fill="${INK}"/>`,
      flat: `<line x1="26" y1="48" x2="38" y2="48" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
      cat: `<path d="M25 46 Q28.5 50 32 46 Q35.5 50 39 46" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
      grille: `<rect x="24" y="45" width="16" height="7" rx="2.5" fill="${INK}"/><line x1="29.3" y1="45" x2="29.3" y2="52" stroke="${fg}" stroke-width="1.2"/><line x1="34.7" y1="45" x2="34.7" y2="52" stroke="${fg}" stroke-width="1.2"/>`,
      none: '',
    };
    parts.push(mouths[mouth] ?? mouths.smile);
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
  ];

  window.AgentStationCharacters = { CHARACTERS, LOOKS, avatarSvg, byId: (id) => CHARACTERS.find((c) => c.id === id) };
})();
