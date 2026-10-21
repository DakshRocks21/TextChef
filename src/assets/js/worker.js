// The engine worker. Big inputs never live on the page: the page sends a Blob (a file, or a
// paste turned into a Blob) and gets back previews and stats. Full text only crosses over on
// request (copy), and downloads go out as Blobs.
import { getOp } from './registry.js';
import { runRecipe } from './recipe.js';
import { quickStats, fullStats, keywords } from './stats.js';
import { readSource } from './source.js';

const PREVIEW = 500_000;
let input = { key: null, text: '' };
const outputs = new Map(); // tab -> last output text

async function inputOf(m, progress) {
  if (typeof m.text === 'string') return m.text;
  const key = `${m.tab}:${m.version}`;
  if (input.key !== key) {
    input = { key: null, text: '' }; // let the old text go before reading the new one
    const text = await readSource(m.src, (done, total) => progress({ phase: 'read', done, total }));
    input = { key, text };
  }
  return input.text;
}

const describe = (t) => ({ length: t.length, preview: t.length > PREVIEW ? t.slice(0, PREVIEW) : t, stats: quickStats(t) });

function keep(tab, text) {
  outputs.delete(tab);
  outputs.set(tab, text);
  while (outputs.size > 2) outputs.delete(outputs.keys().next().value);
}

const handlers = {
  async load(m, progress) {
    return describe(await inputOf(m, progress));
  },
  async bake(m, progress) {
    const text = await inputOf(m, progress);
    const r = await runRecipe(m.steps, text, {
      getOp,
      upto: m.upto ?? Infinity,
      onStep: (i, n) => progress({ phase: 'step', i, n, id: m.steps[i].id }),
    });
    keep(m.tab, r.text);
    const out = { notes: r.notes, ran: r.ran, error: r.error, pausedAt: r.pausedAt, ...describe(r.text) };
    if (r.text.length <= (m.fullLimit ?? 0)) out.full = r.text;
    return out;
  },
  output(m) {
    const t = outputs.get(m.tab);
    if (t == null) throw Object.assign(new Error('Bake again first'), { name: 'OpError' });
    return m.as === 'blob' ? new Blob([t], { type: 'text/plain;charset=utf-8' }) : t;
  },
  async fullstats(m, progress) {
    const t = m.which === 'output' ? outputs.get(m.tab) ?? '' : await inputOf(m, progress);
    return { stats: fullStats(t), keys: keywords(t, { stopWords: m.stopWords }) };
  },
};

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    const result = await handlers[type](data, (progress) => self.postMessage({ id, progress }));
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: { name: e?.name || 'Error', message: String(e?.message || e) } });
  }
};
