// Runs every op in the registry against the hard inputs. New ops are covered automatically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, run } from './helpers.js';

const TYPES = new Set(['bool', 'select', 'number', 'text', 'range']);

const big = (() => {
  const line = 'The  quick brown fox, caf\u00E9 \u201Cquoted\u201D \u2014 jumps\u00A0over 42 dogs\u200B! \uD83D\uDE00\t<b>x</b>\r\n';
  return line.repeat(Math.ceil((1024 * 1024) / line.length));
})();

const INPUTS = {
  empty: '',
  crlf: 'one\r\ntwo  three\r\n\r\n\r\nfour\r\n',
  unicode: 'caf\u00E9 na\u00EFve \u65E5\u672C\u8A9E \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 \uD83C\uDDEC\uD83C\uDDE7 e\u0301',
  nbsp: 'a\u00A0b\u00A0\u00A0c \u202Fd',
  zeroWidth: '\uFEFFa\u200Bb\u200Cc\u200Dd\u2060e\u00ADf',
  oneMB: big,
};

const mods = await loadModules();
const all = mods.flatMap((m) => m.ops.map((op) => ({ op, cat: m.category })));

test('registry shape', () => {
  const ids = new Set();
  for (const m of mods) {
    assert.ok(m.category && m.category.id && m.category.name && m.category.color, `${m.file} exports category`);
    assert.ok(Array.isArray(m.ops) && m.ops.length, `${m.file} exports ops`);
  }
  for (const { op } of all) {
    assert.match(op.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `id ${op.id}`);
    assert.ok(!ids.has(op.id), `duplicate id ${op.id}`);
    ids.add(op.id);
    assert.equal(typeof op.name, 'string');
    assert.equal(typeof op.run, 'function', `${op.id}.run`);
    assert.equal(typeof (op.keywords ?? ''), 'string');
    for (const o of op.options || []) {
      assert.ok(o.id && o.label && TYPES.has(o.type), `${op.id} option ${o.id}`);
      if (o.type === 'select') assert.ok(o.choices.some(([v]) => v === o.default), `${op.id}.${o.id} default in choices`);
      if (o.type === 'bool') assert.equal(typeof o.default, 'boolean');
      if (o.type === 'number' || o.type === 'range') assert.equal(typeof o.default, 'number');
      if (o.type === 'text') assert.equal(typeof o.default, 'string');
    }
  }
  assert.ok(ids.size >= 100, `expected 100+ ops, got ${ids.size}`);
});

for (const { op, cat } of all) {
  test(`${cat.id}/${op.id} survives hard inputs`, async () => {
    for (const [name, input] of Object.entries(INPUTS)) {
      const t0 = performance.now();
      let r;
      try {
        r = await run(op, input);
      } catch (e) {
        assert.equal(e.name, 'OpError', `${op.id} on ${name} threw a non-OpError: ${e.stack}`);
        assert.ok(e.message.length > 0);
        continue;
      }
      const ms = performance.now() - t0;
      assert.equal(typeof r.text, 'string', `${op.id} on ${name} returns a string`);
      assert.equal(typeof r.note, 'string');
      if (input.isWellFormed()) assert.ok(r.text.isWellFormed(), `${op.id} on ${name} keeps surrogate pairs whole`);
      if (name === 'oneMB') assert.ok(ms < 4000, `${op.id} took ${ms | 0}ms on 1 MB`);
      if (op.detect) assert.equal(typeof op.detect(input), 'number', `${op.id}.detect returns a number`);
    }
  });
}
