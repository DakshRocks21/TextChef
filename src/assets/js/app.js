// TextChef workbench UI.
import { categories, ops, byId, catById, getOp, loadCategory } from './registry.js';
import { runRecipe, withDefaults, encodeSteps, decodeSteps, parseHash, encodeText, decodeText } from './recipe.js';
import { quickStats } from './stats.js';
import { detectChips } from './chips.js';
import { diff, diffRanges } from './diff.js';
import { renderMirror, regexRanges, MIRROR_LIMIT } from './mirror.js';
import { mountCounter } from './wcui.js';
import { initShell, toast, booted, applyTheme } from './shell.js';
import * as store from './store.js';
import * as engine from './engine.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.filter((k) => k != null));
  return e;
};
const icon = (name) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'i');
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#i-' + name);
  s.append(u);
  return s;
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), typeof ms === 'function' ? ms() : ms); }; };
const nf = new Intl.NumberFormat();
const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);
const coarse = matchMedia('(pointer: coarse)');
const WORKER_MIN = 256 * 1024;
const OUT_PREVIEW = 500_000;
const IN_BIG = 2_000_000;

const STARTERS = [
  { name: 'Clean pasted text', desc: 'Invisible chars, NBSP, smart quotes, extra spaces', steps: [['remove-invisible'], ['nbsp-to-space'], ['smart-quotes-to-straight'], ['fancy-dashes-to-hyphens'], ['remove-extra-spaces']] },
  { name: 'Make URL slug', desc: 'Title to my-url-slug', steps: [['url-slug']] },
  { name: 'Dedupe and sort list', desc: 'Trim, drop blanks and repeats, sort A to Z', steps: [['trim'], ['remove-empty-lines'], ['remove-duplicate-lines'], ['sort-lines']] },
  { name: 'Strip HTML to plain text', desc: 'Remove tags, decode entities, tidy spaces', steps: [['strip-html'], ['html-entity-decode'], ['remove-extra-spaces']] },
  { name: 'Fix email copy', desc: 'Remove > quotes, join hard-wrapped lines', steps: [['remove-invisible'], ['nbsp-to-space'], ['unwrap-paragraphs', { stripQuotes: true }], ['smart-quotes-to-straight'], ['remove-extra-spaces']] },
  { name: 'Prep text for code', desc: 'Straight quotes, plain dashes, no hidden chars', steps: [['remove-invisible'], ['nbsp-to-space'], ['smart-quotes-to-straight'], ['fancy-dashes-to-hyphens'], ['tabs-to-spaces'], ['trim', { side: 'trailing' }]] },
];

// ---------- State ----------
let keySeq = 0;
const state = {
  steps: [],
  tabs: [],
  active: 0,
  output: '',
  result: null,
  stepPos: null,
};
const tab = () => state.tabs[state.active];
const inputText = () => tab().text;

const mkStep = (id, opts = {}, extra = {}) => ({ key: ++keySeq, id, opts: withDefaults(byId.get(id), opts), off: false, pause: false, ...extra });
const mkTab = (text = '', name) => ({ key: ++keySeq, name: name || `Input ${state.tabs.length + 1}`, text, crlf: /\r\n/.test(text) && !/(^|[^\r])\n/.test(text), handle: null, src: null, version: 0, len: 0, stats: null });

// ---------- Elements ----------
const inTA = $('input'), outTA = $('output');
const inMirror = $('in-mirror'), outMirror = $('out-mirror');
const stepsEl = $('steps');
const layout = $('layout');

// ---------- Ops pane ----------
function opItem(meta) {
  const cat = catById.get(meta.cat);
  const fav = store.get('favs').includes(meta.id);
  return el('li', { class: 'op', draggable: 'true', tabindex: '0', 'data-id': meta.id, style: `--c:${cat.color}`, title: `${meta.name}. Double-click or Enter to add.` },
    el('i', { class: 'dot', 'aria-hidden': 'true' }),
    el('span', { class: 'name', text: meta.name }),
    el('button', { class: 'btn icon fav', type: 'button', 'aria-pressed': String(fav), 'aria-label': `${fav ? 'Unpin' : 'Pin'} ${meta.name}`, 'data-fav': meta.id }, icon('star')));
}

