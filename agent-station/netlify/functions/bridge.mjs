// Netlify Function that hosts the Muse Bridge (see bridge/core.mjs).
// Set BRIDGE_TOKEN in Netlify → Site configuration → Environment variables, then redeploy.
import { getStore } from '@netlify/blobs';
import { handleRequest } from '../../bridge/core.mjs';

export default async (request) => {
  const blobs = getStore({ name: 'agent-station-bridge', consistency: 'strong' });
  const store = { get: (k) => blobs.get(k, { type: 'json' }), set: (k, v) => blobs.setJSON(k, v) };
  return handleRequest(request, store, process.env.BRIDGE_TOKEN || '');
};

export const config = { path: ['/bridge/mcp', '/bridge/sync', '/bridge/health'] };
