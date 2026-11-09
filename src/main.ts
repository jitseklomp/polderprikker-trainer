import './styles.css';
import { createMap } from './map.ts';
import { measure, type LonLat } from './geo.ts';
import { scoreForDistance, formatKm, verdict } from './scoring.ts';
import { CATEGORIES, TOWN_LEVELS, categoryById, provinceText, targetKind, isWaterway, type Target } from './data.ts';
import { TargetDeck } from './game.ts';
import { loadStats, recordAttempt, resetStats } from './stats.ts';
import { readJSON, writeJSON } from './storage.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- preferences ----------
interface Prefs {
  cats: string[]; // 'stations', 'stadiums', 'natura2000', 'towns', 'water'
  townLevel: string; // 'towns-1' | 'towns-2' | 'towns-3'
}
const PREFS_KEY = 'speldwerk:prefs:v1';
const prefs: Prefs = { cats: ['stations', 'towns'], townLevel: 'towns-1', ...readJSON<Partial<Prefs>>(PREFS_KEY, {}) };

const PICKER = [
  { key: 'stations', label: 'Treinstations', desc: '420 stations, ook museumlijnen' },
  { key: 'towns', label: 'Plaatsen', desc: 'Steden en dorpen, 3 niveaus' },
  { key: 'stadiums', label: 'Stadions', desc: 'Eredivisie 2026/27' },
  { key: 'natura2000', label: 'Natura 2000', desc: '162 natuurgebieden' },
  { key: 'water', label: 'Water en havens', desc: 'Havens, meren, polders' },
  { key: 'waterways', label: 'Rivieren en kanalen', desc: '375 waterwegen en vaargeulen' },
];

const selectedCategoryIds = () => prefs.cats.map((k) => (k === 'towns' ? prefs.townLevel : k));

// ---------- map ----------
const mapApi = createMap($('map'));

// keep CSS variables in sync with the overlay heights so the map can pad around them
const syncHeights = () => {
  const root = document.documentElement.style;
  root.setProperty('--top-h', `${$('top').getBoundingClientRect().height}px`);
  const panel = $('panel');
  root.setProperty('--panel-h', `${panel.hidden ? 0 : panel.getBoundingClientRect().height}px`);
};
const ro = new ResizeObserver(syncHeights);
ro.observe($('top'));
ro.observe($('panel'));

$('zoom-in').addEventListener('click', () => mapApi.zoomBy(1));
$('zoom-out').addEventListener('click', () => mapApi.zoomBy(-1));

// Labels toggle: on by default after answering; your choice sticks for the rest of the session.
let labelsOn = true;
const labelsBtn = $<HTMLButtonElement>('labels-btn');
const applyLabels = () => {
  labelsBtn.setAttribute('aria-pressed', String(labelsOn));
  labelsBtn.setAttribute('aria-label', labelsOn ? 'Plaatsnamen verbergen' : 'Plaatsnamen tonen');
  mapApi.setLabels(labelsOn);
};
labelsBtn.addEventListener('click', () => {
  labelsOn = !labelsOn;
  applyLabels();
});

// ---------- game state ----------
type Phase = 'setup' | 'aim' | 'result';
let phase: Phase = 'setup';
const deck = new TargetDeck();
let current: Target | null = null;
let pin: LonLat | null = null;
const session = { rounds: 0, total: 0 };

const actionBtn = $<HTMLButtonElement>('action-btn');

function renderSession() {
  const el = $('session');
  if (!session.rounds) {
    el.textContent = '';
    return;
  }
  const avg = Math.round(session.total / session.rounds);
  el.innerHTML = `<b>${session.rounds}</b> geprikt · gem. <b>${avg}</b>`;
}

