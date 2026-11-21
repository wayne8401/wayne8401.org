// Best time to post: commonly cited posting windows for TikTok, Instagram and Facebook (Central time).
const GUIDE = {
  tiktok: { windows: ['Tue–Thu 6–9 PM', 'Weekdays 7–9 AM', 'Sunday 7–9 PM'], tip: 'Evenings and late nights do best; post 3–5 times a week and keep videos short.' },
  instagram: { windows: ['Weekdays 11 AM–1 PM', 'Weekdays 7–9 PM', 'Tue–Thu is strongest'], tip: 'Reels reach new people at midday; Stories and carousels do well in the evening.' },
  facebook: { windows: ['Weekdays 9 AM–12 PM', 'Wed 11 AM–1 PM', 'Weekdays 1–3 PM'], tip: 'Mornings on weekdays; weekends are usually quieter.' },
};

export default {
  name: 'best_time_to_post', label: 'Best time to post', icon: '📅',
  description: 'Suggested posting windows for TikTok, Instagram or Facebook (Central time), with a tip. General guidance, not account-specific.',
  parameters: { type: 'object', properties: { platform: { type: 'string', enum: ['TikTok', 'Instagram', 'Facebook'], description: 'TikTok, Instagram or Facebook' } }, required: ['platform'] },
  async run({ platform }) {
    const key = String(platform || '').toLowerCase().replace(/[^a-z]/g, '').replace(/^(tt|tik.*)$/, 'tiktok').replace(/^(ig|insta.*)$/, 'instagram').replace(/^(fb|face.*)$/, 'facebook');
    const g = GUIDE[key];
    if (!g) return 'Pick TikTok, Instagram or Facebook.';
    return `Best times to post on ${{ tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' }[key]} (Central time):\n- ${g.windows.join('\n- ')}\nTip: ${g.tip}\nThese are common industry patterns. Check your own analytics after a few weeks and adjust.`;
  },
};
