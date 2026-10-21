// Entry for the /word-counter/ page: one box, live stats, no buttons needed.
import { mountCounter } from './wcui.js';
import { initShell, booted } from './shell.js';
import * as store from './store.js';

initShell();
const ta = document.getElementById('wc-text');
const saved = store.get('rememberInput') ? store.getInput('wc') : null;
if (typeof saved === 'string') ta.value = saved;
const counter = mountCounter(document.getElementById('wc'), () => ta.value);

let timer, saveTimer;
ta.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(counter.update, ta.value.length > 200_000 ? 300 : 40);
  if (store.get('rememberInput')) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.setInput('wc', ta.value.length < 1_000_000 ? ta.value : null), 800);
  }
});
booted();