function showTarget(t: Target) {
  const def = categoryById(t.category);
  const KIND_LABELS: Record<string, string> = { haven: 'Haven', meer: 'Meer', polder: 'Polder', rivier: 'Rivier', kanaal: 'Kanaal', vaargeul: 'Vaargeul' };
  const kindLabel = (t.kind && KIND_LABELS[t.kind]) || def.short;
  $('target-cat').textContent = kindLabel;
  $('target-name').textContent = t.name;
  const hint = $('target-hint');
  const text = [provinceText(t), t.hint].filter(Boolean).join(' · ');
  hint.hidden = !text;
  hint.textContent = text;
  $('target').hidden = false;
}

function nextRound() {
  phase = 'aim';
  current = deck.next();
  pin = null;
  mapApi.clearRound();
  labelsBtn.hidden = true;
  mapApi.setPinEnabled(true);
  mapApi.resetView();
  showTarget(current);
  $('result').hidden = true;
  $('helper').hidden = false;
  $('helper').textContent = 'Tik op de kaart om je speld te zetten';
  actionBtn.textContent = 'Bevestig';
  actionBtn.classList.remove('next');
  actionBtn.disabled = true;
  $('panel').hidden = false;
  syncHeights();
}

mapApi.onPin((ll) => {
  if (phase !== 'aim') return;
  pin = ll;
  actionBtn.disabled = false;
  $('helper').textContent = 'Tik opnieuw of sleep de speld om te verplaatsen';
  if (navigator.vibrate) navigator.vibrate(8);
});

