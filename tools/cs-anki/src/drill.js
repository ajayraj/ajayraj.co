/* drill.js — self-graded flashcard drill with SM-2 spaced repetition.
   Flow: front → user writes → reveal → compare → rate → next card.
   Text matching is deliberately removed: the user is the grader. */

import { renderCardMeta, renderCardFrontContent, renderCardBack, attachCardHandlers } from './render.js';
import { getCardProgress, saveCardProgress, computeNext, isLoggedIn, isDue, isUnseen, addDailyNewDrilled } from './store.js';
import { apiGetSession, apiSubmitReview } from './api.js';
import { TIER_META, shuffle, renderTierTabs } from './util.js';

const NEW_BUDGET     = 10;
const MAX_REVIEWS    = 20;
const SESSION_SIZE   = NEW_BUDGET + MAX_REVIEWS;

let allCards      = [];
let queue         = [];
let idx           = 0;
let tally         = { got_it: 0, almost: 0, no: 0 };
let tierFilter    = 'all';
let sessionType   = 'review'; // 'review' | 'new'
let newCardsInSession = 0;    // count of unseen cards added to queue this session

// Server session data (populated on start when logged in)
let serverSession = null;

export function initDrill(cards) {
  allCards = cards;
  renderSetup();
}

/* ── Setup ────────────────────────────────────────────────────────────── */

