import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, run, op } from './helpers.js';

const note = async (id, text, opts) => (await run(await op(id), text, opts)).note;

test('strip-html', async () => {
  const html = '<html><head><title>x</title></head><body><h1>Title</h1><p>Hello &amp; <b>world</b>&nbsp;&#169; &#x1F600;</p>'
    + '<script>bad()</script><!-- c --><ul><li>a</li><li>b</li></ul>a<br>b</body></html>';
  assert.equal(await t('strip-html', html), 'Title\n\nHello & world \u00A9 \uD83D\uDE00\n\na\nb\n\na\nb');
  assert.equal(await t('strip-html', '<p>a</p>\r\n<p>b</p>'), 'a\r\n\r\nb');
  assert.equal(await t('strip-html', '<p>a &lt;b&gt;</p>', { decodeEntities: false }), '\n\na &lt;b&gt;\n\n'.trim());
  assert.equal(await t('strip-html', '<p>a</p><p>b<br>c</p>', { blockBreaks: false }), 'abc');
  assert.equal(await t('strip-html', '<style>p{color:red}</style><div>x &amp;lt; &#0; &bogus;</div>'), 'x &lt; &#0; &bogus;');
  assert.equal(await t('strip-html', 'a < b and c > d'), 'a < b and c > d');
  assert.equal(await t('strip-html', '<a href="x">link</a> text'), 'link text');
});

test('strip-html detect', async () => {
  const { detect } = await op('strip-html');
  assert.equal(detect(''), 0);
  assert.equal(detect('a < b'), 0);
  assert.equal(detect('if x<3 and y > 2 then'), 0);
  assert.equal(detect('plain words only'), 0);
  assert.equal(detect('use the <b> tag'), 0);
  assert.ok(detect('<p>Hi <a href="x">there</a></p><div>more</div>') > 0.5);
  assert.ok(detect('<!DOCTYPE html><html><body>x</body></html>') > 0.9);
  assert.ok(detect('line one<br>line two<br>') > 0);
});

test('strip-markdown', async () => {
  const md = '# Title #\n\n**bold** and *it* and _u_ and `co*de*` ~~gone~~\n> quote\n- item\n  * nested\n1. one\n- [x] done\n---\n'
    + '[link](http://x) ![alt](i.png) [ref][1]\n[1]: http://y\n```js\nconst a = **1**;\n```\n| a | b |\n|---|:-:|\n| 1 | 2 |\nsnake_case_word \\*lit\\*';
  assert.equal(await t('strip-markdown', md),
    'Title\n\nbold and it and u and co*de* gone\nquote\nitem\n  nested\none\ndone\nlink alt ref\nconst a = **1**;\na\tb\n1\t2\nsnake_case_word *lit*');
  assert.equal(await t('strip-markdown', '## A\r\n**b**'), 'A\r\nb');
  assert.equal(await t('strip-markdown', '~~~\n# not a heading\n~~~'), '# not a heading');
  assert.equal(await t('strip-markdown', '2 * 3 = 6'), '2 * 3 = 6');
});

test('remove-formatting', async () => {
  const fancy = '\uD835\uDC01\uD835\uDC28\uD835\uDC25\uD835\uDC1D s\u0336t\u0336r\u0336 \uFF26\uFF55\uFF4C\uFF4C z\u0351\u0352\u0353a';
  assert.equal(await t('remove-formatting', fancy), 'Bold str Full za');
  assert.equal(await t('remove-formatting', '\u201Chi\u201D \u2018yo\u2019 a\u2014b c\u2013d'), '"hi" \'yo\' a-b c-d');
  assert.equal(await t('remove-formatting', 'a\u00A0b\u200Bc\u2009d\uFEFF'), 'a bc d');
  assert.equal(await t('remove-formatting', '\u24B6\u24B7 x\u00B2 u\u0332n'), 'AB x2 un');
  assert.equal(await t('remove-formatting', 'caf\u00E9 cafe\u0301 Vi\u1EC7t'), 'caf\u00E9 caf\u00E9 Vi\u1EC7t');
  assert.equal(await t('remove-formatting', '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67'), '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67');
});