function renderOps() {
  const q = $('op-search').value.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const match = (m) => {
    const hay = `${m.name} ${m.keywords} ${catById.get(m.cat).name} ${m.id}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  };
  const list = $('cats');
  const open = new Set([...list.querySelectorAll('details[open]')].map((d) => d.dataset.cat));
  const groups = [];
  const favs = store.get('favs').map((id) => byId.get(id)).filter(Boolean);
  if (favs.length && !terms.length) groups.push({ id: 'favs', name: 'Favourites', items: favs });
  for (const c of categories) groups.push({ id: c.id, name: c.name, color: c.color, items: ops.filter((o) => o.cat === c.id && match(o)) });
  const frag = document.createDocumentFragment();
  let shown = 0;
  for (const g of groups) {
    if (!g.items.length) continue;
    shown += g.items.length;
    const det = el('details', { class: 'cat', 'data-cat': g.id }, el('summary', {},
      g.color ? el('i', { class: 'dot', style: `--c:${g.color}`, 'aria-hidden': 'true' }) : icon('star'),
      el('span', { text: g.name }), el('span', { class: 'n', text: String(g.items.length) })),
    el('ul', { class: 'oplist' }, ...g.items.map(opItem)));
    det.open = terms.length > 0 || open.has(g.id) || (g.id === 'favs') || (!open.size && g.id === 'whitespace');
    frag.append(el('li', {}, det));
  }
  list.replaceChildren(frag);
  if (!shown) list.append(el('li', { class: 'empty-note', text: 'No ops match. Try fewer words.' }));
}

function addStep(id, opts, at) {
  if (!byId.has(id)) return;
  const s = mkStep(id, opts);
  if (at == null || at >= state.steps.length) state.steps.push(s);
  else state.steps.splice(at, 0, s);
  loadCategory(byId.get(id).cat).catch(() => {});
  recipeChanged();
  if (coarse.matches && !layout.querySelector('#p-recipe.show')) toast(`Added ${byId.get(id).name}`);
  requestAnimationFrame(() => stepsEl.querySelector(`[data-key="${s.key}"]`)?.scrollIntoView({ block: 'nearest' }));
}

$('cats').addEventListener('click', (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    const id = fav.dataset.fav;
    const favs = store.get('favs');
    store.set('favs', favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]);
    renderOps();
    $('cats').querySelector(`.op[data-id="${id}"] [data-fav]`)?.focus();
    return;
  }
  const li = e.target.closest('.op');
  if (li && coarse.matches) addStep(li.dataset.id);
});
$('cats').addEventListener('dblclick', (e) => {
  const li = e.target.closest('.op');
  if (li && !e.target.closest('[data-fav]')) addStep(li.dataset.id);
});
$('cats').addEventListener('keydown', (e) => {
  const li = e.target.closest('.op');
  if (!li) return;
  if (e.key === 'Enter' && e.target === li) { e.preventDefault(); addStep(li.dataset.id); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const all = [...$('cats').querySelectorAll('details[open] .op')];
    all[all.indexOf(li) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
  }
});
$('cats').addEventListener('dragstart', (e) => {
  const li = e.target.closest('.op');
  if (!li) return;
  e.dataTransfer.setData('text/x-op', li.dataset.id);
  e.dataTransfer.effectAllowed = 'copy';
});
$('op-search').addEventListener('input', renderOps);
$('op-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const first = $('cats').querySelector('.op'); if (first) addStep(first.dataset.id); }
  if (e.key === 'ArrowDown') { e.preventDefault(); $('cats').querySelector('details[open] .op')?.focus(); }
});

// ---------- Recipe pane ----------
function optControl(step, opt) {
  const id = `o${step.key}-${opt.id}`;
  const v = step.opts[opt.id];
  const set = (val) => { step.opts[opt.id] = val; optionsChanged(); };
  const box = (control, cls = '') => el('div', { class: `opt box ${cls}` }, el('label', { for: id, text: opt.label }), control);
  if (opt.type === 'bool') {
    return el('label', { class: 'opt check', for: id }, el('input', { type: 'checkbox', id, checked: !!v, onchange: (e) => set(e.target.checked) }), opt.label);
  }
  if (opt.type === 'select') {
    const sel = el('select', { class: 'bare', id, onchange: (e) => set(e.target.value) }, ...opt.choices.map(([val, label]) => el('option', { value: val, text: label })));
    sel.value = v;
    return box(sel);
  }
  if (opt.type === 'number') {
    return box(el('input', { class: 'bare', type: 'number', id, value: String(v), min: opt.min, max: opt.max, step: opt.step || 1, oninput: (e) => { const n = e.target.valueAsNumber; if (!Number.isNaN(n)) set(n); } }));
  }
  if (opt.type === 'range') {
    const out = el('output', { for: id, text: String(v) });
    return box(el('div', { class: 'rv' },
      el('input', { type: 'range', id, value: String(v), min: opt.min, max: opt.max, step: opt.step || 1, oninput: (e) => { out.textContent = e.target.value; set(+e.target.value); } }), out));
  }
  return box(el('input', { class: 'bare', type: 'text', id, value: v, placeholder: opt.placeholder || '', spellcheck: 'false', autocomplete: 'off', oninput: (e) => set(e.target.value) }), 'wide');
}

function renderSteps() {
  $('starters').hidden = state.steps.length > 0;
  stepsEl.hidden = !state.steps.length;
  stepsEl.replaceChildren(...state.steps.map((s, i) => {
    const meta = byId.get(s.id);
    const cat = catById.get(meta.cat);
    const name = `Step ${i + 1}, ${meta.name}`;
    const hasOpts = (meta.options || []).length > 0;
    const li = el('li', { class: 'step', 'data-key': String(s.key), style: `--c:${cat.color}`, tabindex: '0', 'aria-label': name, 'aria-keyshortcuts': 'Delete Alt+ArrowUp Alt+ArrowDown' },
      el('div', { class: 'row', draggable: 'true', title: `${cat.name}. Drag to reorder, or drag out of the recipe to remove.` },
        el('div', { class: 'meta' },
          el('span', { class: 'title', text: meta.name }),
          el('span', { class: 'sub', hidden: true }, el('span', { class: 'res', 'aria-live': 'polite' }))),
        el('div', { class: 'acts' },
          hasOpts ? el('button', { class: 'btn icon', type: 'button', 'data-act': 'fold', 'aria-expanded': String(!s.fold), 'aria-label': `Options for ${meta.name}`, title: s.fold ? 'Show options' : 'Hide options' }, icon('chevron')) : null,
          el('button', { class: 'btn icon', type: 'button', 'data-act': 'off', 'aria-pressed': String(s.off), 'aria-label': `Disable ${meta.name}`, title: s.off ? 'Enable step' : 'Disable step' }, icon('ban')),
          el('button', { class: 'btn icon', type: 'button', 'data-act': 'pause', 'aria-pressed': String(s.pause), 'aria-label': `Pause before ${meta.name}`, title: 'Pause here (breakpoint)' }, icon('pause')),
          el('button', { class: 'btn icon', type: 'button', 'data-act': 'remove', 'aria-label': `Remove ${meta.name}`, title: 'Remove step' }, icon('x')))),
      hasOpts ? el('div', { class: 'opts', hidden: !!s.fold }, ...meta.options.map((o) => optControl(s, o))) : null);
    li.classList.toggle('off', s.off);
    li.classList.toggle('pause', s.pause);
    return li;
  }));
  updateStepStatus();
  syncFoldAll();
}

// The result line under each step name: numbers in ink, words muted, like "3 replaced".
function figure(text) {
  return text.split(/(\d[\d,.]*%?)/).map((part, i) => (i % 2 ? el('b', { text: part }) : part));
}
function updateStepStatus() {
  const r = state.result;
  stepsEl.querySelectorAll('.step').forEach((li, i) => {
    const s = state.steps[i];
    const res = li.querySelector('.res');
    li.classList.toggle('err', r?.error?.index === i);
    let text = '', tone = '';
    if (r?.error?.index === i) { text = r.error.message; tone = 'bad'; }
    else if (r?.pausedAt === i) { text = 'Paused here'; tone = 'warn'; }
    else if (state.stepPos != null && i === state.stepPos && i < state.steps.length) { text = 'Next'; tone = 'next'; }
    else if (s.off) text = 'Skipped';
    else if (r?.notes?.[i]) text = r.notes[i];
    res.className = `res ${tone}`;
    res.replaceChildren(...(tone ? [text] : figure(text)));
    res.hidden = !text;
    res.parentElement.hidden = !text;
  });
}

stepsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const li = b.closest('.step');
  const i = [...stepsEl.children].indexOf(li);
  const s = state.steps[i];
  if (b.dataset.act === 'fold') {
    s.fold = !s.fold;
    li.querySelector('.opts').hidden = s.fold;
    b.setAttribute('aria-expanded', String(!s.fold));
    b.title = s.fold ? 'Show options' : 'Hide options';
    syncFoldAll();
    return;
  }
  if (b.dataset.act === 'remove') { removeStep(i); return; }
  if (b.dataset.act === 'off') s.off = !s.off;
  if (b.dataset.act === 'pause') s.pause = !s.pause;
  recipeChanged();
  const again = stepsEl.children[Math.min(i, stepsEl.children.length - 1)];
  (again?.querySelector(`[data-act="${b.dataset.act}"]`) || again)?.focus();
});
// Remove a step, with Undo. Steps leave by being dragged out of the recipe, the Delete key,
// or the X that only touch screens show.
function removeStep(i) {
  const [s] = state.steps.splice(i, 1);
  if (!s) return;
  recipeChanged();
  (stepsEl.children[Math.min(i, stepsEl.children.length - 1)] || $('r-scroll'))?.focus?.();
  toast(`Removed ${byId.get(s.id).name}`, { action: 'Undo', onAction: () => { state.steps.splice(i, 0, s); recipeChanged(); } });
}

stepsEl.addEventListener('keydown', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.classList.contains('step')) {
    e.preventDefault();
    removeStep([...stepsEl.children].indexOf(e.target));
    return;
  }
  const li = e.target.closest('.step');
  if (!li || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const i = [...stepsEl.children].indexOf(li);
  const j = i + (e.key === 'ArrowUp' ? -1 : 1);
  if (j < 0 || j >= state.steps.length) return;
  const [s] = state.steps.splice(i, 1);
  state.steps.splice(j, 0, s);
  recipeChanged();
  stepsEl.children[j]?.focus();
});

// Collapse or expand every step's options at once.
function syncFoldAll() {
  const all = state.steps.length > 0 && state.steps.every((s) => s.fold || !(byId.get(s.id).options || []).length);
  $('r-fold').setAttribute('aria-pressed', String(all));
  $('r-fold').title = all ? 'Expand all steps' : 'Collapse all steps';
  $('r-fold').setAttribute('aria-label', $('r-fold').title);
}
$('r-fold').addEventListener('click', () => {
  const fold = $('r-fold').getAttribute('aria-pressed') !== 'true';
  for (const s of state.steps) s.fold = fold;
  renderSteps();
});

// Drag: reorder steps by their header, or drop ops from the left pane.
let dragKey = null;
stepsEl.addEventListener('dragstart', (e) => {
  const li = e.target.closest('.step');
  if (!li) return;
  dragKey = +li.dataset.key;
  e.dataTransfer.setData('text/x-step', li.dataset.key);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setDragImage(li, 20, 16);
  li.classList.add('dragging');
});
stepsEl.addEventListener('dragend', () => {
  dragKey = null;
  stepsEl.querySelectorAll('.dragging,.over,.leaving').forEach((x) => x.classList.remove('dragging', 'over', 'leaving'));
});
// Dragging a step out of the recipe and dropping it anywhere else removes it. Esc still cancels.
const leaving = (on) => stepsEl.querySelector('.dragging')?.classList.toggle('leaving', on);
document.addEventListener('dragover', (e) => {
  if (dragKey == null || recipeDropZone.contains(e.target)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  leaving(true);
});
document.addEventListener('drop', (e) => {
  if (dragKey == null || recipeDropZone.contains(e.target)) return;
  e.preventDefault();
  removeStep(state.steps.findIndex((s) => s.key === dragKey));
});
const recipeDropZone = $('r-scroll');
const dropIndex = (e) => {
  const items = [...stepsEl.children];
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) return i;
  }
  return items.length;
};
recipeDropZone.addEventListener('dragover', (e) => {
  const types = e.dataTransfer.types;
  if (!types.includes('text/x-op') && !types.includes('text/x-step')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = types.includes('text/x-op') ? 'copy' : 'move';
  leaving(false);
  stepsEl.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
  stepsEl.children[dropIndex(e)]?.classList.add('over');
  recipeDropZone.classList.add('drop');
});
recipeDropZone.addEventListener('dragleave', (e) => { if (!recipeDropZone.contains(e.relatedTarget)) recipeDropZone.classList.remove('drop'); });
recipeDropZone.addEventListener('drop', (e) => {
  recipeDropZone.classList.remove('drop');
  const opId = e.dataTransfer.getData('text/x-op');
  const at = dropIndex(e);
  if (opId) { e.preventDefault(); addStep(opId, {}, at); return; }
  if (dragKey != null) {
    e.preventDefault();
    // Handled here: the re-render below detaches the target, so the page-level drop must not see it.
    e.stopPropagation();
    const from = state.steps.findIndex((s) => s.key === dragKey);
    dragKey = null;
    const [s] = state.steps.splice(from, 1);
    state.steps.splice(at > from ? at - 1 : at, 0, s);
    recipeChanged();
  }
});

function renderStarters() {
  $('starter-list').replaceChildren(...STARTERS.map((r) => el('button', { class: 'starter', type: 'button', onclick: () => loadStarter(r) },
    el('b', { text: r.name }), el('span', { text: r.desc }))));
}
function loadStarter(r) {
  state.steps = r.steps.filter(([id]) => byId.has(id)).map(([id, o]) => mkStep(id, o));
  recipeChanged();
}

function recipeChanged() {
  state.stepPos = null;
  renderSteps();
  renderChips();
  writeHash();
  if (store.get('autoBake')) scheduleBake();
}
const optionsChanged = () => {
  state.stepPos = null;
  writeHash();
  refreshMirrors();
  if (store.get('autoBake')) scheduleBake();
};

// ---------- Baking ----------
// Small inputs bake on the page. Medium ones go to the engine worker as a string. Big ones
// (files and pastes over IN_BIG) live in the worker: the page only holds a Blob and a preview.
let bakeSeq = 0;
const isBig = (t = tab()) => !!t.src;
const inLen = (t = tab()) => (t.src ? t.len : t.text.length);
const mb = (n) => (n >= 1e6 ? `${(n / 1048576).toFixed(n >= 1e8 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function showProgress(on) {
  $('progress').hidden = !on;
  if (on) { $('prog-bar').style.width = '0%'; $('prog-text').textContent = 'Working'; }
}
function onProgress(p) {
  showProgress(true);
  if (p.phase === 'read') {
    $('prog-text').textContent = `Reading ${mb(p.done)} of ${mb(p.total)}`;
    $('prog-bar').style.width = `${Math.round((p.done / p.total) * 100)}%`;
  } else {
    $('prog-text').textContent = `Step ${p.i + 1} of ${p.n}: ${byId.get(p.id)?.name || p.id}`;
    $('prog-bar').style.width = `${Math.round((p.i / p.n) * 100)}%`;
  }
}

function plainSteps(upto) {
  return state.steps.map(({ id, opts, off, pause }) => ({ id, opts: { ...opts }, off, pause })).slice(0, upto === Infinity ? undefined : upto);
}

async function bake(upto = Infinity) {
  const seq = ++bakeSeq;
  const t = tab();
  if (!state.steps.length) {
    applyResult({ text: t.text, full: !isBig(t), len: inLen(t), stats: t.stats, notes: [], ran: 0, error: null });
    return;
  }
  let r;
  if (!isBig(t) && t.text.length < WORKER_MIN) {
    r = await runRecipe(state.steps, t.text, { getOp, upto });
  } else {
    if (engine.busy()) engine.cancel();
    const timer = setTimeout(() => seq === bakeSeq && showProgress(true), 150);
    try {
      const res = await engine.call('bake', {
        tab: t.key, version: t.version, src: t.src || undefined, text: isBig(t) ? undefined : t.text,
        steps: plainSteps(Infinity), upto, fullLimit: OUT_PREVIEW,
      }, (p) => seq === bakeSeq && onProgress(p));
      r = { ...res, text: res.full ?? res.preview, full: res.full != null, len: res.length };
    } catch (e) {
      if (e.name === 'AbortError') return;
      r = { text: '', full: true, notes: [], ran: 0, error: { index: 0, message: e.message } };
    } finally {
      clearTimeout(timer);
      if (seq === bakeSeq) showProgress(false);
    }
  }
  if (seq !== bakeSeq) return;
  applyResult(r);
}
const scheduleBake = debounce(() => bake(), () => (inLen() > WORKER_MIN ? 400 : 120));

function applyResult(r) {
  state.result = r;
  state.output = r.text;
  state.outFull = r.full !== false;
  state.outLen = r.len ?? r.text.length;
  state.outStats = r.full === false || r.stats ? r.stats : null;
  if (r.pausedAt != null) state.stepPos = r.pausedAt;
  // Only a preview goes in the textarea: a 10 MB textarea takes seconds to lay out.
  const cut = state.outLen > OUT_PREVIEW;
  if (cut || outTA.value.length > OUT_PREVIEW) outTA.value = '';
  outTA.value = cut ? r.text.slice(0, OUT_PREVIEW) : r.text;
  $('out-note').hidden = !cut;
  if (cut) $('out-note').textContent = `Showing the first ${nf.format(OUT_PREVIEW)} of ${nf.format(state.outLen)} characters. Copy, download and save use all of it.`;
  const err = $('out-err');
  if (r.error) {
    const meta = byId.get(state.steps[r.error.index]?.id);
    err.textContent = `Step ${r.error.index + 1}${meta ? `, ${meta.name}` : ''}: ${r.error.message}`;
  }
  err.hidden = !r.error;
  updateStepStatus();
  updateOutStats();
  refreshMirrors();
  if (!$('side-speak').hidden) fillVoices();
}

// Full output text or a Blob of it, fetched from the worker when only a preview is here.
async function outputText() {
  return state.outFull ? state.output : engine.call('output', { tab: tab().key, as: 'text' });
}
async function outputBlob() {
  return state.outFull ? new Blob([state.output], { type: 'text/plain;charset=utf-8' }) : engine.call('output', { tab: tab().key, as: 'blob' });
}

$('bake').addEventListener('click', () => { state.stepPos = null; bake(); });
$('step').addEventListener('click', () => {
  if (!state.steps.length) return;
  const next = state.stepPos == null ? 1 : Math.min(state.stepPos + 1, state.steps.length);
  state.stepPos = next;
  bake(next).then(updateStepStatus);
  if (next >= state.steps.length) toast('That was the last step');
});
$('autobake').addEventListener('change', (e) => { store.set('autoBake', e.target.checked); if (e.target.checked) bake(); });
$('cancel').addEventListener('click', () => { engine.cancel(); showProgress(false); toast('Cancelled'); });
$('r-clear').addEventListener('click', () => {
  if (!state.steps.length) return;
  const old = state.steps;
  state.steps = [];
  recipeChanged();
  toast('Recipe cleared', { action: 'Undo', onAction: () => { state.steps = old; recipeChanged(); } });
});

// ---------- Input, output, stats ----------
function statsHTML(box, s, extra = '') {
  box.replaceChildren(
    el('span', {}, el('b', { text: nf.format(s.chars) }), ' chars'),
    el('span', {}, el('b', { text: nf.format(s.words) }), ' words'),
    el('span', {}, el('b', { text: nf.format(s.lines) }), ' lines'),
    ...(extra ? [el('span', { class: 'delta', text: extra })] : []));
}
const updateInStats = debounce(() => {
  const t = tab();
  if (isBig(t)) { if (t.stats) statsHTML($('in-stats'), t.stats); else $('in-stats').replaceChildren(); }
  else statsHTML($('in-stats'), quickStats(t.text));
}, () => (inLen() > 500_000 ? 400 : 150));
const updateOutStats = debounce(() => {
  const a = inLen(), b = state.outLen;
  const delta = state.steps.length && a ? Math.round(((a - b) / a) * 100) : 0;
  statsHTML($('out-stats'), state.outStats || quickStats(state.output), delta > 0 ? `${delta}% shorter` : delta < 0 ? `${-delta}% longer` : '');
}, () => (state.output.length > 500_000 ? 400 : 150));

function setInput(text, { keepCrlf = true } = {}) {
  if (text.length > IN_BIG) { setSource(new Blob([text], { type: 'text/plain' }), { preview: text.slice(0, OUT_PREVIEW), len: text.length }); return; }
  const t = tab();
  t.src = null;
  t.stats = null;
  t.text = text;
  t.crlf = keepCrlf && /\r\n/.test(text) && !/(^|[^\r])\n/.test(text);
  showInput();
  inputChanged();
}

// Big input: the worker reads the Blob (streaming files with progress) and sends back a preview.
async function setSource(blob, known = {}) {
  const t = tab();
  t.src = blob;
  t.version = ++keySeq;
  t.text = known.preview || '';
  t.len = known.len || 0;
  t.stats = null;
  t.crlf = false;
  showInput();
  try {
    const d = await engine.call('load', { tab: t.key, version: t.version, src: blob }, onProgress);
    if (t.src !== blob) return;
    // Small after decoding (UTF-16 files, short outputs moved back in): make it a normal editable input.
    if (d.length <= OUT_PREVIEW) { showProgress(false); setInput(d.preview); return; }
    Object.assign(t, { text: d.preview, len: d.length, stats: d.stats });
    showProgress(false);
    showInput();
    inputChanged();
  } catch (e) {
    showProgress(false);
    if (e.name === 'AbortError' || t.src !== blob) return;
    Object.assign(t, { src: null, text: '', len: 0 });
    showInput();
    inputChanged();
    toast(e.message);
  }
}

// Very large inputs get a read-only preview so the page stays responsive. Ops still use all of it.
function showInput() {
  const t = tab();
  const big = isBig(t);
  if (big || inTA.value.length > OUT_PREVIEW) inTA.value = '';
  inTA.value = t.text;
  inTA.readOnly = big;
  $('in-note').hidden = !big;
  if (big) {
    const size = t.src.size ? `, ${mb(t.src.size)}` : '';
    $('in-note').textContent = t.len
      ? `Large input: ${nf.format(t.len)} characters${size}. Showing the start, editing is off. Ops run on all of it.`
      : `Opening${t.src.name ? ` ${t.src.name}` : ''}${size}...`;
  }
}

function inputChanged() {
  state.stepPos = null;
  updateInStats();
  renderChipsSoon();
  if (store.get('autoBake') || !state.steps.length) scheduleBake();
  refreshMirrorsSoon();
  if (!$('side-count').hidden) counterUpdate();
  saveInputSoon();
}

inTA.addEventListener('input', () => {
  const t = tab();
  t.text = t.crlf ? inTA.value.replace(/\n/g, '\r\n') : inTA.value;
  inputChanged();
});
// Keep CRLF when a paste replaces everything, and route huge pastes straight to the worker.
inTA.addEventListener('paste', (e) => {
  const raw = e.clipboardData?.getData('text/plain');
  if (!raw || (!raw.includes('\r') && raw.length <= IN_BIG)) return;
  const all = inTA.selectionStart === 0 && inTA.selectionEnd === inTA.value.length;
  if (!all && raw.length <= IN_BIG) return;
  e.preventDefault();
  const v = isBig() ? '' : inTA.value;
  setInput(all ? raw : v.slice(0, inTA.selectionStart) + raw + v.slice(inTA.selectionEnd));
});
inTA.addEventListener('scroll', () => { inMirror.scrollTop = inTA.scrollTop; });
outTA.addEventListener('scroll', () => { outMirror.scrollTop = outTA.scrollTop; });

const saveInputSoon = debounce(() => {
  if (!store.get('rememberInput')) return;
  const tabs = state.tabs.filter((t) => !isBig(t) && t.text.length < 1_000_000).map((t) => ({ name: t.name, text: t.text }));
  store.setInput('app', { tabs, active: Math.min(state.active, Math.max(0, tabs.length - 1)) });
}, 800);

const CLIP_MAX = 50_000_000;
async function copyText(get, what) {
  try {
    const t = typeof get === 'function' ? await get() : get;
    if (t.length > CLIP_MAX) return toast(`${what} is too big for the clipboard. Use download.`);
    try {
      await navigator.clipboard.writeText(t);
      toast(`${what} copied`);
    } catch {
      const ta = el('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = t;
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      toast(ok ? `${what} copied` : 'Copy blocked by the browser');
    }
  } catch (e) { toast(e.message); }
}
function download(data, name) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}
const outName = () => {
  const n = tab().name;
  return /\.[a-z0-9]{1,6}$/i.test(n) ? n.replace(/(\.[^.]+)$/, '.out$1') : 'output.txt';
};
const inputSnapshot = () => ({ src: tab().src, text: tab().text, len: tab().len });
const restoreInput = (s) => (s.src ? setSource(s.src, { preview: s.text, len: s.len }) : setInput(s.text));

$('in-copy').addEventListener('click', () => copyText(() => (isBig() ? tab().src.text() : tab().text), 'Input'));
$('out-copy').addEventListener('click', () => copyText(outputText, 'Output'));
$('in-download').addEventListener('click', () => download(isBig() ? tab().src : tab().text, /\./.test(tab().name) ? tab().name : 'input.txt'));
$('out-download').addEventListener('click', async () => {
  try { download(await outputBlob(), outName()); } catch (e) { toast(e.message); }
});
$('in-clear').addEventListener('click', () => {
  if (!inLen()) return;
  const old = inputSnapshot();
  setInput('');
  inTA.focus();
  toast('Input cleared', { action: 'Undo', onAction: () => restoreInput(old) });
});
$('out-clear').addEventListener('click', () => {
  const old = inputSnapshot(), oldSteps = state.steps;
  setInput('');
  state.steps = [];
  recipeChanged();
  toast('Cleared', { action: 'Undo', onAction: () => { state.steps = oldSteps; recipeChanged(); restoreInput(old); } });
});
$('in-paste').addEventListener('click', async () => {
  try { setInput(await navigator.clipboard.readText()); }
  catch { toast(`Paste blocked. Click the box and press ${isMac ? 'Cmd' : 'Ctrl'} V.`); inTA.focus(); }
});
$('out-move').addEventListener('click', async () => {
  if (!state.steps.length) return toast('Nothing to move yet');
  const old = inputSnapshot();
  try {
    if (state.outFull) setInput(state.output);
    else setSource(await outputBlob(), { preview: state.output, len: state.outLen });
  } catch (e) { return toast(e.message); }
  toast('Output moved to input', { action: 'Undo', onAction: () => restoreInput(old) });
});

// ---------- Tabs ----------
function renderTabs() {
  const box = $('tabs');
  const single = state.tabs.length === 1;
  box.replaceChildren(...state.tabs.map((t, i) => {
    const sel = i === state.active;
    const label = single && /^Input \d+$/.test(t.name) ? 'Input' : t.name;
    return el('div', { class: 'tabwrap' },
      el('button', { class: 'tab', type: 'button', 'aria-current': sel ? 'true' : 'false', 'data-i': String(i), title: t.name, text: label }),
      single ? null : el('button', { class: 'btn icon x', type: 'button', 'aria-label': `Close ${t.name}`, 'data-close-tab': String(i) }, icon('x')));
  }), el('button', { class: 'btn sm icon', type: 'button', id: 'tab-add', 'aria-label': 'New input tab', title: 'New input tab' }, icon('plus')));
  $('out-save').hidden = !tab().handle;
}
function switchTab(i) {
  state.active = Math.max(0, Math.min(i, state.tabs.length - 1));
  showInput();
  renderTabs();
  inputChanged();
  saveInputSoon();
}
function addTab(text = '', name) {
  if (state.tabs.length >= 20) { toast('20 tabs max'); return false; }
  state.tabs.push(mkTab(text, name));
  switchTab(state.tabs.length - 1);
  return true;
}
$('tabs').addEventListener('click', (e) => {
  const close = e.target.closest('[data-close-tab]');
  if (close) {
    const i = +close.dataset.closeTab;
    state.tabs.splice(i, 1);
    switchTab(state.active >= i ? state.active - 1 : state.active);
    return;
  }
  if (e.target.closest('#tab-add')) { addTab(); inTA.focus(); return; }
  const t = e.target.closest('.tab');
  if (t) switchTab(+t.dataset.i);
});
$('tabs').addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('tab')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    switchTab(state.active + (e.key === 'ArrowRight' ? 1 : -1));
    $('tabs').querySelector('[aria-current="true"]')?.focus();
  }
});

// ---------- Files ----------
// Small text files load on the page and stay editable. Big ones, and UTF-16, go to the worker.
async function loadFiles(items) {
  for (const item of items) {
    const f = item instanceof Blob ? item : item.file;
    const head = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
    const utf16 = (head[0] === 0xFF && head[1] === 0xFE) || (head[0] === 0xFE && head[1] === 0xFF);
    if (!utf16 && head.includes(0)) { toast(`${f.name} looks like a binary file, not text`); continue; }
    const reuse = !inLen() && state.tabs.length === 1;
    if (!reuse && !addTab('', f.name)) return;
    tab().name = f.name;
    tab().handle = item.handle || null;
    renderTabs();
    if (f.size > IN_BIG || utf16) setSource(f);
    else setInput(await f.text());
  }
}
$('in-open').addEventListener('click', async () => {
  if (!window.showOpenFilePicker) { $('file-input').click(); return; }
  try {
    const handles = await window.showOpenFilePicker({ multiple: true });
    await loadFiles(await Promise.all(handles.map(async (h) => ({ file: await h.getFile(), handle: h }))));
  } catch (e) { if (e.name !== 'AbortError') $('file-input').click(); }
});
$('file-input').addEventListener('change', (e) => { loadFiles([...e.target.files]); e.target.value = ''; });
$('out-save').addEventListener('click', async () => {
  const h = tab().handle;
  if (!h) return;
  try {
    const w = await h.createWritable();
    await w.write(await outputBlob());
    await w.close();
    toast(`Saved to ${h.name}`);
  } catch (e) { if (e.name !== 'AbortError') toast('Could not save to that file'); }
});

let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  loadFiles([...e.dataTransfer.files]);
  showPane('p-text');
});

