// Smart chips: spot common problems in pasted text and map each to a fix step. Pure, no DOM.
// Order here is the order "Fix all" adds the steps in.

const count = (re) => (t) => {
  let n = 0;
  re.lastIndex = 0;
  while (re.exec(t)) n++;
  return n;
};

const INVIS = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD\u180E\u2061-\u2064\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const EMOJI_ZWJ = /\p{Extended_Pictographic}\uFE0F?\u200D(?=\p{Extended_Pictographic})/gu;

function dupLines(t) {
  const seen = new Set();
  let n = 0;
  for (const l of t.split(/\r\n|\r|\n/)) {
    const k = l.trim();
    if (!k) continue;
    if (seen.has(k)) n++;
    else seen.add(k);
  }
  return n;
}

function mixedEol(t) {
  const crlf = (t.match(/\r\n/g) || []).length;
  const lf = (t.match(/\n/g) || []).length - crlf;
  const cr = (t.match(/\r/g) || []).length - crlf;
  const kinds = [crlf, lf, cr].filter(Boolean);
  return kinds.length > 1 ? kinds.reduce((a, b) => a + b) - Math.max(...kinds) : 0;
}

export const CHIPS = [
  { id: 'invisible', label: 'Invisible chars', count: (t) => count(INVIS)(t) - count(EMOJI_ZWJ)(t), fix: ['remove-invisible', {}] },
  { id: 'nbsp', label: 'NBSP', count: count(/[\u00A0\u202F\u2007]/g), fix: ['nbsp-to-space', {}] },
  { id: 'quotes', label: 'Smart quotes', count: count(/[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F]/g), fix: ['smart-quotes-to-straight', {}] },
  { id: 'dashes', label: 'Fancy dashes', count: count(/[\u2010-\u2015\u2212]/g), fix: ['fancy-dashes-to-hyphens', {}] },
  { id: 'html', label: 'HTML tags', count: count(/<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/gi), fix: ['strip-html', {}] },
  { id: 'entities', label: 'HTML entities', count: count(/&(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/gi), fix: ['html-entity-decode', {}] },
  { id: 'accents', label: 'Accents', count: count(/[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF]|[\p{L}][\u0300-\u036F]/gu), fix: ['remove-accents', {}] },
  { id: 'emoji', label: 'Emoji', count: count(/\p{Extended_Pictographic}/gu), fix: ['remove-emoji', {}] },
  { id: 'tabs', label: 'Tabs', count: count(/\t/g), fix: ['tabs-to-spaces', {}] },
  { id: 'eol', label: 'Mixed line endings', count: mixedEol, fix: ['normalise-line-endings', {}] },
  { id: 'edges', label: 'Leading or trailing spaces', count: count(/^[ \t]+(?=\S)|(?<=\S)[ \t]+$/gm), fix: ['trim', {}] },
  { id: 'double', label: 'Double spaces', count: count(/(?<=\S) {2,}(?=\S)/g), fix: ['remove-extra-spaces', { trimLines: false, normaliseBreaks: false }] },
  { id: 'blank', label: 'Empty line runs', count: count(/(?:\r?\n|\r)[ \t]*(?:\r?\n|\r)(?:[ \t]*(?:\r?\n|\r))+/g), fix: ['collapse-blank-lines', {}] },
  { id: 'dupes', label: 'Duplicate lines', count: dupLines, fix: ['remove-duplicate-lines', {}] },
];

// Large inputs get checked on the first 512 KB only so typing stays smooth.
export function detectChips(text, limit = 512 * 1024) {
  const t = text.length > limit ? text.slice(0, limit) : text;
  const out = [];
  if (!t) return out;
  for (const c of CHIPS) {
    const n = c.count(t);
    if (n > 0) out.push({ id: c.id, label: c.label, count: n, fix: c.fix, partial: t !== text });
  }
  return out;
}
