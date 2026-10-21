// Encode and decode ops. Op modules import nothing so they run in Node, the page and a worker.
export const category = { id: 'encode', name: 'Encode and decode', color: '#10b981', order: 6 };

const fail = (m) => { const e = new Error(m); e.name = 'OpError'; throw e; };
const eol = (t) => (t.includes('\r\n') ? '\r\n' : t.includes('\r') && !t.includes('\n') ? '\r' : '\n');
const lines = (t) => t.split(/\r\n|\r|\n/);
const utf8 = (s) => new TextEncoder().encode(s);
const fromUtf8 = (b) => {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b); } catch { return fail('Not valid UTF-8 text'); }
};
// Bytes to a Latin-1 binary string, chunked so 1 MB does not blow the stack.
const binStr = (b) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return s;
};
const binBytes = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
const fromCodePoints = (a) => {
  let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCodePoint.apply(null, a.slice(i, i + 0x8000));
  return s;
};
// Share of printable characters (tabs and line breaks count) in decoded text.
const printable = (s) => {
  let n = 0, p = 0;
  for (const ch of s) {
    n++;
    const c = ch.codePointAt(0);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127 && !(c >= 0x80 && c < 0xa0) && c !== 0xfffd)) p++;
  }
  return n ? p / n : 0;
};
const looseUtf8 = (b) => new TextDecoder('utf-8').decode(b);
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const BIN = Array.from({ length: 256 }, (_, i) => i.toString(2).padStart(8, '0'));
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');

const b64decode = (text) => {
  let s = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) fail('Not valid Base64');
  s = s.replace(/=+$/, '');
  if (s.length % 4 === 1) fail('Not valid Base64');
  try { return binBytes(atob(s + '='.repeat((4 - (s.length % 4)) % 4))); } catch { return fail('Not valid Base64'); }
};

// Named HTML entities. Latin-1 block 160..255 in order, then the rest as name:code.
const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml';
const MORE = 'amp:38 lt:60 gt:62 quot:34 apos:39 OElig:338 oelig:339 Scaron:352 scaron:353 Yuml:376 fnof:402 circ:710 tilde:732 ensp:8194 emsp:8195 thinsp:8201 zwnj:8204 zwj:8205 lrm:8206 rlm:8207 ndash:8211 mdash:8212 lsquo:8216 rsquo:8217 sbquo:8218 ldquo:8220 rdquo:8221 bdquo:8222 dagger:8224 Dagger:8225 bull:8226 hellip:8230 permil:8240 prime:8242 Prime:8243 lsaquo:8249 rsaquo:8250 oline:8254 euro:8364 trade:8482 larr:8592 uarr:8593 rarr:8594 darr:8595 harr:8596 sum:8721 minus:8722 radic:8730 infin:8734 asymp:8776 ne:8800 le:8804 ge:8805 alpha:945 beta:946 gamma:947 delta:948 mu:956 pi:960 Omega:937 loz:9674 spades:9824 clubs:9827 hearts:9829 diams:9830';
const ENT = Object.fromEntries([
  ...LATIN1.split(' ').map((n, i) => [n, 160 + i]),
  ...MORE.split(' ').map((p) => { const [n, c] = p.split(':'); return [n, +c]; }),
]);

const MORSE = Object.fromEntries('A.- B-... C-.-. D-.. E. F..-. G--. H.... I.. J.--- K-.- L.-.. M-- N-. O--- P.--. Q--.- R.-. S... T- U..- V...- W.-- X-..- Y-.-- Z--.. 0----- 1.---- 2..--- 3...-- 4....- 5..... 6-.... 7--... 8---.. 9----. ..-.-.- ,--..-- ?..--.. \'.----. !-.-.-- /-..-. (-.--. )-.--.- &.-... :---... ;-.-.-. =-...- +.-.-. --....- _..--.- ".-..-. $...-..- @.--.-.'
  .split(' ').map((p) => [p[0], p.slice(1)]));
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

const NATO = 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split(' ');
const DIGITS = 'Zero One Two Three Four Five Six Seven Eight Nine'.split(' ');
const UNNATO = Object.fromEntries([
  ...NATO.map((w, i) => [w.toLowerCase(), String.fromCharCode(97 + i)]),
  ...DIGITS.map((w, i) => [w.toLowerCase(), String(i)]),
  ['alpha', 'a'], ['juliet', 'j'], ['xray', 'x'], ['whisky', 'w'], ['niner', '9'], ['tree', '3'], ['fife', '5'],
]);

const SEPS = { space: ' ', none: '', colon: ':', '0x': ' ' };

