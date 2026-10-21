// Fun text ops: fancy Unicode styles, flips and zalgo. Op modules import nothing.
export const category = { id: 'fun', name: 'Fun', color: '#ec4899', order: 9 };

const eol = (t) => (t.includes('\r\n') ? '\r\n' : t.includes('\r') && !t.includes('\n') ? '\r' : '\n');
const lines = (t) => t.split(/\r\n|\r|\n/);
const SEG = new Intl.Segmenter();

// UTF-16 output buffer. Plain units go straight into b; put() grows it so `rest` more units always fit.
const DEC = new TextDecoder('utf-16le', { ignoreBOM: true });
class Out {
  constructor(n) { this.b = new Uint16Array(n + 8); this.n = 0; }
  room(m) { if (this.n + m > this.b.length) { const b = new Uint16Array((this.n + m) * 1.5 + 8); b.set(this.b.subarray(0, this.n)); this.b = b; } }
  put(s, rest, back) {
    this.room(s.length + rest);
    if (back) for (let j = s.length - 1; j >= 0; j--) this.b[this.n++] = s.charCodeAt(j);
    else for (let j = 0; j < s.length; j++) this.b[this.n++] = s.charCodeAt(j);
  }
  rev(from) { this.b.subarray(from, this.n).reverse(); }
  done(wellFormed) { // TextDecoder turns lone surrogates into U+FFFD, so only use it when there are none
    if (wellFormed) return DEC.decode(this.b.subarray(0, this.n));
    const parts = [];
    for (let i = 0; i < this.n; i += 8192) parts.push(String.fromCharCode.apply(null, this.b.subarray(i, Math.min(this.n, i + 8192))));
    return parts.join('');
  }
}

