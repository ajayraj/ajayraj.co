import './style.css';
import { getTheme, saveTheme, getMode, saveMode, isOnboarded } from './store.js';
import { initBrowse, navigateToCard } from './browse.js';
import { initCardLookup } from './render.js';
import { initDrill }     from './drill.js';
import { initQuiz }      from './quiz.js';
import { initWorkspace } from './workspace.js';
import { showOnboarding } from './onboarding.js';

let allCards    = [];
let currentMode = 'browse';

async function boot() {
  document.documentElement.dataset.theme = getTheme();
  updateThemeBtn();

  const data = await fetch('./cards.json').then(r => r.json());
  allCards = (data.cards ?? []).filter(c => c.id);
  initCardLookup(allCards);

  initBrowse(allCards);
  wireModNav();
  wireThemeBtn();
  wireCardLinks();
  wireScrollToTop();

  /* Restore last mode (skip if it would re-init and lose unsaved drill state) */
  const saved = getMode();
  if (saved && saved !== 'browse') switchMode(saved);

  if (!isOnboarded()) showOnboarding();
}

/* ── Mode nav ── */
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

  if (mode === 'drill')     initDrill(allCards);
  if (mode === 'quiz')      initQuiz(allCards);
  if (mode === 'workspace') initWorkspace(allCards);
}

/* ── Card cross-reference links ── */
function wireCardLinks() {
  document.addEventListener('click', e => {
    const link = e.target.closest('a.card-link');
    if (!link) return;
    e.preventDefault();

    const targetId = link.dataset.id;
    if (currentMode !== 'browse') {
      switchMode('browse');
      // Give the browse view one frame to be visible before scrolling
      requestAnimationFrame(() => navigateToCard(targetId));
    } else {
      navigateToCard(targetId);
    }
  });
}

/* ── Theme toggle ── */
function wireThemeBtn() {
  document.getElementById('theme-btn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    saveTheme(next);
    updateThemeBtn();
  });
}

/* ── Scroll-to-top ──
   Custom rAF-driven scroll so the duration is tunable (native smooth scroll
   speed varies by browser and feels jumpy from deep in the deck). Eases out
   over ~900ms with a cubic curve. */
function wireScrollToTop() {
  const btn = document.getElementById('scroll-to-top');
  if (!btn) return;

  const update = () => {
    btn.classList.toggle('visible', window.scrollY > 320);
  };
  update();
  window.addEventListener('scroll', update, { passive: true });

  btn.addEventListener('click', () => animatedScrollToTop());
}

function animatedScrollToTop() {
  const start = window.scrollY;
  if (start === 0) return;

  /* Slow down for shorter trips so it doesn't feel snappy on already-near-top
     and doesn't drag forever from the bottom of a 1000-card deck. */
  const duration = Math.min(1400, Math.max(450, start / 4));
  const startTime = performance.now();
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  let cancelled = false;
  const cancel = () => { cancelled = true; };
  /* User-initiated scroll cancels the animation — feels right when they
     change their mind mid-glide. */
  window.addEventListener('wheel',     cancel, { once: true, passive: true });
  window.addEventListener('touchstart', cancel, { once: true, passive: true });

  function step(now) {
    if (cancelled) return;
    const t = Math.min((now - startTime) / duration, 1);
    window.scrollTo(0, Math.round(start * (1 - easeOutCubic(t))));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateThemeBtn() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  btn.textContent = dark ? '☀︎' : '☽';
  btn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
}

boot();
