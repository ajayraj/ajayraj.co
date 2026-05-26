import { TIER_LABELS, escHtml, renderCardMeta, renderCardFrontContent, renderCardBack, attachCardHandlers } from './render.js';
import { getCardProgress } from './store.js';
import { TIER_META } from './util.js';

const FILTER_TABS = [
  { value: 'all', label: 'All', sub: null },
  ...Object.entries(TIER_META).map(([v, m]) => ({ value: v, label: m.label, sub: m.sub })),
];

// Status filter values — granular tiers matching the badge system
const STATUS_TABS = [
  { value: 'all',      label: 'All' },
  { value: 'unseen',   label: 'Unseen' },
  { value: 'due',      label: 'Due' },
  { value: 'learning', label: 'Learning' },
  { value: 'steady',   label: 'Steady' },
  { value: 'strong',   label: 'Strong' },
];

// Sort options
const SORT_OPTIONS = [
  { value: 'default',  label: 'Default order' },
  { value: 'weakest',  label: 'Weakest first' },
  { value: 'due',      label: 'Due first' },
  { value: 'strongest', label: 'Strongest first' },
];

let cards       = [];
let activeTier  = 'all';
let activeCat   = 'all';
let activeStatus = 'all';
let activeSort  = 'default';
let query       = '';

export function initBrowse(allCards) {
  cards = allCards;
  buildFilterTabs();
  buildStatusTabs();
  buildSortControl();
  buildCategoryPills();
  buildLegend();
  renderDeck();
  updateStats();

  document.getElementById('search').addEventListener('input', e => {
    query = e.target.value.toLowerCase();
    renderDeck();
    updateStats();
  });
}

/** Re-render the deck in place — called when progress updates so badges refresh. */
export function refreshBrowse() {
  renderDeck();
  updateStats();
}

