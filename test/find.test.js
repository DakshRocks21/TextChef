import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, run, op } from './helpers.js';

const r = async (id, text, opts) => run(await op(id), text, opts);

test('find-and-replace plain', async () => {
  const a = await r('find-and-replace', 'Cat cat CAT dog', { find: 'cat', replace: 'X' });
  assert.equal(a.text, 'X X X dog');
  assert.equal(a.note, '3 matches');
  assert.equal((await r('find-and-replace', 'cat', { find: 'cat', replace: 'X' })).note, '1 match');
  const none = await r('find-and-replace', 'abc', { find: 'z', replace: 'X' });
  assert.equal(none.text, 'abc');
  assert.equal(none.note, 'No matches');
  const empty = await r('find-and-replace', 'abc', { find: '', replace: 'X' });
  assert.equal(empty.text, 'abc');
  assert.equal(empty.note, '');
  assert.equal(await t('find-and-replace', 'Cat cat', { find: 'cat', replace: 'X', caseSensitive: true }), 'Cat X');
  assert.equal(await t('find-and-replace', 'cat concat cat.', { find: 'cat', replace: 'dog', wholeWord: true }), 'dog concat dog.');
  assert.equal(await t('find-and-replace', 'caf\u00E9s caf\u00E9', { find: 'caf\u00E9', replace: 'x', wholeWord: true }), 'caf\u00E9s x');
  assert.equal(await t('find-and-replace', 'price 5', { find: '5', replace: '$1.00 $&' }), 'price $1.00 $&');
  assert.equal(await t('find-and-replace', 'a+b (c) [d] $5.00 C++ a-b', { find: '$5.00', replace: 'X' }), 'a+b (c) [d] X C++ a-b');
  assert.equal(await t('find-and-replace', 'C++ and C', { find: 'C++', replace: 'Rust' }), 'Rust and C');
  assert.equal(await t('find-and-replace', '[x] y', { find: '[x]', replace: 'ok' }), 'ok y');
  assert.equal(await t('find-and-replace', 'a-b', { find: 'a-b', replace: 'z' }), 'z');
  assert.equal(await t('find-and-replace', 'a\nb\r\nc', { find: '\\n', replace: ', ' }), 'a, b\r, c');
  assert.equal(await t('find-and-replace', 'a b', { find: ' ', replace: '\\t' }), 'a\tb');
  assert.equal(await t('find-and-replace', 'I \u2764 \uD83D\uDE00', { find: '\uD83D\uDE00', replace: '!' }), 'I \u2764 !');
  assert.equal(await t('find-and-replace', '\u00C9COLE', { find: '\u00E9cole', replace: 'x' }), 'x');
});

test('find-and-replace regex', async () => {
  assert.equal(await t('find-and-replace', 'John Smith', { find: '(\\w+) (\\w+)', replace: '$2, $1', regex: true }), 'Smith, John');
  assert.equal(await t('find-and-replace', '2024-01-31', { find: '(?<y>\\d+)-(?<m>\\d+)-(?<d>\\d+)', replace: '$<d>/$<m>/$<y>', regex: true }), '31/01/2024');
  assert.equal(await t('find-and-replace', 'ab', { find: '\\w', replace: '[$&]', regex: true }), '[a][b]');
  const z = await r('find-and-replace', 'abc', { find: '', replace: 'x', regex: true });
  assert.equal(z.note, '');
  const zl = await r('find-and-replace', 'ab', { find: 'x*', replace: '-', regex: true });
  assert.equal(zl.text, '-a-b-');
  assert.equal(zl.note, '3 matches');
  assert.equal(await t('find-and-replace', '\uD83D\uDE00\uD83D\uDE01', { find: '.', replace: 'x', regex: true }), 'xx');
  assert.equal(await t('find-and-replace', 'a1 b2', { find: '\\d', replace: '\\n', regex: true }), 'a\n b\n');
  assert.equal(await t('find-and-replace', 'A-a', { find: '\\-', replace: '+', regex: true }), 'A+a');
  assert.equal(await t('find-and-replace', 'cat concat', { find: 'c\\w+', replace: 'X', regex: true, wholeWord: true }), 'X X');
  assert.equal(await t('find-and-replace', 'cat concat', { find: 'cat', replace: 'X', regex: true, wholeWord: true }), 'X concat');
  await assert.rejects(() => t('find-and-replace', 'a', { find: '(', regex: true }), { name: 'OpError', message: /^Invalid regex: / });
  await assert.rejects(() => t('find-and-replace', 'a', { find: '[', regex: true }), { name: 'OpError' });
});

