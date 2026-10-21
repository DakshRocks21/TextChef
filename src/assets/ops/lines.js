// Line and list ops. Op modules import nothing so they run in Node, the page and a worker.
export const category = { id: 'lines', name: 'Lines and lists', color: '#f59e0b', order: 4 };

const fail = (m) => { const e = new Error(m); e.name = 'OpError'; throw e; };
const eol = (t) => (t.includes('\r\n') ? '\r\n' : t.includes('\r') && !t.includes('\n') ? '\r' : '\n');
// Splits into lines. A single trailing line break is kept aside so it is not treated as an empty line.
const parse = (t) => {
  const ls = t.split(/\r\n|\r|\n/), nl = eol(t);
  let tail = '';
  if (ls.length > 1 && ls[ls.length - 1] === '') { ls.pop(); tail = nl; }
  return { ls, nl, tail };
};
const out = (ls, p) => ls.join(p.nl) + (ls.length ? p.tail : '');
const blank = (l) => l.trim() === '';
const unesc = (s) => s.replace(/\\([ntr\\])/g, (m, c) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\' })[c]);
const reEsc = (s) => s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
const mkRe = (src, flags) => {
  try { return new RegExp(src, flags + 'u'); } catch {
    try { return new RegExp(src, flags); } catch (e) { fail('Invalid regex: ' + String(e.message).replace(/^Invalid regular expression: /, '')); }
  }
};
// Code point length without allocating.
const cpLen = (s) => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0xdc00 || c > 0xdfff) n++; } return n; };
// Uniform random integer in [0, max) from crypto.
const randInts = (count) => {
  const a = new Uint32Array(count);
  for (let i = 0; i < count; i += 16384) crypto.getRandomValues(a.subarray(i, Math.min(count, i + 16384)));
  return a;
};
const shuffle = (arr, take = arr.length) => {
  const a = arr.slice(), n = a.length, k = Math.min(take, n), r = randInts(k);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor((r[i] / 4294967296) * (n - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
};
const removedNote = (n) => `${n} removed`;
const nOpt = (def) => ({ id: 'n', label: 'Lines', type: 'number', default: def, min: 1, max: 1000000 });
const lead = /^[ \t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/;

// Parse one CSV-ish row. Quoted fields may contain the delimiter; "" is an escaped quote.
const parseRow = (line, d) => {
  const f = [];
  let cur = '', q = false, quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"' && cur.trim() === '' && !quoted) { q = true; quoted = true; cur = ''; }
    else if (c === d) { f.push(quoted ? cur : cur.trim()); cur = ''; quoted = false; }
    else if (!(quoted && c === ' ')) cur += c;
  }
  f.push(quoted ? cur : cur.trim());
  return f;
};
const guessDelim = (ls) => {
  const sample = ls.slice(0, 20).join('\n').replace(/"[^"]*"/g, '');
  let best = ',', max = 0;
  for (const d of ['\t', ',', ';', '|']) {
    const n = sample.split(d).length - 1;
    if (n > max) { max = n; best = d; }
  }
  return best;
};

// Words are runs of letters, marks, digits, _ and apostrophes; everything else sits between them.
const WORD_ASCII = Uint8Array.from({ length: 128 }, (_, k) => +/[A-Za-z0-9_']/.test(String.fromCharCode(k)));
const WORD_CP = new Map();
const wordCp = (cp) => {
  if (cp < 128) return WORD_ASCII[cp] === 1;
  let w = WORD_CP.get(cp);
  if (w === undefined) WORD_CP.set(cp, (w = /[\p{L}\p{M}\p{N}_'\u2019]/u.test(String.fromCodePoint(cp))));
  return w;
};
const hwsAt = (t, s, e) => { for (let i = s; i < e; i++) { const k = t.charCodeAt(i); if (k !== 32 && k !== 9 && k !== 0xA0) return false; } return true; };
const lowA = (k) => (k >= 65 && k <= 90 ? k | 32 : k);
// Same word? Compares text[a, a + len) with text[b, b + len) without slicing when it can.
const sameWord = (t, a, ae, aAscii, b, be, bAscii, cs) => {
  const len = ae - a;
  if (len === be - b) {
    let i = 0;
    while (i < len && t.charCodeAt(a + i) === t.charCodeAt(b + i)) i++;
    if (i === len) return true;
    if (cs) return false;
    if (aAscii && bAscii) { while (i < len && lowA(t.charCodeAt(a + i)) === lowA(t.charCodeAt(b + i))) i++; return i === len; }
  } else if (cs || (aAscii && bAscii)) return false;
  return t.slice(a, ae).toLowerCase() === t.slice(b, be).toLowerCase();
};
// Walks word and gap tokens; a removed word also takes the spaces before it (or after it, when there are none).
// Kept text is a list of [start, end) ranges, so nothing is copied until the end.
const dedupeWords = (t, o) => {
  const keep = [], seen = new Set(), all = o.scope === 'all';
  const emit = (s, e) => { if (keep[keep.length - 1] === s) keep[keep.length - 1] = e; else keep.push(s, e); };
  let prev = -1, prevE = 0, prevAscii = false, lastS = 0, lastHws = false, removed = 0, skipSep = false;
  for (let i = 0, j; i < t.length; i = j) {
    const isW = wordCp(t.codePointAt(i));
    let ascii = true;
    for (j = i; j < t.length;) { const cp = t.codePointAt(j); if (wordCp(cp) !== isW) break; ascii &&= cp < 128; j += cp > 0xFFFF ? 2 : 1; }
    if (!isW) {
      const h = hwsAt(t, i, j);
      if (skipSep && h) { skipSep = false; continue; }
      skipSep = false;
      emit(i, j); lastS = i; lastHws = h;
      if (!h) prev = -1;
      continue;
    }
    let dup;
    if (all) { const tk = t.slice(i, j), key = o.caseSensitive ? tk : tk.toLowerCase(); dup = seen.has(key); if (!dup) seen.add(key); }
    else dup = prev >= 0 && sameWord(t, prev, prevE, prevAscii, i, j, ascii, o.caseSensitive);
    if (dup) {
      removed++;
      if (lastHws) { keep[keep.length - 1] = lastS; if (keep[keep.length - 2] === lastS) keep.length -= 2; lastHws = false; } else skipSep = true;
      continue;
    }
    prev = i; prevE = j; prevAscii = ascii;
    emit(i, j); lastS = i; lastHws = false;
  }
  const parts = [];
  for (let k = 0; k < keep.length; k += 2) parts.push(t.slice(keep[k], keep[k + 1]));
  return { text: parts.join(''), note: removedNote(removed) };
};

const segSentences = (text) => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return Array.from(new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text), (s) => s.segment);
  return text.match(/[^.!?\r\n]*(?:[.!?]+|\r\n|\r|\n|$)\s*/g).filter(Boolean);
};

const LIST = /^[ \t]*(?:[-*+\u2022]|\d{1,9}[.)]|[a-zA-Z][.)])[ \t]+/;

export default [
  {
    id: 'sort-lines',
    name: 'Sort lines',
    keywords: 'order alphabetical alphabetize natural numeric length shuffle randomize az za',
    options: [
      { id: 'mode', label: 'Order', type: 'select', default: 'az', choices: [['az', 'A to Z'], ['za', 'Z to A'], ['natural', 'Natural (file2 before file10)'], ['length', 'By length'], ['numeric', 'Numeric'], ['shuffle', 'Shuffle']] },
      { id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: false },
    ],
    run(text, o) {
      const p = parse(text);
      if (o.mode === 'shuffle') return out(shuffle(p.ls), p);
      const col = new Intl.Collator(undefined, { sensitivity: o.caseSensitive ? 'variant' : 'accent', numeric: o.mode === 'natural', caseFirst: o.caseSensitive ? 'upper' : 'false' });
      let ls;
      if (o.mode === 'length') ls = p.ls.map((l) => [cpLen(l), l]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      else if (o.mode === 'numeric') {
        const num = (l) => { const m = l.match(/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/i); return m ? parseFloat(m[1]) : NaN; };
        ls = p.ls.map((l) => [num(l), l]).sort((a, b) => (isNaN(a[0]) ? (isNaN(b[0]) ? 0 : 1) : isNaN(b[0]) ? -1 : a[0] - b[0])).map((x) => x[1]);
      } else {
        ls = p.ls.slice().sort(col.compare);
        if (o.mode === 'za') ls.reverse();
      }
      return out(ls, p);
    },
  },
  {
    id: 'remove-duplicate-lines',
    name: 'Remove duplicate lines',
    keywords: 'dedupe unique distinct repeated lines',
    options: [
      { id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: true },
      { id: 'trim', label: 'Ignore surrounding spaces', type: 'bool', default: true },
      { id: 'keep', label: 'Keep', type: 'select', default: 'first', choices: [['first', 'Keep first'], ['last', 'Keep last']] },
      { id: 'ignoreEmpty', label: 'Keep empty lines', type: 'bool', default: false },
    ],
    run(text, o) {
      const p = parse(text), seen = new Set(), keep = [];
      const ls = o.keep === 'last' ? p.ls.slice().reverse() : p.ls;
      for (const l of ls) {
        let k = o.trim ? l.trim() : l;
        if (!o.caseSensitive) k = k.toLowerCase();
        if (o.ignoreEmpty && k === '') { keep.push(l); continue; }
        if (seen.has(k)) continue;
        seen.add(k);
        keep.push(l);
      }
      if (o.keep === 'last') keep.reverse();
      return { text: out(keep, p), note: removedNote(p.ls.length - keep.length) };
    },
  },
  {
    id: 'remove-duplicate-words',
    name: 'Remove duplicate words',
    keywords: 'repeated words the the dedupe',
    options: [
      { id: 'scope', label: 'Where', type: 'select', default: 'adjacent', choices: [['all', 'Anywhere'], ['adjacent', 'Adjacent only']] },
      { id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: false },
    ],
    run: (text, o) => dedupeWords(text, o),
  },
  {
    id: 'remove-duplicate-sentences',
    name: 'Remove duplicate sentences',
    keywords: 'repeated sentences dedupe',
    options: [{ id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: false }],
    run(text, o) {
      const seen = new Set(), keep = [];
      let removed = 0;
      for (const s of segSentences(text)) {
        let k = s.trim().replace(/\s+/g, ' ');
        if (!o.caseSensitive) k = k.toLowerCase();
        if (k && seen.has(k)) { removed++; continue; }
        seen.add(k);
        keep.push(s);
      }
      if (!removed) return { text, note: removedNote(0) };
      return { text: keep.join('').trimEnd() + text.slice(text.trimEnd().length), note: removedNote(removed) };
    },
  },
  {
    id: 'remove-duplicate-paragraphs',
    name: 'Remove duplicate paragraphs',
    keywords: 'repeated paragraphs blocks dedupe',
    options: [{ id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: true }],
    run(text, o) {
      const parts = text.split(/((?:\r\n|\r|\n)(?:[ \t]*(?:\r\n|\r|\n))+)/);
      const seen = new Set(), res = [];
      let removed = 0;
      for (let i = 0; i < parts.length; i += 2) {
        let k = parts[i].trim().replace(/\s+/g, ' ');
        if (!o.caseSensitive) k = k.toLowerCase();
        if (k && seen.has(k)) { removed++; continue; }
        seen.add(k);
        if (res.length) res.push(parts[i - 1]);
        res.push(parts[i]);
      }
      if (!removed) return { text, note: removedNote(0) };
      return { text: res.join('').trimEnd() + text.slice(text.trimEnd().length), note: removedNote(removed) };
    },
  },
  {
    id: 'show-duplicates',
    name: 'Show duplicate lines',
    keywords: 'find repeated lines duplicates only',
    options: [{ id: 'withCounts', label: 'Show counts', type: 'bool', default: false }],
    run(text, o) {
      const p = parse(text), counts = new Map();
      for (const l of p.ls) if (!blank(l)) counts.set(l, (counts.get(l) || 0) + 1);
      const dups = [...counts].filter(([, c]) => c > 1).map(([l, c]) => (o.withCounts ? `${c}\t${l}` : l));
      return { text: dups.join(p.nl), note: `${dups.length} duplicated` };
    },
  },
  {
    id: 'count-unique',
    name: 'Count unique lines',
    keywords: 'tally frequency histogram distinct lines count',
    options: [],
    run(text) {
      const p = parse(text), counts = new Map();
      let total = 0;
      for (const l of p.ls) if (!blank(l)) { total++; counts.set(l, (counts.get(l) || 0) + 1); }
      const rows = [...counts].sort((a, b) => b[1] - a[1]).map(([l, c]) => `${c}\t${l}`);
      return { text: rows.join(p.nl), note: `${counts.size} unique of ${total}` };
    },
  },
  {
    id: 'reverse-lines',
    name: 'Reverse lines',
    keywords: 'flip order upside down tac',
    options: [],
    run(text) { const p = parse(text); return out(p.ls.slice().reverse(), p); },
  },
  {
    id: 'number-lines',
    name: 'Number lines',
    keywords: 'line numbers count enumerate prefix',
    options: [
      { id: 'start', label: 'Start at', type: 'number', default: 1, min: -1000000, max: 1000000 },
      { id: 'separator', label: 'Separator', type: 'text', default: '. ', placeholder: '. ' },
      { id: 'skipEmpty', label: 'Skip empty lines', type: 'bool', default: false },
      { id: 'pad', label: 'Pad numbers', type: 'bool', default: false },
    ],
    run(text, o) {
      const p = parse(text), start = Math.trunc(Number(o.start) || 0);
      const count = o.skipEmpty ? p.ls.filter((l) => !blank(l)).length : p.ls.length;
      const w = Math.max(String(start).length, String(start + count - 1).length);
      let n = start;
      return out(p.ls.map((l) => {
        if (o.skipEmpty && blank(l)) return l;
        const s = String(n++);
        return (o.pad ? s.padStart(w, ' ') : s) + o.separator + l;
      }), p);
    },
  },
  {
    id: 'add-prefix-suffix',
    name: 'Add prefix and suffix',
    keywords: 'prepend append each line start end',
    options: [
      { id: 'prefix', label: 'Prefix', type: 'text', default: '' },
      { id: 'suffix', label: 'Suffix', type: 'text', default: '' },
      { id: 'skipEmpty', label: 'Skip empty lines', type: 'bool', default: true },
    ],
    run(text, o) {
      const p = parse(text);
      return out(p.ls.map((l) => (o.skipEmpty && blank(l) ? l : o.prefix + l + o.suffix)), p);
    },
  },
  {
    id: 'wrap-in-quotes',
    name: 'Wrap lines in quotes',
    keywords: 'quote each line string list array',
    options: [
      { id: 'quote', label: 'Quote', type: 'select', default: 'double', choices: [['double', '"'], ['single', "'"], ['backtick', '`']] },
      { id: 'comma', label: 'Add commas', type: 'bool', default: false },
      { id: 'skipEmpty', label: 'Skip empty lines', type: 'bool', default: true },
    ],
    run(text, o) {
      const p = parse(text), q = { double: '"', single: "'", backtick: '`' }[o.quote] || '"';
      const idx = [];
      p.ls.forEach((l, i) => { if (!(o.skipEmpty && blank(l))) idx.push(i); });
      const last = idx[idx.length - 1], res = p.ls.slice();
      for (const i of idx) res[i] = q + p.ls[i].replace(/\\/g, '\\\\').split(q).join('\\' + q) + q + (o.comma && i !== last ? ',' : '');
      return out(res, p);
    },
  },
  {
    id: 'join-lines',
    name: 'Join lines',
    keywords: 'merge lines delimiter comma separated implode',
    options: [
      { id: 'delimiter', label: 'Delimiter', type: 'text', default: ', ', placeholder: '\\n for new line, \\t for tab' },
      { id: 'skipEmpty', label: 'Skip empty lines', type: 'bool', default: true },
    ],
    run(text, o) {
      const ls = parse(text).ls.filter((l) => !(o.skipEmpty && blank(l)));
      return ls.join(unesc(o.delimiter));
    },
  },
  {
    id: 'split-to-lines',
    name: 'Split to lines',
    keywords: 'explode delimiter comma separated to list',
    options: [
      { id: 'delimiter', label: 'Delimiter', type: 'text', default: ',', placeholder: '\\t for tab' },
      { id: 'trim', label: 'Trim items', type: 'bool', default: true },
      { id: 'regex', label: 'Regex', type: 'bool', default: false },
    ],
    run(text, o) {
      if (!o.delimiter) return text;
      const sep = o.regex ? mkRe(o.delimiter, '') : unesc(o.delimiter);
      let parts = text.split(sep).filter((s) => s !== undefined);
      if (o.trim) parts = parts.map((s) => s.trim()).filter(Boolean);
      return { text: parts.join(eol(text)), note: `${parts.length} items` };
    },
  },
  {
    id: 'extract-column',
    name: 'Extract column',
    keywords: 'csv tsv field cut column delimiter',
    options: [
      { id: 'n', label: 'Column', type: 'number', default: 1, min: 1, max: 1000 },
      { id: 'delimiter', label: 'Delimiter', type: 'select', default: 'auto', choices: [['auto', 'Auto'], ['comma', ','], ['tab', 'Tab'], ['semicolon', ';'], ['pipe', '|']] },
    ],
    run(text, o) {
      const p = parse(text);
      const d = { comma: ',', tab: '\t', semicolon: ';', pipe: '|' }[o.delimiter] || guessDelim(p.ls);
      const n = Math.max(1, Math.trunc(o.n) || 1) - 1;
      return out(p.ls.map((l) => (l.includes(d) || n === 0 ? parseRow(l, d)[n] ?? '' : '')), p);
    },
  },
  {
    id: 'filter-lines',
    name: 'Filter lines',
    keywords: 'grep keep lines containing matching exclude search',
    options: [
      { id: 'term', label: 'Text', type: 'text', default: '' },
      { id: 'mode', label: 'Keep lines that', type: 'select', default: 'contains', choices: [['contains', 'Contains'], ['not', 'Does not contain']] },
      { id: 'regex', label: 'Regex', type: 'bool', default: false },
      { id: 'caseSensitive', label: 'Case sensitive', type: 'bool', default: false },
    ],
    run(text, o) {
      if (!o.term) return { text, note: '' };
      const re = mkRe(o.regex ? o.term : reEsc(o.term), o.caseSensitive ? '' : 'i');
      const p = parse(text), want = o.mode !== 'not';
      const keep = p.ls.filter((l) => re.test(l) === want);
      return { text: out(keep, p), note: `${keep.length} kept` };
    },
  },
  {
    id: 'head-lines',
    name: 'First lines',
    keywords: 'head top first n lines',
    options: [nOpt(10)],
    run(text, o) { const p = parse(text); return out(p.ls.slice(0, Math.max(0, o.n)), p); },
  },
  {
    id: 'tail-lines',
    name: 'Last lines',
    keywords: 'tail bottom last n lines',
    options: [nOpt(10)],
    run(text, o) { const p = parse(text); return out(o.n > 0 ? p.ls.slice(-o.n) : [], p); },
  },
  {
    id: 'random-lines',
    name: 'Random lines',
    keywords: 'pick sample random lines lottery',
    options: [nOpt(10)],
    run(text, o) { const p = parse(text); return out(shuffle(p.ls, Math.max(0, o.n)), p); },
  },
  {
    id: 'wrap-text',
    name: 'Wrap text',
    keywords: 'word wrap hard wrap line length columns fold',
    options: [
      { id: 'width', label: 'Width', type: 'number', default: 80, min: 10, max: 1000 },
      { id: 'breakLongWords', label: 'Break long words', type: 'bool', default: false },
    ],
    run(text, o) {
      const p = parse(text), w = Math.max(1, Math.trunc(o.width) || 80), res = [];
      for (const line of p.ls) {
        if (cpLen(line) <= w) { res.push(line); continue; }
        let indent = line.match(/^[ \t]*/)[0];
        if (cpLen(indent) >= w / 2) indent = '';
        const iw = cpLen(indent), words = [];
        for (const word of line.slice(indent.length).split(/[ \t]+/)) {
          if (!word) continue;
          if (o.breakLongWords && cpLen(word) > w - iw) {
            const cps = [...word];
            for (let i = 0; i < cps.length; i += w - iw) words.push(cps.slice(i, i + w - iw).join(''));
          } else words.push(word);
        }
        let cur = '', len = 0;
        for (const word of words) {
          const wl = cpLen(word);
          if (cur && len + 1 + wl <= w) { cur += ' ' + word; len += 1 + wl; continue; }
          if (cur) res.push(cur);
          cur = indent + word; len = iw + wl;
        }
        res.push(cur || indent);
      }
      return out(res, p);
    },
  },
  {
    id: 'unwrap-paragraphs',
    name: 'Unwrap paragraphs',
    keywords: 'join hard wrapped lines reflow email quotes paragraphs',
    options: [{ id: 'stripQuotes', label: 'Remove email quote marks', type: 'bool', default: false }],
    run(text, o) {
      const p = parse(text), res = [];
      let cur = null;
      const flush = () => { if (cur) res.push(cur.join(' ')); cur = null; };
      for (let l of p.ls) {
        if (o.stripQuotes) l = l.replace(/^[ \t]*>(?:[ \t]*>)*[ \t]?/, '');
        if (blank(l)) { flush(); res.push(l); continue; }
        if (!cur || LIST.test(l)) { flush(); cur = [l.replace(/[ \t]+$/, '')]; continue; }
        cur.push(l.trim());
      }
      flush();
      return out(res, p);
    },
  },
  {
    id: 'indent',
    name: 'Indent lines',
    keywords: 'indent add leading spaces tabs shift right',
    options: [
      { id: 'width', label: 'Amount', type: 'number', default: 2, min: 1, max: 64 },
      { id: 'char', label: 'With', type: 'select', default: 'space', choices: [['space', 'Spaces'], ['tab', 'Tab']] },
      { id: 'skipEmpty', label: 'Skip empty lines', type: 'bool', default: true },
    ],
    run(text, o) {
      const p = parse(text), unit = (o.char === 'tab' ? '\t' : ' ').repeat(Math.max(0, Math.trunc(o.width) || 0));
      return out(p.ls.map((l) => (o.skipEmpty && blank(l) ? l : unit + l)), p);
    },
  },
  {
    id: 'dedent',
    name: 'Dedent lines',
    keywords: 'unindent remove leading spaces outdent shift left',
    options: [{ id: 'all', label: 'Remove all leading space', type: 'bool', default: false }],
    run(text, o) {
      const p = parse(text);
      if (o.all) return out(p.ls.map((l) => l.replace(lead, '')), p);
      let pre = null;
      for (const l of p.ls) {
        if (blank(l)) continue;
        const ws = l.match(/^[ \t]*/)[0];
        if (pre === null) pre = ws;
        else { let i = 0; while (i < pre.length && i < ws.length && pre[i] === ws[i]) i++; pre = pre.slice(0, i); }
        if (!pre) break;
      }
      if (!pre) return text;
      return out(p.ls.map((l) => (blank(l) ? '' : l.slice(pre.length))), p);
    },
  },
];
