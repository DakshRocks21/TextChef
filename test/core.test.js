import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRecipe, encodeSteps, decodeSteps, parseHash, encodeText, decodeText } from '../src/assets/js/recipe.js';
import { fullStats, quickStats, keywords, syllables, duration } from '../src/assets/js/stats.js';
import { detectChips } from '../src/assets/js/chips.js';
import { diff, diffRanges } from '../src/assets/js/diff.js';
import { loadOps } from './helpers.js';

const ops = await loadOps();
const getOp = async (id) => ops.get(id);

test('runRecipe chains, skips off steps, stops at pause and reports errors', async () => {
  const steps = [
    { id: 'trim', opts: {} },
    { id: 'remove-all-spaces', opts: {}, off: true },
    { id: 'remove-extra-spaces', opts: {} },
  ];
  let r = await runRecipe(steps, '  a    b  ', { getOp });
  assert.equal(r.text, 'a b');
  assert.equal(r.ran, 3);
  r = await runRecipe([{ id: 'trim', opts: {} }, { id: 'remove-all-spaces', opts: {}, pause: true }], ' a b ', { getOp });
  assert.equal(r.text, 'a b');
  assert.equal(r.pausedAt, 1);
  r = await runRecipe(steps, '  a    b  ', { getOp, upto: 1 });
  assert.equal(r.text, 'a    b');
  const bad = { run() { const e = new Error('Nope'); e.name = 'OpError'; throw e; } };
  r = await runRecipe([{ id: 'x', opts: {} }], 'a', { getOp: async () => bad });
  assert.deepEqual(r.error, { index: 0, message: 'Nope' });
});

test('recipe hash round trip keeps only non-default options', () => {
  const meta = new Map([...ops].map(([id, o]) => [id, o]));
  const steps = [
    { id: 'trim', opts: { side: 'both', scope: 'all' }, off: false, pause: false },
    { id: 'remove-extra-spaces', opts: { singleLine: true }, off: true, pause: true },
  ];
  const enc = encodeSteps(steps, meta);
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeSteps(enc, meta), [
    { id: 'trim', opts: { scope: 'all' }, off: false, pause: false },
    { id: 'remove-extra-spaces', opts: { singleLine: true }, off: true, pause: true },
  ]);
  assert.deepEqual(decodeSteps('garbage!!', meta), []);
  assert.deepEqual(decodeSteps(encodeSteps([{ id: 'no-such-op', opts: {} }]), meta), []);
  assert.equal(decodeText(encodeText('caf\u00E9 \uD83D\uDE00\r\n')), 'caf\u00E9 \uD83D\uDE00\r\n');
  assert.deepEqual(parseHash('#recipe=abc&input=xyz'), { recipe: 'abc', input: 'xyz' });
});

test('stats', () => {
  assert.deepEqual(quickStats(''), { chars: 0, words: 0, lines: 0 });
  assert.deepEqual(quickStats('Hello world\r\nagain \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67'), { chars: 19, words: 3, lines: 2 });
  const s = fullStats('The cat sat on the mat. It was happy!\n\nA second paragraph here.');
  assert.equal(s.words, 13);
  assert.equal(s.sentences, 3);
  assert.equal(s.paragraphs, 2);
  assert.equal(s.lines, 3);
  assert.equal(s.longest, 'paragraph');
  assert.ok(s.flesch > 70);
  assert.equal(syllables('readability'), 5);
  assert.equal(duration(75), '1 min 15 sec');
  const k = keywords('apple banana apple the the the cherry apple', { stopWords: true });
  assert.deepEqual(k[0], { word: 'apple', count: 3, density: 37.5 });
  assert.ok(!k.some((x) => x.word === 'the'));
  assert.ok(keywords('the the the x', { stopWords: false }).some((x) => x.word === 'the'));
  assert.equal(fullStats('').words, 0);
  assert.equal(fullStats('a\u00A0b').words, 2);
});

test('chips', () => {
  const ids = (t) => Object.fromEntries(detectChips(t).map((c) => [c.id, c.count]));
  assert.deepEqual(ids(''), {});
  assert.deepEqual(ids('clean text\nhere'), {});
  const c = ids('a  b \n\n\n\nc\u00A0d \u201Chi\u201D \u2014 x\u200By\nc\u00A0d \u201Chi\u201D \u2014 x\u200By\r\n\t<b>&amp; caf\u00E9 \uD83D\uDE00');
  assert.equal(c.double, 1);
  assert.equal(c.blank, 1);
  assert.equal(c.nbsp, 2);
  assert.equal(c.quotes, 4);
  assert.equal(c.dashes, 2);
  assert.equal(c.invisible, 2);
  assert.equal(c.dupes, 1);
  assert.equal(c.eol, 1);
  assert.equal(c.tabs, 1);
  assert.equal(c.html, 1);
  assert.equal(c.entities, 1);
  assert.equal(c.accents, 1);
  assert.equal(c.emoji, 1);
  assert.equal(c.edges, 2);
  // ZWJ inside an emoji family is not flagged.
  assert.deepEqual(ids('\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67'), { emoji: 3 });
});

test('diff', () => {
  const segs = diff('the quick brown fox', 'the slow brown dog');
  assert.equal(segs.filter((s) => s.t !== '+').map((s) => s.s).join(''), 'the quick brown fox');
  assert.equal(segs.filter((s) => s.t !== '-').map((s) => s.s).join(''), 'the slow brown dog');
  assert.deepEqual(diffRanges(segs).b, [[4, 8, 'ins'], [15, 18, 'ins']]);
  assert.deepEqual(diff('', ''), []);
  assert.deepEqual(diff('a', 'a'), [{ t: '=', s: 'a' }]);
  const big = 'word '.repeat(50000);
  const r = diff(big, big.replace('word', 'WORD'));
  assert.equal(r.filter((s) => s.t !== '-').map((s) => s.s).join(''), big.replace('word', 'WORD'));
});