test('regex-tester', async () => {
  const a = await r('regex-tester', 'a1 b22', { pattern: '([a-z])(\\d+)' });
  assert.equal(a.text, '0\ta1\t$1=a\t$2=1\n3\tb22\t$1=b\t$2=22');
  assert.equal(a.note, '2 matches');
  assert.equal((await r('regex-tester', 'a1 b22', { pattern: '\\d+', flags: '' })).text, '1\t1');
  assert.equal((await r('regex-tester', 'A a', { pattern: 'a', flags: 'gi' })).note, '2 matches');
  assert.equal((await r('regex-tester', 'abc', { pattern: 'z' })).note, '0 matches');
  const zl = await r('regex-tester', '\uD83D\uDE00b', { pattern: 'x*', flags: 'gu' });
  assert.equal(zl.note, '3 matches');
  assert.equal(zl.text, '0\t\n2\t\n3\t');
  assert.equal((await r('regex-tester', 'ab', { pattern: 'x*', flags: 'g' })).note, '3 matches');
  assert.equal((await r('regex-tester', 'a\nb', { pattern: 'a\\nb' })).text, '0\ta\\nb');
  assert.equal((await r('regex-tester', 'ab', { pattern: '(x)?b' })).text, '1\tb\t$1=');
  const big = await r('regex-tester', 'a'.repeat(20000), { pattern: 'a' });
  assert.equal(big.note, '10000+ matches');
  assert.equal(big.text.split('\n').length, 10000);
  const e = await r('regex-tester', 'keep', { pattern: '' });
  assert.equal(e.text, 'keep');
  assert.equal(e.note, '');
  await assert.rejects(() => t('regex-tester', 'a', { pattern: '(' }), { name: 'OpError', message: /^Invalid regex/ });
  await assert.rejects(() => t('regex-tester', 'a', { pattern: 'a', flags: 'x' }), { name: 'OpError' });
  await assert.rejects(() => t('regex-tester', 'a', { pattern: 'a', flags: 'gg' }), { name: 'OpError' });
});

test('extract-emails', async () => {
  const a = await r('extract-emails', 'Mail bob@example.com, Ann.Lee+tag@sub.mail.co.uk. Again bob@example.com; not@valid');
  assert.equal(a.text, 'bob@example.com\nAnn.Lee+tag@sub.mail.co.uk');
  assert.equal(a.note, '2 found');
  assert.equal(await t('extract-emails', 'x@y.io x@y.io', { unique: false }), 'x@y.io\nx@y.io');
  assert.equal(await t('extract-emails', '<jos\u00E9@caf\u00E9.fr>'), 'jos\u00E9@caf\u00E9.fr');
  assert.equal((await r('extract-emails', 'nothing here')).note, '0 found');
});

test('extract-urls', async () => {
  const a = await r('extract-urls', 'See https://example.com/a?b=1. Also (http://x.org/path), www.test.com; ftp://f.net/file!');
  assert.equal(a.text, 'https://example.com/a?b=1\nhttp://x.org/path\nwww.test.com\nftp://f.net/file');
  assert.equal(a.note, '4 found');
  assert.equal(await t('extract-urls', 'Wiki https://en.wikipedia.org/wiki/Foo_(bar).'), 'https://en.wikipedia.org/wiki/Foo_(bar)');
  assert.equal(await t('extract-urls', 'a http://a.com b http://a.com', { unique: false }), 'http://a.com\nhttp://a.com');
  assert.equal(await t('extract-urls', '<https://a.com/x>"'), 'https://a.com/x');
  assert.equal(await t('extract-urls', '\u201Chttps://a.com\u201D'), 'https://a.com');
  assert.equal(await t('extract-urls', 'http://a.com\u200Bnext'), 'http://a.com');
  assert.equal(await t('extract-urls', 'HTTPS://A.COM/x'), 'HTTPS://A.COM/x');
});