function renderSetup() {
  const el = document.getElementById('drill-container');
  const tierBtns = [
    { value: 'all', label: 'All tiers', sub: null },
    ...Object.entries(TIER_META).map(([v, m]) => ({ value: v, label: m.label, sub: m.sub })),
  ];

  el.innerHTML = `
    <div class="drill-setup">
      <h2>Drill</h2>
      <p>Write your answer, reveal the card, then rate yourself.
         Cards you review more often will reappear sooner; ones you know well come back later.</p>

      <div class="drill-filters">
        ${renderTierTabs(tierBtns, tierFilter, 'drill-filter-btn')}
      </div>

      <div class="queue-summary" id="drill-queue-summary">
        <span class="queue-loading">Loading queue…</span>
      </div>

      <div class="drill-start-row">
        <button class="drill-session-btn" id="drill-btn-review" disabled>
          <span class="drill-btn-label">Today's cards</span>
          <span class="drill-btn-count" id="drill-review-count">—</span>
        </button>
        <button class="drill-session-btn" id="drill-btn-new" disabled>
          <span class="drill-btn-label">New cards</span>
          <span class="drill-btn-count" id="drill-new-count">—</span>
        </button>
      </div>
    </div>
  `;

  el.querySelector('.drill-filters').addEventListener('click', e => {
    const btn = e.target.closest('.drill-filter-btn');
    if (!btn) return;
    tierFilter = btn.dataset.value;
    el.querySelectorAll('.drill-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    updateQueueSummary();
  });

  el.querySelector('#drill-btn-review').addEventListener('click', () => startSession('review'));
  el.querySelector('#drill-btn-new').addEventListener('click',    () => startSession('new'));

  updateQueueSummary();
}

function candidateCards() {
  return allCards.filter(c => tierFilter === 'all' || c.tier === tierFilter);
}

async function updateQueueSummary() {
  const pool = candidateCards();
  let reviewCount, newCount;

  if (isLoggedIn()) {
    serverSession = await apiGetSession();
    if (serverSession) {
      const seenSet = new Set(serverSession.seen_card_ids);
      const poolIds = new Set(pool.map(c => c.id));
      reviewCount = serverSession.review_card_ids.filter(id => poolIds.has(id)).length;
      newCount    = pool.filter(c => !seenSet.has(c.id)).length;
    } else {
      reviewCount = 0;
      newCount = pool.length;
    }
  } else {
    reviewCount = pool.filter(c => isDue(c.id)).length;
    newCount    = pool.filter(c => isUnseen(c.id)).length;
  }

  // How many of today's new-card budget remain (server-tracked for accuracy)
  const newDrilledToday = serverSession?.new_drilled_today ?? 0;
  const budgetRemaining = Math.max(0, NEW_BUDGET - newDrilledToday);
  const cappedNew       = Math.min(newCount, budgetRemaining);
  const total           = Math.min(reviewCount + cappedNew, SESSION_SIZE);

  // Summary text
  const summaryEl = document.getElementById('drill-queue-summary');
  if (summaryEl) {
    summaryEl.innerHTML =
      `<strong>${total}</strong> cards ready — ` +
      `<span class="queue-reviews">${reviewCount} due for review</span>, ` +
      `<span class="queue-new">${newDrilledToday}/${NEW_BUDGET} new today</span>` +
      (!isLoggedIn() ? ' <span class="queue-offline">(local)</span>' : '');
  }

  // Update button counts + enabled state
  const reviewBtn      = document.getElementById('drill-btn-review');
  const newBtn         = document.getElementById('drill-btn-new');
  const reviewCount_el = document.getElementById('drill-review-count');
  const newCount_el    = document.getElementById('drill-new-count');
  if (reviewCount_el) {
    reviewCount_el.textContent = `${reviewCount} due`;
    reviewCount_el.classList.remove('drill-done-count');
  }
  if (newCount_el) newCount_el.textContent = `${cappedNew} cards`;
  // Review button: always enabled — clicking with 0 due re-drills today's completed cards
  if (reviewBtn) reviewBtn.disabled = false;
  if (newBtn)    newBtn.disabled    = cappedNew === 0;
}

/* ── Session ──────────────────────────────────────────────────────────── */

async function startSession(type = 'review') {
  sessionType      = type;
  newCardsInSession = 0;
  const pool = candidateCards();
  queue = [];
  idx   = 0;
  tally = { got_it: 0, almost: 0, no: 0 };

  const today = new Date().toISOString().slice(0, 10);

  if (isLoggedIn() && serverSession) {
    const seenSet = new Set(serverSession.seen_card_ids);
    const poolIds = new Set(pool.map(c => c.id));
    const budget  = serverSession.new_budget ?? NEW_BUDGET;

    if (type === 'review') {
      const dueCards = serverSession.review_card_ids
        .filter(id => poolIds.has(id))
        .map(id => pool.find(c => c.id === id))
        .filter(Boolean);

      if (dueCards.length > 0) {
        queue = dueCards;
      } else {
        // Nothing due — re-drill cards reviewed today in shuffled order
        queue = shuffle(pool.filter(c => {
          const p = getCardProgress(c.id);
          return p?.last_reviewed?.startsWith(today);
        }));
      }
    } else {
      const newCards = shuffle(pool.filter(c => !seenSet.has(c.id))).slice(0, budget);
      newCardsInSession = newCards.length;
      queue = newCards;
    }
  } else {
    // Offline/local path
    if (type === 'review') {
      const dueCards = pool
        .filter(c => isDue(c.id))
        .sort((a, b) => {
          const da = getCardProgress(a.id)?.next_review ?? '';
          const db = getCardProgress(b.id)?.next_review ?? '';
          return da.localeCompare(db);
        });

      if (dueCards.length > 0) {
        queue = dueCards;
      } else {
        // Re-drill today's completed reviews
        queue = shuffle(pool.filter(c => {
          const p = getCardProgress(c.id);
          return p?.last_reviewed?.startsWith(today);
        }));
      }
    } else {
      const newCards = shuffle(pool.filter(c => isUnseen(c.id))).slice(0, NEW_BUDGET);
      newCardsInSession = newCards.length;
      queue = newCards;
    }
  }

  if (!queue.length) return;
  renderCard();
}

/* ── Card ─────────────────────────────────────────────────────────────── */

function renderCard() {
  if (idx >= queue.length) { renderDone(); return; }

  const card = queue[idx];
  const el   = document.getElementById('drill-container');
  const pct  = Math.round((idx / queue.length) * 100);

  el.innerHTML = `
    <div class="drill-progress">
      <div class="drill-progress-bar">
        <div class="drill-progress-fill" style="width:${pct}%"></div>
      </div>
      <span class="drill-progress-label">${idx + 1} / ${queue.length}</span>
    </div>

    <div class="card tier-${card.tier ?? ''}">
      <div class="card-tier-strip"></div>
      ${renderCardMeta(card)}
      ${renderCardFrontContent(card)}

      <textarea class="drill-answer-input" id="drill-textarea"
        placeholder="Write your answer before revealing…" rows="4"></textarea>

      <button class="reveal-btn" id="drill-reveal">Reveal answer</button>

      <div class="card-back hidden" id="drill-back">
        <div id="drill-your-answer"></div>
        ${renderCardBack(card)}
        <div class="rating-row">
          <button class="rating-btn no"     data-rating="no">✗ No</button>
          <button class="rating-btn almost" data-rating="almost">~ Almost</button>
          <button class="rating-btn got-it" data-rating="got_it">✓ Got it</button>
        </div>
      </div>
    </div>
  `;

  attachCardHandlers(el.querySelector('.card'));

  // Focus textarea for keyboard-first flow
  requestAnimationFrame(() => {
    document.getElementById('drill-textarea')?.focus();
  });

  document.getElementById('drill-reveal').addEventListener('click', function () {
    const userText = document.getElementById('drill-textarea')?.value?.trim() ?? '';
    const back     = document.getElementById('drill-back');
    back.classList.remove('hidden');
    this.style.display = 'none';

    // Show the user's answer above the card back for comparison
    const yourEl = document.getElementById('drill-your-answer');
    if (userText) {
      yourEl.innerHTML = `
        <div class="drill-your-block">
          <div class="back-label">Your answer</div>
          <div class="drill-user-answer">${escHtml(userText)}</div>
        </div>
      `;
    }
  });

  el.querySelector('.rating-row').addEventListener('click', async e => {
    const btn = e.target.closest('.rating-btn');
    if (!btn) return;
    const rating = btn.dataset.rating;

    // Update local cache immediately (no flash on next card)
    const next = computeNext({ ...getCardProgress(card.id), card_id: card.id }, rating);
    saveCardProgress(card.id, next);
    tally[rating]++;

    // Sync to server (fire-and-forget — don't block the study flow)
    if (isLoggedIn()) {
      apiSubmitReview(card.id, rating, 'drill').catch(() => {/* silently ignore */});
    }

    idx++;
    renderCard();
  });
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Done ─────────────────────────────────────────────────────────────── */

function renderDone() {
  const el  = document.getElementById('drill-container');
  const tot = queue.length;
  const pct = tot > 0 ? Math.round((tally.got_it / tot) * 100) : 0;

  // Track new cards drilled today so the daily banner stays accurate
  if (newCardsInSession > 0) {
    addDailyNewDrilled(newCardsInSession);
  }

  // Notify main.js to refresh the daily banner
  document.dispatchEvent(new CustomEvent('drill:session-complete', {
    detail: { newCards: newCardsInSession, type: sessionType },
  }));

  el.innerHTML = `
    <div class="drill-done">
      <h2>Session complete</h2>
      <p style="color:var(--ink-faint);font-size:13px;margin-bottom:4px">${tot} cards reviewed</p>

      <div class="drill-score-row">
        <div class="drill-score-item">
          <div class="drill-score-num good">${tally.got_it}</div>
          <div class="drill-score-label">Got it</div>
        </div>
        <div class="drill-score-item">
          <div class="drill-score-num ok">${tally.almost}</div>
          <div class="drill-score-label">Almost</div>
        </div>
        <div class="drill-score-item">
          <div class="drill-score-num bad">${tally.no}</div>
          <div class="drill-score-label">No</div>
        </div>
      </div>

      ${tot > 0 ? `<p class="drill-done-pct">${pct}% got it</p>` : ''}

      <button class="start-btn" id="drill-again">Drill again</button>
      <br>
      <button class="start-btn" id="drill-setup-btn"
        style="margin-top:12px;background:var(--soft);color:var(--ink)">Back to setup</button>
    </div>
  `;

  document.getElementById('drill-again').addEventListener('click', () => startSession(sessionType));
  document.getElementById('drill-setup-btn').addEventListener('click', renderSetup);
}
