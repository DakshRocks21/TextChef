import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, run, op } from './helpers.js';

const detect = async (id, s) => (await op(id)).detect(s);
const bad = (id, s, opts) => assert.rejects(() => t(id, s, opts), { name: 'OpError' });

test('json-beautify', async () => {
  assert.equal(await t('json-beautify', '{"b":1,"a":[1,{"c":null}]}'), '{\n  "b": 1,\n  "a": [\n    1,\n    {\n      "c": null\n    }\n  ]\n}');
  assert.equal(await t('json-beautify', '{"b":1,"a":2}', { indent: '4' }), '{\n    "b": 1,\n    "a": 2\n}');
  assert.equal(await t('json-beautify', '[1]', { indent: 'tab' }), '[\n\t1\n]');
  assert.equal(await t('json-beautify', '{"b":{"z":1,"y":2},"a":0}', { sortKeys: true, indent: '2' }), '{\n  "a": 0,\n  "b": {\n    "y": 2,\n    "z": 1\n  }\n}');
  assert.equal(await t('json-beautify', '\uFEFF{"a":"caf\u00E9 \uD83D\uDE00"}'), '{\n  "a": "caf\u00E9 \uD83D\uDE00"\n}');
  await assert.rejects(() => t('json-beautify', '{\n  "a": 1\n  "b": 2}'), { name: 'OpError', message: /^Invalid JSON at line 3, column 3: Expected ',' or '}' after property value$/ });
  await assert.rejects(() => t('json-beautify', '{"a":1,}'), { name: 'OpError', message: /line 1, column 8/ });
  await assert.rejects(() => t('json-beautify', '{"a": x}'), { name: 'OpError', message: /^Invalid JSON/ });
  await assert.rejects(() => t('json-beautify', '[1, 2'), { name: 'OpError', message: /line 1/ });
  await bad('json-beautify', '');
  await assert.rejects(() => t('json-beautify', '{"a": ' + 'x'.repeat(200) + '}'), { name: 'OpError', message: "Invalid JSON: Unexpected token 'x'" });
  await bad('json-beautify', 'hello');
});

test('json beautify detect', async () => {
  assert.equal(await detect('json-beautify', '{"a":1}'), 0.95);
  assert.equal(await detect('json-beautify', '  [1,2,3]\n'), 0.95);
  for (const s of ['', 'hello world', 'test', '{not json}', '[1,2', '42', '"str"', 'a,b\n1,2\n3,4'])
    assert.equal(await detect('json-beautify', s), 0, s);
  const big = JSON.stringify(Array.from({ length: 20000 }, (_, i) => ({ i })));
  assert.equal(await detect('json-beautify', big), 0.7);
});

test('json-minify, json-validate, sort-json-keys', async () => {
  assert.equal(await t('json-minify', '{\n  "a": [1, 2],\r\n  "b": "x y"\n}'), '{"a":[1,2],"b":"x y"}');
  await bad('json-minify', '{a:1}');
  assert.deepEqual(await run(await op('json-validate'), '{"a":1,"b":2,"c":3}'), { text: 'Valid JSON', note: 'object with 3 keys' });
  assert.deepEqual(await run(await op('json-validate'), '[1]'), { text: 'Valid JSON', note: 'array with 1 item' });
  assert.equal((await run(await op('json-validate'), 'null')).note, 'null');
  assert.equal((await run(await op('json-validate'), '"x"')).note, 'string');
  assert.equal((await run(await op('json-validate'), '12')).note, 'number');
  await assert.rejects(() => t('json-validate', '{"a":1}\n}'), { name: 'OpError', message: /line 2, column 1/ });
  assert.equal(await t('sort-json-keys', '{"b":[{"d":1,"c":2}],"a":1}'), '{\n  "a": 1,\n  "b": [\n    {\n      "c": 2,\n      "d": 1\n    }\n  ]\n}');
  assert.equal(await t('sort-json-keys', '{"b":1,"a":2}', { indent: 'tab' }), '{\n\t"a": 2,\n\t"b": 1\n}');
});

