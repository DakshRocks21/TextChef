// Op throughput benchmark: `node bench/ops.js [MB]` (default 20). Prints the slowest ops first.
import { loadModules, run } from '../test/helpers.js';

const MB = +process.argv[2] || 20;
const line = 'The  quick brown fox, caf\u00E9 \u201Cquoted\u201D \u2014 jumps over 42 lazy dogs at https://example.com and bob@example.com! \uD83D\uDE00\t<b>x</b>\r\n';
const text = line.repeat(Math.ceil((MB * 1024 * 1024) / line.length));
const rows = [];
for (const m of await loadModules()) {
  for (const op of m.ops) {
    const t0 = performance.now();
    let err = '';
    try { await run(op, text); } catch (e) { err = e.name === 'OpError' ? 'OpError' : e.message; }
    const ms = performance.now() - t0;
    rows.push({ id: op.id, ms, mbs: MB / (ms / 1000), err });
  }
}
rows.sort((a, b) => b.ms - a.ms);
console.log(`${MB} MB input, ${rows.length} ops. Slowest first:`);
for (const r of rows.slice(0, 30)) console.log(`${r.id.padEnd(30)} ${String(Math.round(r.ms)).padStart(7)} ms ${r.mbs.toFixed(0).padStart(6)} MB/s ${r.err}`);
console.log(`Total ${Math.round(rows.reduce((a, r) => a + r.ms, 0))} ms`);
