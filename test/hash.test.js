import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { t } from './helpers.js';

const node = (alg, s) => createHash(alg).update(s, 'utf8').digest('hex');
const big = 'The  quick brown fox, caf\u00E9 \u201Cquoted\u201D jumps over 42 dogs \uD83D\uDE00\r\n'.repeat(15000);
const randomUnicode = (n) => {
  const pools = [[0x20, 0x7e], [0xa0, 0x24f], [0x4e00, 0x4fff], [0x1f300, 0x1f64f]];
  let s = '';
  for (let i = 0; i < n; i++) { const [a, b] = pools[i % 4]; s += String.fromCodePoint(a + Math.floor(Math.random() * (b - a))); }
  return s;
};

test('md5 known vectors', async () => {
  assert.equal(await t('md5', ''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(await t('md5', 'abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(await t('md5', 'The quick brown fox jumps over the lazy dog'), '9e107d9d372bb6826bd81d3542a419d6');
  assert.equal(await t('md5', 'caf\u00E9'), node('md5', 'caf\u00E9'));
  assert.equal(await t('md5', 'caf\u00E9'), '07117fe4a1ebd544965dc19573183da2');
  for (const n of [55, 56, 63, 64, 65, 119, 120, 128]) assert.equal(await t('md5', 'a'.repeat(n)), node('md5', 'a'.repeat(n)), `len ${n}`);
});

test('sha and crc known vectors', async () => {
  assert.equal(await t('sha1', 'abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(await t('sha256', 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await t('sha256', ''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await t('sha512', 'abc'), node('sha512', 'abc'));
  assert.equal(await t('crc32', '123456789'), 'cbf43926');
  assert.equal(await t('crc32', ''), '00000000');
  assert.equal(await t('crc32', 'caf\u00E9'), (await import('node:zlib')).crc32('caf\u00E9').toString(16).padStart(8, '0'));
});

test('hashes match node:crypto on random unicode and 1 MB', async () => {
  for (let i = 0; i < 20; i++) {
    const s = randomUnicode(1 + Math.floor(Math.random() * 300));
    for (const [id, alg] of [['md5', 'md5'], ['sha1', 'sha1'], ['sha256', 'sha256'], ['sha512', 'sha512']]) assert.equal(await t(id, s), node(alg, s), `${id} ${i}`);
  }
  const t0 = performance.now();
  assert.equal(await t('md5', big), node('md5', big));
  assert.ok(performance.now() - t0 < 1500, 'md5 1 MB fast');
  for (const id of ['sha1', 'sha256', 'sha512']) assert.equal(await t(id, big), node(id, big));
  const zlib = await import('node:zlib');
  assert.equal(await t('crc32', big), zlib.crc32(big).toString(16).padStart(8, '0'));
});

test('perLine hashing keeps line endings', async () => {
  assert.equal(await t('md5', 'abc\r\n\r\nabc', { perLine: true }), ['900150983cd24fb0d6963f7d28e17f72', 'd41d8cd98f00b204e9800998ecf8427e', '900150983cd24fb0d6963f7d28e17f72'].join('\r\n'));
  assert.equal(await t('sha256', 'abc\nabc', { perLine: true }), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad\nba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await t('sha1', 'a\nb', { perLine: true }), `${node('sha1', 'a')}\n${node('sha1', 'b')}`);
  assert.equal(await t('sha512', 'a\nb', { perLine: true }), `${node('sha512', 'a')}\n${node('sha512', 'b')}`);
  assert.equal(await t('crc32', '123456789\n123456789', { perLine: true }), 'cbf43926\ncbf43926');
});

test('uuid-v4', async () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(await t('uuid-v4', 'ignored'), re);
  const many = (await t('uuid-v4', '', { count: 50 })).split('\n');
  assert.equal(many.length, 50);
  assert.equal(new Set(many).size, 50);
  for (const u of many) assert.match(u, re);
  assert.match(await t('uuid-v4', '', { upper: true }), /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  assert.equal((await t('uuid-v4', '', { count: 5000 })).split('\n').length, 1000);
});

test('lorem-ipsum', async () => {
  const p = await t('lorem-ipsum', '');
  assert.ok(p.startsWith('Lorem ipsum dolor sit amet'));
  assert.equal(p.split('\n\n').length, 3);
  const w = await t('lorem-ipsum', '', { unit: 'words', count: 7 });
  assert.equal(w.split(' ').length, 7);
  assert.ok(w.startsWith('Lorem ipsum dolor sit amet '));
  assert.equal(await t('lorem-ipsum', '', { unit: 'words', count: 2 }), 'Lorem ipsum');
  const s = await t('lorem-ipsum', '', { unit: 'sentences', count: 4 });
  assert.equal(s.match(/\./g).length, 4);
  assert.ok(s.startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit.'));
  const r = await t('lorem-ipsum', '', { unit: 'sentences', count: 3, classic: false });
  assert.match(r, /^[A-Z][a-z, ]+\.( [A-Z][a-z, ]+\.){2}$/);
  assert.equal((await t('lorem-ipsum', '', { count: 1000 })).split('\n\n').length, 1000);
});

test('random-string', async () => {
  const one = await t('random-string', '');
  assert.match(one, /^[A-Za-z0-9]{16}$/);
  const many = (await t('random-string', '', { length: 8, count: 20 })).split('\n');
  assert.equal(many.length, 20);
  assert.ok(many.every((s) => /^[A-Za-z0-9]{8}$/.test(s)));
  assert.match(await t('random-string', '', { length: 200, upper: false, lower: false }), /^[0-9]{200}$/);
  assert.match(await t('random-string', '', { length: 200, upper: false, lower: false, digits: false, symbols: true }), /^[^A-Za-z0-9\s]{200}$/);
  const na = await t('random-string', '', { length: 5000, noAmbiguous: true });
  assert.ok(!/[0O1lI]/.test(na));
  await assert.rejects(() => t('random-string', '', { upper: false, lower: false, digits: false }), { name: 'OpError', message: 'Pick at least one character set' });
  const counts = {};
  for (const c of await t('random-string', '', { length: 10000, upper: false, lower: false })) counts[c] = (counts[c] || 0) + 1;
  assert.equal(Object.keys(counts).length, 10);
  assert.ok(Object.values(counts).every((n) => n > 800 && n < 1200), 'roughly uniform');
});

test('invisible-text', async () => {
  assert.equal(await t('invisible-text', 'x'), '\u2800');
  assert.equal(await t('invisible-text', '', { kind: 'hangul', count: 3 }), '\u3164\u3164\u3164');
  assert.equal(await t('invisible-text', '', { kind: 'zwsp', count: 2 }), '\u200B\u200B');
  assert.equal(await t('invisible-text', '', { kind: 'space' }), '\u2003');
});
