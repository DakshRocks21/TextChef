// Copy rules: no middle dot and no em dash anywhere in source, docs or build output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const BANNED = [['\u00B7', 'middle dot'], ['\u2014', 'em dash']];
const EXT = new Set(['.js', '.html', '.css', '.md', '.json', '.webmanifest', '.svg', '.txt', '.xml', '.toml', '']);

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.has(extname(f))) yield p;
  }
}

test('no banned characters in files', () => {
  const targets = ['src', 'test', 'dist', 'README.md', 'build.js', 'serve.js'].map((p) => join(root, p)).filter(existsSync);
  const bad = [];
  for (const target of targets) {
    const files = statSync(target).isDirectory() ? [...walk(target)] : [target];
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      for (const [ch, name] of BANNED) if (s.includes(ch)) bad.push(`${f.slice(root.length)} has a literal ${name}`);
    }
  }
  assert.deepEqual(bad, []);
});