function confirm() {
  if (phase !== 'aim' || !current || !pin) return;
  phase = 'result';
  mapApi.setPinEnabled(false);
  const m = measure(pin, current.geometry, current.r ?? 0);
  const kind = targetKind(current);
  const score = scoreForDistance(m.km, kind);
  session.rounds += 1;
  session.total += score;
  recordAttempt(current.category, { name: current.name, hint: current.hint, km: m.km, score });
  renderSession();

  const isArea = current.geometry.type !== 'Point' || (current.r ?? 0) > 0;
  $('verdict').textContent = verdict(m.km, kind);
  const water = isWaterway(current);
  $('distance').textContent = m.inside
    ? water
      ? 'Op het water'
      : isArea
        ? 'Binnen het gebied'
        : 'Raak'
    : `${formatKm(m.km)} ${water ? 'van het water' : isArea ? 'van de rand' : 'ernaast'}`;
  $('points').textContent = String(score);
  const fill = $('meter-fill');
  fill.style.width = '0';
  fill.style.background = score >= 700 ? 'var(--good)' : score >= 300 ? 'var(--warn)' : 'var(--bad)';
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${score / 10}%`)));
  $('result').hidden = false;
  $('helper').hidden = true;
  actionBtn.textContent = 'Volgende';
  actionBtn.classList.add('next');
  actionBtn.disabled = false;
  syncHeights();
  labelsBtn.hidden = false;
  applyLabels();
  mapApi.showAnswer(pin, current.geometry, m.nearest, current.hint ? `${current.name} (${current.hint})` : current.name, current.r ?? 0);
}

actionBtn.addEventListener('click', () => {
  if (phase === 'aim') confirm();
  else if (phase === 'result') nextRound();
});

$('skip-btn').addEventListener('click', () => {
  if (phase === 'aim') nextRound();
});

// ---------- setup sheet ----------
function renderSetup() {
  const cats = $('cats');
  cats.querySelectorAll('.cat').forEach((n) => n.remove());
  for (const p of PICKER) {
    const label = document.createElement('label');
    label.className = 'cat';
    label.innerHTML = `<input type="checkbox" value="${p.key}"><strong>${p.label}</strong><span>${p.desc}</span>`;
    const input = label.querySelector('input')!;
    input.checked = prefs.cats.includes(p.key);
    input.addEventListener('change', () => {
      prefs.cats = PICKER.map((x) => x.key).filter((k) => (k === p.key ? input.checked : prefs.cats.includes(k)));
      writeJSON(PREFS_KEY, prefs);
      renderLevels();
      $('setup-error').hidden = true;
    });
    cats.appendChild(label);
  }
  renderLevels();
}

function renderLevels() {
  const wrap = $('levels');
  const on = prefs.cats.includes('towns');
  wrap.setAttribute('aria-disabled', String(!on));
  wrap.innerHTML = '';
  for (const lvl of TOWN_LEVELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'level';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(prefs.townLevel === lvl.id));
    b.title = categoryById(lvl.id).description;
    b.innerHTML = `${lvl.label}`;
    b.addEventListener('click', () => {
      prefs.townLevel = lvl.id;
      if (!prefs.cats.includes('towns')) prefs.cats.push('towns');
      writeJSON(PREFS_KEY, prefs);
      renderSetup();
    });
    wrap.appendChild(b);
  }
  let note = document.getElementById('levels-note');
  if (!note) {
    note = document.createElement('p');
    note.id = 'levels-note';
    note.className = 'levels-label';
    wrap.after(note);
  }
  note.textContent = `Plaatsen: ${categoryById(prefs.townLevel).description.toLowerCase()}`;
}

function openSetup() {
  renderSetup();
  $('setup').hidden = false;
}

$('menu-btn').addEventListener('click', openSetup);
// Mid-game the menu can be dismissed by tapping outside it; on first visit it stays.
$('setup').addEventListener('click', (e) => {
  if (e.target === $('setup') && phase !== 'setup') $('setup').hidden = true;
});

$('start-btn').addEventListener('click', async () => {
  const err = $('setup-error');
  const ids = selectedCategoryIds();
  if (!ids.length) {
    err.textContent = 'Kies minstens één categorie.';
    err.hidden = false;
    return;
  }
  const btn = $<HTMLButtonElement>('start-btn');
  btn.disabled = true;
  btn.textContent = 'Laden...';
  try {
    await deck.load(ids);
    $('setup').hidden = true;
    nextRound();
  } catch (e) {
    err.textContent = 'De doelen konden niet geladen worden. Controleer je verbinding en probeer het opnieuw.';
    err.hidden = false;
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Start';
  }
});

// ---------- stats sheet ----------
const statLabel = (id: string) => {
  const lvl = TOWN_LEVELS.find((l) => l.id === id);
  return lvl ? `Plaatsen · ${lvl.label.toLowerCase()}` : categoryById(id)?.label ?? id;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function renderStats() {
  const all = loadStats();
  const body = $('stats-body');
  const ids = CATEGORIES.map((c) => c.id).filter((id) => all[id]?.attempts);
  if (!ids.length) {
    body.innerHTML = '<p class="empty">Nog niets geprikt. Je statistieken verschijnen hier na je eerste ronde.</p>';
    return;
  }
  body.innerHTML = ids
    .map((id) => {
      const s = all[id];
      const misses = s.worst
        .map((w) => `<li><span>${escapeHtml(w.name)}${w.hint ? ` <small>(${escapeHtml(w.hint)})</small>` : ''}</span><span>${formatKm(w.km)}</span></li>`)
        .join('');
      return `<section class="stat-block">
        <h3>${statLabel(id)}</h3>
        <div class="stat-nums">
          <div><b>${s.attempts}</b><small>pogingen</small></div>
          <div><b>${Math.round(s.scoreSum / s.attempts)}</b><small>gem. score</small></div>
          <div><b>${formatKm(s.kmSum / s.attempts)}</b><small>gem. afstand</small></div>
        </div>
        ${misses ? `<p class="levels-label">Grootste missers</p><ul class="misses">${misses}</ul>` : ''}
      </section>`;
    })
    .join('');
}

$('stats-btn').addEventListener('click', () => {
  renderStats();
  $('stats').hidden = false;
});
$('stats-close').addEventListener('click', () => ($('stats').hidden = true));
$('stats').addEventListener('click', (e) => {
  if (e.target === $('stats')) $('stats').hidden = true;
});
$('stats-reset').addEventListener('click', () => {
  if (window.confirm('Alle statistieken wissen?')) {
    resetStats();
    renderStats();
  }
});

// ---------- boot ----------
renderSetup();
renderSession();
syncHeights();
