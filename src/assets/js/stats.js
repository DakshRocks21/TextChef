// Text statistics for the header bars and the word counter. Pure, no DOM.

const seg = (g) => (typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: g }) : null);
const wordSeg = seg('word');
const graphemeSeg = seg('grapheme');
const sentenceSeg = seg('sentence');
const WORD_RE = /[\p{L}\p{N}]+(?:['\u2019.\-][\p{L}\p{N}]+)*/gu;
const BIG = 2_000_000;

export function countLines(t) {
  if (!t) return 0;
  let n = 1;
  for (let i = t.indexOf('\n'); i !== -1; i = t.indexOf('\n', i + 1)) n++;
  // Lone CR line endings (old Mac) count too.
  if (n === 1 && t.includes('\r')) n = t.split('\r').length;
  return n;
}

export function countChars(t) {
  if (!t) return 0;
  if (!graphemeSeg || t.length > BIG) return [...t].length;
  let n = 0;
  for (const _ of graphemeSeg.segment(t)) n++;
  return n;
}

export function wordsOf(t) {
  if (!t) return [];
  if (!wordSeg || t.length > BIG) return t.match(WORD_RE) || [];
  const out = [];
  for (const s of wordSeg.segment(t)) if (s.isWordLike) out.push(s.segment);
  return out;
}

// Cheap counts for the input and output header bars. Runs on every keystroke.
// Huge text gets one linear pass: code points, whitespace-separated words, line breaks.
export function quickStats(t) {
  if (t.length <= BIG) return { chars: countChars(t), words: wordsOf(t).length, lines: countLines(t) };
  let chars = 0, words = 0, lines = 1, inWord = false;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 0xDC00 || c > 0xDFFF) chars++;
    const space = c === 32 || (c >= 9 && c <= 13) || c === 0xA0 || c === 0x3000 || (c >= 0x2000 && c <= 0x200A);
    if (c === 10) lines++;
    if (space) inWord = false;
    else if (!inWord) { inWord = true; words++; }
  }
  return { chars, words, lines };
}

