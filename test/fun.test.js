import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from './helpers.js';

const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
const FLAG = '\u{1F1EC}\u{1F1E7}';
const cp = (...a) => String.fromCodePoint(...a);
const MATH_IDS = ['bold-text', 'italic-text', 'bold-italic-text', 'mono-text', 'script-text', 'double-struck-text', 'fraktur-text', 'sans-bold-text'];
const RESERVED = [0x1D455, 0x1D49D, 0x1D4A0, 0x1D4A1, 0x1D4A3, 0x1D4A4, 0x1D4A7, 0x1D4A8, 0x1D4AD, 0x1D4BA, 0x1D4BC, 0x1D4C4,
  0x1D506, 0x1D50B, 0x1D50C, 0x1D515, 0x1D51D, 0x1D53A, 0x1D53F, 0x1D545, 0x1D547, 0x1D548, 0x1D549, 0x1D551, 0x1D6A6, 0x1D6A7, 0x1D7CC, 0x1D7CD];
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

test('reverse-text', async () => {
  assert.equal(await t('reverse-text', 'Hello World 123'), '321 dlroW olleH');
  assert.equal(await t('reverse-text', `a${FAMILY}b${FLAG}e\u0301`), `e\u0301${FLAG}b${FAMILY}a`);
  assert.equal(await t('reverse-text', 'ab\r\ncd'), 'dc\r\nba');
  assert.equal(await t('reverse-text', 'one two three\r\nfour five', { mode: 'words' }), 'three two one\r\nfive four');
  assert.equal(await t('reverse-text', 'abc\r\nde\u0301f', { mode: 'lines' }), 'cba\r\nfe\u0301d');
});

test('upside-down', async () => {
  assert.equal(await t('upside-down', 'Hello World 123'), '\u0190\u1105\u0196 pl\u0279oM oll\u01DDH');
  assert.equal(await t('upside-down', 'abc\r\nxyz'), 'z\u028Ex\r\n\u0254q\u0250');
  assert.equal(await t('upside-down', 'a?!.(]{<'), '>}[)\u02D9\u00A1\u00BF\u0250');
  assert.equal(await t('upside-down', `${FLAG}${FAMILY}`), `${FAMILY}${FLAG}`);
  assert.equal(await t('upside-down', 'e\u0301'), '\u01DD\u0301');
});

test('mirror-text', async () => {
  assert.equal(await t('mirror-text', 'bdpq'), 'pqbd');
  assert.equal(await t('mirror-text', 'RE(x)'), '(x)\u018E\u042F');
  assert.equal(await t('mirror-text', 'ab\r\ncd'), 'd\u0252\r\nb\u0254');
  assert.equal(await t('mirror-text', `x${FAMILY}`), `${FAMILY}x`);
});

test('small-caps and superscript', async () => {
  assert.equal(await t('small-caps', 'Hello World 123'), 'H\u1D07\u029F\u029F\u1D0F W\u1D0F\u0280\u029F\u1D05 123');
  assert.equal(await t('small-caps', `q x ${FAMILY}`), `\u01EB x ${FAMILY}`);
  assert.equal(await t('superscript', 'Hello World 123'), '\u1D34\u1D49\u02E1\u02E1\u1D52 \u1D42\u1D52\u02B3\u02E1\u1D48 \u00B9\u00B2\u00B3');
  assert.equal(await t('superscript', '(x+0)=-9'), '\u207D\u02E3\u207A\u2070\u207E\u207C\u207B\u2079');
  assert.equal(await t('superscript', '\u65E5\r\na'), '\u65E5\r\n\u1D43');
});

