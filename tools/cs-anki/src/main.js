import './style.css';
import { getTheme, saveTheme, getMode, saveMode, isOnboarded, isLoggedIn, setServerProgress } from './store.js';
import { initCardPreview, showCardPreview } from './cardPreview.js';
import { initBrowse, navigateToCard, refreshBrowse } from './browse.js';
import { initCardLookup } from './render.js';
import { initDrill }     from './drill.js';
import { initQuiz }      from './quiz.js';
import { initWorkspace } from './workspace.js';
import { initProgress }  from './progress.js';
import { showOnboarding } from './onboarding.js';
import { initAuth, setAuthState } from './auth.js';
import { apiMe, apiGetProgress, apiGetSession } from './api.js';

let allCards    = [];
let currentMode = 'browse';

async function boot() {
  document.documentElement.dataset.theme = getTheme();
  updateThemeBtn();

  const data = await fetch('./cards.json').then(r => r.json());
  allCards = (data.cards ?? []).filter(c => c.id);
  initCardLookup(allCards);

  // Check auth status, then fetch progress if logged in.
  // Both happen before we render anything so the queue is accurate.
  const user = await apiMe();
  setAuthState(user);

  if (user) {
    const [prog, session] = await Promise.all([apiGetProgress(), apiGetSession()]);
    if (prog) setServerProgress(prog);
    renderDailyBanner(session, allCards);
  }

  initAuth(
    /* onLogin */  async (u) => {
      const [prog, session] = await Promise.all([apiGetProgress(), apiGetSession()]);
      if (prog) setServerProgress(prog);
      renderDailyBanner(session, allCards);
      refreshBrowse(); // update familiarity badges now that progress is loaded
      if (currentMode === 'drill')    initDrill(allCards);
      if (currentMode === 'progress') initProgress(allCards);
    },
    /* onLogout */ () => {
      setServerProgress(null);
      renderDailyBanner(null, allCards);
      refreshBrowse();
      if (currentMode === 'drill')    initDrill(allCards);
      if (currentMode === 'progress') initProgress(allCards);
    }
  );

  initCardPreview(allCards);
  initBrowse(allCards);
  wireModNav();
  wireThemeBtn();
  wireCardLinks();
  wireScrollToTop();
  wireDrillSessionComplete();

  const saved = getMode();
  if (saved && saved !== 'browse') switchMode(saved);

  if (!isOnboarded()) showOnboarding();
}

/* ── Mode nav ─────────────────────────────────────────────────────────── */

function wireModNav() {
  document.querySelector('.mode-nav').addEventListener('click', e => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === currentMode) return;
    switchMode(mode);
  });
}

function switchMode(mode) {
  currentMode = mode;
  saveMode(mode);
  document.querySelectorAll('.mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode)
  );
  document.getElementById('view-browse').classList.toggle('hidden',    mode !== 'browse');
  document.getElementById('view-drill').classList.toggle('hidden',     mode !== 'drill');
  document.getElementById('view-quiz').classList.toggle('hidden',      mode !== 'quiz');
  document.getElementById('view-workspace').classList.toggle('hidden', mode !== 'workspace');
  document.getElementById('view-progress').classList.toggle('hidden',  mode !== 'progress');

  if (mode === 'drill')     initDrill(allCards);
  if (mode === 'quiz')      initQuiz(allCards);
  if (mode === 'workspace') initWorkspace(allCards);
  if (mode === 'progress')  initProgress(allCards);
}

/* ── Card cross-reference links → preview popup ───────────────────────── */

function wireCardLinks() {
  document.addEventListener('click', e => {
    const link = e.target.closest('a.card-link');
    if (!link) return;
    e.preventDefault();
    showCardPreview(link.dataset.id);
  });
}

/* ── Theme ────────────────────────────────────────────────────────────── */

function wireThemeBtn() {
  document.getElementById('theme-btn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    saveTheme(next);
    updateThemeBtn();
  });
}

function updateThemeBtn() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  btn.textContent = dark ? '☀︎' : '☽';
  btn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
}

/* ── Scroll to top ────────────────────────────────────────────────────── */

function wireScrollToTop() {
  const btn = document.getElementById('scroll-to-top');
  if (!btn) return;

  const update = () => btn.classList.toggle('visible', window.scrollY > 320);
  update();
  window.addEventListener('scroll', update, { passive: true });
  btn.addEventListener('click', animatedScrollToTop);
}

function animatedScrollToTop() {
  const start = window.scrollY;
  if (start === 0) return;
  const duration = Math.min(1400, Math.max(450, start / 4));
  const startTime = performance.now();
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  let cancelled = false;
  const cancel = () => { cancelled = true; };
  window.addEventListener('wheel',      cancel, { once: true, passive: true });
  window.addEventListener('touchstart', cancel, { once: true, passive: true });

  function step(now) {
    if (cancelled) return;
    const t = Math.min((now - startTime) / duration, 1);
    window.scrollTo(0, Math.round(start * (1 - easeOutCubic(t))));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── Drill session-complete → refresh banner ──────────────────────────── */

function wireDrillSessionComplete() {
  document.addEventListener('drill:session-complete', async () => {
    if (!isLoggedIn()) return;
    // Brief pause so any in-flight apiSubmitReview calls finish writing to
    // the DB before we re-query the session — avoids a race condition.
    await new Promise(r => setTimeout(r, 700));
    const session = await apiGetSession();
    renderDailyBanner(session, allCards);
  });
}

/* ── Daily session banner ─────────────────────────────────────────────── */

/**
 * Renders the compact "Daily Session" strip above the mode tabs.
 * session: { review_card_ids, seen_card_ids, new_budget } | null
 *
 * New-card count is computed from today's local drill count (getDailyNewDrilled)
 * so the banner decrements correctly as the user drills rather than always
 * showing the full budget.
 */
function renderDailyBanner(session, cards) {
  const el = document.getElementById('daily-banner');
  if (!el) return;

  if (!session) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }

  const reviewCount     = session.review_card_ids?.length ?? 0;
  const seenCount       = session.seen_card_ids?.length ?? 0;
  const newBudget       = session.new_budget ?? 10;
  const newDrilledToday = session.new_drilled_today ?? 0;
  const newCount        = Math.max(0, newBudget - newDrilledToday);
  // "done" = no reviews due AND today's new-card budget is used up.
  // Brand-new users have reviewCount=0 too, but newCount=10, so isDone stays false.
  const isDone          = reviewCount === 0 && newCount === 0;

  if (isDone) {
    el.className = 'daily-banner daily-banner-done';
    el.innerHTML = `
      <div class="daily-inner daily-done">
        <span class="daily-label">Daily Session</span>
        <span class="daily-done-text">✓ All caught up</span>
      </div>
    `;
  } else {
    el.className = 'daily-banner';
    el.innerHTML = `
      <div class="daily-inner">
        <span class="daily-label">Daily Session</span>
        <div class="daily-counts">
          ${reviewCount > 0 ? `<span class="daily-chip daily-chip-review">${reviewCount} due</span>` : ''}
          ${newCount    > 0 ? `<span class="daily-chip daily-chip-new">${newCount} new</span>` : ''}
        </div>
        <button class="daily-start" id="daily-start-btn">Start →</button>
      </div>
    `;
    document.getElementById('daily-start-btn')?.addEventListener('click', () => {
      switchMode('drill');
    });
  }

  el.classList.remove('hidden');
}

boot();
