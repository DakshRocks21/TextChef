// Format ops: JSON, CSV, slugs, Markdown lists. Op modules import nothing so they run in Node, the page and a worker.
export const category = { id: 'format', name: 'Format', color: '#0ea5e9', order: 7 };

const fail = (m) => { const e = new Error(m); e.name = 'OpError'; throw e; };
const eol = (t) => (t.includes('\r\n') ? '\r\n' : t.includes('\r') && !t.includes('\n') ? '\r' : '\n');
const lines = (t) => t.split(/\r\n|\r|\n/);
const noBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);

// JSON.parse with a readable error: 'Invalid JSON at line 3, column 7: Expected comma'.
const parseJSON = (text) => {
  const s = noBom(text);
  try { return JSON.parse(s); } catch (e) {
    const msg = String(e.message);
    const m = msg.match(/at position (\d+)/);
    const pos = m ? +m[1] : /Unexpected end/.test(msg) ? s.length : -1;
    const why = msg.replace(/^JSON\.parse: /, '').replace(/ in JSON at position.*$/s, '').replace(/,? "[\s\S]*(?:"|\.\.\.) is not valid JSON$/, '')
      .replace(/ after JSON$/, '').replace(/ of JSON input$/, '');
    if (pos < 0) return fail('Invalid JSON: ' + why);
    const before = s.slice(0, pos), line = (before.match(/\r\n|\r|\n/g) || []).length + 1;
    const col = pos - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'));
    return fail(`Invalid JSON at line ${line}, column ${col}: ${why}`);
  }
};
const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
};
const INDENT = { '2': 2, '4': 4, tab: '\t' };
const indentOpt = { id: 'indent', label: 'Indent', type: 'select', default: '2', choices: [['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tab']] };