test('smart-quotes-to-straight', async () => {
  assert.equal(await t('smart-quotes-to-straight', '\u201Chi\u201D \u2018x\u2019 \u201Ey\u201C \u00ABg\u00BB'), '"hi" \'x\' "y" "g"');
  assert.equal(await t('smart-quotes-to-straight', '\u00ABg\u00BB \u2019', { guillemets: false }), '\u00ABg\u00BB \'');
  assert.equal(await note('smart-quotes-to-straight', '\u201Chi\u201D'), '2 replaced');
});

test('fancy-dashes-to-hyphens', async () => {
  assert.equal(await t('fancy-dashes-to-hyphens', 'a\u2013b\u2014c\u2212d\u2011e\u2012f\u2015g'), 'a-b-c-d-e-f-g');
  assert.equal(await t('fancy-dashes-to-hyphens', 'a\u2014b\u2013c', { emDash: 'double' }), 'a--b-c');
  assert.equal(await note('fancy-dashes-to-hyphens', 'a\u2014b\u2013c-d'), '2 replaced');
});

test('remove-invisible', async () => {
  const fam = '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67';
  assert.equal(await t('remove-invisible', '\uFEFFa\u200Bb\u00ADc\u200Ed\u202Ee\u2066f\u2060g\u180Eh ' + fam + ' x\u200Dy'), 'abcdefgh ' + fam + ' xy');
  assert.equal(await t('remove-invisible', fam, { keepJoiners: false }), '\uD83D\uDC68\uD83D\uDC69\uD83D\uDC67');
  assert.equal(await t('remove-invisible', '\u2764\uFE0F'), '\u2764\uFE0F');
  assert.equal(await note('remove-invisible', 'a\u200Bb\u200Cc'), '2 removed');
});

test('nbsp-to-space', async () => {
  assert.equal(await t('nbsp-to-space', 'a\u00A0b\u202Fc\u2007d\u2003e\u3000f\u205Fg'), 'a b c d e f g');
  assert.equal(await note('nbsp-to-space', 'a\u00A0\u00A0b'), '2 replaced');
  assert.equal(await t('nbsp-to-space', 'a\u200Bb'), 'a\u200Bb');
});

test('remove-accents', async () => {
  assert.equal(await t('remove-accents', 'Cr\u00E8me br\u00FBl\u00E9e cafe\u0301'), 'Creme brulee cafe');
  assert.equal(await t('remove-accents', '\u0141\u00F3d\u017A Stra\u00DFe \u00C6sir \u00F8 \u0111 \u0153 \u00FE \u00F0 \u0131'), 'Lodz Strasse AEsir o d oe th d i');
  assert.equal(await t('remove-accents', '\u65E5\u672C\u8A9E \u304C \uD55C\uAD6D \uD83D\uDE00'), '\u65E5\u672C\u8A9E \u304C \uD55C\uAD6D \uD83D\uDE00');
});

test('remove-accents keeps other scripts', async () => {
  assert.equal(await t('remove-accents', '\u0439\u043E\u0433\u0443\u0440\u0442 \u0451\u0436 \u03AC'), '\u0439\u043E\u0433\u0443\u0440\u0442 \u0451\u0436 \u03AC');
});

test('unicode-normalise', async () => {
  assert.equal(await t('unicode-normalise', 'e\u0301'), '\u00E9');
  assert.equal(await t('unicode-normalise', '\u00E9', { form: 'NFD' }), 'e\u0301');
  assert.equal(await t('unicode-normalise', '\uFB01 \u00E9', { form: 'NFKC' }), 'fi \u00E9');
  assert.equal(await t('unicode-normalise', '\uFB01\u00E9', { form: 'NFKD' }), 'fie\u0301');
});

test('remove-emoji', async () => {
  const s = 'hi \uD83D\uDE00 there \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 \uD83C\uDDEC\uD83C\uDDE7 1\uFE0F\u20E3 \u00A9 \u2122 \u2764\uFE0F end \uD83D\uDC4D\uD83C\uDFFD';
  const r = await run(await op('remove-emoji'), s);
  assert.equal(r.text, 'hi there \u00A9 \u2122 end');
  assert.equal(r.note, '6 removed');
  assert.equal(await t('remove-emoji', '\uD83D\uDE00 start\r\nmid \uD83D\uDE00\uD83D\uDE00 x\r\nend \uD83D\uDE00\r\nkeep  double'), 'start\r\nmid x\r\nend\r\nkeep  double');
  assert.equal(await t('remove-emoji', 'a \uD83D\uDE00 b', { collapseSpaces: false }), 'a  b');
  assert.equal(await t('remove-emoji', 'flag \uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F!'), 'flag !');
  assert.equal(await t('remove-emoji', 'caf\u00E9 \u65E5\u672C 123 #'), 'caf\u00E9 \u65E5\u672C 123 #');
});