// ---------- Chips ----------
function renderChips() {
  const box = $('chips');
  const t = inputText();
  const inRecipe = new Set(state.steps.filter((s) => !s.off).map((s) => s.id));
  const chips = detectChips(t).filter((c) => !inRecipe.has(c.fix[0]) && byId.has(c.fix[0]));
  const kids = chips.map((c) => el('button', { class: 'chip', type: 'button', title: `Add ${byId.get(c.fix[0]).name} to the recipe`, onclick: () => addStep(c.fix[0], c.fix[1]) },
    el('span', { text: c.label }), el('b', { text: nf.format(c.count) + (c.partial || isBig() ? '+' : '') })));
  if (chips.length > 1) {
    kids.push(el('button', { class: 'chip all', type: 'button', onclick: () => {
      for (const c of chips) state.steps.push(mkStep(c.fix[0], c.fix[1]));
      recipeChanged();
      toast(`Added ${chips.length} fixes`);
    } }, 'Fix all'));
  }
  box.replaceChildren(...kids);
}
const renderChipsSoon = debounce(renderChips, () => (inputText().length > 500_000 ? 600 : 200));

// ---------- Mirrors: invisibles, diff, regex highlight ----------
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function searchRanges(text) {
  const s = state.steps.find((x) => !x.off && (x.id === 'regex-tester' || x.id === 'find-and-replace'));
  if (!s) return [];
  if (s.id === 'regex-tester') return regexRanges(text, s.opts.pattern, s.opts.flags || 'g');
  const o = s.opts;
  if (!o.find) return [];
  let pat = o.regex ? o.find : escapeRe(o.find.replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
  if (o.wholeWord) pat = `\\b(?:${pat})\\b`;
  return regexRanges(text, pat, o.caseSensitive ? 'g' : 'gi');
}
function refreshMirrors() {
  const inv = store.get('invisibles');
  const a = inputText(), b = state.output;
  let ra = [], rb = [];
  if (store.get('diff') && state.steps.length && a.length <= MIRROR_LIMIT && b.length <= MIRROR_LIMIT) {
    const r = diffRanges(diff(a, b));
    ra = r.a;
    rb = r.b;
  }
  const hits = a.length <= MIRROR_LIMIT ? searchRanges(a) : [];
  if (hits.length) ra = [...ra, ...hits].sort((x, y) => x[0] - y[0]);
  inMirror.innerHTML = renderMirror(a, ra, inv);
  outMirror.innerHTML = renderMirror(b, rb, inv);
  inMirror.scrollTop = inTA.scrollTop;
  outMirror.scrollTop = outTA.scrollTop;
  const big = (inv || store.get('diff')) && (a.length > MIRROR_LIMIT || b.length > MIRROR_LIMIT);
  if (big && !refreshMirrors.warned) { refreshMirrors.warned = true; toast('Highlights are off for very large text'); }
}
const refreshMirrorsSoon = debounce(refreshMirrors, 150);

function toggle(btnId, key, label) {
  const b = $(btnId);
  const sync = () => b.setAttribute('aria-pressed', String(!!store.get(key)));
  sync();
  b.addEventListener('click', () => {
    store.set(key, !store.get(key));
    sync();
    refreshMirrors();
    toast(`${label} ${store.get(key) ? 'on' : 'off'}`);
  });
}
toggle('t-invis', 'invisibles', 'Invisibles');
toggle('t-diff', 'diff', 'Diff');

// ---------- URL hash ----------
function writeHash() {
  const h = state.steps.length ? '#recipe=' + encodeSteps(plainSteps(Infinity), byId) : '';
  if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
}
function readHash() {
  const p = parseHash(location.hash);
  if (!p.recipe && !p.input) return false;
  if (p.recipe) state.steps = decodeSteps(p.recipe, byId).map((s) => mkStep(s.id, s.opts, { off: s.off, pause: s.pause }));
  if (p.input) {
    const t = decodeText(p.input);
    if (t != null) { state.tabs = [mkTab(t)]; state.active = 0; }
  }
  return true;
}
addEventListener('hashchange', () => {
  if (readHash()) { showInput(); renderTabs(); renderSteps(); writeHash(); inputChanged(); }
});

// ---------- Dialogs and panels ----------
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (!c) return;
  const box = c.closest('dialog, .side, .pop');
  if (box?.tagName === 'DIALOG') box.close();
  else closePanel(box);
});