test('extract-numbers', async () => {
  const a = await r('extract-numbers', 'Paid 1,234.5 and -7, then 3.14 or 42 (x2) and 42');
  assert.equal(a.text, '1,234.5\n-7\n3.14\n42\n2');
  assert.equal(a.note, '5 found');
  assert.equal(await t('extract-numbers', '5-3 1.2.3', { unique: false }), '5\n3\n1.2');
  assert.equal(await t('extract-numbers', '7 7 7', { unique: false }), '7\n7\n7');
  assert.equal(await t('extract-numbers', 'no digits'), '');
});

test('extract-hashtags', async () => {
  const a = await r('extract-hashtags', '#hello world #caf\u00E9 #2024goals #1 a#b #hello &#39;');
  assert.equal(a.text, '#hello\n#caf\u00E9\n#2024goals');
  assert.equal(a.note, '3 found');
  assert.equal(await t('extract-hashtags', '#a #a', { unique: false }), '#a\n#a');
});

test('extract-ips', async () => {
  const a = await r('extract-ips', 'Hosts 192.168.0.1, 10.0.0.255:8080 and 256.1.1.1 and 1.2.3.999 and 8.8.8.8.');
  assert.equal(a.text, '192.168.0.1\n10.0.0.255\n8.8.8.8');
  assert.equal(a.note, '3 found');
  assert.equal(await t('extract-ips', 'v6 2001:db8::1 and ::1 and fe80:0:0:0:0:0:0:1 and std::cout and 12:30'), '2001:db8::1\n::1\nfe80:0:0:0:0:0:0:1');
  assert.equal(await t('extract-ips', '1.1.1.1 1.1.1.1', { unique: false }), '1.1.1.1\n1.1.1.1');
  assert.equal(await t('extract-ips', 'version 1.2.3.4.5'), '');
});

test('extract-dates', async () => {
  const s = 'On 2024-01-31, 31/01/2024, 01-31-2024, 31.01.2024, Jan 31, 2024 and 31 January 2024. Not 2024-13-01 or 45/45/2024.';
  const a = await r('extract-dates', s);
  assert.equal(a.text, '2024-01-31\n31/01/2024\n01-31-2024\n31.01.2024\nJan 31, 2024\n31 January 2024');
  assert.equal(a.note, '6 found');
  assert.equal(await t('extract-dates', '1st March 2023 and Sept. 5th 2023'), '1st March 2023\nSept. 5th 2023');
  assert.equal(await t('extract-dates', '2024-01-31 2024-01-31', { unique: false }), '2024-01-31\n2024-01-31');
  assert.equal(await t('extract-dates', 'Jan 32, 2024'), '');
});

test('word-frequency', async () => {
  const a = await r('word-frequency', 'The cat and the hat. The end!');
  assert.equal(a.text, 'the\t3\t42.9%\nand\t1\t14.3%\ncat\t1\t14.3%\nend\t1\t14.3%\nhat\t1\t14.3%');
  assert.equal(a.note, '5 unique words');
  assert.equal(await t('word-frequency', 'A a b', { caseSensitive: true }), 'A\t1\t33.3%\na\t1\t33.3%\nb\t1\t33.3%');
  assert.equal(await t('word-frequency', 'a bb ccc bb', { minLength: 2 }), 'bb\t2\t66.7%\nccc\t1\t33.3%');
  assert.equal(await t('word-frequency', 'the cat is on the mat', { stopWords: true }), 'cat\t1\t50.0%\nmat\t1\t50.0%');
  assert.equal(await t('word-frequency', 'caf\u00E9 caf\u00E9 \u65E5\u672C'), 'caf\u00E9\t2\t66.7%\n\u65E5\u672C\t1\t33.3%');
  assert.equal(await t('word-frequency', 'x 42 x'), 'x\t2\t66.7%\n42\t1\t33.3%');
  assert.equal(await t('word-frequency', ''), '');
});

