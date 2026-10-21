import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, run, op } from './helpers.js';

const bs = (s) => '\\' + s; // builds backslash escapes without writing them literally
const detect = async (id, s) => (await op(id)).detect(s);
const bad = (id, s, opts) => assert.rejects(() => t(id, s, opts), { name: 'OpError' });

test('base64-encode', async () => {
  assert.equal(await t('base64-encode', 'hello world'), 'aGVsbG8gd29ybGQ=');
  assert.equal(await t('base64-encode', 'caf\u00E9 \uD83D\uDE00'), 'Y2Fmw6kg8J+YgA==');
  assert.equal(await t('base64-encode', ''), '');
  assert.equal(await t('base64-encode', '\xfb\xff', { urlSafe: true }), 'w7vDvw');
  assert.equal(await t('base64-encode', '?>?', { urlSafe: false }), 'Pz4/');
  assert.equal(await t('base64-encode', '?>?', { urlSafe: true }), 'Pz4_');
  const wrapped = await t('base64-encode', 'x'.repeat(100), { lineWrap: true });
  assert.deepEqual(wrapped.split('\n').map((l) => l.length), [76, 60]);
  const big = 'caf\u00E9 \uD83D\uDE00 '.repeat(100000);
  assert.equal(await t('base64-encode', big), Buffer.from(big).toString('base64'));
});

test('base64-decode', async () => {
  assert.equal(await t('base64-decode', 'aGVsbG8gd29ybGQ='), 'hello world');
  assert.equal(await t('base64-decode', 'aGVsbG8gd29ybGQ'), 'hello world');
  assert.equal(await t('base64-decode', ' aGVs\r\nbG8g\nd29y bGQ= '), 'hello world');
  assert.equal(await t('base64-decode', 'Y2Fmw6kg8J-YgA'), 'caf\u00E9 \uD83D\uDE00');
  assert.equal(await t('base64-decode', 'Pz4_'), '?>?');
  assert.equal(await t('base64-decode', ''), '');
  await bad('base64-decode', 'abc$def');
  await bad('base64-decode', 'abcde');
  await bad('base64-decode', 'ab=cd');
  await assert.rejects(() => t('base64-decode', '//79'), { name: 'OpError', message: 'Not valid UTF-8 text' });
  const big = 'caf\u00E9 \uD83D\uDE00 '.repeat(100000);
  assert.equal(await t('base64-decode', Buffer.from(big).toString('base64')), big);
});

test('base64 detect', async () => {
  assert.ok((await detect('base64-decode', 'aGVsbG8gd29ybGQ=')) >= 0.8);
  assert.ok((await detect('base64-decode', 'VGhlIHF1aWNrIGJyb3duIGZveA==')) >= 0.8);
  assert.ok((await detect('base64-decode', 'VGhlIHF1aWNrIGJyb3duIGZveA')) >= 0.8);
  for (const s of ['', 'hello world', 'test', 'hello', 'abcdefgh', 'deadbeef', 'Hello World', 'HelloWorldFooBar',
    'The quick brown fox jumps', 'password', 'aaaaaaaaaaaaaaaaaaaa', '48656c6c6f20776f726c64', '12345678'])
    assert.equal(await detect('base64-decode', s), 0, s);
  assert.equal(await detect('base64-decode', '//79//79'), 0);
});

test('url-encode and url-decode', async () => {
  assert.equal(await t('url-encode', 'a b&c=d/\u00E9'), 'a%20b%26c%3Dd%2F%C3%A9');
  assert.equal(await t('url-encode', 'a b&c', { spacePlus: true }), 'a+b%26c');
  assert.equal(await t('url-encode', 'https://x.io/a b?q=1&r=\u00E9', { mode: 'full' }), 'https://x.io/a%20b?q=1&r=%C3%A9');
  assert.equal(await t('url-encode', '\uD83D\uDE00'), '%F0%9F%98%80');
  assert.equal(await t('url-encode', 'a' + String.fromCharCode(0xd800)), 'a%EF%BF%BD');
  assert.equal(await t('url-decode', 'a%20b%26c%3Dd%2F%C3%A9'), 'a b&c=d/\u00E9');
  assert.equal(await t('url-decode', 'a+b%2Bc'), 'a b+c');
  assert.equal(await t('url-decode', 'a+b', { plusSpace: false }), 'a+b');
  assert.equal(await t('url-decode', '%F0%9F%98%80'), '\uD83D\uDE00');
  await bad('url-decode', '100%');
  await bad('url-decode', '%E0%A4%A');
  await bad('url-decode', '%FF');
});

