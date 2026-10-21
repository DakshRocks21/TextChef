import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from './helpers.js';

test('upper and lower', async () => {
  assert.equal(await t('upper-case', 'Hello w\u00F6rld \u00DF \uD83D\uDE00\r\nx'), 'HELLO W\u00D6RLD SS \uD83D\uDE00\r\nX');
  assert.equal(await t('lower-case', 'HeLLo \u00C9T\u00C9 \u0394'), 'hello \u00E9t\u00E9 \u03B4');
});

test('title-case', async () => {
  assert.equal(await t('title-case', 'the lord of the rings: the return of the king'), 'The Lord of the Rings: The Return of the King');
  assert.equal(await t('title-case', 'NASA and the USA go to the moon'), 'NASA and the USA Go to the Moon');
  assert.equal(await t('title-case', 'THE QUICK BROWN FOX'), 'The Quick Brown Fox');
  assert.equal(await t('title-case', 'a well-known story of iPhone users'), 'A Well-Known Story of iPhone Users');
  assert.equal(await t('title-case', 'what is it made of'), 'What Is It Made Of');
  assert.equal(await t('title-case', 'one of two\r\nin the end'), 'One of Two\r\nIn the End');
  assert.equal(await t('title-case', 'war and peace', { style: 'all' }), 'War And Peace');
  assert.equal(await t('title-case', 'don\u2019t stop \u00E9t\u00E9 in paris'), 'Don\u2019t Stop \u00C9t\u00E9 in Paris');
  assert.equal(await t('title-case', ''), '');
});

test('sentence-case', async () => {
  assert.equal(await t('sentence-case', 'HELLO WORLD. this is i. what? yes!\n\nnew para i\'m here. i.e. ok'),
    'Hello world. This is I. What? Yes!\n\nNew para I\'m here. I.e. Ok');
  assert.equal(await t('sentence-case', '"quoted START." next one'), '"Quoted start." Next one');
  assert.equal(await t('sentence-case', 'a\r\n\r\nb'), 'A\r\n\r\nB');
});

test('capitalise-words', async () => {
  assert.equal(await t('capitalise-words', 'hello wORLD don\'t \'quoted\' well-known \u00E9t\u00E9'), 'Hello WORLD Don\'t \'Quoted\' Well-Known \u00C9t\u00E9');
});

test('alternating and invert', async () => {
  assert.equal(await t('alternating-case', 'hello world'), 'hElLo WoRlD');
  assert.equal(await t('alternating-case', 'a1 b! c'), 'a1 B! c');
  assert.equal(await t('invert-case', 'Hello World \u00C9t\u00E9 \uD83D\uDE00'), 'hELLO wORLD \u00E9T\u00C9 \uD83D\uDE00');
});

test('programming cases', async () => {
  const s = 'XMLHttpRequest version2Beta';
  assert.equal(await t('snake-case', s), 'xml_http_request_version2_beta');
  assert.equal(await t('kebab-case', s), 'xml-http-request-version2-beta');
  assert.equal(await t('dot-case', s), 'xml.http.request.version2.beta');
  assert.equal(await t('camel-case', s), 'xmlHttpRequestVersion2Beta');
  assert.equal(await t('pascal-case', s), 'XmlHttpRequestVersion2Beta');
  assert.equal(await t('constant-case', s), 'XML_HTTP_REQUEST_VERSION2_BETA');
  assert.equal(await t('path-case', s), 'xml/http/request/version2/beta');
  assert.equal(await t('train-case', s), 'Xml-Http-Request-Version2-Beta');
  assert.equal(await t('snake-case', 'Caf\u00E9 au lait\r\n\r\nfoo-bar_baz'), 'cafe_au_lait\r\n\r\nfoo_bar_baz');
  assert.equal(await t('camel-case', '  Hello, World!  \n!!!\nsome_var'), 'helloWorld\n\nsomeVar');
  assert.equal(await t('kebab-case', '\u65E5\u672C \u0394\u03B5\u03BB\u03C4\u03B1 fooBar'), '\u65E5\u672C-\u03B4\u03B5\u03BB\u03C4\u03B1-foo-bar');
  assert.equal(await t('constant-case', 'api key'), 'API_KEY');
  assert.equal(await t('train-case', 'content type'), 'Content-Type');
  assert.equal(await t('pascal-case', 'ABCDef ghi'), 'AbcDefGhi');
});

test('fast paths: non-ASCII, astral, lone surrogates, mixed line endings', async () => {
  assert.equal(await t('invert-case', 'A\u00DF \u{10400}\u{10428} \u0130x \u01C5 \uFEFFq\r\n\u00C9\u0301z'), 'aSS \u{10428}\u{10400} i\u0307X \u01C5 \uFEFFQ\r\n\u00E9\u0301Z');
  assert.equal(await t('invert-case', 'a\uD800B\uDC00c'), 'A\uD800b\uDC00C');
  assert.equal(await t('alternating-case', '\uFEFFab \u00E9\u00C9 \u{10400}\u{10400} 1\u02B0x \u00DFy'), '\uFEFFaB \u00E9\u00C9 \u{10428}\u{10400} 1\u02B0X \u00DFY');
  assert.equal(await t('alternating-case', 'a\uDC00b'), 'a\uDC00B');
  assert.equal(await t('title-case', '\u00E9t\u00E9 of \u00C9T\u00C9\r\nthe end\rof it\nl\u2019\u00E9t\u00E9 is a well-known x-ray: of course'), '\u00C9t\u00E9 of \u00C9T\u00C9\r\nThe End\r\nOf It\r\nL\u2019\u00E9t\u00E9 Is a Well-Known X-Ray: Of Course');
  assert.equal(await t('title-case', 'an \u{10428}\u{10428} and the NASA\u00C9 of e\u0301clair. of'), 'An \u{10400}\u{10428} and the NASA\u00C9 of E\u0301clair. Of');
  assert.equal(await t('title-case', 'IN THE \u00C9T\u00C9 OF \u{10400}\u{10400}', { style: 'all' }), 'In The \u00C9t\u00E9 Of \u{10400}\u{10428}');
  assert.equal(await t('snake-case', '\u00C9cole\u0301 na\u00EFveCaf\u00E9\r\n\u01C5ungla \u{10400}\u{10428}B\nABCd\u0663e'), 'ecole_naive_cafe\r\n\u01C6ungla_\u{10428}\u{10428}_b\r\nab_cd\u0663e');
  assert.equal(await t('camel-case', '\u00C9cole na\u00EFveCaf\u00E9\r\nfoo\u0903bar \u0130stanbul'), 'ecoleNaiveCafe\r\nfooBarIstanbul');
  assert.equal(await t('train-case', 'hello-WORLD XMLParser\u00C9t\u00E9\rx'), 'Hello-World-Xml-Parser-Ete\rX');
});