// CSV (RFC 4180): quoted fields with "" escapes, delimiters and line breaks inside quotes, CRLF.
const DELIMS = { comma: ',', tab: '\t', semicolon: ';' };
const guessDelim = (text) => {
  const sample = lines(text.slice(0, 65536).replace(/"[^"]*"/g, '')).filter((l) => l.trim()).slice(0, 20);
  let best = ',', bestScore = -1;
  for (const d of [',', '\t', ';']) {
    const counts = sample.map((l) => l.split(d).length - 1);
    const total = counts.reduce((a, b) => a + b, 0);
    const score = total && counts.every((c) => c === counts[0]) ? 1e9 + counts[0] : total;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
};
const parseCSV = (text, d) => {
  const s = noBom(text), n = s.length, rows = [];
  let row = [], f = '', i = 0, q = false;
  while (i < n) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      const j = s.indexOf('"', i);
      const end = j < 0 ? n : j;
      f += s.slice(i, end); i = end; continue;
    }
    if (c === '"' && f === '') { q = true; i++; continue; }
    if (c === d) { row.push(f); f = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(f); rows.push(row); row = []; f = '';
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1; continue;
    }
    let j = i + 1, k; // plain run up to the next delimiter or line break (quotes inside a field are literal)
    while (j < n && (k = s[j]) !== d && k !== '\r' && k !== '\n') j++;
    f += s.slice(i, j); i = j;
  }
  if (q) fail('Unclosed quote in CSV');
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
};
const csvCell = (v, d) => {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.includes(d) || /["\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const cpLen = (s) => { let n = 0; for (const _ of s) n++; return n; };

const DIACRITIC = { '\u00DF': 'ss', '\u1E9E': 'SS', '\u00E6': 'ae', '\u00C6': 'AE', '\u00F8': 'o', '\u00D8': 'O', '\u0153': 'oe', '\u0152': 'OE', '\u0142': 'l', '\u0141': 'L', '\u0111': 'd', '\u0110': 'D', '\u00FE': 'th', '\u00DE': 'TH', '\u00F0': 'd', '\u00D0': 'D' };
// Slug classes: 1 letter or digit (kept), 2 dropped (marks, apostrophes), 3 '&' (reads as 'and'), 0 separator.
const SLUG_ASCII = Uint8Array.from({ length: 128 }, (_, k) => (/[A-Za-z0-9]/.test(String.fromCharCode(k)) ? 1 : k === 39 ? 2 : k === 38 ? 3 : 0));
const SLUG = new Map();
const slugCls = (cp) => {
  if (cp < 128) return SLUG_ASCII[cp];
  let c = SLUG.get(cp);
  if (c === undefined) { const ch = String.fromCodePoint(cp); SLUG.set(cp, (c = /[\p{M}\u2019]/u.test(ch) ? 2 : /[\p{L}\p{N}]/u.test(ch) ? 1 : 0)); }
  return c;
};
const slugify = (text, o) => {
  let s = text.replace(/[\u00DF\u1E9E\u00E6\u00C6\u00F8\u00D8\u0153\u0152\u0142\u0141\u0111\u0110\u00FE\u00DE\u00F0\u00D0]/g, (c) => DIACRITIC[c]).normalize('NFD');
  // Lower case before dropping marks gives the same letters, except for a final sigma next to a spacing mark.
  if (o.lowercase) s = (s.includes('\u03A3') ? s.replace(/\p{M}+/gu, '') : s).toLowerCase();
  const sep = o.separator;
  let b = new Uint16Array(s.length + 8), n = 0, gap = false;
  const put = (t, rest) => {
    if (n + t.length + rest > b.length) { const nb = new Uint16Array((n + t.length + rest) * 1.5); nb.set(b.subarray(0, n)); b = nb; }
    for (let j = 0; j < t.length; j++) b[n++] = t.charCodeAt(j);
  };
  for (let i = 0, k; i < s.length;) {
    const c = (k = s.charCodeAt(i)) < 128 ? SLUG_ASCII[k] : slugCls(k = s.codePointAt(i)), end = i + (k > 0xFFFF ? 2 : 1);
    if (c === 1) {
      if (gap && n) put(sep, s.length - i);
      gap = false;
      for (; i < end; i++) b[n++] = s.charCodeAt(i);
      continue;
    }
    if (c === 3) put(n ? sep + 'and' : 'and', s.length - end);
    if (c !== 2) gap = true;
    i = end;
  }
  s = new TextDecoder('utf-16le', { ignoreBOM: true }).decode(b.subarray(0, n)); // only letters and digits are kept, so no lone surrogates
  const max = o.maxLength | 0;
  let end = 0;
  for (let n = 0; n < max && end < s.length; n++) end += s.codePointAt(end) > 0xFFFF ? 2 : 1; // first max code points
  if (max > 0 && end < s.length) {
    let cut = s.slice(0, end);
    if (String.fromCodePoint(s.codePointAt(end)) !== sep) { const k = cut.lastIndexOf(sep); if (k > 0) cut = cut.slice(0, k); }
    s = cut.split(sep).filter(Boolean).join(sep);
  }
  return s;
};

export default [
  {
    id: 'json-beautify',
    name: 'JSON beautify',
    keywords: 'json pretty print format indent prettify',
    options: [indentOpt, { id: 'sortKeys', label: 'Sort keys', type: 'bool', default: false }],
    run(text, o) {
      const v = parseJSON(text);
      return JSON.stringify(o.sortKeys ? sortKeys(v) : v, null, INDENT[o.indent] ?? 2);
    },
    magic: true,
    detect(text) {
      const t = noBom(text).trim();
      if (!/^[{[]/.test(t)) return 0;
      if (text.length > 65536) return /[}\]]$/.test(t) ? 0.7 : 0;
      try { JSON.parse(t); return 0.95; } catch { return 0; }
    },
  },
  {
    id: 'json-minify',
    name: 'JSON minify',
    keywords: 'json compact compress one line minify',
    options: [],
    run: (text) => JSON.stringify(parseJSON(text)),
  },
  {
    id: 'json-validate',
    name: 'JSON validate',
    keywords: 'json check lint validate syntax',
    options: [],
    run(text) {
      const v = parseJSON(text);
      const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
      const note = v === null ? 'null' : Array.isArray(v) ? `array with ${plural(v.length, 'item')}`
        : typeof v === 'object' ? `object with ${plural(Object.keys(v).length, 'key')}` : typeof v;
      return { text: 'Valid JSON', note };
    },
  },
  {
    id: 'sort-json-keys',
    name: 'Sort JSON keys',
    keywords: 'json sort keys alphabetical order recursive',
    options: [indentOpt],
    run: (text, o) => JSON.stringify(sortKeys(parseJSON(text)), null, INDENT[o.indent] ?? 2),
  },
  {
    id: 'csv-to-json',
    name: 'CSV to JSON',
    keywords: 'csv tsv spreadsheet table convert json',
    options: [
      { id: 'delimiter', label: 'Delimiter', type: 'select', default: 'auto', choices: [['auto', 'Auto'], ['comma', ','], ['tab', 'Tab'], ['semicolon', ';']] },
      { id: 'header', label: 'First row is header', type: 'bool', default: true },
    ],
    run(text, o) {
      const rows = parseCSV(text, DELIMS[o.delimiter] || guessDelim(text));
      if (!o.header) return { text: JSON.stringify(rows, null, 2), note: `${rows.length} rows` };
      const [head = [], ...body] = rows;
      const out = body.map((r) => {
        const obj = {};
        head.forEach((k, i) => { obj[k] = r[i] ?? ''; });
        for (let i = head.length; i < r.length; i++) obj[`column ${i + 1}`] = r[i];
        return obj;
      });
      return { text: JSON.stringify(out, null, 2), note: `${out.length} rows` };
    },
    magic: true,
    detect(text) {
      const t = noBom(text.slice(0, 65536)).trim();
      if (/^[{[]/.test(t)) { try { JSON.parse(t); return 0; } catch { /* not JSON */ } }
      let ls = lines(t.replace(/"[^"]*"/g, '')).filter((l) => l.trim());
      if (text.length > 65536) ls = ls.slice(0, -1);
      ls = ls.slice(0, 20);
      if (ls.length < 3) return 0;
      for (const d of [',', '\t', ';']) {
        const c = ls.map((l) => l.split(d).length - 1);
        if (c[0] >= 1 && c.every((x) => x === c[0])) return 0.6;
      }
      return 0;
    },
  },
  {
    id: 'json-to-csv',
    name: 'JSON to CSV',
    keywords: 'json csv spreadsheet table convert export',
    options: [{ id: 'delimiter', label: 'Delimiter', type: 'select', default: 'comma', choices: [['comma', ','], ['tab', 'Tab'], ['semicolon', ';']] }],
    run(text, o) {
      const v = parseJSON(text), d = DELIMS[o.delimiter] || ',';
      if (!Array.isArray(v)) fail('JSON must be an array');
      const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
      let rows;
      if (v.length && v.every(isObj)) {
        const keys = [...new Set(v.flatMap((x) => Object.keys(x)))];
        rows = [keys, ...v.map((x) => keys.map((k) => x[k]))];
      } else rows = v.map((x) => (Array.isArray(x) ? x : [x]));
      return { text: rows.map((r) => r.map((c) => csvCell(c, d)).join(d)).join('\n'), note: `${v.length} rows` };
    },
  },
  {
    id: 'csv-to-markdown',
    name: 'CSV to Markdown table',
    keywords: 'csv markdown table md gfm convert',
    options: [{ id: 'header', label: 'First row is header', type: 'bool', default: true }],
    run(text, o) {
      const rows = parseCSV(text, guessDelim(text)).map((r) => r.map((c) => (/[|\r\n]/.test(c) ? c.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>') : c)));
      if (!rows.length) return '';
      const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
      if (!o.header) rows.unshift(Array.from({ length: cols }, (_, i) => `Column ${i + 1}`));
      const w = Array.from({ length: cols }, (_, i) => rows.reduce((m, r) => Math.max(m, cpLen(r[i] ?? '')), 3));
      const line = (r) => '| ' + w.map((n, i) => { const c = r[i] ?? ''; return c + ' '.repeat(n - cpLen(c)); }).join(' | ') + ' |';
      const out = [line(rows[0]), '| ' + w.map((n) => '-'.repeat(n)).join(' | ') + ' |', ...rows.slice(1).map(line)];
      return { text: out.join('\n'), note: `${rows.length - 1} rows` };
    },
  },
  {
    id: 'url-slug',
    name: 'URL slug',
    keywords: 'slug slugify permalink url friendly seo kebab',
    options: [
      { id: 'separator', label: 'Separator', type: 'select', default: '-', choices: [['-', 'Hyphen'], ['_', 'Underscore']] },
      { id: 'lowercase', label: 'Lowercase', type: 'bool', default: true },
      { id: 'maxLength', label: 'Max length (0 = no limit)', type: 'number', default: 0, min: 0, max: 1000 },
      { id: 'perLine', label: 'Each line', type: 'bool', default: false },
    ],
    run: (text, o) => (o.perLine ? lines(text).map((l) => slugify(l, o)).join(eol(text)) : slugify(text, o)),
  },
  {
    id: 'markdown-list',
    name: 'Markdown list',
    keywords: 'markdown list bullet numbered checkbox todo lines',
    options: [
      { id: 'style', label: 'Style', type: 'select', default: 'bullet', choices: [['bullet', '- Bullet'], ['numbered', '1. Numbered'], ['checkbox', '- [ ] Checkbox']] },
      { id: 'skipEmpty', label: 'Skip empty lines', type: 'bool', default: true },
    ],
    run(text, o) {
      const ls = lines(text);
      const lead = (l) => l.match(/^[ \t]*/)[0];
      const spaceIndents = ls.filter((l) => l.trim()).map((l) => lead(l)).filter((s) => s && !s.includes('\t')).map((s) => s.length);
      const unit = spaceIndents.length ? Math.max(1, Math.min(4, spaceIndents.reduce((a, b) => Math.min(a, b)))) : 2;
      const pad = o.style === 'numbered' ? '   ' : '  ';
      const counters = [];
      let prev = -1;
      const out = [];
      for (const l of ls) {
        if (!l.trim()) { if (!o.skipEmpty) out.push(''); continue; }
        const ws = lead(l);
        let level = (ws.match(/\t/g) || []).length + Math.floor(ws.replace(/\t/g, '').length / unit);
        level = Math.min(level, prev + 1);
        prev = level;
        counters.length = level + 1;
        counters[level] = (counters[level] || 0) + 1;
        const item = l.trim().replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '');
        const mark = o.style === 'numbered' ? `${counters[level]}.` : o.style === 'checkbox' ? '- [ ]' : '-';
        out.push(pad.repeat(level) + mark + ' ' + item);
      }
      return out.join(eol(text));
    },
  },
];