function openPanel(id, btn) {
  for (const s of document.querySelectorAll('.side')) if (s.id !== id && !s.hidden) closePanel(s);
  const p = $(id);
  p.hidden = false;
  btn?.setAttribute('aria-pressed', 'true');
  p.querySelector('button, select, input')?.focus();
}
function closePanel(p) {
  if (!p || p.hidden) return;
  p.hidden = true;
  document.querySelector(`[data-panel="${p.id}"]`)?.setAttribute('aria-pressed', 'false');
  if (p.id === 'side-speak') speechSynthesis?.cancel();
}
function panelToggle(btnId, panelId, onOpen) {
  const b = $(btnId);
  b.dataset.panel = panelId;
  b.addEventListener('click', () => {
    if (!$(panelId).hidden) { closePanel($(panelId)); return; }
    openPanel(panelId, b);
    onOpen?.();
  });
}

// Word counter panel
let counter = null;
const counterUpdate = debounce(() => counter?.update(), () => (inLen() > 200_000 ? 400 : 60));
// Big inputs are counted in the worker so the page never scans the whole text.
const bigCount = (stopWords) => (isBig() ? engine.call('fullstats', { tab: tab().key, version: tab().version, src: tab().src, stopWords }) : null);
panelToggle('t-count', 'side-count', () => { counter ||= mountCounter($('wc'), inputText, bigCount); counter.update(); });

