// Find and extract ops. Op modules import nothing so they run in Node, the page and a worker.
export const category = { id: 'find', name: 'Find and extract', color: '#ef4444', order: 5 };

const fail = (m) => { const e = new Error(m); e.name = 'OpError'; throw e; };
const unesc = (s) => s.replace(/\\([ntr\\])/g, (m, c) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\' })[c]);
const reEsc = (s) => s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
const badRe = (e) => fail('Invalid regex: ' + String(e.message).replace(/^Invalid regular expression: /, ''));
// Prefer the u flag; fall back to plain when the pattern only works without it.
const mkRe = (src, flags, wholeWord) => {
  try {
    return new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])` : src, flags + 'u');
  } catch {
    try { return new RegExp(wholeWord ? `\\b(?:${src})\\b` : src, flags); } catch (e) { badRe(e); }
  }
};
const termRe = (o) => mkRe(reEsc(unesc(o.term)), 'g' + (o.caseSensitive ? '' : 'i'), o.wholeWord);
const countAll = (re, text) => { let n = 0; for (const _ of text.matchAll(re)) n++; return n; };
const matchNote = (n) => (n === 0 ? 'No matches' : n === 1 ? '1 match' : `${n} matches`);
const pct = (c, total) => (total ? ((c / total) * 100).toFixed(1) : '0.0') + '%';

const uniqOpt = { id: 'unique', label: 'Unique only', type: 'bool', default: true };
const extract = (text, o, re, keep = () => true) => {
  let items = [];
  for (const m of text.matchAll(re)) {
    const v = typeof keep === 'function' ? keep(m[0]) : m[0];
    if (v === true) items.push(m[0]); else if (typeof v === 'string' && v) items.push(v);
  }
  if (o.unique) items = [...new Set(items)];
  return { text: items.join('\n'), note: `${items.length} found` };
};
const exOp = (id, name, keywords, re, keep) => ({ id, name, keywords, options: [uniqOpt], run: (text, o) => extract(text, o, re, keep) });

// URLs: strip trailing punctuation, and closing brackets that have no opener inside the URL.
const trimUrl = (u) => {
  for (;;) {
    const c = u[u.length - 1];
    const unbalanced = (open, close) => c === close && u.split(open).length < u.split(close).length;
    if ('.,;:!?\'"*'.includes(c) || unbalanced('(', ')') || unbalanced('[', ']') || unbalanced('{', '}')) u = u.slice(0, -1);
    else return u;
  }
};
const OCT = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const H4 = '[0-9a-f]{1,4}';
const IP = new RegExp(
  `(?<![\\p{L}\\p{N}_.:])(?:(?:${OCT}\\.){3}${OCT}(?![\\p{L}\\p{N}_]|\\.\\p{N})` +
    `|(?:(?:${H4}:){7}${H4}|(?:${H4}:){1,7}:(?:${H4}(?::${H4}){0,6})?|::(?:${H4}(?::${H4}){0,6})?)(?![\\p{L}\\p{N}_:]))`,
  'giu',
);
const MON = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const ORD = '(?:st|nd|rd|th)?';
const DATE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}([/.-])\\d{1,2}\\1\\d{4}|${MON} \\d{1,2}${ORD},? \\d{4}|\\d{1,2}${ORD} ${MON},? \\d{4})(?![\\p{L}\\p{N}])`,
  'giu',
);
const validDate = (s) => {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}$/);
  if (m) { const a = +m[1], b = +m[2]; return a >= 1 && b >= 1 && a <= 31 && b <= 31 && (a <= 12 || b <= 12); }
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\b/);
  return !!m && +m[1] >= 1 && +m[1] <= 31;
};

const STOP = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by ' +
  'can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how ' +
  'i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own ' +
  're same she should so some such than that the their theirs them themselves then there these they this those through to too under until ' +
  'up very was we were what when where which while who whom why will with would you your yours yourself yourselves also us may might must ' +
  'shall upon yet via per let get got one many much every either neither within without onto').split(' '));

