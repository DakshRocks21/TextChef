// Hash and generate ops. Op modules import nothing so they run in Node, the page and a worker.
export const category = { id: 'hash', name: 'Hash and generate', color: '#64748b', order: 8 };

const fail = (m) => { const e = new Error(m); e.name = 'OpError'; throw e; };
const eol = (t) => (t.includes('\r\n') ? '\r\n' : t.includes('\r') && !t.includes('\n') ? '\r' : '\n');
const lines = (t) => t.split(/\r\n|\r|\n/);
const utf8 = (s) => new TextEncoder().encode(s);
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const toHex = (b) => { let s = ''; for (let i = 0; i < b.length; i++) s += HEX[b[i]]; return s; };

// MD5 (RFC 1321) on bytes.
const MK = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
const MS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const md5 = (bytes) => {
  const n = bytes.length, len = (((n + 8) >>> 6) + 1) * 64, buf = new Uint8Array(len);
  buf.set(bytes);
  buf[n] = 0x80;
  const dv = new DataView(buf.buffer), M = new Int32Array(16);
  dv.setUint32(len - 8, (n * 8) >>> 0, true);
  dv.setUint32(len - 4, Math.floor(n / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let off = 0; off < len; off += 64) {
    for (let j = 0; j < 16; j++) M[j] = dv.getInt32(off + j * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; }
      else { f = c ^ (b | ~d); g = (7 * i) & 15; }
      f = (f + a + MK[i] + M[g]) | 0;
      const s = MS[((i >> 4) << 2) | (i & 3)];
      a = d; d = c; c = b;
      b = (b + ((f << s) | (f >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  const out = new Uint8Array(16), ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((w, i) => ov.setInt32(i * 4, w, true));
  return toHex(out);
};

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return ((c ^ -1) >>> 0).toString(16).padStart(8, '0');
};
const subtle = (alg) => async (b) => toHex(new Uint8Array(await crypto.subtle.digest(alg, b)));

const perLine = { id: 'perLine', label: 'Hash each line', type: 'bool', default: false };
const hashOp = (id, name, keywords, fn) => ({
  id, name, keywords, options: [perLine],
  async run(text, o) {
    if (!o.perLine) return fn(utf8(text));
    const out = await Promise.all(lines(text).map((l) => fn(utf8(l))));
    return out.join(eol(text));
  },
});

// Uniform random integers below n (n <= 256) via rejection sampling.
const randomInts = (count, n) => {
  const out = new Uint8Array(count), lim = 256 - (256 % n), buf = new Uint8Array(65536);
  let k = 0;
  while (k < count) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && k < count; i++) if (buf[i] < lim) out[k++] = buf[i] % n;
  }
  return out;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(v)) || lo));

const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nunc pulvinar sapien porta vitae'.split(' ');
const rnd = (n) => Math.floor(Math.random() * n);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const words = (n) => Array.from({ length: n }, () => WORDS[rnd(WORDS.length)]);
const sentence = () => {
  const w = words(6 + rnd(9));
  if (w.length > 8 && rnd(2)) w[3 + rnd(w.length - 5)] += ',';
  return cap(w.join(' ')) + '.';
};
const CLASSIC = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