// Character inspector
const CHAR_NAMES = {
  0x09: 'Tab', 0x0A: 'Line feed (LF)', 0x0D: 'Carriage return (CR)', 0x20: 'Space', 0xA0: 'No-break space (NBSP)', 0xAD: 'Soft hyphen',
  0x200B: 'Zero width space', 0x200C: 'Zero width non-joiner', 0x200D: 'Zero width joiner', 0x200E: 'Left-to-right mark', 0x200F: 'Right-to-left mark',
  0x2060: 'Word joiner', 0xFEFF: 'Byte order mark (zero width no-break space)', 0x202F: 'Narrow no-break space', 0x2007: 'Figure space',
  0x2002: 'En space', 0x2003: 'Em space', 0x2009: 'Thin space', 0x200A: 'Hair space', 0x3000: 'Ideographic space', 0x180E: 'Mongolian vowel separator',
  0x2018: 'Left single quotation mark', 0x2019: 'Right single quotation mark', 0x201C: 'Left double quotation mark', 0x201D: 'Right double quotation mark',
  0x201A: 'Single low-9 quotation mark', 0x201E: 'Double low-9 quotation mark', 0xAB: 'Left-pointing double angle quotation mark', 0xBB: 'Right-pointing double angle quotation mark',
  0x2010: 'Hyphen', 0x2011: 'Non-breaking hyphen', 0x2012: 'Figure dash', 0x2013: 'En dash', 0x2014: 'Em dash', 0x2015: 'Horizontal bar', 0x2212: 'Minus sign',
  0x2026: 'Horizontal ellipsis', 0x2022: 'Bullet', 0xB7: 'Middle dot', 0x2032: 'Prime', 0x2033: 'Double prime', 0xFE0F: 'Variation selector-16 (emoji style)',
  0x2028: 'Line separator', 0x2029: 'Paragraph separator', 0x20AC: 'Euro sign', 0xA9: 'Copyright sign', 0xAE: 'Registered sign', 0x2122: 'Trade mark sign',
  0x22: 'Quotation mark', 0x27: 'Apostrophe', 0x2D: 'Hyphen-minus', 0x2E: 'Full stop', 0x2C: 'Comma', 0x3B: 'Semicolon', 0x3A: 'Colon', 0x5C: 'Reverse solidus (backslash)',
};
const CATS = [[/\p{Lu}/u, 'Uppercase letter'], [/\p{Ll}/u, 'Lowercase letter'], [/\p{L}/u, 'Letter'], [/\p{M}/u, 'Combining mark'], [/\p{Nd}/u, 'Digit'], [/\p{N}/u, 'Number'],
  [/\p{Zs}/u, 'Space separator'], [/\p{Cc}/u, 'Control'], [/\p{Cf}/u, 'Format (invisible)'], [/\p{Extended_Pictographic}/u, 'Emoji or pictograph'], [/\p{P}/u, 'Punctuation'], [/\p{S}/u, 'Symbol']];