test('char-frequency', async () => {
  const a = await r('char-frequency', 'aab a');
  assert.equal(a.text, 'a\t3\t60.0%\nb\t1\t20.0%\nspace\t1\t20.0%');
  assert.equal(a.note, '3 unique');
  assert.equal(await t('char-frequency', 'aA a', { ignoreWhitespace: true, caseSensitive: false }), 'a\t3\t100.0%');
  assert.equal(await t('char-frequency', 'aA', { caseSensitive: true }), 'A\t1\t50.0%\na\t1\t50.0%');
  const ws = await t('char-frequency', '\t\r\n\u00A0\n');
  for (const name of ['tab', 'CRLF', 'NBSP', 'LF']) assert.ok(ws.split('\n').some((l) => l.startsWith(name + '\t')), name);
  const fam = '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67';
  assert.equal(await t('char-frequency', fam + fam + '\uD83C\uDDEC\uD83C\uDDE7'), `${fam}\t2\t66.7%\n\uD83C\uDDEC\uD83C\uDDE7\t1\t33.3%`);
  assert.equal(await t('char-frequency', 'e\u0301e\u0301'), 'e\u0301\t2\t100.0%');
});

test('count-occurrences', async () => {
  const a = await r('count-occurrences', 'Cat cat concat', { term: 'cat' });
  assert.equal(a.text, '3');
  assert.equal(a.note, '3 matches');
  assert.equal(await t('count-occurrences', 'Cat cat concat', { term: 'cat', caseSensitive: true }), '2');
  assert.equal(await t('count-occurrences', 'Cat cat concat', { term: 'cat', wholeWord: true }), '2');
  assert.equal(await t('count-occurrences', 'a.b a.b', { term: 'a.b' }), '2');
  assert.equal(await t('count-occurrences', 'axb', { term: 'a.b' }), '0');
  assert.equal(await t('count-occurrences', 'aaaa', { term: 'aa' }), '2');
  assert.equal(await t('count-occurrences', 'a\nb\nc', { term: '\\n' }), '2');
  assert.equal(await t('count-occurrences', '\uD83D\uDE00x\uD83D\uDE00', { term: '\uD83D\uDE00' }), '2');
  assert.equal((await r('count-occurrences', 'abc', { term: 'z' })).note, 'No matches');
  const e = await r('count-occurrences', 'abc', { term: '' });
  assert.equal(e.text, '0');
  assert.equal(e.note, '');
});

test('frequency fast paths match the segmenter', async () => {
  assert.equal(await t('word-frequency', 'e.g. e.g 1,000 1.5 a_b _ __ x:y don\'t caf\u00E9 caf\u00E9 \u201Cquoted\u201D \u200Dzw \u00ADab THE the'), 'caf\u00E9\t2\t13.3%\ne.g\t2\t13.3%\nthe\t2\t13.3%\n1,000\t1\t6.7%\n1.5\t1\t6.7%\n__\t1\t6.7%\na_b\t1\t6.7%\nab\t1\t6.7%\ndon\'t\t1\t6.7%\nquoted\t1\t6.7%\nx:y\t1\t6.7%\nzw\t1\t6.7%');
  assert.equal(await t('word-frequency', 'Caf\u00E9 caf\u00E9 \u65E5\u672C\u8A9E', { caseSensitive: true, minLength: 2 }), 'Caf\u00E9\t1\t33.3%\ncaf\u00E9\t1\t33.3%\n\u65E5\u672C\u8A9E\t1\t33.3%');
  assert.equal(await t('char-frequency', 'e\u0301e\u0301\r\n\r\nAa\u212A \u{1F1EC}\u{1F1E7}', { caseSensitive: false }), 'CRLF\t2\t22.2%\na\t2\t22.2%\ne\u0301\t2\t22.2%\nk\t1\t11.1%\nspace\t1\t11.1%\n\u{1F1EC}\u{1F1E7}\t1\t11.1%');
  assert.equal(await t('char-frequency', 'a a\u00A0\tb\r\n', { ignoreWhitespace: true }), 'a\t2\t66.7%\nb\t1\t33.3%');
});
