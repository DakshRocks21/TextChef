// All settings live under one versioned localStorage key. Unknown versions are ignored.
// Remembered input text is content, not a setting, so it lives under its own keys and can be
// dropped when storage is full without losing favourites or saved recipes.
const KEY = 'textchef';
const INPUT_KEY = 'textchef-input-';
const VERSION = 1;

export const DEFAULTS = {
  theme: 'system',
  autoBake: true,
  favs: [],
  recipes: [],
  cols: [260, 340],
  ioSplit: 0.5,
  rememberInput: false,
  invisibles: false,
  diff: false,
  stopWords: true,
  limit: { kind: 'words', value: 0 },
  voice: '',
  rate: 1,
};

let data = load();
let timer = null;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.v === VERSION && raw.data && typeof raw.data === 'object') return { ...structuredClone(DEFAULTS), ...raw.data };
  } catch { /* blocked storage or bad JSON */ }
  return structuredClone(DEFAULTS);
}

function clearInputs() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(INPUT_KEY)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Probably over quota: remembered input is the big, expendable part.
    clearInputs();
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
}

function flush() {
  clearTimeout(timer);
  timer = null;
  write(KEY, JSON.stringify({ v: VERSION, data }));
}

export const get = (k) => data[k];

// Writes are batched so a splitter drag does not hit storage on every pointer move.
export function set(k, v) {
  data[k] = v;
  if (!timer) timer = setTimeout(flush, 250);
}

export function getInput(name) {
  try { return JSON.parse(localStorage.getItem(INPUT_KEY + name)); } catch { return null; }
}

export function setInput(name, value) {
  if (value == null) { try { localStorage.removeItem(INPUT_KEY + name); } catch { /* ignore */ } return; }
  if (!write(INPUT_KEY + name, JSON.stringify(value))) { try { localStorage.removeItem(INPUT_KEY + name); } catch { /* ignore */ } }
}

export { clearInputs };

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => timer && flush());
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) flush(); });
}