const hex = (n, w = 4) => n.toString(16).toUpperCase().padStart(w, '0');
const segG = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
let inspectSrc = inTA;
function renderInspector() {
  const body = $('inspect-body');
  if ($('side-inspect').hidden) return;
  const ta = inspectSrc;
  const v = ta.value;
  const pos = ta.selectionStart;
  let g = '';
  const from = Math.max(0, pos - 40);
  for (const s of segG.segment(v.slice(from, pos + 40))) {
    if (from + s.index <= pos && pos < from + s.index + s.segment.length) { g = s.segment; break; }
  }
  if (!g) { body.replaceChildren(el('p', { style: 'margin:0;color:var(--muted)', text: `Click on a character in the ${ta === inTA ? 'input' : 'output'} to inspect it.` })); return; }
  const cps = [...g].map((c) => c.codePointAt(0));
  const bytes = [...new TextEncoder().encode(g)].map((b) => hex(b, 2)).join(' ');
  const rows = [
    ['Code point', cps.map((c) => 'U+' + hex(c)).join(' ')],
    ['Name', cps.map((c) => CHAR_NAMES[c] || (c >= 0x21 && c < 0x7F ? `Latin ${String.fromCodePoint(c)}` : '')).filter(Boolean).join(', ') || 'Not in the short list'],
    ['Type', cps.map((c) => (CATS.find(([re]) => re.test(String.fromCodePoint(c))) || [0, 'Other'])[1]).join(', ')],
    ['UTF-8', bytes],
    ['UTF-16', [...g].map((c) => [...Array(c.length)].map((_, i) => hex(c.charCodeAt(i)))).flat().join(' ')],
    ['Decimal', cps.join(' ')],
    ['HTML', cps.map((c) => `&#x${hex(c, 1)};`).join('')],
    ['JS', cps.map((c) => (c > 0xFFFF ? `\\u{${hex(c, 1)}}` : `\\u${hex(c)}`)).join('')],
    ['Position', `${nf.format(pos)} of ${nf.format(v.length)}`],
  ];
  const visible = g.replace(/\s/g, (c) => ({ ' ': '\u2423', '\t': '\u2192', '\n': '\u21B5' }[c] || '\u237D'));
  body.replaceChildren(el('div', { class: 'big', 'aria-hidden': 'true', text: visible }),
    el('dl', {}, ...rows.flatMap(([k, val]) => [el('dt', { text: k }), el('dd', { text: val })])));
}
for (const ta of [inTA, outTA]) {
  for (const ev of ['click', 'keyup', 'focus', 'select']) ta.addEventListener(ev, () => { inspectSrc = ta; renderInspector(); });
}
panelToggle('t-inspect', 'side-inspect', renderInspector);

// Read aloud
const synth = window.speechSynthesis;
function fillVoices() {
  if (!synth) return;
  const sel = $('sp-voice');
  const voices = synth.getVoices();
  if (sel.options.length === voices.length && voices.length) return;
  sel.replaceChildren(el('option', { value: '', text: 'Default voice' }), ...voices.map((v) => el('option', { value: v.voiceURI, text: `${v.name} (${v.lang})${v.localService ? '' : ' online'}` })));
  sel.value = store.get('voice') || '';
}
panelToggle('t-speak', 'side-speak', () => {
  if (!synth) { $('sp-note').textContent = 'This browser cannot read text aloud.'; $('sp-play').disabled = true; return; }
  fillVoices();
  synth.onvoiceschanged = fillVoices;
});
$('sp-rate').value = store.get('rate');
$('sp-rate-v').textContent = store.get('rate');
$('sp-rate').addEventListener('input', (e) => { $('sp-rate-v').textContent = e.target.value; store.set('rate', +e.target.value); });
$('sp-voice').addEventListener('change', (e) => store.set('voice', e.target.value));
$('sp-play').addEventListener('click', () => {
  synth.cancel();
  const text = ($('sp-src').value === 'input' ? inputText() : state.output).slice(0, 100_000);
  if (!text.trim()) return toast('Nothing to read');
  const voice = synth.getVoices().find((v) => v.voiceURI === $('sp-voice').value);
  // Short chunks avoid browsers cutting long utterances off.
  const chunks = text.match(/[^.!?\n]{1,220}(?:[.!?]+|\n+|$)|[^\s]{220}/g) || [text];
  for (const c of chunks) {
    if (!c.trim()) continue;
    const u = new SpeechSynthesisUtterance(c);
    if (voice) u.voice = voice;
    u.rate = +$('sp-rate').value;
    synth.speak(u);
  }
});
$('sp-stop').addEventListener('click', () => synth?.cancel());

