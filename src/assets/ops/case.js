// Case ops. Op modules import nothing so they run in Node, the page and a worker.
export const category = { id: 'case', name: 'Case', color: '#8b5cf6', order: 3 };

const eol = (t) => (t.includes('\r\n') ? '\r\n' : t.includes('\r') && !t.includes('\n') ? '\r' : '\n');
const lines = (t) => t.split(/\r\n|\r|\n/);
const UP = Array.from({ length: 128 }, (_, k) => String.fromCharCode(k).toUpperCase());
const cap = (w) => {
  const k = w.charCodeAt(0);
  if (k < 128) return UP[k] + w.slice(1).toLowerCase();
  const c = String.fromCodePoint(w.codePointAt(0));
  return c.toUpperCase() + w.slice(c.length).toLowerCase();
};

// Code point classes for the fast scanners: ASCII from a table, anything else from \p{} once, then cached.
const LU = 1, LL = 2, LO = 4, NUM = 8, MARK = 16, ALNUM = LU | LL | LO | NUM;
const ASC = Uint8Array.from({ length: 128 }, (_, k) => (k >= 65 && k <= 90 ? LU : k >= 97 && k <= 122 ? LL : k >= 48 && k <= 57 ? NUM : 0));
const CLS = new Map();
const cls = (cp) => {
  if (cp < 128) return ASC[cp];
  let c = CLS.get(cp);
  if (c === undefined) {
    const s = String.fromCodePoint(cp);
    c = /\p{Lu}/u.test(s) ? LU : /\p{Ll}/u.test(s) ? LL : /\p{L}/u.test(s) ? LO : /\p{N}/u.test(s) ? NUM : /\p{M}/u.test(s) ? MARK : 0;
    CLS.set(cp, c);
  }
  return c;
};
// UTF-16 output buffer. ASCII goes straight into b; put() grows it so `rest` more units always fit.
const DEC = new TextDecoder('utf-16le', { ignoreBOM: true });
class Out {
  constructor(n) { this.b = new Uint16Array(n + 8); this.n = 0; }
  put(s, rest) {
    if (this.n + s.length + rest > this.b.length) { const b = new Uint16Array((this.n + s.length + rest) * 1.5 + 8); b.set(this.b.subarray(0, this.n)); this.b = b; }
    for (let j = 0; j < s.length; j++) this.b[this.n++] = s.charCodeAt(j);
  }
  done(wellFormed) { // TextDecoder turns lone surrogates into U+FFFD, so only use it when there are none
    if (wellFormed) return DEC.decode(this.b.subarray(0, this.n));
    const parts = [];
    for (let i = 0; i < this.n; i += 8192) parts.push(String.fromCharCode.apply(null, this.b.subarray(i, Math.min(this.n, i + 8192))));
    return parts.join('');
  }
}
const memo = (f) => { const m = new Map(); return (cp) => { let r = m.get(cp); if (r === undefined) m.set(cp, (r = f(String.fromCodePoint(cp), cls(cp)))); return r; }; };

// Split an identifier or phrase into words: fooBar, XMLHttpRequest, snake_case, kebab-case, spaces.
// Accents are dropped first (whole text at once). Words are runs of letters and digits, also split
// before an upper case letter that follows a lower case letter or digit, and in ABc before the B.
const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036F]/g, '').normalize('NFC');
const words = (line) => {
  const out = [];
  let start = -1, p1 = 0, p2 = 0, prev = 0;
  for (let i = 0; i < line.length;) {
    const cp = line.codePointAt(i), c = cls(cp) & ALNUM;
    if (!c) { if (start >= 0) out.push(line.slice(start, i)); start = -1; }
    else if (start < 0) start = i;
    else if (c === LU && (p1 === LL || p1 === NUM)) { out.push(line.slice(start, i)); start = i; }
    else if (c === LL && p1 === LU && p2 === LU) { out.push(line.slice(start, prev)); start = prev; }
    p2 = p1; p1 = c; prev = i;
    i += cp > 0xFFFF ? 2 : 1;
  }
  if (start >= 0) out.push(line.slice(start));
  return out;
};
const prog = (id, name, keywords, fmt) => ({
  id, name, keywords, options: [],
  run: (text) => lines(fold(text)).map((l) => { const w = words(l); return w.length ? fmt(w) : ''; }).join(eol(text)),
});
const lower = (w) => w.map((x) => x.toLowerCase());

