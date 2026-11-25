// Plugins: drop a .mjs file in server/plugins/ (or DATA_DIR/plugins/) and restart.
// Each file default-exports:
//   { name, description, parameters /* JSON Schema */, run: async (input, ctx) => string }
// See plugins/README.md for a template.

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadPlugins(dirs, onEvent = () => {}) {
  const out = [];
  for (const dir of dirs) {
    const names = await fs.readdir(dir).catch(() => []);
    for (const f of names.filter((n) => n.endsWith('.mjs')).sort()) {
      try {
        const mod = (await import(pathToFileURL(path.join(dir, f)).href)).default;
        if (!mod?.name || typeof mod.run !== 'function') throw new Error('needs a name and a run() function');
        const name = 'plugin_' + String(mod.name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
        out.push({ ...mod, name, label: mod.label || mod.name, icon: mod.icon || '🧩', file: f, parameters: mod.parameters || { type: 'object', properties: {} } });
      } catch (e) { onEvent('error', `Plugin ${f} failed to load: ${e.message}`); }
    }
  }
  return out;
}