// Magic
async function runMagic() {
  const pop = $('magic-pop');
  const btn = $('magic').getBoundingClientRect();
  pop.style.top = `${btn.bottom + 6}px`;
  pop.style.left = `${Math.max(12, Math.min(btn.right - 340, innerWidth - 352))}px`;
  pop.hidden = false;
  const body = $('magic-body');
  body.replaceChildren(el('p', { style: 'margin:0;color:var(--muted)', text: 'Looking...' }));
  const target = state.steps.length ? state.output : inputText();
  const sample = target.slice(0, 65536);
  const magicOps = ops.filter((o) => o.magic);
  const found = [];
  if (sample.trim()) {
    await Promise.all([...new Set(magicOps.map((o) => o.cat))].map(loadCategory));
    for (const meta of magicOps) {
      const op = await getOp(meta.id);
      let score = 0;
      try { score = op.detect(sample); } catch { score = 0; }
      if (score >= 0.3) found.push({ meta, score });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const chips = detectChips(sample);
  const rows = found.slice(0, 5).map(({ meta, score }) => el('div', { class: 'sugg' },
    el('i', { class: 'dot', style: `--c:${catById.get(meta.cat).color}`, 'aria-hidden': 'true' }),
    el('span', {}, meta.name, el('small', { text: score >= 0.8 ? 'Very likely' : score >= 0.55 ? 'Likely' : 'Maybe' })),
    el('button', { class: 'btn line', type: 'button', text: 'Add', onclick: () => { addStep(meta.id); pop.hidden = true; } })));
  if (chips.length >= 2) {
    rows.push(el('div', { class: 'sugg' }, el('span', {}, 'Messy paste', el('small', { text: chips.map((c) => c.label).join(', ') })),
      el('button', { class: 'btn line', type: 'button', text: 'Clean', onclick: () => { loadStarter(STARTERS[0]); pop.hidden = true; } })));
  }
  if (!rows.length) rows.push(el('p', { style: 'margin:0;color:var(--muted)', text: sample.trim() ? 'Nothing obvious. It looks like plain text.' : 'Add some text first.' }));
  body.replaceChildren(el('p', { style: 'margin:0;font-size:12px;color:var(--muted)', text: `Checking the ${state.steps.length ? 'output' : 'input'}` }), ...rows);
  body.querySelector('button')?.focus();
}
$('magic').addEventListener('click', () => ($('magic-pop').hidden ? runMagic() : ($('magic-pop').hidden = true)));
document.addEventListener('pointerdown', (e) => {
  const pop = $('magic-pop');
  if (!pop.hidden && !pop.contains(e.target) && !$('magic').contains(e.target)) pop.hidden = true;
});

// Save, load, share, settings
$('r-save').addEventListener('click', () => {
  if (!state.steps.length) return toast('Add some steps first');
  $('save-name').value = '';
  $('dlg-save').showModal();
});
$('dlg-save').addEventListener('close', () => {
  if ($('dlg-save').returnValue !== 'ok') return;
  const name = $('save-name').value.trim();
  if (!name) return;
  const list = store.get('recipes').filter((r) => r.name !== name);
  list.push({ name, recipe: encodeSteps(plainSteps(Infinity), byId) });
  store.set('recipes', list);
  toast(`Saved ${name}`);
});
function renderSaved() {
  const list = store.get('recipes');
  $('saved-list').replaceChildren(...(list.length ? list.map((r, i) => el('li', {},
    el('span', { text: r.name, title: r.name }),
    el('button', { class: 'btn line', type: 'button', text: 'Load', onclick: () => {
      state.steps = decodeSteps(r.recipe, byId).map((s) => mkStep(s.id, s.opts, { off: s.off, pause: s.pause }));
      recipeChanged();
      $('dlg-load').close();
    } }),
    el('button', { class: 'btn icon', type: 'button', 'aria-label': `Delete ${r.name}`, onclick: () => { list.splice(i, 1); store.set('recipes', list); renderSaved(); } }, icon('trash'))))
    : [el('li', { style: 'border:0;color:var(--muted)', text: 'Nothing saved yet.' })]));
}
$('r-load').addEventListener('click', () => { renderSaved(); $('dlg-load').showModal(); });
$('rec-export').addEventListener('click', () => {
  const data = store.get('recipes').map((r) => ({ name: r.name, steps: decodeSteps(r.recipe, byId).map(({ id, opts, off, pause }) => ({ id, opts, off, pause })) }));
  download(JSON.stringify({ app: 'textchef', version: 1, recipes: data }, null, 2), 'textchef-recipes.json');
});
$('rec-import').addEventListener('click', () => $('rec-file').click());
$('rec-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const incoming = (Array.isArray(data) ? data : data.recipes || []).filter((r) => r && typeof r.name === 'string' && Array.isArray(r.steps));
    const list = store.get('recipes');
    for (const r of incoming) {
      const steps = r.steps.filter((s) => s && byId.has(s.id)).map((s) => ({ id: s.id, opts: s.opts || {}, off: !!s.off, pause: !!s.pause }));
      const name = r.name.slice(0, 80);
      const at = list.findIndex((x) => x.name === name);
      const entry = { name, recipe: encodeSteps(steps, byId) };
      if (at >= 0) list[at] = entry; else list.push(entry);
    }
    store.set('recipes', list);
    renderSaved();
    toast(`Imported ${incoming.length} recipe${incoming.length === 1 ? '' : 's'}`);
  } catch { toast('That file is not a recipe export'); }
});

function shareUrl() {
  const parts = [];
  if (state.steps.length) parts.push('recipe=' + encodeSteps(plainSteps(Infinity), byId));
  if ($('share-input').checked && inputText()) parts.push('input=' + encodeText(inputText()));
  return location.origin + location.pathname + (parts.length ? '#' + parts.join('&') : '');
}
$('r-share').addEventListener('click', () => {
  $('share-input').checked = false;
  $('share-warn').hidden = true;
  $('share-url').value = shareUrl();
  $('dlg-share').showModal();
  $('share-url').select();
});
$('share-input').addEventListener('change', (e) => {
  if (e.target.checked && isBig()) { e.target.checked = false; toast('That input is too big to put in a link'); return; }
  $('share-warn').hidden = !e.target.checked;
  $('share-url').value = shareUrl();
  if (e.target.checked && $('share-url').value.length > 32000) toast('That link is very long and may not work everywhere');
});
$('share-copy').addEventListener('click', () => copyText($('share-url').value, 'Link'));

$('t-settings').addEventListener('click', () => {
  $('set-remember').checked = !!store.get('rememberInput');
  $('set-theme').value = store.get('theme');
  $('dlg-settings').showModal();
});
$('set-remember').addEventListener('change', (e) => {
  store.set('rememberInput', e.target.checked);
  if (!e.target.checked) store.clearInputs();
  else saveInputSoon();
});
$('set-theme').addEventListener('change', (e) => { store.set('theme', e.target.value); applyTheme(e.target.value); });

