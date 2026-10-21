// Word-level diff (Myers O(ND)). Returns segments [{ t: '=' | '-' | '+', s }]. Pure, no DOM.

const tokenize = (s) => s.match(/\r\n|\s|[\p{L}\p{N}_]+|[^]/gu) || [];

function myers(a, b, maxD) {
  const n = a.length, m = b.length, max = n + m, off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= max; d++) {
    if (d > maxD) return null;
    trace.push(v.slice(off - d, off + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, d);
    }
  }
  return null;
}

function backtrack(trace, a, b, D) {
  const out = [];
  let x = a.length, y = b.length;
  for (let d = D; d > 0; d--) {
    const V = trace[d];
    const at = (k) => V[k + d];
    const k = x - y;
    const pk = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const px = at(pk), py = px - pk;
    while (x > px && y > py) { x--; y--; out.push(['=', a[x]]); }
    if (x === px) out.push(['+', b[--y]]);
    else out.push(['-', a[--x]]);
  }
  while (x > 0 && y > 0) { x--; y--; out.push(['=', a[x]]); }
  return out.reverse();
}

function merge(list) {
  const segs = [];
  for (const [t, s] of list) {
    const last = segs[segs.length - 1];
    if (last && last.t === t) last.s += s;
    else segs.push({ t, s });
  }
  return segs;
}

export function diff(a, b, { maxTokens = 40000, maxD = 1500 } = {}) {
  if (a === b) return a ? [{ t: '=', s: a }] : [];
  const A = tokenize(a), B = tokenize(b);
  let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let e = 0;
  while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
  const midA = A.slice(s, A.length - e), midB = B.slice(s, B.length - e);
  let mid = midA.length + midB.length <= maxTokens ? myers(midA, midB, maxD) : null;
  // Too different or too big: show the middle as one replaced block.
  if (!mid) mid = [...midA.map((x) => ['-', x]), ...midB.map((x) => ['+', x])];
  return merge([...A.slice(0, s).map((x) => ['=', x]), ...mid, ...A.slice(A.length - e).map((x) => ['=', x])]);
}

// Highlight ranges for each side: deletions live in the input, insertions in the output.
export function diffRanges(segs) {
  const a = [], b = [];
  let i = 0, j = 0;
  for (const { t, s } of segs) {
    if (t === '=') { i += s.length; j += s.length; }
    else if (t === '-') { a.push([i, i + s.length, 'del']); i += s.length; }
    else { b.push([j, j + s.length, 'ins']); j += s.length; }
  }
  return { a, b };
}