// True when a code point is always a grapheme on its own next to other such code points (asked once each).
const JOINS = /[\p{M}\p{Grapheme_Extend}\p{Emoji_Modifier}\p{Regional_Indicator}\p{Cf}\p{Script=Hangul}]/u;
const ALONE = new Map();
const alone = (cp) => {
  if (cp < 128) return true;
  let r = ALONE.get(cp);
  if (r === undefined) {
    const c = String.fromCodePoint(cp), s = c + 'a' + c + c + '\u00E9' + c + '\r' + c + '\n\uD83D\uDE00' + c;
    r = (cp < 0xD800 || cp > 0xDFFF) && !JOINS.test(c) && [...SEG.segment(s)].length === [...s].length;
    ALONE.set(cp, r);
  }
  return r;
};
// Calls fn(start, end) for each grapheme cluster. Lone code points are clusters by themselves (and CR LF);
// Intl.Segmenter only runs on the stretches around marks, ZWJ, flags and the like, which keeps it fast.
const eachG = (t, fn) => {
  const n = t.length;
  let cp = t.codePointAt(0), a = n > 0 && alone(cp);
  for (let i = 0; i < n;) {
    let j = i + (cp > 0xFFFF ? 2 : 1);
    if (cp === 13 && t.charCodeAt(j) === 10) j++;
    const next = t.codePointAt(j), b = j >= n || alone(next);
    if (a && b) { fn(i, j); i = j; cp = next; a = b; continue; }
    // Segment up to a spot with lone code points on both sides, once 32+ units of them follow the last joining one.
    let p = i, pa = false, pcr = false, run = 0;
    while (p < n) {
      const c = t.codePointAt(p), ca = alone(c), w = c > 0xFFFF ? 2 : 1;
      if (pa && ca && run >= 32 && !(pcr && c === 10)) break;
      run = ca ? run + w : 0; pa = ca; pcr = c === 13; p += w;
    }
    for (const g of SEG.segment(t.slice(i, p))) fn(i + g.index, i + g.index + g.segment.length);
    i = p; cp = t.codePointAt(p); a = p < n && alone(cp);
  }
};
const WS = new Uint8Array(65536); // 1 = not \s, 2 = \s, filled lazily
const isWs = (t, s, e) => {
  if (e - s > 1) return /^\s+$/.test(t.slice(s, e));
  const k = t.charCodeAt(s);
  return (WS[k] ||= /\s/.test(t[s]) ? 2 : 1) === 2;
};
const isBreak = (t, s, e) => { const k = t.charCodeAt(s); return e - s === 1 ? k === 10 || k === 13 : e - s === 2 && k === 13 && t.charCodeAt(s + 1) === 10; };
// Build a lookup from two strings walked by code point.
const tbl = (from, to) => { const a = [...from], b = [...to], m = {}; a.forEach((c, i) => { m[c] = b[i]; }); return m; };
// Map a grapheme: whole match first, else its first code point (keeps trailing combining marks).
const mapG = (T, g) => { if (T[g]) return T[g]; const c = String.fromCodePoint(g.codePointAt(0)); return T[c] ? T[c] + g.slice(c.length) : g; };
// Reverses grapheme clusters, mapping each through T. With nl, line breaks become nl, and with perLine each
// line is reversed on its own. Clusters are written back to front, then the buffer is reversed in place.
const flip = (t, T, nl, perLine) => {
  const n = t.length, o = new Out(n), A = T && Array.from({ length: 128 }, (_, k) => T[String.fromCharCode(k)]);
  let ls = 0;
  eachG(t, (s, e) => {
    const k = t.charCodeAt(s);
    if (nl && (k === 10 || k === 13)) {
      if (perLine) { o.rev(ls); o.put(nl, n - e); ls = o.n; } else o.put(nl, n - e, true);
    } else if (e - s === 1 && k < 128 && !(A && A[k])) o.b[o.n++] = k;
    else if (e - s === 1 && k < 128 && A[k].length === 1) o.b[o.n++] = A[k].charCodeAt(0);
    else o.put(T ? mapG(T, t.slice(s, e)) : t.slice(s, e), n - e, true);
  });
  o.rev(ls);
  return o.done(t.isWellFormed());
};
// Maps text unit by unit: ASCII through table A (strings, undefined keeps it), other units through more(k).
const unitMap = (A, more = () => undefined) => (t) => {
  const n = t.length, o = new Out(n);
  for (let i = 0; i < n; i++) {
    const k = t.charCodeAt(i), r = k < 128 ? A[k] : more(k);
    if (r === undefined) o.b[o.n++] = k; else o.put(r, n - i - 1);
  }
  return o.done(t.isWellFormed());
};
const asciiTable = (f) => Array.from({ length: 128 }, (_, k) => f(String.fromCharCode(k), k) ?? undefined);
const UPSIDE = tbl(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?!.,\'"_&;()[]{}<>',
  '\u0250q\u0254p\u01DD\u025F\u0183\u0265\u1D09\u027E\u029El\u026Fuodb\u0279s\u0287n\u028C\u028Dx\u028Ez'
  + '\u2200\uA4ED\u0186\uA4F7\u018E\u2132\u2141HI\u017F\uA7B0\uA4F6WNO\u0500\u038C\uA4E4S\uA4D5\u2229\u039BMX\u2144Z'
  + '0\u0196\u1105\u0190\u3123\u03DB9\u31258' + '6\u00BF\u00A1\u02D9\',\u201E\u203E\u214B\u061B)(][}{><',
);
const MIRROR = tbl(
  'bdpq()[]{}<>/\\aceErRsSNKLFCPD?3',
  'dbqp)(][}{><\\/\u0252\u0254\u0258\u018E\u027F\u042F\uA645\uA644\u0418\uA4D8\u2143\uA7FB\u0186\uA7FC\u15E1\u2E2E\u0190',
);
const SMALL = tbl('abcdefghijklmnopqrstuvwxyz',
  '\u1D00\u0299\u1D04\u1D05\u1D07\uA730\u0262\u029C\u026A\u1D0A\u1D0B\u029F\u1D0D\u0274\u1D0F\u1D18\u01EB\u0280\uA731\u1D1B\u1D1C\u1D20\u1D21x\u028F\u1D22');