test('math styles map Hello World 123', async () => {
  const hw = (U, L, D) => {
    const u = (c) => cp(U + c.charCodeAt(0) - 65), l = (c) => cp(L + c.charCodeAt(0) - 97);
    return u('H') + l('e') + l('l') + l('l') + l('o') + ' ' + u('W') + l('o') + l('r') + l('l') + l('d') + ' '
      + (D ? cp(D + 1, D + 2, D + 3) : '123');
  };
  assert.equal(await t('bold-text', 'Hello World 123'), hw(0x1D400, 0x1D41A, 0x1D7CE));
  assert.equal(await t('bold-text', 'Hi 1'), cp(0x1D407, 0x1D422, 0x20, 0x1D7CF));
  assert.equal(await t('italic-text', 'Hello World 123'), hw(0x1D434, 0x1D44E, 0));
  assert.equal(await t('italic-text', 'h'), '\u210E');
  assert.equal(await t('bold-italic-text', 'Hello World 123'), hw(0x1D468, 0x1D482, 0));
  assert.equal(await t('mono-text', 'Hello World 123'), hw(0x1D670, 0x1D68A, 0x1D7F6));
  assert.equal(await t('sans-bold-text', 'Hello World 123'), hw(0x1D5D4, 0x1D5EE, 0x1D7EC));
  assert.equal(await t('script-text', 'Hello'), cp(0x210B, 0x212F, 0x1D4C1, 0x1D4C1, 0x2134));
  assert.equal(await t('script-text', 'BEFHILMRego'), cp(0x212C, 0x2130, 0x2131, 0x210B, 0x2110, 0x2112, 0x2133, 0x211B, 0x212F, 0x210A, 0x2134));
  assert.equal(await t('double-struck-text', 'CHNPQRZ 0'), cp(0x2102, 0x210D, 0x2115, 0x2119, 0x211A, 0x211D, 0x2124, 0x20, 0x1D7D8));
  assert.equal(await t('double-struck-text', 'Hello'), cp(0x210D, 0x1D556, 0x1D55D, 0x1D55D, 0x1D560));
  assert.equal(await t('fraktur-text', 'CHIRZ a'), cp(0x212D, 0x210C, 0x2111, 0x211C, 0x2128, 0x20, 0x1D51E));
  assert.equal(await t('fraktur-text', '123'), '123');
});

test('math styles never emit reserved code points', async () => {
  for (const id of MATH_IDS) {
    const out = await t(id, AZ);
    const cps = [...out].map((c) => c.codePointAt(0));
    for (const r of RESERVED) assert.ok(!cps.includes(r), `${id} emits reserved U+${r.toString(16).toUpperCase()}`);
    assert.ok(out.isWellFormed());
    assert.ok(cps.slice(0, 52).every((c) => c > 0x2100), `${id} maps every letter`);
    assert.equal(new Set(cps.slice(0, 52)).size, 52, `${id} letters are distinct`);
  }
});

test('math styles pass through and keep accents', async () => {
  for (const id of MATH_IDS) {
    assert.equal(await t(id, `\u65E5\u672C ${FAMILY} ${FLAG}\r\n\u00F8`), `\u65E5\u672C ${FAMILY} ${FLAG}\r\n\u00F8`);
    assert.equal((await t(id, 'a\r\nb')).split('\r\n').length, 2);
  }
  assert.equal(await t('bold-text', '\u00E9'), cp(0x1D41E) + '\u0301');
  assert.equal(await t('bold-text', 'e\u0301'), cp(0x1D41E) + '\u0301');
  assert.equal(await t('bold-text', '\u00C5'), cp(0x1D400) + '\u030A');
});

test('bubble-text and wide-text', async () => {
  assert.equal(await t('bubble-text', 'Hello World 123'), '\u24BD\u24D4\u24DB\u24DB\u24DE \u24CC\u24DE\u24E1\u24DB\u24D3 \u2460\u2461\u2462');
  assert.equal(await t('bubble-text', 'Az09'), '\u24B6\u24E9\u24EA\u2468');
  assert.equal(await t('bubble-text', `${FAMILY}\u00E9`), `${FAMILY}\u00E9`);
  assert.equal(await t('wide-text', 'Hi 1!~'), '\uFF28\uFF49\u3000\uFF11\uFF01\uFF5E');
  assert.equal(await t('wide-text', `a\r\n${FLAG}`), `\uFF41\r\n${FLAG}`);
});

test('strikethrough and underline', async () => {
  assert.equal(await t('strikethrough', 'ab c'), 'a\u0336b\u0336 c\u0336');
  assert.equal(await t('strikethrough', `a\r\n${FAMILY}`), `a\u0336\r\n${FAMILY}\u0336`);
  assert.equal(await t('strikethrough', 'e\u0301'), 'e\u0301\u0336');
  assert.equal(await t('underline', 'a b'), 'a\u0332 \u0332b\u0332');
  assert.equal(await t('underline', 'a\r\nb'), 'a\u0332\r\nb\u0332');
});

