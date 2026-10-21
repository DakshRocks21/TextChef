// Cleanup ops. Op modules import nothing so they run in Node, the page and a worker.
export const category = { id: 'cleanup', name: 'Cleanup', color: '#14b8a6', order: 2 };

const eol = (t) => (t.includes('\r\n') ? '\r\n' : t.includes('\r') && !t.includes('\n') ? '\r' : '\n');
const lines = (t) => t.split(/\r\n|\r|\n/);
const count = (text, re, to = '') => {
  let n = 0;
  const out = text.replace(re, (...a) => {
    const r = typeof to === 'function' ? to(...a) : to;
    if (r !== a[0]) n++;
    return r;
  });
  return { text: out, n };
};
const removed = (text, re, to) => {
  const r = count(text, re, to);
  return { text: r.text, note: `${r.n} removed` };
};

const SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const SQ = /[\u2018\u2019\u201A\u201B\u2032]/g;
const DQ = /[\u201C\u201D\u201E\u201F\u2033]/g;
const DASHES = /[\u2010\u2011\u2012\u2013\u2015\u2212\u2E3A\u2E3B\uFE58\uFE63\uFF0D]/g;
const INVISIBLE = /[\u200B\u200C\u2060\uFEFF\u00AD\u180E\u2061-\u2064\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
// ZWJ that does not sit between two pictographs (so family / profession emoji keep their joiner).
const LONE_ZWJ = /(?<![\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F])\u200D|\u200D(?!\p{Extended_Pictographic})/gu;

const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '\u00A9', reg: '\u00AE', trade: '\u2122',
  hellip: '\u2026', ndash: '\u2013', mdash: '\u2014', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  laquo: '\u00AB', raquo: '\u00BB', bull: '\u2022', middot: '\u00B7', deg: '\u00B0', times: '\u00D7', divide: '\u00F7',
  euro: '\u20AC', pound: '\u00A3', yen: '\u00A5', cent: '\u00A2', sect: '\u00A7', para: '\u00B6', shy: '\u00AD',
  iexcl: '\u00A1', iquest: '\u00BF', plusmn: '\u00B1', frac12: '\u00BD', frac14: '\u00BC', frac34: '\u00BE',
  eacute: '\u00E9', egrave: '\u00E8', ecirc: '\u00EA', aacute: '\u00E1', agrave: '\u00E0', acirc: '\u00E2',
  auml: '\u00E4', ouml: '\u00F6', uuml: '\u00FC', Auml: '\u00C4', Ouml: '\u00D6', Uuml: '\u00DC', iacute: '\u00ED',
  oacute: '\u00F3', uacute: '\u00FA', ccedil: '\u00E7', ntilde: '\u00F1', szlig: '\u00DF', Eacute: '\u00C9',
};
const decode = (s) => s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g, (m, d, h, n) => {
  if (n) return Object.hasOwn(ENT, n) ? ENT[n] : m;
  const cp = d ? +d : parseInt(h, 16);
  return cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : m;
});
const HTML_TAG = /<\/?(?:p|div|a|br|span|html|body|head|ul|ol|li|table|tr|td|th|h[1-6]|img|b|i|u|strong|em|script|style|meta|link|section|article|nav|header|footer|form|input|button|pre|code|blockquote|title)\b[^<>]*>/gi;