const INV = memo((c, k) => (k === LU ? c.toLowerCase() : k === LL ? c.toUpperCase() : c));
const ALT = memo((c, k) => (k & (LU | LL | LO) ? [c.toUpperCase(), c.toLowerCase()] : null)); // [upper, lower]
const SMALL = new Set('a an the and but or nor for so yet as at by in of off on per to up via vs'.split(' '));
// Writes one part of a word: as is (acronyms with 2+ capitals and only capitals and digits, or aB inside),
// all lower case (small words) or capitalised.
const putPart = (o, t, s, e, rest, allCaps, small) => {
  let up = 0, acr = true, keep = false, asc = true, prev = 0;
  for (let i = s; i < e && !keep;) {
    const k = t.charCodeAt(i);
    let c;
    if (k < 128) { c = ASC[k]; i++; } else { const cp = t.codePointAt(i); c = cls(cp); asc = false; i += cp > 0xFFFF ? 2 : 1; }
    if (c === LU) { keep = prev === LL; up++; } else if (c !== NUM) acr = false;
    prev = c;
  }
  if (!allCaps && (keep || (acr && up >= 2))) { for (let i = s; i < e; i++) o.b[o.n++] = t.charCodeAt(i); return; }
  const lowerSmall = small && e - s <= (asc ? 3 : 6) && SMALL.has(t.slice(s, e).toLowerCase()); // small words have 3 letters at most
  if (!asc) { const p = t.slice(s, e); o.put(lowerSmall ? p.toLowerCase() : cap(p), rest); return; }
  for (let i = s; i < e; i++) { const k = t.charCodeAt(i); o.b[o.n++] = i === s && !lowerSmall ? (ASC[k] === LL ? k ^ 32 : k) : ASC[k] === LU ? k | 32 : k; }
};
const WORD = ALNUM | MARK;
const wordAt = (t, i, e) => i < e && (t.charCodeAt(i) < 128 ? ASC[t.charCodeAt(i)] : cls(t.codePointAt(i)) & WORD);
// Words are runs of letters, marks and digits joined by single apostrophes or hyphens.
// Small words stay lower case unless first or last in the line, or after : . ! or ?.
const titleCase = (t, smart) => {
  const n = t.length, nl = eol(t), o = new Out(n);
  for (let ls = 0; ;) {
    let le = ls, k;
    while (le < n && (k = t.charCodeAt(le)) !== 10 && k !== 13) le++;
    let allCaps = true;
    for (let i = ls; i < le && allCaps; i++) allCaps = (k = t.charCodeAt(i)) < 128 ? ASC[k] !== LL : cls(t.codePointAt(i)) !== LL;
    const ms = [];
    for (let i = ls; i < le;) {
      if (!wordAt(t, i, le)) { i++; continue; }
      const s = i;
      let hy = 0;
      for (;;) {
        while (wordAt(t, i, le)) i += t.charCodeAt(i) >= 0xD800 && t.codePointAt(i) > 0xFFFF ? 2 : 1;
        k = t.charCodeAt(i);
        if (i < le && (k === 39 || k === 0x2019 || k === 45) && wordAt(t, i + 1, le)) { i++; hy |= k === 45; } else break;
      }
      ms.push(s, i, hy);
    }
    let last = ls;
    for (let j = 0; j < ms.length; j += 3) {
      const s = ms[j], e = ms[j + 1], hy = ms[j + 2];
      let edge = j === 0 || j === ms.length - 3;
      for (let i = last; i < s; i++) { k = t.charCodeAt(i); o.b[o.n++] = k; edge ||= k === 58 || k === 46 || k === 33 || k === 63; }
      for (let p = s; p <= e;) {
        let q = p;
        while (q < e && t.charCodeAt(q) !== 45) q++;
        putPart(o, t, p, q, n - q, allCaps, smart && !edge && !hy);
        if (q < e) o.b[o.n++] = 45;
        p = q + 1;
      }
      last = e;
    }
    for (let i = last; i < le; i++) o.b[o.n++] = t.charCodeAt(i);
    if (le >= n) return o.done(t.isWellFormed());
    ls = le + (t.charCodeAt(le) === 13 && t.charCodeAt(le + 1) === 10 ? 2 : 1);
    o.put(nl, n - ls);
  }
};