// Word-like segments, as Intl.Segmenter finds them. ASCII runs between whitespace go through a scanner with
// the same word break rules (UAX 29: letters, digits, _ and . ' : , ; between letters or digits). Any other run
// is counted with the whitespace before it, and each distinct one is segmented once, which gives the same words.
const WSEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
const WB = Uint8Array.from({ length: 128 }, (_, k) => {
  const c = String.fromCharCode(k);
  return /[A-Za-z]/.test(c) ? 1 : /[0-9]/.test(c) ? 2 : c === ':' ? 3 : c === '.' || c === "'" ? 4 : c === ',' || c === ';' ? 5 : c === '_' ? 6 : 0;
});
const asciiWords = (t, s, e, out) => {
  const cl = (i) => (i >= s && i < e ? WB[t.charCodeAt(i)] : 0);
  let a = cl(s), from = s;
  for (let i = s + 1; i <= e; i++) {
    const b = cl(i), an = (x) => x === 1 || x === 2;
    const join = i < e && ((an(a) && an(b)) || (b === 6 && (an(a) || a === 6)) || (a === 6 && an(b))
      || (a === 1 && (b === 3 || b === 4) && cl(i + 1) === 1) || (b === 1 && (a === 3 || a === 4) && cl(i - 2) === 1)
      || (a === 2 && (b === 4 || b === 5) && cl(i + 1) === 2) || (b === 2 && (a === 4 || a === 5) && cl(i - 2) === 2));
    if (!join) { if (i - from > 1 || an(cl(from))) tally(out, t.slice(from, i)); from = i; }
    a = b;
  }
};
const tally = (m, w, c = 1) => m.set(w, (m.get(w) || 0) + c);
// The scanner was checked against V8's ICU; if this engine's segmenter disagrees on a probe, it is not used.
const PROBES = ['a:b', "a'b", 'a.b', '1,5', '1;5', "1'5", 'a_b', '_', '__', '_1', '1.a', 'a,b', '1:2', 'e.g.', 'x:'];
let asciiOk;
const checkAscii = () => PROBES.every((p) => {
  const a = new Map(), b = new Map();
  asciiWords(p, 0, p.length, a);
  for (const s of WSEG.segment(p)) if (s.isWordLike) tally(b, s.segment);
  return JSON.stringify([...a]) === JSON.stringify([...b]);
});
// Counts each word (a Map of word to count).
const words = (text) => {
  const out = new Map(), rest = new Map();
  if (!WSEG) { for (const w of text.match(/[\p{L}\p{N}']+/gu) || []) tally(out, w); return out; }
  const sp = (k) => k === 32 || (k >= 9 && k <= 13);
  for (let i = 0, n = text.length; i < n;) {
    if (sp(text.charCodeAt(i))) { i++; continue; }
    let j = i, asc = true, k;
    while (j < n && !sp(k = text.charCodeAt(j))) { asc &&= k < 128; j++; }
    if (asc && (asciiOk ??= checkAscii())) asciiWords(text, i, j, out); else tally(rest, text.slice(i && i - 1, j));
    i = j;
  }
  for (const [t, c] of rest) for (const s of WSEG.segment(t)) if (s.isWordLike) tally(out, s.segment, c);
  return out;
};
const NAMES = { ' ': 'space', '\t': 'tab', '\n': 'LF', '\r': 'CR', '\r\n': 'CRLF', '\u00A0': 'NBSP', '\u200B': 'ZWSP', '\uFEFF': 'BOM', '\u202F': 'NNBSP' };
const GSEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
// True when a code point is always a grapheme on its own next to other such code points (asked once each).
const JOINS = /[\p{M}\p{Grapheme_Extend}\p{Emoji_Modifier}\p{Regional_Indicator}\p{Cf}\p{Script=Hangul}]/u;
const ALONE = new Map();
const alone = (cp) => {
  if (cp < 128) return true;
  let r = ALONE.get(cp);
  if (r === undefined) {
    const c = String.fromCodePoint(cp), s = c + 'a' + c + c + '\u00E9' + c + '\r' + c + '\n\uD83D\uDE00' + c;
    r = (cp < 0xD800 || cp > 0xDFFF) && !JOINS.test(c) && [...GSEG.segment(s)].length === [...s].length;
    ALONE.set(cp, r);
  }
  return r;
};
// Counts graphemes: lone code points (and CR LF) directly, Intl.Segmenter only around marks, ZWJ, flags and the like.
const graphemes = (t) => {
  const out = new Map(), n = t.length;
  if (!GSEG) { for (const c of t) tally(out, c); return out; }
  const ascii = new Float64Array(128);
  let cp = t.codePointAt(0), a = n > 0 && alone(cp);
  for (let i = 0; i < n;) {
    let j = i + (cp > 0xFFFF ? 2 : 1);
    if (cp === 13 && t.charCodeAt(j) === 10) j++;
    const next = t.codePointAt(j), b = j >= n || alone(next);
    if (a && b) { if (j - i === 1 && cp < 128) ascii[cp]++; else tally(out, t.slice(i, j)); i = j; cp = next; a = b; continue; }
    // Segment up to a spot with lone code points on both sides, once 32+ units of them follow the last joining one.
    let p = i, pa = false, pcr = false, run = 0;
    while (p < n) {
      const c = t.codePointAt(p), ca = alone(c), w = c > 0xFFFF ? 2 : 1;
      if (pa && ca && run >= 32 && !(pcr && c === 10)) break;
      run = ca ? run + w : 0; pa = ca; pcr = c === 13; p += w;
    }
    for (const g of GSEG.segment(t.slice(i, p))) tally(out, g.segment);
    i = p; cp = t.codePointAt(p); a = p < n && alone(cp);
  }
  ascii.forEach((c, k) => { if (c) tally(out, String.fromCharCode(k), c); });
  return out;
};
const table = (counts, total) => [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, c]) => `${k}\t${c}\t${pct(c, total)}`).join('\n');

export default [
  {
    id: 'find-and-replace',
    name: 'Find and replace',
    keywords: 'search replace substitute regex sed swap',
    options: [
      { id: 'find', label: 'Find', type: 'text', default: '', placeholder: 'Use \\n for line break, \\t for tab' },
      { id: 'replace', label: 'Replace with', type: 'text', default: '', placeholder: 'Regex: $1, $&, $<name>' },
      { id: 'regex', label: 'Regex', type: 'bool', default: false },
      { id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: false },
      { id: 'wholeWord', label: 'Whole word', type: 'bool', default: false },
    ],
    run(text, o) {
      if (!o.find) return { text, note: '' };
      const re = mkRe(o.regex ? o.find : reEsc(unesc(o.find)), 'g' + (o.caseSensitive ? '' : 'i'), o.wholeWord);
      const n = countAll(re, text), rep = unesc(o.replace);
      if (!n) return { text, note: matchNote(0) };
      return { text: o.regex ? text.replace(re, rep) : text.replace(re, () => rep), note: matchNote(n) };
    },
  },
  {
    id: 'regex-tester',
    name: 'Regex tester',
    keywords: 'regular expression test match groups pattern',
    options: [
      { id: 'pattern', label: 'Pattern', type: 'text', default: '', placeholder: '(\\w+)@(\\w+)' },
      { id: 'flags', label: 'Flags', type: 'text', default: 'g', placeholder: 'gimsuy' },
    ],
    run(text, o) {
      if (!o.pattern) return { text, note: '' };
      let re;
      try { re = new RegExp(o.pattern, o.flags || ''); } catch (e) { badRe(e); }
      const show = (s) => (s ?? '').replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
      const rows = [], cap = 10000, all = re.global || re.sticky, uni = re.unicode || re.unicodeSets;
      re.lastIndex = 0;
      let m, more = false;
      while ((m = re.exec(text))) {
        if (rows.length === cap) { more = true; break; }
        let row = `${m.index}\t${show(m[0])}`;
        for (let i = 1; i < m.length; i++) row += `\t$${i}=${show(m[i])}`;
        rows.push(row);
        if (!all) break;
        if (m[0] === '') {
          const c = text.charCodeAt(re.lastIndex);
          re.lastIndex += uni && c >= 0xd800 && c <= 0xdbff ? 2 : 1;
          if (re.lastIndex > text.length) break;
        }
      }
      return { text: rows.join('\n'), note: more ? `${cap}+ matches` : `${rows.length} matches` };
    },
  },
  exOp('extract-emails', 'Extract emails', 'email addresses find pull mail', /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu, (s) => s.replace(/^\.+/, '')),
  exOp('extract-urls', 'Extract URLs', 'links urls web addresses find pull http', /(?<![\p{L}\p{N}_@.])(?:(?:https?|ftp):\/\/|www\.)[^\s<>"`\u201C\u201D\u2018\u2019\u200B-\u200D\u2060\uFEFF]+/giu, (s) => trimUrl(s).replace(/^(?:https?|ftp):\/\/$|^www\.$/i, '')),
  exOp('extract-numbers', 'Extract numbers', 'numbers digits integers decimals find pull', /(?:(?<![\p{L}\p{N}_])-)?(?<![\d.])(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?/gu),
  exOp('extract-hashtags', 'Extract hashtags', 'hashtags tags social twitter', /(?<![\p{L}\p{N}_&#])#[\p{L}\p{M}\p{N}_]*\p{L}[\p{L}\p{M}\p{N}_]*/gu),
  exOp('extract-ips', 'Extract IP addresses', 'ip ipv4 ipv6 addresses network', IP, (s) => s !== '::'),
  exOp('extract-dates', 'Extract dates', 'dates calendar iso find pull', DATE, validDate),
  {
    id: 'word-frequency',
    name: 'Word frequency',
    keywords: 'word count frequency most common words tally keywords',
    options: [
      { id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: false },
      { id: 'minLength', label: 'Min length', type: 'number', default: 1, min: 1, max: 100 },
      { id: 'stopWords', label: 'Skip common words', type: 'bool', default: false },
    ],
    run(text, o) {
      const counts = new Map();
      let total = 0;
      for (let [w, c] of words(text)) {
        if (!o.caseSensitive) w = w.toLowerCase();
        if ([...w].length < o.minLength || (o.stopWords && STOP.has(w.toLowerCase()))) continue;
        total += c;
        tally(counts, w, c);
      }
      return { text: table(counts, total), note: `${counts.size} unique words` };
    },
  },
  {
    id: 'char-frequency',
    name: 'Character frequency',
    keywords: 'letter count frequency characters histogram',
    options: [
      { id: 'ignoreWhitespace', label: 'Ignore whitespace', type: 'bool', default: false },
      { id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: true },
    ],
    run(text, o) {
      const counts = new Map();
      let total = 0;
      for (let [g, c] of graphemes(text)) {
        if (o.ignoreWhitespace && /^\s+$/.test(g)) continue;
        if (!o.caseSensitive) g = g.toLowerCase();
        total += c;
        tally(counts, g, c);
      }
      const named = new Map([...counts].map(([k, c]) => [NAMES[k] || k, c]));
      return { text: table(named, total), note: `${counts.size} unique` };
    },
  },
  {
    id: 'count-occurrences',
    name: 'Count occurrences',
    keywords: 'count matches how many times search term',
    options: [
      { id: 'term', label: 'Text', type: 'text', default: '' },
      { id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: false },
      { id: 'wholeWord', label: 'Whole word', type: 'bool', default: false },
    ],
    run(text, o) {
      if (!o.term) return { text: '0', note: '' };
      const n = countAll(termRe(o), text);
      return { text: String(n), note: matchNote(n) };
    },
  },
];