// UTF-16 output buffer that grows as needed.
const DEC16 = new TextDecoder('utf-16le', { ignoreBOM: true });
class Out {
  constructor(n) { this.b = new Uint16Array(n + 8); this.n = 0; }
  put(s) {
    if (this.n + s.length > this.b.length) { const b = new Uint16Array((this.n + s.length) * 1.5 + 8); b.set(this.b.subarray(0, this.n)); this.b = b; }
    for (let j = 0; j < s.length; j++) this.b[this.n++] = s.charCodeAt(j);
  }
  done(wellFormed) { // TextDecoder turns lone surrogates into U+FFFD, so only use it when there are none
    if (wellFormed) return DEC16.decode(this.b.subarray(0, this.n));
    const parts = [];
    for (let i = 0; i < this.n; i += 8192) parts.push(String.fromCharCode.apply(null, this.b.subarray(i, Math.min(this.n, i + 8192))));
    return parts.join('');
  }
}
// Spells text code point by code point. f(c) gives 0 for whitespace, else [tokens, skipped count] (cached).
// Tokens join with spaces, words (split at whitespace) with ' / ', lines with the main line ending.
const speller = (f) => {
  const ascii = [], other = new Map();
  return (text) => {
    const n = text.length, nl = eol(text), o = new Out(n * 4);
    let inWord = false, lineUsed = false, skipped = 0;
    for (let i = 0; i < n; i++) {
      const k = text.charCodeAt(i);
      if (k === 10 || k === 13) { if (k === 13 && text.charCodeAt(i + 1) === 10) i++; o.put(nl); inWord = lineUsed = false; continue; }
      let r;
      if (k < 128) r = ascii[k] ??= f(String.fromCharCode(k));
      else {
        const cp = text.codePointAt(i);
        if (cp > 0xFFFF) i++;
        if ((r = other.get(cp)) === undefined) other.set(cp, (r = f(String.fromCodePoint(cp))));
      }
      if (r === 0) { inWord = false; continue; }
      skipped += r[1];
      for (const t of r[0]) { o.put(inWord ? ' ' : lineUsed ? ' / ' : ''); o.put(t); inWord = lineUsed = true; }
    }
    return { text: o.done(text.isWellFormed()), skipped };
  };
};
const morse = speller((c) => {
  if (/\s/.test(c)) return 0;
  const codes = [...c.toUpperCase()].map((x) => MORSE[x]);
  return [codes.filter(Boolean), codes.filter((x) => !x).length];
});
const nato = speller((c) => {
  if (/\s/.test(c)) return 0;
  const b = c.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  return [[/^[A-Z]$/.test(b) ? NATO[b.charCodeAt(0) - 65] : /^[0-9]$/.test(b) ? DIGITS[+b] : c], 0];
});