export default [
  {
    id: 'upper-case',
    name: 'Upper case',
    keywords: 'uppercase capitals caps all caps',
    options: [],
    run: (text) => text.toUpperCase(),
  },
  {
    id: 'lower-case',
    name: 'Lower case',
    keywords: 'lowercase small letters',
    options: [],
    run: (text) => text.toLowerCase(),
  },
  {
    id: 'title-case',
    name: 'Title case',
    keywords: 'headline capitalise capitalize titles ap style',
    options: [{ id: 'style', label: 'Style', type: 'select', default: 'smart', choices: [['smart', 'Smart (AP style)'], ['all', 'Capitalise every word']] }],
    run: (text, o) => titleCase(text, o.style === 'smart'),
  },
  {
    id: 'sentence-case',
    name: 'Sentence case',
    keywords: 'sentences capitalise first letter',
    options: [],
    run: (text) => text.toLowerCase()
      .replace(/(^[^\p{L}\p{N}]*|[.!?]['"\u2019\u201D)\]]*\s+|(?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)[^\p{L}\p{N}]*)(\p{L})/gu, (m, p, c) => p + c.toUpperCase())
      .replace(/(?<![\p{L}\p{N}_])i(?![\p{L}\p{N}_]|\.\p{L})/gu, 'I'),
  },
  {
    id: 'capitalise-words',
    name: 'Capitalise words',
    keywords: 'capitalize first letter each word uppercase initials',
    options: [],
    run: (text) => text.replace(/(?<![\p{L}\p{N}\p{M}]['\u2019]?)\p{L}/gu, (c) => c.toUpperCase()),
  },
  {
    id: 'alternating-case',
    name: 'Alternating case',
    keywords: 'alternating spongebob mocking random case',
    options: [],
    run(text) {
      const n = text.length, o = new Out(n);
      let odd = 0;
      for (let i = 0; i < n; i++) {
        const k = text.charCodeAt(i);
        if (k < 128) o.b[o.n++] = ASC[k] & (LU | LL) ? ((odd ^= 1) ? k | 32 : k & 0xDF) : k;
        else {
          const cp = text.codePointAt(i), r = ALT(cp);
          if (cp > 0xFFFF) i++;
          o.put(r ? r[odd ^= 1] : String.fromCodePoint(cp), n - i - 1);
        }
      }
      return o.done(text.isWellFormed());
    },
  },
  {
    id: 'invert-case',
    name: 'Invert case',
    keywords: 'swap toggle reverse case',
    options: [],
    run(text) {
      const n = text.length, o = new Out(n);
      for (let i = 0; i < n; i++) {
        const k = text.charCodeAt(i);
        if (k < 128) o.b[o.n++] = ASC[k] & (LU | LL) ? k ^ 32 : k;
        else { const cp = text.codePointAt(i); if (cp > 0xFFFF) i++; o.put(INV(cp), n - i - 1); }
      }
      return o.done(text.isWellFormed());
    },
  },
  prog('snake-case', 'Snake case', 'snake underscore identifier variable', (w) => lower(w).join('_')),
  prog('kebab-case', 'Kebab case', 'kebab dash hyphen slug identifier', (w) => lower(w).join('-')),
  prog('dot-case', 'Dot case', 'dot period identifier', (w) => lower(w).join('.')),
  prog('camel-case', 'Camel case', 'camel identifier variable javascript', (w) => w[0].toLowerCase() + w.slice(1).map(cap).join('')),
  prog('pascal-case', 'Pascal case', 'pascal upper camel class identifier', (w) => w.map(cap).join('')),
  prog('constant-case', 'Constant case', 'constant screaming snake upper env', (w) => w.map((x) => x.toUpperCase()).join('_')),
  prog('path-case', 'Path case', 'path slash folder identifier', (w) => lower(w).join('/')),
  prog('train-case', 'Train case', 'train http header capitalised dash', (w) => w.map(cap).join('-')),
];