test('csv-to-json', async () => {
  assert.equal(await t('csv-to-json', 'name,age\nAnn,30\nBob,4'), JSON.stringify([{ name: 'Ann', age: '30' }, { name: 'Bob', age: '4' }], null, 2));
  const tricky = 'a,b\r\n"x, ""y""","line1\r\nline2"\r\n"caf\u00E9 \uD83D\uDE00",\r\n';
  assert.deepEqual(JSON.parse(await t('csv-to-json', tricky)), [{ a: 'x, "y"', b: 'line1\r\nline2' }, { a: 'caf\u00E9 \uD83D\uDE00', b: '' }]);
  assert.deepEqual(JSON.parse(await t('csv-to-json', 'a;b\n1;2', { delimiter: 'auto' })), [{ a: '1', b: '2' }]);
  assert.deepEqual(JSON.parse(await t('csv-to-json', 'a\tb\n1\t2')), [{ a: '1', b: '2' }]);
  assert.deepEqual(JSON.parse(await t('csv-to-json', 'a;b,c\n1;2,3', { delimiter: 'semicolon' })), [{ a: '1', 'b,c': '2,3' }]);
  assert.deepEqual(JSON.parse(await t('csv-to-json', 'a,b\n1,2', { delimiter: 'tab' })), [{ 'a,b': '1,2' }]);
  assert.deepEqual(JSON.parse(await t('csv-to-json', 'a,b\n1,2', { header: false })), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(JSON.parse(await t('csv-to-json', 'a\n1,2\n\n')), [{ a: '1', 'column 2': '2' }]);
  assert.equal((await run(await op('csv-to-json'), 'a\n1\n2')).note, '2 rows');
  assert.equal(await t('csv-to-json', ''), '[]');
  await bad('csv-to-json', 'a,b\n"open,1');
});

test('csv detect', async () => {
  assert.equal(await detect('csv-to-json', 'name,age\nAnn,30\nBob,4'), 0.6);
  assert.equal(await detect('csv-to-json', 'a\tb\n1\t2\n3\t4\n'), 0.6);
  assert.equal(await detect('csv-to-json', 'a,b\n"x, y",2\n3,4'), 0.6);
  for (const s of ['', 'hello world', 'test', 'a,b\n1,2', 'one, two\nthree\nfour, five, six', '[1,\n2,\n3]', 'deadbeef', '| a | b |\n| --- | --- |\n| 1 | 2 |'])
    assert.equal(await detect('csv-to-json', s), 0, s);
});

test('json-to-csv', async () => {
  assert.equal(await t('json-to-csv', '[{"a":1,"b":"x"},{"b":"y, z","c":true}]'), 'a,b,c\n1,x,\n,"y, z",true');
  assert.equal(await t('json-to-csv', '[[1,"say \\"hi\\""],[null,"a\\nb"]]'), '1,"say ""hi"""\n,"a\nb"');
  assert.equal(await t('json-to-csv', '[{"a":{"x":1},"b":[1,2]}]'), 'a,b\n"{""x"":1}","[1,2]"');
  assert.equal(await t('json-to-csv', '[{"a":1,"b":2}]', { delimiter: 'tab' }), 'a\tb\n1\t2');
  assert.equal(await t('json-to-csv', '[{"a":"1;2","b":2}]', { delimiter: 'semicolon' }), 'a;b\n"1;2";2');
  assert.equal(await t('json-to-csv', '[1,"caf\u00E9"]'), '1\ncaf\u00E9');
  await assert.rejects(() => t('json-to-csv', '{"a":1}'), { name: 'OpError', message: 'JSON must be an array' });
  await bad('json-to-csv', '[1,');
  const back = JSON.parse(await t('csv-to-json', await t('json-to-csv', '[{"a":"x, \\"q\\"\\nz","b":"2"}]')));
  assert.deepEqual(back, [{ a: 'x, "q"\nz', b: '2' }]);
});

test('csv-to-markdown', async () => {
  assert.equal(await t('csv-to-markdown', 'name,age\nAnn,30\nBob,4'), '| name | age |\n| ---- | --- |\n| Ann  | 30  |\n| Bob  | 4   |');
  assert.equal(await t('csv-to-markdown', 'a|b,c\n"x\ny",\u00E9'), '| a\\|b   | c   |\n| ------ | --- |\n| x<br>y | \u00E9   |');
  assert.equal(await t('csv-to-markdown', '1,2', { header: false }), '| Column 1 | Column 2 |\n| -------- | -------- |\n| 1        | 2        |');
  assert.equal(await t('csv-to-markdown', ''), '');
});

test('url-slug', async () => {
  assert.equal(await t('url-slug', 'Hello, World! Caf\u00E9 & Cr\u00E8me'), 'hello-world-cafe-and-creme');
  assert.equal(await t('url-slug', '  Stra\u00DFe \u00C6gir \u00D8resund \u0152uvre \u0141\u00F3d\u017A \u0110ak  '), 'strasse-aegir-oresund-oeuvre-lodz-dak');
  assert.equal(await t('url-slug', "Don't stop -- believin'\u2019"), 'dont-stop-believin');
  assert.equal(await t('url-slug', 'Hello World', { separator: '_', lowercase: false }), 'Hello_World');
  assert.equal(await t('url-slug', 'line one\nline two'), 'line-one-line-two');
  assert.equal(await t('url-slug', 'Line One\r\nLine Two', { perLine: true }), 'line-one\r\nline-two');
  assert.equal(await t('url-slug', 'the quick brown fox', { maxLength: 12 }), 'the-quick');
  assert.equal(await t('url-slug', 'the quick brown fox', { maxLength: 9 }), 'the-quick');
  assert.equal(await t('url-slug', 'supercalifragilistic', { maxLength: 5 }), 'super');
  assert.equal(await t('url-slug', '\u65E5\u672C\u8A9E \uD83D\uDE00 text'), '\u65E5\u672C\u8A9E-text');
  assert.equal(await t('url-slug', '!!!'), '');
});

test('markdown-list', async () => {
  assert.equal(await t('markdown-list', 'apples\n\npears\n'), '- apples\n- pears');
  assert.equal(await t('markdown-list', 'a\r\nb', { style: 'numbered' }), '1. a\r\n2. b');
  assert.equal(await t('markdown-list', 'a\nb', { style: 'checkbox' }), '- [ ] a\n- [ ] b');
  assert.equal(await t('markdown-list', 'a\n\nb', { skipEmpty: false }), '- a\n\n- b');
  assert.equal(await t('markdown-list', 'a\n  b\n    c\n  d\ne'), '- a\n  - b\n    - c\n  - d\n- e');
  assert.equal(await t('markdown-list', 'a\n\tb\n\t\tc\nd'), '- a\n  - b\n    - c\n- d');
  assert.equal(await t('markdown-list', 'a\n    b\n    c\nd\n    e', { style: 'numbered' }), '1. a\n   1. b\n   2. c\n2. d\n   1. e');
  assert.equal(await t('markdown-list', '- one\n* two\n3. three\n- [x] four'), '- one\n- two\n- three\n- four');
  assert.equal(await t('markdown-list', 'caf\u00E9 \uD83D\uDE00'), '- caf\u00E9 \uD83D\uDE00');
});

test('url-slug fast path edges', async () => {
  assert.equal(await t('url-slug', '\u0391\u03A3\u0903\u0391 & Rock\'n\'Roll \u00C9t\u00E9 \u00DF'), '\u03B1\u03C3\u03B1-and-rocknroll-ete-ss');
  assert.equal(await t('url-slug', 'Hello W\u00F6rld \u{1D400}\u{1D400} end', { maxLength: 13 }), 'hello-world');
  assert.equal(await t('url-slug', '--A&B--', { separator: '_', lowercase: false }), 'A_and_B');
});
