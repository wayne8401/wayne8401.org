// Run the Muse Bridge locally or on any Node host: BRIDGE_TOKEN=secret node bridge/dev-server.mjs
import http from 'node:http';
import fs from 'node:fs';
import { handleRequest } from './core.mjs';

const file = process.env.BRIDGE_FILE || './bridge-data.json';
let data = {}; try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new */ }
const store = { get: async (k) => data[k], set: async (k, v) => { data[k] = v; fs.writeFileSync(file, JSON.stringify(data)); } };
const port = +process.env.PORT || 8799;
http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method) ? undefined : body });
  const r = await handleRequest(request, store, process.env.BRIDGE_TOKEN || '');
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`Muse Bridge on http://localhost:${port}/bridge/mcp`));
