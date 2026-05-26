/* progress.js — per-category mastery view with expandable card-level drill-down.
   Renders into #progress-container when the Progress mode tab is active. */

import { apiGetMastery, apiGetCardHistory } from './api.js';
import { isLoggedIn, getProgress, getCardProgress } from './store.js';
import { showCardPreview } from './cardPreview.js';

/* Human-readable names for category codes */
const CAT_NAMES = {
  ARR:  'Arrays',
  STR:  'Strings',
  LOOP: 'Loops',
  HASH: 'Hash Maps',
  LL:   'Linked Lists',
  TREE: 'Trees',
  GRPH: 'Graphs',
  BFS:  'BFS',
  DFS:  'DFS',
  STK:  'Stacks',
  Q:    'Queues',
  HEAP: 'Heaps',
  REC:  'Recursion',
  DP:   'Dynamic Programming',
  BS:   'Binary Search',
  WIN:  'Sliding Window',
  PTR:  'Two Pointers',
  SRT:  'Sorting',
  MRG:  'Merge',
  BT:   'Backtracking',
  BLD:  'Build / Construct',
  NEST: 'Nested / Compound',
  NUM:  'Numbers',
  MATH: 'Math',
  BOOL: 'Boolean Logic',
  VAR:  'Variables',
  FN:   'Functions',
  ERR:  'Errors',
  EQ:   'Equality',
  LIN:  'Linear Search',
  SET:  'Sets',
  PY:   'Python',
  DIR:  'Direction / Orientation',
  BIG:  'Big-O',
};

let allCards = [];

export function initProgress(cards) {
  allCards = cards;
  render();
}

async function render() {
  const el = document.getElementById('progress-container');
  if (!el) return;

  if (!isLoggedIn()) {
    el.innerHTML = `
      <div class="progress-gate">
        <div class="progress-gate-icon">◈</div>
        <h2>Progress tracking</h2>
        <p>Log in to track your progress across sessions and see which
           concept areas need more work.</p>
        <p class="progress-gate-sub">Your cards, intervals, and mastery data
           are stored on the server and follow you across devices.</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `<div class="progress-loading">Loading…</div>`;

  const [mastery, history] = await Promise.all([apiGetMastery(), apiGetCardHistory()]);
  if (!mastery) {
    el.innerHTML = `<div class="progress-loading">Couldn't load progress data.</div>`;
    return;
  }

  // Build per-category totals from the card catalogue
  const catTotals = {};
  const catCards  = {};
  for (const card of allCards) {
    const cat = card.category ?? 'OTHER';
    catTotals[cat] = (catTotals[cat] ?? 0) + 1;
    (catCards[cat] ??= []).push(card);
  }

  // Overall numbers
  const localProg  = getProgress();
  const totalCards = allCards.length;
  const totalSeen  = Object.keys(localProg).length;
  const today      = new Date().toISOString().slice(0, 10);
  const totalDue   = Object.values(localProg)
    .filter(p => p.next_review && p.next_review <= today).length;

  // Merge server mastery data with catalogue totals
  const rows = Object.entries(catTotals).map(([cat, total]) => {
    const s = mastery[cat];
    return {
      cat,
      name:     CAT_NAMES[cat] ?? cat,
      total,
      cards:    catCards[cat] ?? [],
      seen:     s?.seen     ?? 0,
      meanEase: s?.mean_ease ?? 0,
      reps:     s?.total_reps ?? 0,
      due:      s?.due       ?? 0,
    };
  }).sort((a, b) => {
    const unseenA = a.total - a.seen;
    const unseenB = b.total - b.seen;
    return unseenB - unseenA || a.name.localeCompare(b.name);
  });

  el.innerHTML = `
    <div class="progress-header">
      <div class="progress-stat">
        <span class="progress-stat-num">${totalSeen}</span>
        <span class="progress-stat-label">cards seen</span>
      </div>
      <div class="progress-stat">
        <span class="progress-stat-num">${totalCards - totalSeen}</span>
        <span class="progress-stat-label">not yet seen</span>
      </div>
      <div class="progress-stat progress-stat-due">
        <span class="progress-stat-num">${totalDue}</span>
        <span class="progress-stat-label">due today</span>
      </div>
    </div>

    <div class="progress-table-wrap">
      <table class="progress-table">
        <thead>
          <tr>
            <th></th>
            <th>Category</th>
            <th class="progress-th-num">Seen</th>
            <th class="progress-th-num">Due</th>
            <th class="progress-th-bar">Progress</th>
            <th class="progress-th-num">Avg ease</th>
          </tr>
        </thead>
        <tbody id="progress-tbody">
          ${rows.map(r => rowHTML(r, history)).join('')}
        </tbody>
      </table>
    </div>

    <p class="progress-footnote">
      Avg ease ≥ 2.5 is solid. Below 1.8 means a concept needs more reps.
      Cards reset to interval 1 when you answer "No".
    </p>
  `;

  // Wire expand — clicking anywhere on a category row opens/closes it
  el.querySelector('#progress-tbody')?.addEventListener('click', e => {
    // Ignore clicks inside the already-open expand row
    if (e.target.closest('.progress-expand-row')) return;
    const row = e.target.closest('.progress-row[data-cat]');
    if (!row) return;

    const cat       = row.dataset.cat;
    const btn       = row.querySelector('.progress-expand-btn');
    const expandRow = el.querySelector(`.progress-expand-row[data-cat="${cat}"]`);
    if (!expandRow || !btn) return;

    const isOpen = !expandRow.classList.contains('hidden');
    expandRow.classList.toggle('hidden', isOpen);
    btn.textContent = isOpen ? '▶' : '▼';
    btn.setAttribute('aria-expanded', String(!isOpen));
  });

  // Wire card preview from progress card items
  el.addEventListener('click', e => {
    const btn = e.target.closest('.progress-card-preview-btn');
    if (btn?.dataset.cardId) showCardPreview(btn.dataset.cardId);
  });
}

