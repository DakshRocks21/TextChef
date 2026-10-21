// Builds the highlight layer that sits behind a textarea: invisible markers, diff and regex marks.
// It renders the raw text (which may hold CRLF) so range offsets match the recipe text exactly.
export const MIRROR_LIMIT = 200_000;

const ZW = '\u200B\u200C\u200D\u2060\uFEFF\u00AD\u180E\u2061-\u2064\u200E\u200F\u202A-\u202E\u2066-\u2069';
const SPECIAL = new RegExp(`\\r\\n|[ \\t\\u00A0\\u202F\\u2007\\r\\n${ZW}]`, 'g');
const IS_ZW = new RegExp(`[${ZW}]`);
const GLYPH = { ' ': '\u2423', '\t': '\u2192', '\u00A0': '\u237D', '\u202F': '\u237D', '\u2007': '\u237D' };
const esc = (s) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
const eol = (g) => `<i class="g eol" data-g="${g}"></i>\n`;

function invis(s) {
  return esc(s).replace(SPECIAL, (c) => {
    if (c === '\r\n') return eol('\u240D\u21B5');
    if (c === '\n') return eol('\u21B5');
    if (c === '\r') return eol('\u240D');
    if (IS_ZW.test(c)) return `<i class="g zw" data-g="|">${c}</i>`;
    return `<i class="g" data-g="${GLYPH[c]}">${c}</i>`;
  });
}

// ranges: sorted [start, end, cls]. Returns HTML, or '' when there is nothing to draw.
export function renderMirror(text, ranges, showInvisibles) {
  if ((!ranges.length && !showInvisibles) || text.length > MIRROR_LIMIT) return '';
  const fmt = showInvisibles ? invis : esc;
  let out = '', pos = 0;
  for (const [s, e, cls] of ranges) {
    if (s < pos) continue;
    out += fmt(text.slice(pos, s)) + `<mark class="${cls}">${fmt(text.slice(s, e))}</mark>`;
    pos = e;
  }
  // The extra newline keeps a trailing empty line the same height as in the textarea.
  return out + fmt(text.slice(pos)) + '\n';
}

// Regex match ranges for the regex tester and find and replace, capped for speed.
export function regexRanges(text, pattern, flags = '', cap = 5000) {
  if (!pattern) return [];
  let re;
  try { re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'); } catch { return []; }
  const out = [];
  let m;
  while ((m = re.exec(text)) && out.length < cap) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out.push([m.index, m.index + m[0].length, 'hit']);
  }
  return out;
}
