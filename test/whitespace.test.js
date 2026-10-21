import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, run, op } from './helpers.js';

test('remove-extra-spaces', async () => {
  assert.equal(await t('remove-extra-spaces', '  a   b\u00A0\u00A0c  \n\n\n\nd'), 'a b c\n\nd');
  assert.equal(await t('remove-extra-spaces', 'a  b\r\nc', { normaliseBreaks: false }), 'a b\r\nc');
  assert.equal(await t('remove-extra-spaces', 'a\n\n b ', { singleLine: true }), 'a b');
  const r = await run(await op('remove-extra-spaces'), 'a    b');
  assert.equal(r.note, '3 removed, 50% shorter');
  assert.equal(await t('remove-extra-spaces', 'a\u200B  b'), 'a\u200B b');
});

test('remove-all-spaces', async () => {
  assert.equal(await t('remove-all-spaces', 'a b\tc\nd e'), 'abc\nde');
  assert.equal(await t('remove-all-spaces', 'a b\r\nc', { breaks: true }), 'abc');
});

test('trim', async () => {
  assert.equal(await t('trim', '  a  \r\n  b  '), 'a\r\nb');
  assert.equal(await t('trim', '  a  ', { side: 'leading' }), 'a  ');
  assert.equal(await t('trim', '  a  ', { side: 'trailing' }), '  a');
  assert.equal(await t('trim', '\n  a \n b \n', { scope: 'all' }), 'a \n b');
});

test('empty and blank lines', async () => {
  assert.equal(await t('remove-empty-lines', 'a\r\n\r\n  \r\nb'), 'a\r\nb');
  assert.equal(await t('remove-empty-lines', 'a\n  \nb', { ws: false }), 'a\n  \nb');
  assert.equal(await t('collapse-blank-lines', 'a\n\n\n\nb\n\nc'), 'a\n\nb\n\nc');
  assert.equal(await t('collapse-blank-lines', 'a\n\n\nb', { max: 0 }), 'a\nb');
});

test('remove-line-breaks', async () => {
  assert.equal(await t('remove-line-breaks', 'a\r\n b\nc'), 'a b c');
  assert.equal(await t('remove-line-breaks', 'a\nb', { joiner: 'none' }), 'ab');
  assert.equal(await t('remove-line-breaks', 'a\nb\n\nc\nd', { paragraphs: true }), 'a b\n\nc d');
});

test('tabs and spaces', async () => {
  assert.equal(await t('tabs-to-spaces', 'a\tb\n\tc', { width: 4 }), 'a   b\n    c');
  assert.equal(await t('spaces-to-tabs', '      x', { width: 4 }), '\t  x');
  assert.equal(await t('spaces-to-tabs', 'a    b', { leading: false }), 'a\tb');
});

test('normalise-line-endings', async () => {
  assert.equal(await t('normalise-line-endings', 'a\r\nb\rc\nd'), 'a\nb\nc\nd');
  assert.equal(await t('normalise-line-endings', 'a\nb\r\nc', { to: 'crlf' }), 'a\r\nb\r\nc');
});