test('zalgo', async () => {
  const strip = (s) => s.replace(/[\u0300-\u036F]/g, '');
  const input = `Hello World 123\r\n${FAMILY} ${FLAG} \u65E5`;
  for (const intensity of [1, 3, 10]) {
    const out = await t('zalgo', input, { intensity });
    assert.equal(strip(out), input);
    assert.ok(out.isWellFormed());
    assert.ok(out.length > input.length);
    assert.ok(out.includes('\r\n'));
  }
  const lo = (await t('zalgo', 'x'.repeat(2000), { intensity: 1 })).length;
  const hi = (await t('zalgo', 'x'.repeat(2000), { intensity: 10 })).length;
  assert.ok(hi > lo * 2, 'more marks at higher intensity');
  assert.equal(await t('zalgo', ' \r\n\t'), ' \r\n\t');
  const big = 'ab\uD83D\uDE00 '.repeat(300000);
  const t0 = performance.now();
  const out = await t('zalgo', big, { intensity: 10 });
  assert.ok(performance.now() - t0 < 4000);
  assert.ok(out.isWellFormed());
  assert.equal(strip(out), big);
});

test('grapheme fast path: marks, flags, Indic, Hangul, prepend, keycaps, BOM, lone surrogates', async () => {
  assert.equal(await t('reverse-text', '\uFEFFab e\u0301x \u{1F1EC}\u{1F1E7}\u{1F1FA}\u{1F1F8} \u0915\u094D\u0937\u093F \uD55C\uAD6D \u0600a 1\uFE0F\u20E3\r\nz'), 'z\r\n1\uFE0F\u20E3 \u0600a \uAD6D\uD55C \u0915\u094D\u0937\u093F \u{1F1FA}\u{1F1F8}\u{1F1EC}\u{1F1E7} xe\u0301 ba\uFEFF');
  assert.equal(await t('reverse-text', 'a\uD800b\r\nc', { mode: 'lines' }), 'b\uD800a\r\nc');
  assert.equal(await t('reverse-text', 'x\u0301y\nab\r\ncd\re\u0301', { mode: 'lines' }), 'yx\u0301\r\nba\r\ndc\r\ne\u0301');
  assert.equal(await t('upside-down', 'e\u0301a\r\nb\u00E9\n\u{1F44D}\u{1F3FD}c'), '\u0254\u{1F44D}\u{1F3FD}\r\n\u00E9q\r\n\u0250\u01DD\u0301');
  assert.equal(await t('mirror-text', 'b\u0301d\r\n(p)\nq\u200Dx'), 'bd\u0301\r\n(q)\r\nxp\u200D');
  assert.equal(await t('strikethrough', 'a e\u0301\r\n\u00A0\u{1F468}\u200D\u{1F469}\u200D\u{1F467}b\t'), 'a\u0336 e\u0301\u0336\r\n\u00A0\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u0336b\u0336\t');
  assert.equal(await t('underline', 'a\r\nb\rc\n\n e\u0301'), 'a\u0332\r\nb\u0332\rc\u0332\n\n \u0332e\u0301\u0332');
  assert.equal(await t('small-caps', '\uFEFFabc \u00E9 xyz\r\n'), '\uFEFF\u1D00\u0299\u1D04 \u00E9 x\u028F\u1D22\r\n');
  assert.equal(await t('bold-text', '\u00C9t\u00E9 \u1EA4 \u00C6 9z'), '\u{1D404}\u0301\u{1D42D}\u{1D41E}\u0301 \u{1D400}\u0302\u0301 \u00C6 \u{1D7D7}\u{1D433}');
  assert.equal(await t('wide-text', 'Hi! ~\u00E9\r\n'), '\uFF28\uFF49\uFF01\u3000\uFF5E\u00E9\r\n');
  assert.equal(await t('bubble-text', 'a0Z9 \u00E9'), '\u24D0\u24EA\u24CF\u2468 \u00E9');
  const z = await t('zalgo', 'ab e\u0301\r\n');
  assert.equal(z.replace(/[\u0300-\u036F]/g, ''), 'ab e\r\n');
  assert.ok(z.startsWith('a') && z.endsWith('\r\n') && z.isWellFormed());
});