const SUPER = tbl('abcdefghijklmnopqrstuvwxyzABDEGHIJKLMNOPRTUVW0123456789+-=()',
  '\u1D43\u1D47\u1D9C\u1D48\u1D49\u1DA0\u1D4D\u02B0\u2071\u02B2\u1D4F\u02E1\u1D50\u207F\u1D52\u1D56q\u02B3\u02E2\u1D57\u1D58\u1D5B\u02B7\u02E3\u02B8\u1DBB'
  + '\u1D2C\u1D2E\u1D30\u1D31\u1D33\u1D34\u1D35\u1D36\u1D37\u1D38\u1D39\u1D3A\u1D3C\u1D3E\u1D3F\u1D40\u1D41\u2C7D\u1D42'
  + '\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079\u207A\u207B\u207C\u207D\u207E');
for (const c of 'CFSXYZ') SUPER[c] = SUPER[c.toLowerCase()];

// Mathematical Alphanumeric Symbols: [upper A, lower a, digit 0 or 0, holes filled by Letterlike Symbols].
const MATH = {
  'bold-text': ['Bold', 0x1D400, 0x1D41A, 0x1D7CE, {}],
  'italic-text': ['Italic', 0x1D434, 0x1D44E, 0, { h: 0x210E }],
  'bold-italic-text': ['Bold italic', 0x1D468, 0x1D482, 0, {}],
  'mono-text': ['Monospace', 0x1D670, 0x1D68A, 0x1D7F6, {}],
  'script-text': ['Script', 0x1D49C, 0x1D4B6, 0, { B: 0x212C, E: 0x2130, F: 0x2131, H: 0x210B, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211B, e: 0x212F, g: 0x210A, o: 0x2134 }],
  'double-struck-text': ['Double struck', 0x1D538, 0x1D552, 0x1D7D8, { C: 0x2102, H: 0x210D, N: 0x2115, P: 0x2119, Q: 0x211A, R: 0x211D, Z: 0x2124 }],
  'fraktur-text': ['Fraktur', 0x1D504, 0x1D51E, 0, { C: 0x212D, H: 0x210C, I: 0x2111, R: 0x211C, Z: 0x2128 }],
  'sans-bold-text': ['Sans bold', 0x1D5D4, 0x1D5EE, 0x1D7EC, {}],
};
// Accented Latin letters are styled as base letter plus combining marks.
const mathStyle = ([, U, L, D, H]) => {
  const A = asciiTable((c, k) => (/[A-Za-z]/.test(c) || (D && /[0-9]/.test(c))
    ? String.fromCodePoint(H[c] ?? (k <= 57 ? D + k - 48 : k <= 90 ? U + k - 65 : L + k - 97)) : undefined));
  const acc = new Map();
  return unitMap(A, (k) => {
    if (!((k >= 0xC0 && k <= 0x24F) || (k >= 0x1E00 && k <= 0x1EFF))) return undefined;
    let r = acc.get(k);
    if (r === undefined) { const d = String.fromCharCode(k).normalize('NFD'); acc.set(k, (r = /^[A-Za-z][\u0300-\u036F]+$/.test(d) ? A[d.charCodeAt(0)] + d.slice(1) : null)); }
    return r ?? undefined;
  });
};

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ABOVE = [...range(0x300, 0x315), ...range(0x33D, 0x344), 0x346, ...range(0x34A, 0x34C), ...range(0x350, 0x352), 0x357, 0x35B, ...range(0x363, 0x36F)];
const MIDDLE = range(0x334, 0x338);
const BELOW = [...range(0x316, 0x319), ...range(0x31C, 0x333), ...range(0x339, 0x33C), 0x345, ...range(0x347, 0x349), 0x34D, 0x34E, ...range(0x353, 0x356), 0x359, 0x35A];
const pick = (o, arr, n) => { for (let i = 0; i < n; i++) o.b[o.n++] = arr[(Math.random() * arr.length) | 0]; };
const rnd = (k) => (Math.random() * (k + 1)) | 0;