// ---------- Command palette ----------
const ACTIONS = [
  { name: 'Bake', hint: 'Ctrl Enter', run: () => bake() },
  { name: 'Magic', hint: 'Guess the format', run: () => runMagic() },
  { name: 'Copy output', hint: 'Ctrl Shift C', run: () => copyText(outputText, 'Output') },
  { name: 'Clear recipe', run: () => $('r-clear').click() },
  { name: 'Toggle invisibles', run: () => $('t-invis').click() },
  { name: 'Toggle diff', run: () => $('t-diff').click() },
  { name: 'Word counter', run: () => $('t-count').click() },
  { name: 'Share link', run: () => $('r-share').click() },
  { name: 'New input tab', run: () => addTab() },
  { name: 'Open file', run: () => $('in-open').click() },
];
let palItems = [], palSel = 0;
function palRender() {
  const q = $('pal-input').value.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const score = (name, extra = '') => {
    const n = name.toLowerCase(), hay = `${n} ${extra.toLowerCase()}`;
    if (!terms.every((t) => hay.includes(t))) return -1;
    return (n.startsWith(q) ? 3 : 0) + (n.includes(q) ? 2 : 0) + terms.filter((t) => n.includes(t)).length;
  };
  const items = [
    ...ops.map((o) => ({ kind: 'op', id: o.id, name: o.name, hint: catById.get(o.cat).name, color: catById.get(o.cat).color, s: score(o.name, `${o.keywords} ${o.id} ${catById.get(o.cat).name}`) })),
    ...STARTERS.map((r) => ({ kind: 'starter', r, name: r.name, hint: 'Starter recipe', s: score(r.name, 'recipe starter') - 0.5 })),
    ...ACTIONS.map((a) => ({ kind: 'action', a, name: a.name, hint: a.hint || 'Action', s: score(a.name, 'action') - 0.25 })),
  ].filter((x) => x.s >= 0);
  if (terms.length) items.sort((a, b) => b.s - a.s);
  palItems = items.slice(0, 60);
  palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
  $('pal-list').replaceChildren(...palItems.map((x, i) => el('li', { role: 'option', id: `pal-${i}`, 'aria-selected': String(i === palSel), 'data-i': String(i) },
    x.color ? el('i', { class: 'dot', style: `--c:${x.color}`, 'aria-hidden': 'true' }) : icon(x.kind === 'starter' ? 'book' : 'play'),
    el('span', { text: x.name }), el('small', { text: x.hint }))));
  if (!palItems.length) $('pal-list').append(el('li', { style: 'color:var(--muted)', text: 'No matches' }));
  $('pal-input').setAttribute('aria-activedescendant', palItems.length ? `pal-${palSel}` : '');
  $('pal-list').children[palSel]?.scrollIntoView({ block: 'nearest' });
}
function palPick(i) {
  const x = palItems[i];
  if (!x) return;
  $('palette').close();
  if (x.kind === 'op') addStep(x.id);
  else if (x.kind === 'starter') loadStarter(x.r);
  else x.a.run();
}
function openPalette() {
  $('pal-input').value = '';
  palSel = 0;
  palRender();
  $('palette').showModal();
  $('pal-input').focus();
}
$('open-palette').addEventListener('click', openPalette);
$('pal-input').addEventListener('input', () => { palSel = 0; palRender(); });
$('pal-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    palSel = (palSel + (e.key === 'ArrowDown' ? 1 : -1) + palItems.length) % Math.max(1, palItems.length);
    palRender();
  } else if (e.key === 'Enter') { e.preventDefault(); palPick(palSel); }
});
$('pal-list').addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) palPick(+li.dataset.i); });
$('palette').addEventListener('click', (e) => { if (e.target === $('palette')) $('palette').close(); });

// ---------- Keyboard ----------
addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); $('palette').open ? $('palette').close() : openPalette(); }
  else if (mod && e.key === 'Enter') { e.preventDefault(); state.stepPos = null; bake(); }
  else if (mod && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyText(outputText, 'Output'); }
  else if (e.key === 'Escape') {
    if (!$('magic-pop').hidden) { $('magic-pop').hidden = true; $('magic').focus(); return; }
    const side = [...document.querySelectorAll('.side')].find((s) => !s.hidden);
    if (side && !document.querySelector('dialog[open]')) closePanel(side);
  }
});

// ---------- Panes: resizing and mobile tabs ----------
function applyCols() {
  const [c1, c2] = store.get('cols');
  layout.style.setProperty('--c1', `${c1}px`);
  layout.style.setProperty('--c2', `${c2}px`);
  const r = store.get('ioSplit');
  const io = $('p-text');
  io.style.setProperty('--r1', `${r}fr`);
  io.style.setProperty('--r2', `${1 - r}fr`);
  $('s1').setAttribute('aria-valuenow', String(c1));
  $('s2').setAttribute('aria-valuenow', String(c2));
  $('s3').setAttribute('aria-valuenow', String(Math.round(r * 100)));
}
function splitter(id, onMove) {
  const s = $(id);
  s.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    s.setPointerCapture(e.pointerId);
    s.classList.add('drag');
    const move = (ev) => onMove(ev, null);
    const up = () => { s.classList.remove('drag'); s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); };
    s.addEventListener('pointermove', move);
    s.addEventListener('pointerup', up);
  });
  s.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -16, ArrowUp: -16, ArrowRight: 16, ArrowDown: 16 }[e.key];
    if (d) { e.preventDefault(); onMove(null, d); }
  });
}
const clampCols = (c1, c2) => {
  const w = layout.clientWidth;
  c1 = Math.max(180, Math.min(c1, w * 0.4));
  c2 = Math.max(240, Math.min(c2, w - c1 - 320));
  return [Math.round(c1), Math.round(c2)];
};
splitter('s1', (e, d) => {
  const [c1, c2] = store.get('cols');
  const left = layout.getBoundingClientRect().left;
  store.set('cols', clampCols(e ? e.clientX - left : c1 + d, c2));
  applyCols();
});
splitter('s2', (e, d) => {
  const [c1, c2] = store.get('cols');
  const left = layout.getBoundingClientRect().left;
  store.set('cols', clampCols(c1, e ? e.clientX - left - c1 - 5 : c2 + d));
  applyCols();
});
splitter('s3', (e, d) => {
  const box = $('p-text').getBoundingClientRect();
  const r = e ? (e.clientY - box.top) / box.height : store.get('ioSplit') + d / box.height;
  store.set('ioSplit', Math.max(0.15, Math.min(0.85, r)));
  applyCols();
});

function showPane(id) {
  for (const p of layout.querySelectorAll(':scope > section')) p.classList.toggle('show', p.id === id);
  for (const b of document.querySelectorAll('.mtabs button')) b.setAttribute('aria-selected', String(b.dataset.p === id));
}
document.querySelector('.mtabs').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) showPane(b.dataset.p); });

$('intro-close')?.addEventListener('click', () => { $('intro').hidden = true; });

// ---------- Boot ----------
function boot() {
  initShell();
  const last = store.get('rememberInput') ? store.getInput('app') : null;
  if (last && Array.isArray(last.tabs) && last.tabs.length) {
    state.tabs = last.tabs.map((t) => mkTab(String(t.text || ''), String(t.name || 'Input')));
    state.active = Math.min(last.active | 0, state.tabs.length - 1);
  } else state.tabs = [mkTab('')];

  if (!readHash()) {
    try {
      const pre = JSON.parse(document.body.dataset.preload || '[]');
      state.steps = pre.filter(([id]) => byId.has(id)).map(([id, o]) => mkStep(id, o));
    } catch { /* ignore */ }
  }
  $('op-search').placeholder = `Search ${ops.length} ops`;
  $('autobake').checked = store.get('autoBake');
  if (!isMac) document.querySelectorAll('kbd').forEach((k) => (k.textContent = k.textContent.replace('Cmd', 'Ctrl')));
  else document.querySelectorAll('kbd').forEach((k) => (k.textContent = k.textContent.replace('Ctrl', 'Cmd')));
  applyCols();
  renderOps();
  renderStarters();
  renderTabs();
  showInput();
  renderSteps();
  writeHash();
  inputChanged();
  bake();
  booted();
}
boot();
