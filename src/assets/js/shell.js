// Shared page chrome: toasts, theme toggle, service worker, offline pill, update prompt.
import * as store from './store.js';

export function toast(msg, { action, onAction, timeout = 2600 } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  const span = document.createElement('span');
  span.textContent = msg;
  el.append(span);
  const close = () => el.remove();
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn line';
    b.textContent = action;
    b.addEventListener('click', () => { close(); onAction?.(); });
    el.append(b);
  }
  box.append(el);
  if (timeout) setTimeout(close, timeout);
  return close;
}

const THEMES = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'Theme: follow system', light: 'Theme: light', dark: 'Theme: dark' };

export function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const b = document.getElementById('t-theme');
  if (b) { b.title = THEME_LABEL[t]; b.setAttribute('aria-label', THEME_LABEL[t]); }
}

function setPill(state) {
  const pill = document.getElementById('offline');
  if (!pill) return;
  const label = pill.querySelector('span');
  if (state === 'ready') {
    pill.classList.add('ok');
    label.textContent = navigator.onLine ? 'Available offline' : 'Offline';
    pill.title = 'Everything is cached. TextChef works without a connection.';
  } else if (state === 'none') {
    label.textContent = 'Online only';
    pill.title = 'Offline mode is not available in this browser.';
  }
}

export function initShell() {
  const themeBtn = document.getElementById('t-theme');
  applyTheme(store.get('theme'));
  themeBtn?.addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(store.get('theme')) + 1) % THEMES.length];
    store.set('theme', next);
    applyTheme(next);
    toast(THEME_LABEL[next]);
  });

  if (!('serviceWorker' in navigator) || location.protocol === 'file:') { setPill('none'); return; }
  const hadController = !!navigator.serviceWorker.controller;
  const swUrl = new URL('../../../sw.js', import.meta.url);
  addEventListener('online', () => setPill('ready'));
  addEventListener('offline', () => setPill('ready'));
  navigator.serviceWorker.ready.then(() => setPill('ready'));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  const prompt = (w) => {
    if (!navigator.serviceWorker.controller) return;
    toast('Update ready', { action: 'Reload', timeout: 0, onAction: () => w.postMessage('skipWaiting') });
  };
  navigator.serviceWorker.register(swUrl).then((reg) => {
    if (reg.waiting) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') prompt(w); });
    });
  }, () => setPill('none'));
}

export function booted() {
  window.__tcBooted = true;
  try { sessionStorage.removeItem('textchef-heal'); } catch { /* ignore */ }
}
