// Turns a Blob or File into text, inside the worker. Streams big files with progress.
// Document formats (PDF, DOCX, ...) plug in here later: add an extractor with match() and extract().
export const MAX_CHARS = 500_000_000; // V8's string limit is a little above this.
const STREAM_FROM = 16 * 1024 * 1024;

const opError = (m) => Object.assign(new Error(m), { name: 'OpError' });

// { match(blob) -> boolean, extract(blob, onProgress) -> Promise<string> }
const EXTRACTORS = [];
export const addExtractor = (x) => EXTRACTORS.push(x);

function sniff(head) {
  if (head[0] === 0xFF && head[1] === 0xFE) return 'utf-16le';
  if (head[0] === 0xFE && head[1] === 0xFF) return 'utf-16be';
  // NUL bytes without a UTF-16 BOM: almost certainly not text.
  for (let i = 0; i < head.length; i++) if (head[i] === 0) return null;
  return 'utf-8';
}

export async function readSource(blob, onProgress = () => {}) {
  const ex = EXTRACTORS.find((e) => e.match(blob));
  if (ex) return ex.extract(blob, onProgress);
  const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  const enc = sniff(head);
  if (!enc) throw opError(`${blob.name || 'This file'} looks like a binary file, not text.`);
  if (blob.size > MAX_CHARS * 3) throw opError('That file is too big to open as text here (about 500 MB of text is the limit).');
  if (blob.size < STREAM_FROM) return new TextDecoder(enc).decode(await blob.arrayBuffer());
  const reader = blob.stream().getReader();
  const dec = new TextDecoder(enc);
  const parts = [];
  let done = 0, chars = 0, last = 0;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    const s = dec.decode(value, { stream: true });
    chars += s.length;
    if (chars > MAX_CHARS) { reader.cancel(); throw opError('That file is too big to open as text here (about 500 MB of text is the limit).'); }
    parts.push(s);
    done += value.length;
    if (done - last > blob.size / 50) { last = done; onProgress(done, blob.size); }
  }
  parts.push(dec.decode());
  onProgress(blob.size, blob.size);
  return parts.join('');
}
