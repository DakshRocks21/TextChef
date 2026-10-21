// Shared test helpers. Loads every op module straight from src.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const OPS_DIR = fileURLToPath(new URL('../src/assets/ops/', import.meta.url));

export async function loadModules() {
  const files = readdirSync(OPS_DIR).filter((f) => f.endsWith('.js')).sort();
  const mods = [];
  for (const f of files) {
    const m = await import(pathToFileURL(join(OPS_DIR, f)).href);
    mods.push({ file: f, category: m.category, ops: m.default });
  }
  return mods;
}

export async function loadOps() {
  const map = new Map();
  for (const m of await loadModules()) for (const op of m.ops) map.set(op.id, { ...op, category: m.category.id });
  return map;
}

export function defaults(op) {
  const o = {};
  for (const opt of op.options || []) o[opt.id] = opt.default;
  return o;
}

// Runs an op with defaults merged in and always resolves to { text, note }.
export async function run(op, text, opts = {}) {
  const r = await op.run(text, { ...defaults(op), ...opts });
  return typeof r === 'string' ? { text: r, note: '' } : { text: r.text, note: r.note || '' };
}

let cache;
export async function op(id) {
  cache ||= await loadOps();
  const o = cache.get(id);
  if (!o) throw new Error('No op ' + id);
  return o;
}

// Shorthand: await t('trim', '  a  ', { side: 'both' }) -> 'a'
export async function t(id, text, opts) {
  return (await run(await op(id), text, opts)).text;
}
