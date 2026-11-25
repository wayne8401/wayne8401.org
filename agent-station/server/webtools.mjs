// Free web search + page fetching for models without built-in web tools
// (Claude uses Anthropic's server-side web_search / web_fetch instead).
//
// Search: SearXNG (open-source, self-hostable) if SEARXNG_URL is set, otherwise
// DuckDuckGo's HTML endpoint. No API keys needed.

import dns from 'node:dns/promises';
import net from 'node:net';

const UA = 'Mozilla/5.0 (compatible; AgentStation/1.0)';

const decode = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

export async function webSearch(query) {
  const q = String(query || '').trim();
  if (!q) return 'Empty search query.';
  if (process.env.SEARXNG_URL) {
    const url = `${process.env.SEARXNG_URL.replace(/\/$/, '')}/search?format=json&q=${encodeURIComponent(q)}`;
    const j = await (await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })).json();
    const rows = (j.results || []).slice(0, 8);
    return rows.length ? rows.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${(r.content || '').slice(0, 300)}`).join('\n') : 'No results.';
  }
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `q=${encodeURIComponent(q)}`,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status}). Tip: set SEARXNG_URL to a SearXNG instance for reliable free search.`);
  const html = await res.text();
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m;
  while ((m = re.exec(html)) && out.length < 8) {
    let href = m[1].replace(/&amp;/g, '&');
    const u = href.match(/[?&]uddg=([^&]+)/);
    if (u) href = decodeURIComponent(u[1]);
    if (href.startsWith('//')) href = 'https:' + href;
    if (/duckduckgo\.com\/y\.js/.test(href)) continue; // ads
    out.push(`${out.length + 1}. ${decode(m[2])}\n   ${href}\n   ${decode(m[3] || '').slice(0, 300)}`);
  }
  return out.length ? out.join('\n') : 'No results (the search engine may be rate-limiting; try again or set SEARXNG_URL).';
}

// Refuse local / private network addresses so a web page can't trick an agent
// into reaching your router, other devices, or cloud metadata endpoints.
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

export async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Not a valid URL'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) links can be fetched');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new Error('That address is on a private network and is blocked');
  return u;
}

export async function webFetch(raw) {
  let url = await assertPublicUrl(raw);
  let res;
  for (let hop = 0; hop < 5; hop++) { // follow redirects manually so each hop is checked
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = await assertPublicUrl(new URL(res.headers.get('location'), url).href); continue; }
    break;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.href}`);
  const type = res.headers.get('content-type') || '';
  const reader = res.body.getReader();
  let size = 0; const chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; chunks.push(value); if (size > 3e6) { reader.cancel(); break; } }
  let text = Buffer.concat(chunks).toString('utf8');
  if (/html/i.test(type) || /^\s*<!doctype html|<html/i.test(text)) {
    const title = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    text = text
      .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ');
    text = (title ? `# ${decode(title)}\n\n` : '') + text.split('\n').map(decode).filter(Boolean).join('\n');
  }
  return text.length > 40000 ? text.slice(0, 40000) + '\n…[truncated]' : text;
}