test('remove-urls and emails', async () => {
  assert.equal(await t('remove-urls', 'see https://example.com/a?b=1. and www.x.org, ok (http://y.io/p)'), 'see . and , ok ()');
  assert.equal(await note('remove-urls', 'http://a.com ftp://b.org'), '2 removed');
  assert.equal(await t('remove-urls', 'no links here.'), 'no links here.');
  assert.equal(await t('remove-emails', 'mail a.b+c@ex-ample.co.uk or j\u00F6rg@m\u00FCller.de now'), 'mail  or  now');
  assert.equal(await note('remove-emails', 'x@y.com and @bob'), '1 removed');
});

test('remove-numbers', async () => {
  const s = 'I have 3 cats, -4.5 dogs, 1,234 birds and version2 2nd.';
  assert.equal(await t('remove-numbers', s, { keepInWords: false }), 'I have  cats,  dogs,  birds and version nd.');
  assert.equal(await t('remove-numbers', s), 'I have  cats,  dogs,  birds and version2 2nd.');
  assert.equal(await t('remove-numbers', s, { keepInWords: true }), 'I have  cats,  dogs,  birds and version2 2nd.');
  assert.equal(await note('remove-numbers', s, { keepInWords: true }), '3 removed');
  assert.equal(await t('remove-numbers', 'pi is 3.14159!', { keepInWords: true }), 'pi is !');
});

test('remove-hashtags and mentions', async () => {
  assert.equal(await t('remove-hashtags', '#hi there #tag_1 #1 a#b #caf\u00E9'), ' there  #1 a#b ');
  assert.equal(await note('remove-hashtags', '#a #b'), '2 removed');
  assert.equal(await t('remove-mentions', '@bob hi @alice_1, mail a@b.com'), ' hi , mail a@b.com');
  assert.equal(await note('remove-mentions', '@a @b @c'), '3 removed');
});

test('remove-punctuation', async () => {
  assert.equal(await t('remove-punctuation', 'Don\'t stop, \u201Cplease\u201D! \'quoted\' it\u2019s'), 'Don\'t stop please quoted it\u2019s');
  assert.equal(await t('remove-punctuation', 'Don\'t stop!', { keepApostrophes: false }), 'Dont stop');
  assert.equal(await note('remove-punctuation', 'a, b. c!'), '3 removed');
  assert.equal(await t('remove-punctuation', '\u00BFQu\u00E9? \u3001\u3002'), 'Qu\u00E9 ');
});

test('remove-special-chars', async () => {
  assert.equal(await t('remove-special-chars', 'Hi! @#$ caf\u00E9 \uD83D\uDE00 (ok) "a-b": c;'), 'Hi!  caf\u00E9  (ok) "a-b": c;');
  assert.equal(await t('remove-special-chars', 'Hi! a-b (ok) 42%', { keepBasic: false }), 'Hi ab ok 42');
  assert.equal(await note('remove-special-chars', 'a@b#c'), '2 removed');
  assert.equal(await t('remove-special-chars', '\u2764\uFE0F x'), ' x');
});

test('remove-non-ascii', async () => {
  assert.equal(await t('remove-non-ascii', 'caf\u00E9 \uD83D\uDE00 ok'), 'caf  ok');
  assert.equal(await t('remove-non-ascii', 'caf\u00E9 \uD83D\uDC68\u200D\uD83D\uDC69 e\u0301', { replacement: 'question' }), 'caf? ? e?');
  assert.equal(await note('remove-non-ascii', '\u00E9\u00E8 x \u65E5'), '3 removed');
  assert.equal(await t('remove-non-ascii', 'plain\r\nascii'), 'plain\r\nascii');
});
