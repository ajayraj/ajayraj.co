import { TIER_LABELS, escHtml, renderCardMeta, renderCardFrontContent, renderCardBack, attachCardHandlers } from './render.js';
import { getRevealed, saveRevealed } from './store.js';
import { TIER_META } from './util.js';

const FILTER_TABS = [
  { value: 'all', label: 'All', sub: null },
  ...Object.entries(TIER_META).map(([v, m]) => ({ value: v, label: m.label, sub: m.sub })),
];

let cards = [];
let activeTier  = 'all';
let activeCat   = 'all';
let query       = '';
const _revealed = getRevealed();

export function initBrowse(allCards) {
  cards = allCards;
  buildFilterTabs();
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

/* Navigate to a card by ID — resets all filters if needed, then glows the card. */
export function navigateToCard(targetId) {
  // Reset any active filters so the target card is guaranteed to be in the DOM
  activeTier = 'all';
  activeCat  = 'all';
  query      = '';
  const searchEl = document.getElementById('search');
  if (searchEl) searchEl.value = '';
  buildFilterTabs();
  buildCategoryPills();
  renderDeck();
  updateStats();

  requestAnimationFrame(() => {
    const el = document.getElementById(`card-${targetId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('link-target');       // reset if already glowing
    void el.offsetWidth;                      // force reflow to restart animation
    el.classList.add('link-target');
    setTimeout(() => el.classList.remove('link-target'), 2600);
  });
}

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

/* Weights for relevance ranking. ID and front are highest signal, prose
   fields are middle, code/example lowest. Anything not listed isn't searched. */
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

function filtered() {
  const q = query.trim();
  const matched = cards.filter(c => {
    if (activeTier !== 'all' && c.tier !== activeTier) return false;
    if (activeCat  !== 'all' && c.category !== activeCat) return false;
    if (q && searchScore(c, q) === 0) return false;
    return true;
  });
  if (!q) return matched;
  /* Stable sort by score descending; ties keep card-deck order. */
  return matched
    .map((c, i) => [c, searchScore(c, q), i])
    .sort((a, b) => b[1] - a[1] || a[2] - b[2])
    .map(([c]) => c);
}

function updateStats() {
  const vis = filtered().length;
  document.getElementById('stats').textContent =
    vis === cards.length ? `${cards.length} cards` : `${vis} of ${cards.length} cards`;
}

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
      ${renderCardMeta(c)}
      ${renderCardFrontContent(c)}
      <button class="reveal-btn">Reveal</button>
      <div class="card-back hidden">${renderCardBack(c)}</div>
    </div>
  `).join('');

  deck.querySelectorAll('.card').forEach(el => {
    attachCardHandlers(el);
    const cardId = el.id.replace('card-', '');
    const revealBtn = el.querySelector('.reveal-btn');
    const back      = el.querySelector('.card-back');
    // Restore open state
    if (_revealed.has(cardId) && back && revealBtn) {
      back.classList.remove('hidden');
      revealBtn.textContent = 'Hide';
    }
    // Track future opens/closes via the reveal button
    revealBtn?.addEventListener('click', () => {
      if (back?.classList.contains('hidden')) {
        _revealed.delete(cardId);
      } else {
        _revealed.add(cardId);
      }
      saveRevealed(_revealed);
    });
  });
}
