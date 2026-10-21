// Whitespace ops. Op modules import nothing so they run in Node, the page and a worker.
export const category = { id: 'whitespace', name: 'Whitespace', color: '#3b82f6', order: 1 };

// Horizontal whitespace: space, tab, NBSP and the Unicode space separators. Not line breaks, not zero-width.
const H = '[ \\t\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]';
const eol = (t) => (t.includes('\r\n') ? '\r\n' : t.includes('\r') && !t.includes('\n') ? '\r' : '\n');
const lines = (t) => t.split(/\r\n|\r|\n/);

export default [
  {
    id: 'remove-extra-spaces',
    name: 'Remove extra spaces',
    keywords: 'double spaces collapse whitespace clean squeeze',
    options: [
      { id: 'trimLines', label: 'Trim lines', type: 'bool', default: true },
      { id: 'normaliseBreaks', label: 'Normalise line breaks', type: 'bool', default: true },
      { id: 'singleLine', label: 'Single line', type: 'bool', default: false },
    ],
    run(text, o) {
      let t = text.replace(new RegExp(H + '{2,}', 'g'), ' ');
      if (o.trimLines) t = t.replace(new RegExp('^' + H + '+|' + H + '+$', 'gm'), '');
      if (o.normaliseBreaks) t = t.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
      if (o.singleLine) t = t.replace(/\s*(\r\n|\r|\n)+\s*/g, ' ').trim();
      const removed = text.length - t.length;
      const pct = text.length ? Math.round((removed / text.length) * 100) : 0;
      return { text: t, note: `${removed} removed, ${pct}% shorter` };
    },
  },
  {
    id: 'remove-all-spaces',
    name: 'Remove all spaces',
    keywords: 'strip whitespace delete spaces',
    options: [{ id: 'breaks', label: 'Line breaks too', type: 'bool', default: false }],
    run: (text, o) => text.replace(o.breaks ? /\s+/g : new RegExp(H + '+', 'g'), ''),
  },
  {
    id: 'trim',
    name: 'Trim',
    keywords: 'leading trailing whitespace strip',
    options: [
      { id: 'side', label: 'Side', type: 'select', default: 'both', choices: [['both', 'Both'], ['leading', 'Leading'], ['trailing', 'Trailing']] },
      { id: 'scope', label: 'Scope', type: 'select', default: 'lines', choices: [['lines', 'Each line'], ['all', 'Whole text']] },
    ],
    run(text, o) {
      const lead = o.side !== 'trailing', trail = o.side !== 'leading';
      const re = o.scope === 'lines'
        ? new RegExp([lead && '^' + H + '+', trail && H + '+$'].filter(Boolean).join('|'), 'gm')
        : new RegExp([lead && '^\\s+', trail && '\\s+$'].filter(Boolean).join('|'), 'g');
      return text.replace(re, '');
    },
  },
  {
    id: 'remove-empty-lines',
    name: 'Remove empty lines',
    keywords: 'blank lines delete',
    options: [{ id: 'ws', label: 'Whitespace-only counts as empty', type: 'bool', default: true }],
    run(text, o) {
      const keep = lines(text).filter((l) => (o.ws ? l.trim() !== '' : l !== ''));
      return keep.join(eol(text));
    },
  },
  {
    id: 'collapse-blank-lines',
    name: 'Collapse blank lines',
    keywords: 'empty line runs squeeze paragraphs',
    options: [{ id: 'max', label: 'Max blank lines', type: 'number', default: 1, min: 0, max: 10 }],
    run(text, o) {
      const out = [];
      let run = 0;
      for (const l of lines(text)) {
        run = l.trim() === '' ? run + 1 : 0;
        if (run <= o.max) out.push(run ? '' : l);
      }
      return out.join(eol(text));
    },
  },
  {
    id: 'remove-line-breaks',
    name: 'Remove line breaks',
    keywords: 'join lines unwrap newline single line',
    options: [
      { id: 'joiner', label: 'Join with', type: 'select', default: 'space', choices: [['space', 'Space'], ['none', 'Nothing']] },
      { id: 'paragraphs', label: 'Keep paragraphs', type: 'bool', default: false },
    ],
    run(text, o) {
      const j = o.joiner === 'space' ? ' ' : '';
      const join = (s) => s.split(/\r\n|\r|\n/).map((l) => (j ? l.trim() : l)).filter((l) => !j || l).join(j);
      if (!o.paragraphs) return join(text);
      const nl = eol(text);
      return text.split(/(?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)\s*/).map(join).join(nl + nl);
    },
  },
  {
    id: 'tabs-to-spaces',
    name: 'Tabs to spaces',
    keywords: 'expand tab indent',
    options: [{ id: 'width', label: 'Tab width', type: 'number', default: 4, min: 1, max: 16 }],
    run(text, o) {
      const w = Math.max(1, o.width | 0);
      return text.replace(/[^\r\n]*\t[^\r\n]*/g, (line) => {
        let col = 0, out = '';
        for (const ch of line) {
          if (ch === '\t') { const n = w - (col % w); out += ' '.repeat(n); col += n; }
          else { out += ch; col++; }
        }
        return out;
      });
    },
  },
  {
    id: 'spaces-to-tabs',
    name: 'Spaces to tabs',
    keywords: 'indent tab unexpand',
    options: [
      { id: 'width', label: 'Tab width', type: 'number', default: 4, min: 1, max: 16 },
      { id: 'leading', label: 'Leading only', type: 'bool', default: true },
    ],
    run(text, o) {
      const w = Math.max(1, o.width | 0), run = new RegExp(` {${w}}`, 'g');
      if (!o.leading) return text.replace(run, '\t');
      return text.replace(/^ +/gm, (s) => '\t'.repeat(Math.floor(s.length / w)) + ' '.repeat(s.length % w));
    },
  },
  {
    id: 'normalise-line-endings',
    name: 'Normalise line endings',
    keywords: 'crlf lf cr windows unix newline eol normalize',
    options: [{ id: 'to', label: 'Convert to', type: 'select', default: 'lf', choices: [['lf', 'LF (Unix)'], ['crlf', 'CRLF (Windows)']] }],
    run: (text, o) => (o.to === 'crlf' ? text.replace(/\r\n|\r|\n/g, '\r\n') : text.replace(/\r\n?/g, '\n')),
  },
];
