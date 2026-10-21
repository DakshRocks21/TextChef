import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, run, op } from './helpers.js';

const sorted = (s) => s.split('\n').sort();

test('sort-lines', async () => {
  assert.equal(await t('sort-lines', 'b\nA\nc\na'), 'A\na\nb\nc');
  assert.equal(await t('sort-lines', 'b\r\na\r\nc\r\n'), 'a\r\nb\r\nc\r\n');
  assert.equal(await t('sort-lines', 'b\na\nc', { mode: 'za' }), 'c\nb\na');
  assert.equal(await t('sort-lines', 'file10\nfile2\nfile1'), 'file1\nfile10\nfile2');
  assert.equal(await t('sort-lines', 'file10\nfile2\nfile1', { mode: 'natural' }), 'file1\nfile2\nfile10');
  assert.equal(await t('sort-lines', 'ccc\na\nbb\n\uD83D\uDE00\uD83D\uDE00', { mode: 'length' }), 'a\nbb\n\uD83D\uDE00\uD83D\uDE00\nccc');
  assert.equal(await t('sort-lines', '10 x\nfoo\n-2\n3.5\n+1e1 y\nbar', { mode: 'numeric' }), '-2\n3.5\n10 x\n+1e1 y\nfoo\nbar');
  assert.equal(await t('sort-lines', 'b\na\nB\nA', { caseSensitive: true }), 'A\na\nB\nb');
  const sh = await t('sort-lines', 'a\nb\nc\nd\ne', { mode: 'shuffle' });
  assert.deepEqual(sorted(sh), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(await t('sort-lines', ''), '');
});

test('remove-duplicate-lines', async () => {
  const r = await run(await op('remove-duplicate-lines'), 'a\nb\n a\nA\nb');
  assert.equal(r.text, 'a\nb\nA');
  assert.equal(r.note, '2 removed');
  assert.equal(await t('remove-duplicate-lines', 'a\r\nb\r\na\r\n'), 'a\r\nb\r\n');
  assert.equal(await t('remove-duplicate-lines', 'a\nA', { caseSensitive: false }), 'a');
  assert.equal(await t('remove-duplicate-lines', 'a\n a', { trim: false }), 'a\n a');
  assert.equal(await t('remove-duplicate-lines', '1 a\nb\n2 a', { keep: 'last' }), '1 a\nb\n2 a');
  assert.equal(await t('remove-duplicate-lines', 'x\ny\nx\nz', { keep: 'last' }), 'y\nx\nz');
  assert.equal(await t('remove-duplicate-lines', 'a\n\nb\n\nc'), 'a\n\nb\nc');
  assert.equal(await t('remove-duplicate-lines', 'a\n\nb\n\nc', { ignoreEmpty: true }), 'a\n\nb\n\nc');
  assert.equal(await t('remove-duplicate-lines', '\uD83D\uDE00\n\uD83D\uDE00'), '\uD83D\uDE00');
});

test('remove-duplicate-words', async () => {
  const r = await run(await op('remove-duplicate-words'), 'the the cat sat sat on The mat');
  assert.equal(r.text, 'the cat sat on The mat');
  assert.equal(r.note, '2 removed');
  assert.equal(await t('remove-duplicate-words', 'The the end'), 'The end');
  assert.equal(await t('remove-duplicate-words', 'The the end', { caseSensitive: true }), 'The the end');
  assert.equal(await t('remove-duplicate-words', 'stop. stop now'), 'stop. stop now');
  assert.equal(await t('remove-duplicate-words', 'a b a c b', { scope: 'all' }), 'a b c');
  assert.equal(await t('remove-duplicate-words', 'a, b. a c', { scope: 'all' }), 'a, b. c');
  assert.equal(await t('remove-duplicate-words', 'caf\u00E9 caf\u00E9\nok'), 'caf\u00E9\nok');
});

test('remove-duplicate-sentences', async () => {
  const r = await run(await op('remove-duplicate-sentences'), 'Hi there. How are you? Hi there. Bye.');
  assert.equal(r.text, 'Hi there. How are you? Bye.');
  assert.equal(r.note, '1 removed');
  assert.equal(await t('remove-duplicate-sentences', 'A one. B two. A ONE.'), 'A one. B two.');
  assert.equal(await t('remove-duplicate-sentences', 'A one. A ONE.', { caseSensitive: true }), 'A one. A ONE.');
  assert.equal(await t('remove-duplicate-sentences', 'Same.\nOther.\nSame.\n'), 'Same.\nOther.\n');
});

test('remove-duplicate-paragraphs', async () => {
  const r = await run(await op('remove-duplicate-paragraphs'), 'one\ntwo\n\nthree\n\n\none\ntwo\n\nfour');
  assert.equal(r.text, 'one\ntwo\n\nthree\n\nfour');
  assert.equal(r.note, '1 removed');
  assert.equal(await t('remove-duplicate-paragraphs', 'A\r\n\r\nB\r\n\r\nA\r\n'), 'A\r\n\r\nB\r\n');
  assert.equal(await t('remove-duplicate-paragraphs', 'A\n\na'), 'A\n\na');
  assert.equal(await t('remove-duplicate-paragraphs', 'A\n\na', { caseSensitive: false }), 'A');
});

test('show-duplicates and count-unique', async () => {
  const r = await run(await op('show-duplicates'), 'b\na\nb\nc\na\nb\n\n');
  assert.equal(r.text, 'b\na');
  assert.equal(r.note, '2 duplicated');
  assert.equal(await t('show-duplicates', 'b\na\nb\nb', { withCounts: true }), '3\tb');
  assert.equal(await t('show-duplicates', 'x\r\ny\r\nx'), 'x');
  const c = await run(await op('count-unique'), 'a\nb\nb\nc\nb\nc\n');
  assert.equal(c.text, '3\tb\n2\tc\n1\ta');
  assert.equal(c.note, '3 unique of 6');
});

test('reverse-lines and number-lines', async () => {
  assert.equal(await t('reverse-lines', 'a\r\nb\r\nc'), 'c\r\nb\r\na');
  assert.equal(await t('reverse-lines', 'a\nb\n'), 'b\na\n');
  assert.equal(await t('number-lines', 'a\nb'), '1. a\n2. b');
  assert.equal(await t('number-lines', 'a\n\nb', { skipEmpty: true }), '1. a\n\n2. b');
  assert.equal(await t('number-lines', 'a\nb', { start: 9, separator: ': ', pad: true }), ' 9: a\n10: b');
  assert.equal(await t('number-lines', 'a\r\nb', { start: 0, separator: '\t' }), '0\ta\r\n1\tb');
});

test('add-prefix-suffix and wrap-in-quotes', async () => {
  assert.equal(await t('add-prefix-suffix', 'a\n\nb', { prefix: '- ', suffix: ';' }), '- a;\n\n- b;');
  assert.equal(await t('add-prefix-suffix', 'a\n\nb', { prefix: '>', skipEmpty: false }), '>a\n>\n>b');
  assert.equal(await t('wrap-in-quotes', 'a\nsay "hi"\n\nb'), '"a"\n"say \\"hi\\""\n\n"b"');
  assert.equal(await t('wrap-in-quotes', 'a\nb\n', { quote: 'single', comma: true }), "'a',\n'b'\n");
  assert.equal(await t('wrap-in-quotes', 'a\n\nb', { quote: 'backtick', comma: true, skipEmpty: false }), '`a`,\n``,\n`b`');
  assert.equal(await t('wrap-in-quotes', 'a\\b'), '"a\\\\b"');
});

test('join-lines and split-to-lines', async () => {
  assert.equal(await t('join-lines', 'a\r\nb\r\n\r\nc'), 'a, b, c');
  assert.equal(await t('join-lines', 'a\n\nb', { skipEmpty: false, delimiter: '|' }), 'a||b');
  assert.equal(await t('join-lines', 'a\nb', { delimiter: '\\t' }), 'a\tb');
  assert.equal(await t('join-lines', 'a\nb', { delimiter: '\\n\\n' }), 'a\n\nb');
  const r = await run(await op('split-to-lines'), 'a, b,,c ');
  assert.equal(r.text, 'a\nb\nc');
  assert.equal(r.note, '3 items');
  assert.equal(await t('split-to-lines', 'a, b', { trim: false }), 'a\n b');
  assert.equal(await t('split-to-lines', 'a\tb', { delimiter: '\\t' }), 'a\nb');
  assert.equal(await t('split-to-lines', 'a1b22c', { delimiter: '\\d+', regex: true }), 'a\nb\nc');
  assert.equal(await t('split-to-lines', '\uD83D\uDE00\uD83D\uDE01', { delimiter: '', regex: false }), '\uD83D\uDE00\uD83D\uDE01');
  assert.equal(await t('split-to-lines', 'ab', { delimiter: '(?:)', regex: true, trim: false }), 'a\nb');
  await assert.rejects(() => t('split-to-lines', 'a', { delimiter: '(', regex: true }), { name: 'OpError', message: /^Invalid regex/ });
});

test('extract-column', async () => {
  assert.equal(await t('extract-column', 'a,b,c\n1,2,3', { n: 2 }), 'b\n2');
  assert.equal(await t('extract-column', 'x,"a, b",y\r\n1,"say ""hi""",3\r\n', { n: 2 }), 'a, b\r\nsay "hi"\r\n');
  assert.equal(await t('extract-column', 'a\tb\nc\td', { n: 2 }), 'b\nd');
  assert.equal(await t('extract-column', 'a;b\nc', { n: 2 }), 'b\n');
  assert.equal(await t('extract-column', 'a|b,c\nd|e', { n: 2, delimiter: 'pipe' }), 'b,c\ne');
  assert.equal(await t('extract-column', 'a;b', { n: 2, delimiter: 'semicolon' }), 'b');
  assert.equal(await t('extract-column', 'a\tb', { n: 2, delimiter: 'tab' }), 'b');
  assert.equal(await t('extract-column', 'a,b', { n: 5, delimiter: 'comma' }), '');
  assert.equal(await t('extract-column', 'only\nx,y', { n: 1 }), 'only\nx');
});

test('filter-lines', async () => {
  const r = await run(await op('filter-lines'), 'Apple\nbanana\napricot', { term: 'ap' });
  assert.equal(r.text, 'Apple\napricot');
  assert.equal(r.note, '2 kept');
  assert.equal(await t('filter-lines', 'Apple\nbanana\napricot', { term: 'ap', caseSensitive: true }), 'apricot');
  assert.equal(await t('filter-lines', 'a\r\nb\r\nab\r\n', { term: 'a', mode: 'not' }), 'b\r\n');
  assert.equal(await t('filter-lines', 'a1\nb\nc22', { term: '\\d$', regex: true }), 'a1\nc22');
  assert.equal(await t('filter-lines', 'C++\nC', { term: 'C++' }), 'C++');
  assert.equal(await t('filter-lines', 'a-b\nab', { term: 'a-b' }), 'a-b');
  assert.equal(await t('filter-lines', 'x\ny', { term: '' }), 'x\ny');
  await assert.rejects(() => t('filter-lines', 'a', { term: '[', regex: true }), { name: 'OpError' });
});

test('head, tail and random lines', async () => {
  const ten = Array.from({ length: 15 }, (_, i) => String(i)).join('\n');
  assert.equal(await t('head-lines', ten), '0\n1\n2\n3\n4\n5\n6\n7\n8\n9');
  assert.equal(await t('head-lines', 'a\r\nb\r\nc\r\n', { n: 2 }), 'a\r\nb\r\n');
  assert.equal(await t('tail-lines', ten, { n: 3 }), '12\n13\n14');
  assert.equal(await t('tail-lines', 'a\nb', { n: 10 }), 'a\nb');
  const r = await t('random-lines', ten, { n: 4 });
  assert.equal(r.split('\n').length, 4);
  assert.equal(new Set(r.split('\n')).size, 4);
  for (const l of r.split('\n')) assert.ok(+l >= 0 && +l < 15);
  assert.deepEqual(sorted(await t('random-lines', 'a\nb\nc', { n: 10 })), ['a', 'b', 'c']);
});

test('wrap-text', async () => {
  assert.equal(await t('wrap-text', 'aaa bbb ccc ddd', { width: 10 }), 'aaa bbb\nccc ddd');
  assert.equal(await t('wrap-text', 'short\r\naaa bbb ccc', { width: 10 }), 'short\r\naaa bbb\r\nccc');
  assert.equal(await t('wrap-text', '  aaa bbb ccc', { width: 10 }), '  aaa bbb\n  ccc');
  assert.equal(await t('wrap-text', 'abcdefghijklmn x', { width: 10 }), 'abcdefghijklmn\nx');
  assert.equal(await t('wrap-text', 'abcdefghijklmn x', { width: 10, breakLongWords: true }), 'abcdefghij\nklmn x');
  const e = '\uD83D\uDE00'.repeat(12);
  const w = await t('wrap-text', e, { width: 10, breakLongWords: true });
  assert.equal(w, '\uD83D\uDE00'.repeat(10) + '\n' + '\uD83D\uDE00'.repeat(2));
  assert.ok(w.isWellFormed());
  assert.equal(await t('wrap-text', '\u00E9\u00E9\u00E9\u00E9 \u00E9\u00E9\u00E9\u00E9\u00E9 x', { width: 10 }), '\u00E9\u00E9\u00E9\u00E9 \u00E9\u00E9\u00E9\u00E9\u00E9\nx');
});

test('unwrap-paragraphs', async () => {
  assert.equal(await t('unwrap-paragraphs', 'one\ntwo\nthree\n\nfour\nfive'), 'one two three\n\nfour five');
  assert.equal(await t('unwrap-paragraphs', 'a\r\nb\r\n\r\nc\r\n'), 'a b\r\n\r\nc\r\n');
  assert.equal(await t('unwrap-paragraphs', 'Intro\nline\n- one\n  more\n* two\n1. three\n2) four'), 'Intro line\n- one more\n* two\n1. three\n2) four');
  assert.equal(await t('unwrap-paragraphs', '> a\n> b\n>\n>> c', { stripQuotes: true }), 'a b\n\nc');
  assert.equal(await t('unwrap-paragraphs', '> a\n> b'), '> a > b');
});

test('indent and dedent', async () => {
  assert.equal(await t('indent', 'a\n\nb'), '  a\n\n  b');
  assert.equal(await t('indent', 'a\r\n\r\nb', { width: 1, char: 'tab', skipEmpty: false }), '\ta\r\n\t\r\n\tb');
  assert.equal(await t('indent', 'a', { width: 4 }), '    a');
  assert.equal(await t('dedent', '    a\n      b\n\n    c'), 'a\n  b\n\nc');
  assert.equal(await t('dedent', '\ta\r\n\t\tb\r\n'), 'a\r\n\tb\r\n');
  assert.equal(await t('dedent', '  a\nb'), '  a\nb');
  assert.equal(await t('dedent', '  a\n\tb\n\u00A0c', { all: true }), 'a\nb\nc');
});

test('remove-duplicate-words fast path edges', async () => {
  assert.equal(await t('remove-duplicate-words', 'the\u00A0the\tthe, The cat\r\ncat \u00C9t\u00E9 \u00E9t\u00E9 x'), 'the, The cat\r\ncat \u00C9t\u00E9 x');
  assert.equal(await t('remove-duplicate-words', 'a b A c B a', { scope: 'all' }), 'a b c');
  assert.equal(await t('remove-duplicate-words', '\u0130 i\u0307 x\uD800 x\uD800'), '\u0130 x\uD800 x\uD800');
});