export function navigateToCard(targetId) {
  activeTier   = 'all';
  activeCat    = 'all';
  activeStatus = 'all';
  query        = '';
  const searchEl = document.getElementById('search');
  if (searchEl) searchEl.value = '';
  buildFilterTabs();
  buildStatusTabs();
  buildCategoryPills();
  renderDeck();
  updateStats();

  requestAnimationFrame(() => {
    const el = document.getElementById(`card-${targetId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('link-target');
    void el.offsetWidth;
    el.classList.add('link-target');
    setTimeout(() => el.classList.remove('link-target'), 2600);
  });
}

/* ── Filter / sort controls ───────────────────────────────────────────── */

function buildFilterTabs() {
  const el = document.querySelector('.filters');
  el.innerHTML = FILTER_TABS.map(t => `
    <button class="filter-btn${t.value === activeTier ? ' active' : ''}" data-filter="${t.value}">
      ${t.label}${t.sub ? `<span class="filter-sub">${t.sub}</span>` : ''}
    </button>
  `).join('');
  el.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    activeTier = btn.dataset.filter;
    el.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderDeck();
    updateStats();
  });
}

function buildStatusTabs() {
  let statusEl = document.querySelector('.status-filters');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'status-filters';
    const slot = document.querySelector('.browse-row-filters');
    if (slot) slot.appendChild(statusEl);
  }
  statusEl.innerHTML = STATUS_TABS.map(t => `
    <button class="status-btn${t.value === activeStatus ? ' active' : ''}" data-status="${t.value}">
      ${t.label}
    </button>
  `).join('');
  statusEl.addEventListener('click', e => {
    const btn = e.target.closest('.status-btn');
    if (!btn) return;
    activeStatus = btn.dataset.status;
    statusEl.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderDeck();
    updateStats();
  });
}

function buildSortControl() {
  let sortEl = document.querySelector('.sort-control');
  if (!sortEl) {
    sortEl = document.createElement('div');
    sortEl.className = 'sort-control';
    const slot = document.getElementById('sort-control-slot');
    if (slot) slot.appendChild(sortEl);
  }
  sortEl.innerHTML = `
    <label class="sort-label">Sort
      <select class="sort-select" id="sort-select">
        ${SORT_OPTIONS.map(o => `
          <option value="${o.value}"${o.value === activeSort ? ' selected' : ''}>${o.label}</option>
        `).join('')}
      </select>
    </label>
  `;
  sortEl.querySelector('#sort-select').addEventListener('change', e => {
    activeSort = e.target.value;
    renderDeck();
    updateStats();
  });
}

function buildCategoryPills() {
  const cats = ['all', ...new Set(cards.map(c => c.category).filter(Boolean))].sort((a, b) =>
    a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b)
  );
  const el = document.getElementById('catFilter');
  el.innerHTML = cats.map(c => `
    <button class="cat-pill${c === activeCat ? ' active' : ''}" data-cat="${c}">${c}</button>
  `).join('');
  el.addEventListener('click', e => {
    const pill = e.target.closest('.cat-pill');
    if (!pill) return;
    activeCat = pill.dataset.cat;
    el.querySelectorAll('.cat-pill').forEach(p => p.classList.toggle('active', p === pill));
    renderDeck();
    updateStats();
  });
}

function buildLegend() {
  document.querySelector('.legend').innerHTML = `
    <span class="legend-item"><span class="legend-dot" style="background:var(--accent-leaf-pale)"></span>foundation</span>
    <span class="legend-item"><span class="legend-dot" style="background:var(--accent-leaf)"></span>primitive</span>
    <span class="legend-item"><span class="legend-dot" style="background:var(--accent-warm)"></span>pattern</span>
    <span class="legend-item"><span class="legend-dot" style="background:var(--accent-rose)"></span>technique</span>
  `;
}

/* ── Search & filter ──────────────────────────────────────────────────── */

const SEARCH_WEIGHTS = [
  { fields: ['id'],                                   weight: 8 },
  { fields: ['front', 'techniqueName'],               weight: 6 },
  { fields: ['technical', 'techniqueGist'],           weight: 4 },
  { fields: ['explanation', 'insight', 'mnemonic',
             'gotcha', 'metaphor', 'category'],       weight: 3 },
  { fields: ['hints'],                                weight: 2 },
  { fields: ['code', 'skeleton', 'example',
             'fullCode'],                             weight: 1 },
];

function searchScore(card, q) {
  let score = 0;
  for (const { fields, weight } of SEARCH_WEIGHTS) {
    for (const f of fields) {
      const v = card[f];
      if (!v) continue;
      const text = (Array.isArray(v) ? v.join(' ') : String(v)).toLowerCase();
      if (text.includes(q)) score += weight;
    }
  }
  return score;
}

/** Returns 0–4 familiarity level for a card: 0=unseen, 1=due/weak, 2=learning, 3=solid, 4=strong */
function familiarityLevel(id) {
  const prog = getCardProgress(id);
  if (!prog) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const due = prog.next_review && prog.next_review <= today;
  if (due) return 1;
  const ef   = prog.ease_factor  ?? 2.5;
  const reps = prog.repetitions  ?? 0;
  if (ef >= 2.8 && reps >= 3) return 4;  // strong
  if (ef >= 2.3 && reps >= 2) return 3;  // solid (requires 2+ successful reviews)
  return 2; // learning
}

function statusOf(id) {
  const prog = getCardProgress(id);
  if (!prog) return 'unseen';
  const today = new Date().toISOString().slice(0, 10);
  if (prog.next_review && prog.next_review <= today) return 'due';
  const ef   = prog.ease_factor  ?? 2.5;
  const reps = prog.repetitions  ?? 0;
  if (ef >= 2.8 && reps >= 3) return 'strong';
  if (ef >= 2.3 && reps >= 2) return 'steady';
  return 'learning';
}

function filtered() {
  const q = query.trim();
  const today = new Date().toISOString().slice(0, 10);

  let matched = cards.filter(c => {
    if (activeTier !== 'all' && c.tier !== activeTier) return false;
    if (activeCat  !== 'all' && c.category !== activeCat) return false;
    if (q && searchScore(c, q) === 0) return false;

    if (activeStatus !== 'all') {
      const s = statusOf(c.id);
      if (s !== activeStatus) return false;
    }
    return true;
  });

  // Search score sort takes precedence over other sorts when query is active
  if (q) {
    return matched
      .map((c, i) => [c, searchScore(c, q), i])
      .sort((a, b) => b[1] - a[1] || a[2] - b[2])
      .map(([c]) => c);
  }

  // Apply selected sort
  switch (activeSort) {
    case 'weakest':
      return matched.slice().sort((a, b) => familiarityLevel(a.id) - familiarityLevel(b.id));
    case 'strongest':
      return matched.slice().sort((a, b) => familiarityLevel(b.id) - familiarityLevel(a.id));
    case 'due': {
      return matched.slice().sort((a, b) => {
        const pa = getCardProgress(a.id);
        const pb = getCardProgress(b.id);
        const da = pa?.next_review ?? '9999';
        const db_ = pb?.next_review ?? '9999';
        return da.localeCompare(db_);
      });
    }
    default:
      return matched;
  }
}

function updateStats() {
  const vis   = filtered().length;
  const total = cards.length;
  const seenCount = cards.filter(c => getCardProgress(c.id)).length;

  document.getElementById('stats').innerHTML =
    vis === total
      ? `${total} cards · <span class="stats-seen">${seenCount} seen</span>`
      : `${vis} of ${total} · <span class="stats-seen">${seenCount} seen</span>`;
}

/* ── Familiarity badge ────────────────────────────────────────────────── */

function renderFamiliarityBadge(id) {
  const prog = getCardProgress(id);
  if (!prog) return '<span class="fam-badge fam-unseen">new</span>';

  const today = new Date().toISOString().slice(0, 10);
  const due   = prog.next_review && prog.next_review <= today;
  if (due) return '<span class="fam-badge fam-due">due</span>';

  const ef   = prog.ease_factor  ?? 2.5;
  const reps = prog.repetitions  ?? 0;
  if (ef >= 2.8 && reps >= 3) return '<span class="fam-badge fam-strong">strong</span>';
  if (ef >= 2.3 && reps >= 2) return '<span class="fam-badge fam-steady">steady</span>';
  return '<span class="fam-badge fam-learning">learning</span>';
}

/* ── Deck render ──────────────────────────────────────────────────────── */

function renderDeck() {
  const deck = document.getElementById('deck');
  const list = filtered();

  if (!list.length) {
    deck.innerHTML = '<div class="empty-state">No cards match.</div>';
    return;
  }

  deck.innerHTML = list.map(c => `
    <div class="card tier-${c.tier ?? ''}" id="card-${c.id}">
      <div class="card-tier-strip"></div>
      ${renderCardMeta(c, renderFamiliarityBadge(c.id))}
      ${renderCardFrontContent(c)}
      <button class="reveal-btn">Reveal</button>
      <div class="card-back hidden">${renderCardBack(c)}</div>
    </div>
  `).join('');

  deck.querySelectorAll('.card').forEach(el => {
    attachCardHandlers(el);
  });
}