export default [
  hashOp('md5', 'MD5 hash', 'md5 hash checksum digest', md5),
  hashOp('sha1', 'SHA-1 hash', 'sha1 sha-1 hash checksum digest', subtle('SHA-1')),
  hashOp('sha256', 'SHA-256 hash', 'sha256 sha-256 sha2 hash checksum digest', subtle('SHA-256')),
  hashOp('sha512', 'SHA-512 hash', 'sha512 sha-512 sha2 hash checksum digest', subtle('SHA-512')),
  hashOp('crc32', 'CRC32 checksum', 'crc32 crc checksum zip', crc32),
  {
    id: 'uuid-v4',
    name: 'UUID v4',
    keywords: 'uuid guid random id generate',
    options: [
      { id: 'count', label: 'How many', type: 'number', default: 1, min: 1, max: 1000 },
      { id: 'upper', label: 'Uppercase', type: 'bool', default: false },
    ],
    run(text, o) {
      const one = () => {
        if (crypto.randomUUID) return crypto.randomUUID();
        const b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        const h = toHex(b);
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
      };
      const s = Array.from({ length: clamp(o.count, 1, 1000) }, one).join('\n');
      return o.upper ? s.toUpperCase() : s;
    },
  },
  {
    id: 'lorem-ipsum',
    name: 'Lorem ipsum',
    keywords: 'lorem ipsum placeholder dummy filler text generate',
    options: [
      { id: 'unit', label: 'Unit', type: 'select', default: 'paragraphs', choices: [['paragraphs', 'Paragraphs'], ['sentences', 'Sentences'], ['words', 'Words']] },
      { id: 'count', label: 'How many', type: 'number', default: 3, min: 1, max: 1000 },
      { id: 'classic', label: 'Start with Lorem ipsum', type: 'bool', default: true },
    ],
    run(text, o) {
      const n = clamp(o.count, 1, 1000);
      if (o.unit === 'words') {
        const w = words(n);
        if (o.classic) CLASSIC.toLowerCase().replace(/[,.]/g, '').split(' ').slice(0, n).forEach((x, i) => { w[i] = x; });
        return cap(w.join(' '));
      }
      const sentences = (k) => Array.from({ length: k }, sentence);
      if (o.unit === 'sentences') {
        const s = sentences(n);
        if (o.classic) s[0] = CLASSIC;
        return s.join(' ');
      }
      const p = Array.from({ length: n }, () => sentences(4 + rnd(4)));
      if (o.classic) p[0][0] = CLASSIC;
      return p.map((s) => s.join(' ')).join('\n\n');
    },
  },
  {
    id: 'random-string',
    name: 'Random string',
    keywords: 'random string password token generate characters',
    options: [
      { id: 'length', label: 'Length', type: 'number', default: 16, min: 1, max: 10000 },
      { id: 'count', label: 'How many', type: 'number', default: 1, min: 1, max: 1000 },
      { id: 'upper', label: 'Uppercase A-Z', type: 'bool', default: true },
      { id: 'lower', label: 'Lowercase a-z', type: 'bool', default: true },
      { id: 'digits', label: 'Digits 0-9', type: 'bool', default: true },
      { id: 'symbols', label: 'Symbols', type: 'bool', default: false },
      { id: 'noAmbiguous', label: 'No look-alikes (0 O 1 l I)', type: 'bool', default: false },
    ],
    run(text, o) {
      let set = (o.upper ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '') + (o.lower ? 'abcdefghijklmnopqrstuvwxyz' : '')
        + (o.digits ? '0123456789' : '') + (o.symbols ? '!@#$%^&*()-_=+[]{};:,.<>?/~' : '');
      if (o.noAmbiguous) set = set.replace(/[0O1lI]/g, '');
      if (!set) fail('Pick at least one character set');
      const len = clamp(o.length, 1, 10000), count = clamp(o.count, 1, 1000);
      const r = randomInts(len * count, set.length), out = [];
      for (let i = 0; i < count; i++) {
        let s = '';
        for (let j = i * len; j < (i + 1) * len; j++) s += set[r[j]];
        out.push(s);
      }
      return out.join('\n');
    },
  },
  {
    id: 'invisible-text',
    name: 'Invisible text',
    keywords: 'invisible blank empty character whitespace name zero width',
    options: [
      { id: 'kind', label: 'Character', type: 'select', default: 'braille', choices: [['braille', 'Braille blank U+2800'], ['hangul', 'Hangul filler U+3164'], ['zwsp', 'Zero-width space'], ['space', 'Em space U+2003']] },
      { id: 'count', label: 'How many', type: 'number', default: 1, min: 1, max: 10000 },
    ],
    run(text, o) {
      const ch = { braille: '\u2800', hangul: '\u3164', zwsp: '\u200B', space: '\u2003' }[o.kind] || '\u2800';
      return ch.repeat(clamp(o.count, 1, 10000));
    },
  },
];