// Markdown inline syntax, applied outside code spans.
const mdInline = (p) => p
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\](?:\([^)]*\)|\[[^\]]*\])/g, '$1')
  .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
  .replace(/(?<!\\)(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
  .replace(/(?<![\\\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1')
  .replace(/(?<!\\)\*(?=\S)(.+?)(?<=[^\s\\])\*/g, '$1')
  .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1')
  .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1');

// One emoji: flag pair, keycap, or pictograph with modifiers, tags and ZWJ links.
const EMOJI = /\p{Regional_Indicator}{1,2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}])*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*/gu;
// Text-style symbols like (c), (r), TM and arrows only count when they carry the emoji selector.
const isEmoji = (m) => m.length > 1 || /\p{Emoji_Presentation}/u.test(m) || m.codePointAt(0) >= 0x2600;

const SPECIAL = {
  '\u00F8': 'o', '\u00D8': 'O', '\u0111': 'd', '\u0110': 'D', '\u0142': 'l', '\u0141': 'L', '\u00DF': 'ss',
  '\u00E6': 'ae', '\u00C6': 'AE', '\u0153': 'oe', '\u0152': 'OE', '\u00FE': 'th', '\u00DE': 'Th', '\u00F0': 'd',
  '\u00D0': 'D', '\u0131': 'i',
};

export default [
  {
    id: 'strip-html',
    name: 'Strip HTML',
    keywords: 'remove html tags markup plain text entities clean web page',
    options: [
      { id: 'decodeEntities', label: 'Decode entities', type: 'bool', default: true },
      { id: 'blockBreaks', label: 'Block tags to line breaks', type: 'bool', default: true },
    ],
    magic: true,
    detect(text) {
      const s = text.slice(0, 65536);
      if (!s) return 0;
      if (/^\s*<!doctype html|<html[\s>]/i.test(s)) return 0.95;
      const tags = (s.match(HTML_TAG) || []).length, closing = (s.match(/<\/[a-z][a-z0-9]*\s*>/gi) || []).length;
      if (tags < 2 || (!closing && !/<br\s*\/?>/i.test(s))) return 0;
      return Math.min(0.9, 0.4 + tags * 0.05);
    },
    run(text, o) {
      let t = text.replace(/\r\n?/g, '\n')
        .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
        .replace(/<(script|style|head|template|noscript)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
      if (o.blockBreaks) {
        t = t.replace(/<br\s*\/?>/gi, '\n')
          .replace(/<(?:li|tr|dt|dd)\b[^<>]*>/gi, '\n')
          .replace(/<\/(?:td|th)\s*>/gi, ' ')
          .replace(/<\/?(?:p|div|h[1-6]|ul|ol|table|blockquote|pre|section|article|header|footer|nav|aside|hr|dl|form|figure|main)\b[^<>]*>/gi, '\n\n');
      }
      t = t.replace(/<[!?/]?[a-zA-Z][^<>]*>/g, '');
      if (o.decodeEntities) t = decode(t);
      if (o.blockBreaks) t = t.replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
      return t.replace(/\n/g, eol(text));
    },
  },
  {
    id: 'strip-markdown',
    name: 'Strip Markdown',
    keywords: 'remove markdown md formatting plain text headings links bold',
    options: [],
    run(text) {
      const out = [];
      let fence = null;
      for (const l of lines(text)) {
        const f = l.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (fence) {
          if (f && f[1][0] === fence[0] && f[1].length >= fence.length && /^\s*[`~]+\s*$/.test(l)) fence = null;
          else out.push(l);
          continue;
        }
        if (f) { fence = f[1]; continue; }
        if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(l) || /^\s{0,3}={3,}\s*$/.test(l)) continue;
        if (l.includes('|') && l.includes('-') && /^[\s|:-]+$/.test(l)) continue;
        if (/^\s{0,3}\[[^\]]+\]:\s+\S/.test(l)) continue;
        let s = l;
        if (/^\s{0,3}#{1,6}(\s|$)/.test(s)) s = s.replace(/^\s*#+\s*/, '').replace(/\s+#+\s*$/, '');
        s = s.replace(/^\s*(?:>\s?)+/, '').replace(/^(\s*)(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/, '$1');
        if (/^\s*\|.*\|\s*$/.test(s)) s = s.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim()).join('\t');
        out.push(s.split(/(``[^`]+?``|`[^`]+`)/).map((p, i) => (i % 2 ? p.replace(/^`+ ?| ?`+$/g, '') : mdInline(p))).join(''));
      }
      return out.join(eol(text));
    },
  },
  {
    id: 'remove-formatting',
    name: 'Remove text formatting',
    keywords: 'paste as plain text fancy unicode bold italic font strikethrough zalgo clean styled',
    options: [],
    run: (text) => text
      .replace(/[\u0332\u0333\u0334\u0335\u0336\u0337\u0338]/g, '')
      .normalize('NFC')
      .replace(/[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20DC\uFE20-\uFE2F]{2,}/g, '')
      .normalize('NFKC')
      .replace(INVISIBLE, '').replace(LONE_ZWJ, '')
      .replace(SPACES, ' ').replace(SQ, "'").replace(DQ, '"').replace(DASHES, '-').replace(/\u2014/g, '-'),
  },
  {
    id: 'smart-quotes-to-straight',
    name: 'Smart quotes to straight',
    keywords: 'curly quotes typographic apostrophe ascii straighten',
    options: [{ id: 'guillemets', label: 'Guillemets too', type: 'bool', default: true }],
    run(text, o) {
      const re = o.guillemets ? /[\u2018\u2019\u201A\u201B\u2032\u2039\u203A]|[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g : /[\u2018\u2019\u201A\u201B\u2032]|[\u201C\u201D\u201E\u201F\u2033]/g;
      const r = count(text, re, (c) => (/[\u2018\u2019\u201A\u201B\u2032\u2039\u203A]/.test(c) ? "'" : '"'));
      return { text: r.text, note: `${r.n} replaced` };
    },
  },
  {
    id: 'fancy-dashes-to-hyphens',
    name: 'Fancy dashes to hyphens',
    keywords: 'en dash em dash minus hyphen ascii',
    options: [{ id: 'emDash', label: 'Em dash becomes', type: 'select', default: 'hyphen', choices: [['hyphen', '-'], ['double', '--']] }],
    run(text, o) {
      const a = count(text, DASHES, '-'), b = count(a.text, /\u2014/g, o.emDash === 'double' ? '--' : '-');
      return { text: b.text, note: `${a.n + b.n} replaced` };
    },
  },
  {
    id: 'remove-invisible',
    name: 'Remove invisible characters',
    keywords: 'zero width space joiner bom soft hyphen bidi hidden characters',
    options: [{ id: 'keepJoiners', label: 'Keep emoji joiners', type: 'bool', default: true }],
    run(text, o) {
      const a = count(text, INVISIBLE), b = count(a.text, o.keepJoiners ? LONE_ZWJ : /\u200D/g);
      return { text: b.text, note: `${a.n + b.n} removed` };
    },
  },
  {
    id: 'nbsp-to-space',
    name: 'Non-breaking spaces to spaces',
    keywords: 'nbsp unicode space thin space ideographic normal space',
    options: [],
    run(text) {
      const r = count(text, SPACES, ' ');
      return { text: r.text, note: `${r.n} replaced` };
    },
  },
  {
    id: 'remove-accents',
    name: 'Remove accents',
    keywords: 'diacritics strip accent marks ascii latin deaccent',
    options: [],
    run: (text) => text.normalize('NFD').replace(/(\p{Script=Latin})[\u0300-\u036F]+/gu, '$1').normalize('NFC').replace(/[\u00F8\u00D8\u0111\u0110\u0142\u0141\u00DF\u00E6\u00C6\u0153\u0152\u00FE\u00DE\u00F0\u00D0\u0131]/g, (c) => SPECIAL[c]),
  },
  {
    id: 'unicode-normalise',
    name: 'Unicode normalise',
    keywords: 'normalize nfc nfd nfkc nfkd compose decompose',
    options: [{ id: 'form', label: 'Form', type: 'select', default: 'NFC', choices: [['NFC', 'NFC'], ['NFD', 'NFD'], ['NFKC', 'NFKC'], ['NFKD', 'NFKD']] }],
    run: (text, o) => text.normalize(o.form),
  },
  {
    id: 'remove-emoji',
    name: 'Remove emoji',
    keywords: 'emoticons emojis strip pictographs flags smileys',
    options: [{ id: 'collapseSpaces', label: 'Collapse spaces', type: 'bool', default: true }],
    run(text, o) {
      const parts = [];
      let n = 0, last = 0, cut = false;
      const lastCh = () => (parts.length ? parts[parts.length - 1].slice(-1) : '');
      const push = (s) => {
        if (cut && o.collapseSpaces) {
          if (!parts.length || /[ \r\n]/.test(lastCh())) s = s.replace(/^ +/, '');
          if (!s || /^[\r\n]/.test(s)) while (parts.length && / $/.test(lastCh())) { const p = parts.pop().replace(/ +$/, ''); if (p) { parts.push(p); break; } }
        }
        if (s) parts.push(s);
        cut = false;
      };
      for (const m of text.matchAll(EMOJI)) {
        if (!isEmoji(m[0])) continue;
        push(text.slice(last, m.index));
        last = m.index + m[0].length;
        cut = true;
        n++;
      }
      push(text.slice(last));
      return { text: parts.join('').replace(/[\uFE0F\u20E3\p{Emoji_Modifier}\u{E0020}-\u{E007F}]/gu, ''), note: `${n} removed` };
    },
  },
  {
    id: 'remove-urls',
    name: 'Remove URLs',
    keywords: 'links web addresses http strip',
    options: [],
    run: (text) => removed(text, /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"']+/gi, (m) => m.match(/[.,;:!?)\]]*$/)[0]),
  },
  {
    id: 'remove-emails',
    name: 'Remove email addresses',
    keywords: 'emails strip addresses privacy',
    options: [],
    run: (text) => removed(text, /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu),
  },
  {
    id: 'remove-numbers',
    name: 'Remove numbers',
    keywords: 'digits strip figures numeric',
    options: [{ id: 'keepInWords', label: 'Keep digits inside words', type: 'bool', default: true }],
    run(text, o) {
      const a = count(text, /(?<![\p{L}\p{N}_.,])[-+\u2212]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?<=\d)(?![\p{L}\p{N}_]|[.,]\d)/gu);
      if (o.keepInWords) return { text: a.text, note: `${a.n} removed` };
      const b = count(a.text, /\d+/g);
      return { text: b.text, note: `${a.n + b.n} removed` };
    },
  },
  {
    id: 'remove-hashtags',
    name: 'Remove hashtags',
    keywords: 'hash tags social twitter instagram strip',
    options: [],
    run: (text) => removed(text, /(?<![\p{L}\p{N}_&#/])#[\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*/gu),
  },
  {
    id: 'remove-mentions',
    name: 'Remove mentions',
    keywords: 'at user handles social twitter strip',
    options: [],
    run: (text) => removed(text, /(?<![\p{L}\p{N}_.@])@[\p{L}\p{N}_]+/gu),
  },
  {
    id: 'remove-punctuation',
    name: 'Remove punctuation',
    keywords: 'strip punctuation marks commas periods symbols',
    options: [{ id: 'keepApostrophes', label: 'Keep apostrophes in words', type: 'bool', default: true }],
    run: (text, o) => (o.keepApostrophes
      ? removed(text, /((?<=\p{L})['\u2019](?=\p{L}))|\p{P}/gu, (m, keep) => (keep ? m : ''))
      : removed(text, /\p{P}/gu)),
  },
  {
    id: 'remove-special-chars',
    name: 'Remove special characters',
    keywords: 'symbols strip non alphanumeric clean',
    options: [{ id: 'keepBasic', label: 'Keep basic punctuation', type: 'bool', default: true }],
    run: (text, o) => removed(text, o.keepBasic ? /[^\p{L}\p{M}\p{N}\s.,!?'"\-:;()]|[\uFE00-\uFE0F]/gu : /[^\p{L}\p{M}\p{N}\s]|[\uFE00-\uFE0F]/gu),
  },
  {
    id: 'remove-non-ascii',
    name: 'Remove non-ASCII',
    keywords: 'ascii only strip unicode accents emoji',
    options: [{ id: 'replacement', label: 'Replace with', type: 'select', default: 'remove', choices: [['remove', 'Remove'], ['question', '?']] }],
    run: (text, o) => removed(text, /[^\x00-\x7F](?:\u200D[^\x00-\x7F]|[\p{M}\p{Emoji_Modifier}])*/gu, o.replacement === 'question' ? '?' : ''),
  },
];
