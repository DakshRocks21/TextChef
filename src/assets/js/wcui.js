// Word counter UI. Shared by the /word-counter/ page and the panel in the app.
import { fullStats, keywords, fleschLabel, duration } from './stats.js';
import * as store from './store.js';

const fmt = new Intl.NumberFormat();

// compute(stopWords), when given and it returns a promise, supplies { stats, keys } from elsewhere (the worker).
export function mountCounter(root, getText, compute) {
  const k = (name) => root.querySelector(`[data-k="${name}"]`);
  const preset = root.querySelector('#wc-preset');
  const custom = root.querySelector('[data-custom]');
  const customVal = root.querySelector('#wc-custom');
  const customKind = root.querySelector('#wc-kind');
  const stop = root.querySelector('#wc-stop');
  const limitBox = root.querySelector('[data-limit]');
  const meter = limitBox.querySelector('.meter');

  const lim = store.get('limit') || { kind: 'words', value: 0 };
  const presetKey = `${lim.kind}:${lim.value}`;
  if (!lim.value) preset.value = '';
  else if ([...preset.options].some((o) => o.value === presetKey)) preset.value = presetKey;
  else { preset.value = 'custom'; customVal.value = lim.value; customKind.value = lim.kind; }
  custom.hidden = preset.value !== 'custom';
  stop.checked = store.get('stopWords') !== false;

  function saveLimit() {
    custom.hidden = preset.value !== 'custom';
    let v = { kind: 'words', value: 0 };
    if (preset.value === 'custom') v = { kind: customKind.value, value: Math.max(1, +customVal.value || 0) };
    else if (preset.value) { const [kind, n] = preset.value.split(':'); v = { kind, value: +n }; }
    store.set('limit', v);
    update();
  }
  preset.addEventListener('change', saveLimit);
  customVal.addEventListener('input', saveLimit);
  customKind.addEventListener('change', saveLimit);
  stop.addEventListener('change', () => { store.set('stopWords', stop.checked); update(); });

  let summaryTimer, seq = 0;
  function update() {
    const pending = compute?.(stop.checked);
    if (!pending) { const t = getText(); render(fullStats(t), keywords(t, { stopWords: stop.checked })); return; }
    const mine = ++seq;
    root.setAttribute('aria-busy', 'true');
    pending.then(({ stats, keys }) => mine === seq && render(stats, keys), () => {}).finally(() => root.removeAttribute('aria-busy'));
  }

  function render(s, keys) {
    k('words').textContent = fmt.format(s.words);
    k('chars').textContent = fmt.format(s.chars);
    k('charsNoSpaces').textContent = fmt.format(s.charsNoSpaces);
    k('sentences').textContent = fmt.format(s.sentences);
    k('paragraphs').textContent = fmt.format(s.paragraphs);
    k('lines').textContent = fmt.format(s.lines);
    k('reading').textContent = duration(s.readingSec);
    k('speaking').textContent = duration(s.speakingSec);
    k('avgWord').textContent = s.avgWord.toFixed(1);
    k('longest').textContent = s.longest || 'None';
    k('longest').title = s.longest;
    k('flesch').textContent = s.words ? Math.round(s.flesch) : '0';
    k('fleschLabel').textContent = s.words ? `Reading ease: ${fleschLabel(s.flesch)}` : 'Reading ease';
    k('grade').textContent = s.words ? s.grade.toFixed(1) : '0';

    const l = store.get('limit');
    limitBox.classList.remove('near', 'over');
    if (l && l.value) {
      const used = l.kind === 'chars' ? s.chars : s.words;
      const pct = (used / l.value) * 100;
      k('limit').textContent = `${fmt.format(used)} of ${fmt.format(l.value)} ${l.kind === 'chars' ? 'characters' : 'words'}`;
      meter.firstElementChild.style.width = Math.min(100, pct) + '%';
      meter.setAttribute('aria-valuenow', String(Math.round(Math.min(100, pct))));
      meter.hidden = false;
      if (pct > 100) limitBox.classList.add('over');
      else if (pct >= 90) limitBox.classList.add('near');
    } else {
      k('limit').textContent = '';
      meter.hidden = true;
    }

    const ol = k('keys');
    ol.replaceChildren(...keys.map((w) => {
      const li = document.createElement('li');
      const a = document.createElement('b');
      a.textContent = w.word;
      a.style.fontWeight = '500';
      const c = document.createElement('span');
      c.textContent = String(w.count);
      const d = document.createElement('span');
      d.textContent = w.density.toFixed(1) + '%';
      li.append(a, c, d);
      return li;
    }));
    if (!keys.length) {
      const li = document.createElement('li');
      li.textContent = 'Keywords show up here as you type.';
      li.style.color = 'var(--muted)';
      ol.append(li);
    }

    clearTimeout(summaryTimer);
    summaryTimer = setTimeout(() => {
      k('summary').textContent = `${fmt.format(s.words)} words, ${fmt.format(s.chars)} characters`;
    }, 1200);
  }

  update();
  return { update };
}