test('url detect', async () => {
  assert.ok((await detect('url-decode', 'q%3Dhello%20world%26x%3D1')) >= 0.7);
  assert.ok((await detect('url-decode', 'caf%C3%A9')) >= 0.7);
  for (const s of ['', 'hello world', 'test', '100% sure', 'a%20b and lots of plain words with spaces in them'])
    assert.equal(await detect('url-decode', s), 0, s);
});

test('html entities', async () => {
  assert.equal(await t('html-entity-encode', `<a href="x">Tom & Jerry's</a> caf\u00E9`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt; caf\u00E9');
  assert.equal(await t('html-entity-encode', '<caf\u00E9 \uD83D\uDE00>', { mode: 'all' }), '&lt;caf&#233; &#128512;&gt;');
  assert.equal(await t('html-entity-decode', '&lt;p&gt; &amp;amp; &quot;hi&quot; &apos;x&#39;'), '<p> &amp; "hi" \'x\'');
  assert.equal(await t('html-entity-decode', 'a&nbsp;b &copy; &mdash; &middot; &hellip; &euro;'), 'a\u00A0b \u00A9 \u2014 \u00B7 \u2026 \u20AC');
  assert.equal(await t('html-entity-decode', '&eacute;&Eacute;&szlig;&ntilde;&ouml;&yuml;&frac12;&deg;'), '\u00E9\u00C9\u00DF\u00F1\u00F6\u00FF\u00BD\u00B0');
  assert.equal(await t('html-entity-decode', '&#128512; &#x1F600; &#X41;'), '\uD83D\uDE00 \uD83D\uDE00 A');
  assert.equal(await t('html-entity-decode', '&#xD800; &#0; &#x110000;'), '\uFFFD \uFFFD \uFFFD');
  assert.equal(await t('html-entity-decode', '&bogus; & &amp &constructor; &toString;'), '&bogus; & &amp &constructor; &toString;');
  const r = await run(await op('html-entity-decode'), '&lt;&gt;&zzz;');
  assert.equal(r.note, '2 decoded');
  assert.ok((await detect('html-entity-decode', 'Tom &amp; Jerry &lt;3')) >= 0.7);
  assert.equal(await detect('html-entity-decode', 'Tom &amp; Jerry'), 0);
  assert.equal(await detect('html-entity-decode', 'hello world'), 0);
  assert.equal(await detect('html-entity-decode', '&foo; &bar;'), 0);
});

test('hex', async () => {
  assert.equal(await t('hex-encode', 'Hi \u00E9'), '48 69 20 c3 a9');
  assert.equal(await t('hex-encode', 'Hi', { separator: 'none', upper: true }), '4869');
  assert.equal(await t('hex-encode', 'Hi\u00E9', { separator: 'colon' }), '48:69:c3:a9');
  assert.equal(await t('hex-encode', 'Hi\u00E9', { separator: '0x', upper: true }), '0x48 0x69 0xC3 0xA9');
  assert.equal(await t('hex-encode', ''), '');
  assert.equal(await t('hex-decode', '68656c6c6f20776f726c64'), 'hello world');
  assert.equal(await t('hex-decode', '48 65:6C\n0x6c,0X6f'), 'Hello');
  assert.equal(await t('hex-decode', 'f09f9880'), '\uD83D\uDE00');
  await bad('hex-decode', '486');
  await bad('hex-decode', '48zz');
  await assert.rejects(() => t('hex-decode', 'deadbeef'), { name: 'OpError', message: 'Not valid UTF-8 text' });
  const big = 'caf\u00E9 \uD83D\uDE00\r\n'.repeat(80000);
  assert.equal(await t('hex-decode', await t('hex-encode', big, { separator: 'none' })), big);
});

test('hex detect', async () => {
  assert.ok((await detect('hex-decode', '48656c6c6f20776f726c64')) >= 0.8);
  assert.ok((await detect('hex-decode', '48 65 6c 6c 6f')) >= 0.8);
  assert.ok((await detect('hex-decode', '0x48 0x65 0x6c 0x6c 0x6f')) >= 0.8);
  for (const s of ['', 'deadbeef', 'face', 'cafe', 'test', 'hello world', 'decade', 'add bad cab', '486'])
    assert.ok((await detect('hex-decode', s)) < 0.5, s);
  assert.ok((await detect('hex-decode', '41424344')) < 0.5);
  const t0 = performance.now();
  for (const s of ['e83c5163316f89bfbde7d9ab23ca2e25604af290 Fix bug', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  abc.txt', 'deadbeef'.repeat(5) + '!', 'a'.repeat(5000) + '!'])
    assert.equal(await detect('hex-decode', s), 0, s);
  assert.ok(performance.now() - t0 < 50, 'hex detect is linear');
});

test('binary', async () => {
  assert.equal(await t('binary-encode', 'Hi'), '01001000 01101001');
  assert.equal(await t('binary-encode', '\u00E9'), '11000011 10101001');
  assert.equal(await t('binary-decode', '01001000 01101001'), 'Hi');
  assert.equal(await t('binary-decode', '0100100001101001\n11000011,10101001'), 'Hi\u00E9');
  await bad('binary-decode', '0100100');
  await bad('binary-decode', '01001002');
  await bad('binary-decode', '11111111');
  assert.ok((await detect('binary-decode', '01001000 01101001')) >= 0.9);
  assert.ok((await detect('binary-decode', '0100100001101001')) >= 0.5);
  for (const s of ['', '0101', '1 0 1 0', 'hello', '10101010 1010', '00000001 00000010'])
    assert.equal(await detect('binary-decode', s), 0, s);
});

test('decimal', async () => {
  assert.equal(await t('decimal-encode', 'Hi\u00E9\uD83D\uDE00'), '72 105 233 128512');
  assert.equal(await t('decimal-encode', 'Hi\u00E9', { mode: 'utf8' }), '72 105 195 169');
  assert.equal(await t('decimal-decode', '72 105 233 128512'), 'Hi\u00E9\uD83D\uDE00');
  assert.equal(await t('decimal-decode', '72,105, 195\n169', { mode: 'utf8' }), 'Hi\u00E9');
  await bad('decimal-decode', '72 abc');
  await bad('decimal-decode', '55296');
  await bad('decimal-decode', '9999999');
  await bad('decimal-decode', '300', { mode: 'utf8' });
  await bad('decimal-decode', '195', { mode: 'utf8' });
  const big = 'ab\u00E9\uD83D\uDE00 '.repeat(100000);
  assert.equal(await t('decimal-decode', await t('decimal-encode', big)), big);
});

test('unicode-escape', async () => {
  assert.equal(await t('unicode-escape', 'caf\u00E9 \uD83D\uDE00'), 'caf' + bs('u00E9') + ' ' + bs('uD83D') + bs('uDE00'));
  assert.equal(await t('unicode-escape', 'a\u00E9', { mode: 'all' }), bs('u0061') + bs('u00E9'));
  assert.equal(await t('unicode-escape', '\u00E9\uD83D\uDE00', { style: 'es6' }), bs('u{00E9}') + bs('u{1F600}'));
  assert.equal(await t('unicode-escape', 'x\u00E9\uD83D\uDE00', { style: 'uplus' }), 'xU+00E9U+1F600');
  const lone = 'a' + String.fromCharCode(0xd800) + 'b';
  assert.equal(await t('unicode-escape', lone), 'a' + bs('uD800') + 'b');
});

test('unicode-unescape', async () => {
  assert.equal(await t('unicode-unescape', 'caf' + bs('u00e9') + ' ' + bs('uD83D') + bs('uDE00')), 'caf\u00E9 \uD83D\uDE00');
  assert.equal(await t('unicode-unescape', bs('u{1F600}') + bs('u{e9}') + ' U+00E9 U+1F600 ' + bs('x41')), '\uD83D\uDE00\u00E9 \u00E9 \uD83D\uDE00 A');
  const lone = 'a' + bs('uD800') + 'b' + bs('uDE00');
  const out = await t('unicode-unescape', lone);
  assert.equal(out, lone);
  assert.ok(out.isWellFormed());
  assert.equal(await t('unicode-unescape', bs('u{110000}')), bs('u{110000}'));
  const r = await run(await op('unicode-unescape'), bs('u0041') + bs('u0042'));
  assert.deepEqual(r, { text: 'AB', note: '2 unescaped' });
  for (const s of ['caf\u00E9 \uD83D\uDE00 \u65E5\u672C', 'Hi\u00E9 there']) assert.equal(await t('unicode-unescape', await t('unicode-escape', s)), s);
  assert.ok((await detect('unicode-unescape', bs('u0048') + bs('u0069'))) >= 0.7);
  assert.equal(await detect('unicode-unescape', 'one ' + bs('u0048')), 0);
  assert.equal(await detect('unicode-unescape', 'hello world'), 0);
});

test('json-escape and json-unescape', async () => {
  const s = 'He said "hi"\n\tC:' + bs('x') + ' \u00E9';
  assert.equal(await t('json-escape', s), 'He said ' + bs('"hi') + bs('"') + bs('n') + bs('t') + 'C:' + bs(bs('x')) + ' \u00E9');
  assert.equal(await t('json-escape', 'a"b', { quotes: true }), '"a' + bs('"') + 'b"');
  assert.equal(await t('json-unescape', await t('json-escape', s)), s);
  assert.equal(await t('json-unescape', await t('json-escape', s, { quotes: true })), s);
  assert.equal(await t('json-unescape', bs('u00e9') + bs('uD83D') + bs('uDE00')), '\u00E9\uD83D\uDE00');
  assert.equal(await t('json-unescape', 'line1\r\nline2'), 'line1\r\nline2');
  await bad('json-unescape', 'bad ' + bs('q'));
  await bad('json-unescape', 'a"b');
});

test('rot13, rot47, caesar', async () => {
  assert.equal(await t('rot13', 'Hello, World! \u00E9'), 'Uryyb, Jbeyq! \u00E9');
  assert.equal(await t('rot13', await t('rot13', 'Round Trip')), 'Round Trip');
  assert.equal(await t('rot47', 'Hello, World!'), 'w6==@[ (@C=5P');
  assert.equal(await t('rot47', await t('rot47', 'a~!z 9')), 'a~!z 9');
  assert.equal(await t('caesar', 'Hello xyz'), 'Khoor abc');
  assert.equal(await t('caesar', 'Khoor abc', { shift: -3 }), 'Hello xyz');
  assert.equal(await t('caesar', 'Abc', { shift: 25 }), 'Zab');
  assert.equal(await t('caesar', 'Abc \uD83D\uDE00', { shift: 0 }), 'Abc \uD83D\uDE00');
});

test('morse', async () => {
  assert.equal(await t('morse-encode', 'SOS help'), '... --- ... / .... . .-.. .--.');
  assert.equal(await t('morse-encode', 'a1?\r\nb'), '.- .---- ..--..\r\n-...');
  const r = await run(await op('morse-encode'), 'hi \u00E9\uD83D\uDE00!');
  assert.deepEqual(r, { text: '.... .. / -.-.--', note: '2 skipped' });
  assert.equal(await t('morse-decode', '... --- ... / .... . .-.. .--.'), 'SOS HELP');
  assert.equal(await t('morse-decode', '.... ..   -.-.--'), 'HI !');
  assert.equal(await t('morse-decode', '\u2022\u2022\u2022 ___ \u00B7\u00B7\u00B7'), 'SOS');
  const u = await run(await op('morse-decode'), '.- ........ -');
  assert.deepEqual(u, { text: 'A?T', note: '1 unknown' });
  assert.ok((await detect('morse-decode', '... --- ...')) >= 0.8);
  for (const s of ['', '...', '- -', 'hello world', 'a - b', '---------- ---------- ----------'])
    assert.equal(await detect('morse-decode', s), 0, s);
});

test('nato-phonetic', async () => {
  assert.equal(await t('nato-phonetic', 'Hi 42'), 'Hotel India / Four Two');
  assert.equal(await t('nato-phonetic', 'xy\u00E9!\r\nz'), 'X-ray Yankee Echo !\r\nZulu');
  assert.equal(await t('nato-phonetic', 'Hotel India / Four Two', { direction: 'decode' }), 'hi 42');
  assert.equal(await t('nato-phonetic', 'alpha JULIET xray niner Bogus !', { direction: 'decode' }), 'ajx9?!');
  assert.equal(await t('nato-phonetic', await t('nato-phonetic', 'abc xyz 019'), { direction: 'decode' }), 'abc xyz 019');
});

test('morse and NATO spell non-ASCII and CRLF', async () => {
  const r = await run(await op('morse-encode'), 'Stra\u00DFe \u00E9t\u00E9\r\n  sos\u00A0ok');
  assert.equal(r.text, '... - .-. .- ... ... . / -\r\n... --- ... / --- -.-');
  assert.equal(r.note, '2 skipped');
  assert.equal(await t('nato-phonetic', '\u00E9t\u00E9 9\r\nA\u{1F600} b'), 'Echo Tango Echo / Nine\r\nAlfa \u{1F600} / Bravo');
});