// Append a combining mark after every grapheme that passes the test.
const combine = (mark, skip) => (t) => {
  const o = new Out(2 * t.length);
  eachG(t, (s, e) => { for (let i = s; i < e; i++) o.b[o.n++] = t.charCodeAt(i); if (!skip(t, s, e)) o.b[o.n++] = mark; });
  return o.done(t.isWellFormed());
};

export default [
  {
    id: 'reverse-text',
    name: 'Reverse text',
    keywords: 'backwards flip reverse string words lines',
    options: [{ id: 'mode', label: 'Reverse', type: 'select', default: 'chars', choices: [['chars', 'Characters'], ['words', 'Words'], ['lines', 'Each line']] }],
    run(text, o) {
      if (o.mode === 'chars') return flip(text, null);
      if (o.mode !== 'words') return flip(text, null, eol(text), true);
      return lines(text).map((l) => l.split(/(\s+)/).reverse().join('')).join(eol(text));
    },
  },
  {
    id: 'upside-down',
    name: 'Upside down',
    keywords: 'flip rotate turn australian 180',
    options: [],
    run: (text) => flip(text, UPSIDE, eol(text)),
  },
  {
    id: 'mirror-text',
    name: 'Mirror text',
    keywords: 'mirrored reversed backwards flip horizontal',
    options: [],
    run: (text) => flip(text, MIRROR, eol(text), true),
  },
  { id: 'small-caps', name: 'Small caps', keywords: 'smallcaps tiny capitals fancy font', options: [], run: unitMap(asciiTable((c) => SMALL[c])) },
  { id: 'superscript', name: 'Superscript', keywords: 'tiny text small raised exponent fancy font', options: [], run: unitMap(asciiTable((c) => SUPER[c])) },
  ...Object.entries(MATH).map(([id, s]) => ({
    id, name: s[0] + ' text', keywords: `${s[0].toLowerCase()} fancy font unicode math style`, options: [], run: mathStyle(s),
  })),
  {
    id: 'bubble-text',
    name: 'Bubble text',
    keywords: 'circled letters circle fancy font',
    options: [],
    run: unitMap(asciiTable((c, k) => (/[A-Za-z0-9]/.test(c)
      ? String.fromCharCode(k === 48 ? 0x24EA : k <= 57 ? 0x2460 + k - 49 : k <= 90 ? 0x24B6 + k - 65 : 0x24D0 + k - 97) : undefined))),
  },
  {
    id: 'wide-text',
    name: 'Wide text',
    keywords: 'fullwidth vaporwave aesthetic spaced',
    options: [],
    run: unitMap(asciiTable((c, k) => (k === 32 ? '\u3000' : k > 32 && k < 127 ? String.fromCharCode(k + 0xFEE0) : undefined))),
  },
  { id: 'strikethrough', name: 'Strikethrough', keywords: 'strike through line cross out combining', options: [], run: combine(0x336, isWs) },
  { id: 'underline', name: 'Underline', keywords: 'underlined combining low line', options: [], run: combine(0x332, isBreak) },
  {
    id: 'zalgo',
    name: 'Zalgo',
    keywords: 'glitch creepy cursed combining marks chaos',
    options: [{ id: 'intensity', label: 'Intensity', type: 'range', default: 3, min: 1, max: 10 }],
    run(text, o) {
      let k = Math.min(10, Math.max(1, o.intensity | 0));
      if (text.length > 200000) k = Math.min(k, 2); // keep huge inputs fast and small
      const mid = k >= 5 ? Math.ceil(k / 5) : 0;
      const out = new Out(text.length * (k + 2));
      eachG(text, (s, e) => {
        out.room(e - s + 2 * k + mid);
        for (let i = s; i < e; i++) out.b[out.n++] = text.charCodeAt(i);
        if (!isWs(text, s, e)) { pick(out, ABOVE, 1 + rnd(k - 1)); pick(out, MIDDLE, rnd(mid)); pick(out, BELOW, 1 + rnd(k - 1)); }
      });
      return out.done(text.isWellFormed());
    },
  },
];
