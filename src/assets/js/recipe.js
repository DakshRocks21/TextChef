// Recipe model: run steps in order and (de)serialise to the URL hash. Pure, no DOM.
// A step is { id, opts, off, pause }. `off` skips it, `pause` stops the bake before it.

export function withDefaults(op, opts = {}) {
  const o = {};
  for (const opt of op.options || []) o[opt.id] = opt.id in opts ? opts[opt.id] : opt.default;
  return o;
}

// getOp(id) resolves to an op. upto limits how many steps run (for the Step button).
export async function runRecipe(steps, input, { getOp, upto = Infinity, onStep, signal } = {}) {
  let text = input;
  const notes = [];
  let ran = 0;
  for (let i = 0; i < steps.length && i < upto; i++) {
    const s = steps[i];
    if (signal?.aborted) return { text, notes, ran, error: null, aborted: true };
    if (s.pause && i > 0 && upto === Infinity) return { text, notes, ran, error: null, pausedAt: i };
    if (s.off) { notes[i] = ''; ran = i + 1; continue; }
    onStep?.(i, steps.length);
    try {
      const op = await getOp(s.id);
      const r = await op.run(text, withDefaults(op, s.opts));
      if (typeof r === 'string') { text = r; notes[i] = ''; }
      else { text = r.text; notes[i] = r.note || ''; }
    } catch (e) {
      const message = e && e.name === 'OpError' ? e.message : `Something broke: ${e?.message || e}`;
      return { text, notes, ran: i, error: { index: i, message } };
    }
    ran = i + 1;
  }
  return { text, notes, ran, error: null };
}

// URL-safe Base64 of UTF-8 JSON. Only non-default options are stored.
const b64e = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64d = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeSteps(steps, metaById) {
  return b64e(JSON.stringify(steps.map((s) => {
    const meta = metaById?.get(s.id);
    const opts = {};
    for (const [k, v] of Object.entries(s.opts || {})) {
      const def = meta?.options?.find((o) => o.id === k)?.default;
      if (v !== def) opts[k] = v;
    }
    const flags = (s.off ? 1 : 0) | (s.pause ? 2 : 0);
    const row = [s.id];
    if (Object.keys(opts).length || flags) row.push(opts);
    if (flags) row.push(flags);
    return row;
  })));
}

export function decodeSteps(str, metaById) {
  try {
    const rows = JSON.parse(b64d(str));
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => Array.isArray(r) && typeof r[0] === 'string' && (!metaById || metaById.has(r[0])))
      .map(([id, opts, flags]) => ({ id, opts: opts && typeof opts === 'object' ? opts : {}, off: !!(flags & 1), pause: !!(flags & 2) }));
  } catch {
    return [];
  }
}

export const encodeText = b64e;
export function decodeText(s) {
  try { return b64d(s); } catch { return null; }
}

// "#recipe=...&input=..." <-> { recipe, input }
export function parseHash(hash) {
  const out = {};
  for (const part of hash.replace(/^#/, '').split('&')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}