export function syllables(word) {
  const w = word.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const s = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = s.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

function countSentences(t) {
  if (!t.trim()) return 0;
  if (sentenceSeg && t.length <= BIG) {
    let n = 0;
    for (const s of sentenceSeg.segment(t)) if (/[\p{L}\p{N}]/u.test(s.segment)) n++;
    return n;
  }
  return (t.match(/[^.!?\u3002]+(?:[.!?\u3002]+|$)/g) || []).filter((s) => /[\p{L}\p{N}]/u.test(s)).length;
}

export const STOP_WORDS = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours yourself yourselves also get got its im ive dont doesnt didnt cant wont isnt arent wasnt one two may might must shall').split(' '));

export function keywords(t, { stopWords = true, n = 10 } = {}) {
  const map = new Map();
  let total = 0;
  const add = (w) => {
    const c0 = w.charCodeAt(0) | 32;
    if (!(c0 >= 97 && c0 <= 122) && !/\p{L}/u.test(w)) return;
    let k = w.toLowerCase();
    if (k.includes('\u2019')) k = k.replace(/\u2019/g, "'");
    total++;
    if (k.length < 2 || (stopWords && (STOP_WORDS.has(k) || STOP_WORDS.has(k.replace(/'/g, ''))))) return;
    map.set(k, (map.get(k) || 0) + 1);
  };
  if (t.length > BIG) scan(t, (s, e) => add(t.slice(s, e)));
  else for (const w of wordsOf(t)) add(w);
  return [...map]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([word, count]) => ({ word, count, density: total ? (count / total) * 100 : 0 }));
}

// One pass over huge text, no arrays: an approximation of the word rules above that keeps
// a 100 MB count to about a second. Words are runs of letters and digits joined by ' . - inside.
const isWordCode = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) ||
  (c >= 0xC0 && c !== 0xD7 && c !== 0xF7 && !(c >= 0x2000 && c <= 0x206F) && !(c >= 0x3000 && c <= 0x303F) &&
    !(c >= 0xFE00 && c <= 0xFE0F) && c !== 0xFEFF && !(c >= 0xD800 && c <= 0xDFFF));
const isSpaceCode = (c) => c === 32 || (c >= 9 && c <= 13) || c === 0xA0 || c === 0x3000 || (c >= 0x2000 && c <= 0x200A) || c === 0x2028 || c === 0x2029 || c === 0x202F || c === 0x205F;
const isJoin = (c) => c === 39 || c === 0x2019 || c === 46 || c === 45;

function scan(t, onWord) {
  const n = t.length;
  let chars = 0, nonSpace = 0, words = 0, letters = 0, lines = n ? 1 : 0, sentences = 0, paragraphs = 0;
  let wStart = -1, longS = 0, longE = 0, sentOpen = false, lineHasText = false, inPara = false;
  const endWord = (i) => {
    const len = i - wStart;
    letters += len;
    if (len > longE - longS) { longS = wStart; longE = i; }
    onWord?.(wStart, i, words);
    wStart = -1;
  };
  const endLine = () => {
    if (lineHasText) { if (!inPara) { paragraphs++; inPara = true; } }
    else { inPara = false; sentOpen = false; }
    lineHasText = false;
  };
  for (let i = 0; i < n; i++) {
    const c = t.charCodeAt(i);
    const low = c >= 0xDC00 && c <= 0xDFFF;
    if (!low) chars++;
    const space = isSpaceCode(c);
    if (!space) { if (!low) nonSpace++; lineHasText = true; }
    if (isWordCode(c) || (wStart >= 0 && isJoin(c) && i + 1 < n && isWordCode(t.charCodeAt(i + 1)))) {
      if (wStart < 0) { wStart = i; words++; if (!sentOpen) { sentences++; sentOpen = true; } }
      continue;
    }
    if (wStart >= 0) endWord(i);
    if (c === 46 || c === 33 || c === 63 || c === 0x3002) sentOpen = false;
    if (c === 10) { lines++; endLine(); }
  }
  if (wStart >= 0) endWord(n);
  endLine();
  return { chars, nonSpace, words, letters, lines, sentences, paragraphs, longest: t.slice(longS, longE) };
}

function bigStats(t) {
  let syl = 0, sampled = 0;
  const r = scan(t, (s, e) => { if (sampled < 200_000) { syl += syllables(t.slice(s, e)); sampled++; } });
  if (sampled && sampled < r.words) syl = (syl / sampled) * r.words;
  return { ...r, syl };
}

// Full stats for the word counter.
export function fullStats(t) {
  if (t.length > BIG) {
    const r = bigStats(t);
    const sn = Math.max(1, r.sentences), wc = r.words;
    return {
      words: wc, chars: r.chars, charsNoSpaces: r.nonSpace, sentences: r.sentences, paragraphs: r.paragraphs, lines: r.lines,
      readingSec: Math.round((wc / 238) * 60), speakingSec: Math.round((wc / 150) * 60),
      avgWord: wc ? r.letters / wc : 0, longest: r.longest,
      flesch: wc ? Math.max(0, Math.min(100, 206.835 - 1.015 * (wc / sn) - 84.6 * (r.syl / wc))) : 0,
      grade: wc ? Math.max(0, 0.39 * (wc / sn) + 11.8 * (r.syl / wc) - 15.59) : 0,
    };
  }
  const words = wordsOf(t);
  const wc = words.length;
  const sentences = countSentences(t);
  const paragraphs = t.split(/\r?\n\s*\r?\n|\r\s*\r/).filter((p) => p.trim()).length;
  let letters = 0, longest = '', syl = 0;
  const sample = wc > 200_000 ? words.slice(0, 200_000) : words;
  for (const w of words) {
    const len = [...w].length;
    letters += len;
    if (len > [...longest].length) longest = w;
  }
  for (const w of sample) syl += syllables(w);
  if (sample !== words) syl = (syl / sample.length) * wc;
  const s = Math.max(1, sentences);
  const flesch = wc ? 206.835 - 1.015 * (wc / s) - 84.6 * (syl / wc) : 0;
  const grade = wc ? 0.39 * (wc / s) + 11.8 * (syl / wc) - 15.59 : 0;
  return {
    words: wc,
    chars: countChars(t),
    charsNoSpaces: countChars(t.replace(/\s+/g, '')),
    sentences,
    paragraphs,
    lines: countLines(t),
    readingSec: Math.round((wc / 238) * 60),
    speakingSec: Math.round((wc / 150) * 60),
    avgWord: wc ? letters / wc : 0,
    longest,
    flesch: wc ? Math.max(0, Math.min(100, flesch)) : 0,
    grade: wc ? Math.max(0, grade) : 0,
  };
}

export function fleschLabel(score) {
  if (score >= 90) return 'Very easy';
  if (score >= 80) return 'Easy';
  if (score >= 70) return 'Fairly easy';
  if (score >= 60) return 'Plain English';
  if (score >= 50) return 'Fairly hard';
  if (score >= 30) return 'Hard';
  return 'Very hard';
}

export function duration(sec) {
  if (sec < 60) return `${sec} sec`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s ? `${m} min ${s} sec` : `${m} min`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}