export default [
  {
    id: 'base64-encode',
    name: 'Base64 encode',
    keywords: 'base64 btoa encode mime',
    options: [
      { id: 'urlSafe', label: 'URL-safe alphabet', type: 'bool', default: false },
      { id: 'lineWrap', label: 'Wrap at 76 columns', type: 'bool', default: false },
    ],
    run(text, o) {
      let s = btoa(binStr(utf8(text)));
      if (o.urlSafe) s = s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return o.lineWrap ? s.replace(/.{76}(?=.)/g, '$&\n') : s;
    },
  },
  {
    id: 'base64-decode',
    name: 'Base64 decode',
    keywords: 'base64 atob decode mime',
    options: [],
    run: (text) => fromUtf8(b64decode(text)),
    magic: true,
    detect(text) {
      const t = text.slice(0, 65536).trim();
      if (/[ \t]/.test(t)) return 0;
      const s = t.replace(/\s+/g, '');
      if (s.length < 8 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) return 0;
      const pad = s.includes('=');
      if (pad && s.length % 4 && text.length <= 65536) return 0;
      if (!pad && !/[0-9+/_-]/.test(s) && !(/[a-z]/.test(s) && /[A-Z]/.test(s) && s.length >= 16)) return 0;
      const body = s.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
      if (body.length % 4 === 1) return 0;
      const cut = text.length > 65536 ? body.slice(0, body.length - (body.length % 4)) : body;
      let bytes;
      try { bytes = binBytes(atob(cut + '='.repeat((4 - (cut.length % 4)) % 4))); } catch { return 0; }
      const d = looseUtf8(bytes);
      if (!d.trim() || printable(d) < 0.9) return 0;
      return 0.9;
    },
  },
  {
    id: 'url-encode',
    name: 'URL encode',
    keywords: 'percent encode uri encodeuricomponent query string',
    options: [
      { id: 'mode', label: 'Mode', type: 'select', default: 'component', choices: [['component', 'Component (encodeURIComponent)'], ['full', 'Full URL (encodeURI)']] },
      { id: 'spacePlus', label: 'Space as +', type: 'bool', default: false },
    ],
    run(text, o) {
      const s = (o.mode === 'full' ? encodeURI : encodeURIComponent)(text.toWellFormed());
      return o.spacePlus ? s.replace(/%20/g, '+') : s;
    },
  },
  {
    id: 'url-decode',
    name: 'URL decode',
    keywords: 'percent decode uri decodeuricomponent query string unescape',
    options: [{ id: 'plusSpace', label: '+ as space', type: 'bool', default: true }],
    run(text, o) {
      try { return decodeURIComponent(o.plusSpace ? text.replace(/\+/g, ' ') : text); } catch { return fail('Not valid URL encoding'); }
    },
    magic: true,
    detect(text) {
      const t = text.slice(0, 65536);
      const hits = (t.match(/%[0-9A-Fa-f]{2}/g) || []).length;
      if (hits < 2) return 0;
      const spaces = (t.match(/ /g) || []).length;
      if (spaces > hits || spaces / t.length > 0.05) return 0;
      try { decodeURIComponent(t.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')); } catch { return 0; }
      return hits >= 3 ? 0.85 : 0.7;
    },
  },
  {
    id: 'html-entity-encode',
    name: 'HTML entity encode',
    keywords: 'html entities escape amp lt gt',
    options: [{ id: 'mode', label: 'Encode', type: 'select', default: 'basic', choices: [['basic', 'Special chars only (& < > " \')'], ['all', 'All non-ASCII too']] }],
    run(text, o) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      const s = text.replace(/[&<>"']/g, (c) => map[c]);
      return o.mode === 'all' ? s.replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`) : s;
    },
  },
  {
    id: 'html-entity-decode',
    name: 'HTML entity decode',
    keywords: 'html entities unescape amp nbsp numeric',
    options: [],
    run(text) {
      let n = 0;
      const out = text.replace(/&(?:#(\d{1,8})|#[xX]([0-9a-fA-F]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/g, (m, d, h, name) => {
        if (name) { if (!Object.hasOwn(ENT, name)) return m; n++; return String.fromCodePoint(ENT[name]); }
        const c = d ? parseInt(d, 10) : parseInt(h, 16);
        n++;
        return c === 0 || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff) ? '\uFFFD' : String.fromCodePoint(c);
      });
      return { text: out, note: `${n} decoded` };
    },
    magic: true,
    detect(text) {
      const t = text.slice(0, 65536);
      const m = t.match(/&(?:#\d{1,8}|#[xX][0-9a-fA-F]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g) || [];
      const known = m.filter((e) => e[1] === '#' || Object.hasOwn(ENT, e.slice(1, -1))).length;
      return known >= 2 ? (known >= 4 ? 0.85 : 0.7) : 0;
    },
  },
  {
    id: 'hex-encode',
    name: 'Hex encode',
    keywords: 'hexadecimal bytes base16 dump',
    options: [
      { id: 'separator', label: 'Separator', type: 'select', default: 'space', choices: [['space', 'Space'], ['none', 'None'], ['colon', ':'], ['0x', '0x prefix']] },
      { id: 'upper', label: 'Uppercase', type: 'bool', default: false },
    ],
    run(text, o) {
      const b = utf8(text), out = new Array(b.length), pre = o.separator === '0x' ? '0x' : '';
      for (let i = 0; i < b.length; i++) out[i] = pre + HEX[b[i]];
      const s = out.join(SEPS[o.separator]);
      return o.upper ? s.toUpperCase().replace(/0X/g, '0x') : s;
    },
  },
  {
    id: 'hex-decode',
    name: 'Hex decode',
    keywords: 'hexadecimal bytes base16 unhex',
    options: [],
    run(text) {
      const s = text.replace(/0x/gi, '').replace(/[\s:,]+/g, '');
      if (/[^0-9a-fA-F]/.test(s)) fail('Not valid hex');
      if (s.length % 2) fail('Hex has an odd number of digits');
      const b = new Uint8Array(s.length / 2);
      for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16);
      return fromUtf8(b);
    },
    magic: true,
    detect(text) {
      const t = text.slice(0, 65536).trim();
      if (!t || /[^0-9a-f\s:,x]/i.test(t)) return 0;
      let s = t.replace(/0x/gi, '').replace(/[\s:,]+/g, '');
      if (/[^0-9a-fA-F]/.test(s)) return 0;
      if (text.length > 65536) s = s.slice(0, s.length & ~1);
      if (s.length < 8 || s.length % 2) return 0;
      const b = new Uint8Array(s.length / 2);
      for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16);
      let d;
      try { d = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { if (text.length <= 65536) return 0; d = looseUtf8(b); }
      if (!d.trim() || printable(d) < 0.9) return 0;
      if (/^[0-9\s]+$/.test(t) && s.length < 16) return 0.3;
      return 0.9;
    },
  },
  {
    id: 'binary-encode',
    name: 'Binary encode',
    keywords: 'binary bits bytes 01 base2',
    options: [],
    run(text) {
      const b = utf8(text), out = new Array(b.length);
      for (let i = 0; i < b.length; i++) out[i] = BIN[b[i]];
      return out.join(' ');
    },
  },
  {
    id: 'binary-decode',
    name: 'Binary decode',
    keywords: 'binary bits bytes 01 base2',
    options: [],
    run(text) {
      const s = text.replace(/[\s,]+/g, '');
      if (/[^01]/.test(s)) fail('Not valid binary');
      if (s.length % 8) fail('Binary length is not a multiple of 8');
      const b = new Uint8Array(s.length / 8);
      for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 8, 8), 2);
      return fromUtf8(b);
    },
    magic: true,
    detect(text) {
      const t = text.slice(0, 65536).trim();
      if (!t || /[^01\s]/.test(t)) return 0;
      let groups = t.split(/\s+/);
      if (text.length > 65536) groups = groups.slice(0, -1);
      const spaced = groups.length >= 2 && groups.every((g) => g.length === 8);
      const joined = groups.length === 1 && t.length >= 16 && t.length % 8 === 0;
      if (!spaced && !joined) return 0;
      const s = groups.join(''), b = new Uint8Array(s.length / 8);
      for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 8, 8), 2);
      const d = looseUtf8(b);
      if (printable(d) < 0.9) return 0;
      return spaced ? 0.95 : 0.7;
    },
  },
  {
    id: 'decimal-encode',
    name: 'Decimal encode',
    keywords: 'char codes code points ascii numbers ord',
    options: [{ id: 'mode', label: 'Codes', type: 'select', default: 'codepoint', choices: [['codepoint', 'Code points'], ['utf8', 'UTF-8 bytes']] }],
    run(text, o) {
      if (o.mode === 'utf8') return utf8(text).join(' ');
      const out = [];
      for (const ch of text) out.push(ch.codePointAt(0));
      return out.join(' ');
    },
  },
  {
    id: 'decimal-decode',
    name: 'Decimal decode',
    keywords: 'char codes code points ascii numbers chr',
    options: [{ id: 'mode', label: 'Codes', type: 'select', default: 'codepoint', choices: [['codepoint', 'Code points'], ['utf8', 'UTF-8 bytes']] }],
    run(text, o) {
      const parts = text.split(/[\s,]+/).filter(Boolean);
      if (parts.some((p) => !/^\d{1,7}$/.test(p))) fail('Not valid decimal codes');
      const nums = parts.map(Number);
      if (o.mode === 'utf8') {
        if (nums.some((n) => n > 255)) fail('Byte values must be 0 to 255');
        return fromUtf8(Uint8Array.from(nums));
      }
      if (nums.some((n) => n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff))) fail('Not a valid code point');
      return fromCodePoints(nums);
    },
  },
  {
    id: 'unicode-escape',
    name: 'Unicode escape',
    keywords: 'unicode escape code point js es6 u+',
    options: [
      { id: 'mode', label: 'Escape', type: 'select', default: 'nonascii', choices: [['nonascii', 'Non-ASCII only'], ['all', 'All chars']] },
      { id: 'style', label: 'Style', type: 'select', default: 'js', choices: [['js', '\\uXXXX'], ['es6', '\\u{XXXXX}'], ['uplus', 'U+XXXX']] },
    ],
    run(text, o) {
      const B = '\\';
      return text.replace(o.mode === 'all' ? /[\s\S]/gu : /[^\x00-\x7f]/gu, (ch) => {
        const c = ch.codePointAt(0);
        if (o.style === 'es6') return B + 'u{' + hex4(c) + '}';
        if (o.style === 'uplus') return 'U+' + hex4(c);
        return ch.length === 2 ? B + 'u' + hex4(ch.charCodeAt(0)) + B + 'u' + hex4(ch.charCodeAt(1)) : B + 'u' + hex4(c);
      });
    },
  },
  {
    id: 'unicode-unescape',
    name: 'Unicode unescape',
    keywords: 'unicode unescape code point js es6 u+ decode',
    options: [],
    run(text) {
      const re = /\\u(d[89ab][0-9a-f]{2})\\u(d[c-f][0-9a-f]{2})|\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|U\+([0-9a-f]{4,6})|\\x([0-9a-f]{2})/gi;
      let n = 0;
      const out = text.replace(re, (m, hi, lo, braced, js, plus, x) => {
        if (hi) { n++; return String.fromCharCode(parseInt(hi, 16), parseInt(lo, 16)); }
        const c = parseInt(braced || js || plus || x, 16);
        if (c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) return m;
        n++;
        return String.fromCodePoint(c);
      });
      return { text: out, note: `${n} unescaped` };
    },
    magic: true,
    detect(text) {
      const n = (text.slice(0, 65536).match(/\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]{1,6}\}/g) || []).length;
      return n >= 2 ? (n >= 4 ? 0.85 : 0.7) : 0;
    },
  },
  {
    id: 'json-escape',
    name: 'JSON escape',
    keywords: 'json string escape quotes backslash',
    options: [{ id: 'quotes', label: 'Add quotes', type: 'bool', default: false }],
    run(text, o) {
      const s = JSON.stringify(text);
      return o.quotes ? s : s.slice(1, -1);
    },
  },
  {
    id: 'json-unescape',
    name: 'JSON unescape',
    keywords: 'json string unescape quotes backslash',
    options: [],
    run(text) {
      const t = text.trim();
      const q = t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"' ? t : '"' + text + '"';
      let v;
      try { v = JSON.parse(q.replace(/[\x00-\x1f]/g, (c) => '\\u' + hex4(c.charCodeAt(0)))); } catch { return fail('Not a valid JSON string'); }
      return v;
    },
  },
  {
    id: 'rot13',
    name: 'ROT13',
    keywords: 'rot13 cipher rotate letters',
    options: [],
    run: (text) => text.replace(/[a-zA-Z]/g, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); }),
  },
  {
    id: 'rot47',
    name: 'ROT47',
    keywords: 'rot47 cipher rotate ascii',
    options: [],
    run: (text) => text.replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94))),
  },
  {
    id: 'caesar',
    name: 'Caesar cipher',
    keywords: 'caesar shift cipher rotate letters',
    options: [{ id: 'shift', label: 'Shift', type: 'number', default: 3, min: -25, max: 25 }],
    run(text, o) {
      const k = (((o.shift | 0) % 26) + 26) % 26;
      return text.replace(/[a-zA-Z]/g, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + k) % 26) + b); });
    },
  },
  {
    id: 'morse-encode',
    name: 'Morse code encode',
    keywords: 'morse code dots dashes telegraph',
    options: [],
    run(text) {
      const { text: out, skipped } = morse(text);
      return { text: out, note: skipped ? `${skipped} skipped` : '' };
    },
  },
  {
    id: 'morse-decode',
    name: 'Morse code decode',
    keywords: 'morse code dots dashes telegraph',
    options: [],
    run(text) {
      let unknown = 0;
      const t = text.replace(/[\u2022\u00B7]/g, '.').replace(/[_\u2212\u2013]/g, '-');
      const out = lines(t).map((l) => l.trim().split(/\s*\/\s*|\s{3,}/).map((w) => w.split(/\s+/).filter(Boolean)
        .map((c) => UNMORSE[c] || (unknown++, '?')).join('')).filter(Boolean).join(' '));
      return { text: out.join(eol(text)), note: unknown ? `${unknown} unknown` : '' };
    },
    magic: true,
    detect(text) {
      const t = text.slice(0, 65536).trim();
      if (!/^[.\-/\s]+$/.test(t) || !/[.-]/.test(t)) return 0;
      const g = t.split(/[\s/]+/).filter(Boolean);
      return g.length >= 3 && g.every((c) => c.length <= 7) ? 0.9 : 0;
    },
  },
  {
    id: 'nato-phonetic',
    name: 'NATO phonetic alphabet',
    keywords: 'nato phonetic spelling alfa bravo charlie radio',
    options: [{ id: 'direction', label: 'Direction', type: 'select', default: 'encode', choices: [['encode', 'Text to NATO'], ['decode', 'NATO to text']] }],
    run(text, o) {
      const nl = eol(text);
      if (o.direction === 'decode') {
        return lines(text).map((l) => l.split('/').map((w) => w.split(/\s+/).filter(Boolean)
          .map((tok) => UNNATO[tok.toLowerCase()] ?? ([...tok].length === 1 ? tok : '?')).join('')).filter(Boolean).join(' ')).join(nl);
      }
      return nato(text).text;
    },
  },
];
