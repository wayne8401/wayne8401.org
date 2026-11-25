// Free encyclopedia lookups via the Wikipedia API (no key).
const UA = { 'User-Agent': 'AgentStation/1.0 (open-source agent app)' };

export default {
  name: 'wikipedia', label: 'Wikipedia', icon: '📚',
  description: 'Look up a topic on Wikipedia and get a short, sourced summary. Good for definitions, people, places and history.',
  parameters: { type: 'object', properties: { topic: { type: 'string' }, language: { type: 'string', description: 'Wikipedia language code, default "en"' } }, required: ['topic'] },
  async run({ topic, language }) {
    const lang = /^[a-z-]{2,12}$/.test(language || '') ? language : 'en';
    const s = await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&search=${encodeURIComponent(topic)}`, { headers: UA, signal: AbortSignal.timeout(10000) })).json();
    const title = s?.[1]?.[0];
    if (!title) return `No Wikipedia article found for "${topic}".`;
    const r = await (await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: UA, signal: AbortSignal.timeout(10000) })).json();
    return `${r.title}: ${r.extract || 'No summary available.'}\nSource: ${r.content_urls?.desktop?.page || s[3]?.[0]}`;
  },
};