function rowHTML(r, history) {
  const pct       = r.total > 0 ? Math.round((r.seen / r.total) * 100) : 0;
  const easeStr   = r.seen > 0 ? r.meanEase.toFixed(2) : '—';
  const easeClass = r.seen === 0 ? '' : r.meanEase >= 2.5 ? 'ease-good' : r.meanEase >= 1.8 ? 'ease-ok' : 'ease-low';
  const dueStr    = r.due > 0 ? `<span class="due-badge">${r.due}</span>` : '—';

  return `
    <tr class="progress-row${r.seen === 0 ? ' progress-row-unseen' : ''}" data-cat="${r.cat}">
      <td class="progress-expand-cell">
        <button class="progress-expand-btn" data-cat="${r.cat}"
          aria-label="Expand ${r.name}" aria-expanded="false">▶</button>
      </td>
      <td class="progress-cat">
        <span class="progress-cat-name">${r.name}</span>
        <span class="progress-cat-code">${r.cat}</span>
      </td>
      <td class="progress-td-num">${r.seen} / ${r.total}</td>
      <td class="progress-td-num">${dueStr}</td>
      <td class="progress-td-bar">
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="progress-bar-pct">${pct}%</span>
      </td>
      <td class="progress-td-num ${easeClass}">${easeStr}</td>
    </tr>
    <tr class="progress-expand-row hidden" data-cat="${r.cat}">
      <td colspan="6" class="progress-expand-td">
        ${cardListHTML(r.cards, history)}
      </td>
    </tr>
  `;
}

function cardListHTML(cards, history) {
  if (!cards.length) return '<p class="progress-no-cards">No cards in this category.</p>';

  // Sort: seen cards first (by last reviewed desc), then unseen
  const sorted = [...cards].sort((a, b) => {
    const pa = getCardProgress(a.id);
    const pb = getCardProgress(b.id);
    if (pa && !pb) return -1;
    if (!pa && pb) return 1;
    if (pa && pb) {
      const da = pa.last_reviewed ?? '';
      const db = pb.last_reviewed ?? '';
      return db.localeCompare(da);
    }
    return 0;
  });

  return `
    <div class="progress-card-list">
      <div class="progress-card-header">
        <span>Status</span>
        <span>Card</span>
        <span class="pch-right">Reviews</span>
        <span class="pch-right">Ease</span>
        <span class="pch-right">Next</span>
      </div>
      ${sorted.map(c => cardItemHTML(c, history)).join('')}
    </div>
  `;
}

function cardItemHTML(card, history) {
  const prog  = getCardProgress(card.id);
  const hist  = history?.[card.id];
  const badge = famBadgeHTML(prog);

  const count = hist?.count != null ? `${hist.count}×` : '—';
  const ef    = prog?.ease_factor != null ? prog.ease_factor.toFixed(1) : '—';
  const next  = prog?.next_review
    ? relativeDate(prog.next_review + 'T00:00:00Z')
    : '—';

  return `
    <div class="progress-card-item${!prog ? ' progress-card-unseen' : ''}">
      ${badge}
      <button class="progress-card-preview-btn progress-card-front"
        data-card-id="${escHtml(card.id)}"
        title="Preview card: ${escHtml(card.front)}">
        ${escHtml(truncate(card.front, 55))}
      </button>
      <span class="progress-card-col">${count}</span>
      <span class="progress-card-col">${ef}</span>
      <span class="progress-card-col">${next}</span>
    </div>
  `;
}

function famBadgeHTML(prog) {
  if (!prog) return '<span class="fam-badge fam-unseen">new</span>';
  const today = new Date().toISOString().slice(0, 10);
  if (prog.next_review && prog.next_review <= today)
    return '<span class="fam-badge fam-due">due</span>';
  const ef   = prog.ease_factor  ?? 2.5;
  const reps = prog.repetitions  ?? 0;
  if (ef >= 2.8 && reps >= 3) return '<span class="fam-badge fam-strong">strong</span>';
  if (ef >= 2.3 && reps >= 2) return '<span class="fam-badge fam-steady">steady</span>';
  return '<span class="fam-badge fam-learning">learning</span>';
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, n) {
  return s?.length > n ? s.slice(0, n) + '…' : (s ?? '');
}

/** Returns a human-readable relative date, e.g. "3 days ago". */
function relativeDate(isoString) {
  if (!isoString) return null;
  const ms   = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}
