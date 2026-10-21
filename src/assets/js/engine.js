// Page side of the engine worker: request and response by id, progress callbacks, cancel.
let worker = null;
let seq = 0;
const jobs = new Map();

function reset(err) {
  worker?.terminate();
  worker = null;
  for (const j of jobs.values()) j.reject(err);
  jobs.clear();
}

function get() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const j = jobs.get(data.id);
    if (!j) return;
    if (data.progress) { j.onProgress?.(data.progress); return; }
    jobs.delete(data.id);
    if (data.error) j.reject(Object.assign(new Error(data.error.message), { name: data.error.name }));
    else j.resolve(data.result);
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    reset(Object.assign(new Error('The worker stopped. The file may be too big for this device.'), { name: 'OpError' }));
  };
  return worker;
}

export function call(type, payload = {}, onProgress) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject, onProgress });
    get().postMessage({ id, type, ...payload });
  });
}

// Stops whatever is running. The worker restarts on the next call and re-reads Blob sources.
export function cancel() {
  reset(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
}

export const busy = () => jobs.size > 0;
