/* quiz.js — multiple-choice quiz with same-concept-family distractors.
   Each option shows the technique name + its gist, so "Backtracking" and
   "Recursive tree traversal" are distinguishable and the user can learn the
   distinction rather than just guessing. */

import { escHtml, renderCardMeta } from './render.js';
import { shuffle } from './util.js';
import { getCardProgress, saveCardProgress, computeNext, isLoggedIn } from './store.js';
import { apiSubmitReview } from './api.js';

const SESSION_SIZE = 10;

let allCards = [];
let quizMode = null;   // 'differential' | 'primitive'
let queue    = [];
let idx      = 0;
let correct  = 0;

export function initQuiz(cards) {
  allCards = cards;
  renderSetup();
}

/* ── Setup ────────────────────────────────────────────────────────────── */

function renderSetup() {
  const el = document.getElementById('quiz-container');
  el.innerHTML = `
    <div class="quiz-setup">
      <h2>Quiz</h2>
      <div class="quiz-mode-picker">
        <div class="quiz-mode-card${quizMode === 'differential' ? ' selected' : ''}" data-mode="differential">
          <h3>Identify the Technique</h3>
          <p>Read a problem scenario and pick the right algorithm or approach from four options.
             Each option shows a short description so you can tell similar techniques apart.</p>
        </div>
        <div class="quiz-mode-card${quizMode === 'primitive' ? ' selected' : ''}" data-mode="primitive">
          <h3>Code &amp; Syntax</h3>
          <p>See a task description and pick the correct code snippet.
             Tests recall of common operations and patterns.</p>
        </div>
      </div>
      <button class="start-btn" id="quiz-start-btn" ${!quizMode ? 'disabled' : ''}>
        Start quiz
      </button>
    </div>
  `;

  el.querySelectorAll('.quiz-mode-card').forEach(card => {
    card.addEventListener('click', () => {
      quizMode = card.dataset.mode;
      el.querySelectorAll('.quiz-mode-card').forEach(c => c.classList.toggle('selected', c === card));
      el.querySelector('#quiz-start-btn').disabled = false;
    });
  });

  el.querySelector('#quiz-start-btn').addEventListener('click', startSession);
}

/* ── Session ──────────────────────────────────────────────────────────── */

function startSession() {
  if (!quizMode) return;
  queue   = buildQueue();
  idx     = 0;
  correct = 0;

  if (!queue.length) {
    document.getElementById('quiz-container').innerHTML =
      '<div class="empty-state">Not enough cards with the required fields for this quiz mode.</div>';
    return;
  }
  renderQuestion();
}

function buildQueue() {
  let pool;
  if (quizMode === 'differential') {
    pool = allCards.filter(c => c.tier === '3' && c.techniqueName && c.front);
  } else {
    pool = allCards.filter(c => (c.tier === '1' || c.tier === '2') && c.code && c.front);
  }
  return shuffle(pool).slice(0, SESSION_SIZE);
}

/* ── Question ─────────────────────────────────────────────────────────── */

function renderQuestion() {
  if (idx >= queue.length) { renderDone(); return; }

  const card    = queue[idx];
  const options = buildOptions(card);
  const pct     = Math.round((idx / queue.length) * 100);
  const el      = document.getElementById('quiz-container');

  el.innerHTML = `
    <div class="quiz-progress">
      <div class="quiz-progress-bar">
        <div class="quiz-progress-fill" style="width:${pct}%"></div>
      </div>
      <span class="quiz-progress-label">${idx + 1} / ${queue.length}</span>
    </div>

    ${renderCardMeta(card)}
    <div class="quiz-question">${escHtml(card.front)}</div>

    <div class="quiz-options">
      ${options.map((opt, i) => renderOption(opt, i)).join('')}
    </div>

    <div id="quiz-result-area"></div>
  `;

  el.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => handleAnswer(btn, options, card));
  });
}

function renderOption(opt, i) {
  if (quizMode === 'differential') {
    return `
      <button class="quiz-option quiz-option-diff" data-idx="${i}" data-correct="${opt.correct}">
        <span class="quiz-opt-name">${escHtml(opt.label)}</span>
        ${opt.gist ? `<span class="quiz-opt-gist">${escHtml(opt.gist)}</span>` : ''}
      </button>
    `;
  }
  // Primitive: code snippet
  return `
    <button class="quiz-option" data-idx="${i}" data-correct="${opt.correct}">
      ${opt.label ? `<span class="quiz-opt-label">${escHtml(opt.label)}</span>` : ''}
      <code>${escHtml(truncateCode(opt.code))}</code>
    </button>
  `;
}

function handleAnswer(chosen, options, card) {
  const el        = document.getElementById('quiz-container');
  const isCorrect = chosen.dataset.correct === 'true';

  if (isCorrect) correct++;

  el.querySelectorAll('.quiz-option').forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.correct === 'true') btn.classList.add('correct');
    else if (btn === chosen)            btn.classList.add('wrong');
  });

  // For differential: show full gist of correct answer in result if not already visible
  const correctOpt = options.find(o => o.correct);
  const wrongOpts  = options.filter(o => !o.correct && o.explanation);
  const distractorNotes = wrongOpts.length ? `
    <div class="distractor-notes">
      ${wrongOpts.map(o => `<p><strong>${escHtml(o.label)}:</strong> ${escHtml(o.explanation)}</p>`).join('')}
    </div>
  ` : '';

  // Record SM-2 — quiz uses got_it / no (no "almost" for MC)
  const rating = isCorrect ? 'got_it' : 'no';
  const next   = computeNext({ ...getCardProgress(card.id), card_id: card.id }, rating);
  saveCardProgress(card.id, next);
  if (isLoggedIn()) apiSubmitReview(card.id, rating, 'quiz').catch(() => {});

  document.getElementById('quiz-result-area').innerHTML = `
    <div class="quiz-result ${isCorrect ? 'correct-result' : 'wrong-result'}">
      <strong>${isCorrect ? '✓ Correct' : '✗ Incorrect'}</strong>
      ${!isCorrect && correctOpt && correctOpt.label ? `
        <div class="quiz-correct-answer">
          <span class="quiz-correct-label">Correct answer:</span>
          <strong>${escHtml(correctOpt.label)}</strong>
          ${correctOpt.gist ? `<span>${escHtml(correctOpt.gist)}</span>` : ''}
        </div>
      ` : ''}
      ${card.techniqueGist && isCorrect ? `<span>${escHtml(card.techniqueGist)}</span>` : ''}
      ${card.explanation ? `<span>${escHtml(card.explanation)}</span>` : ''}
      ${distractorNotes}
    </div>
    <button class="next-btn" id="quiz-next">
      ${idx + 1 < queue.length ? 'Next →' : 'See results'}
    </button>
  `;

  document.getElementById('quiz-next').addEventListener('click', () => { idx++; renderQuestion(); });
}

/* ── Done ─────────────────────────────────────────────────────────────── */

function renderDone() {
  const pct = Math.round((correct / queue.length) * 100);
  const el  = document.getElementById('quiz-container');

  el.innerHTML = `
    <div class="quiz-done">
      <h2>Quiz complete</h2>
      <div class="quiz-accuracy">${pct}%</div>
      <div class="quiz-accuracy-label">${correct} / ${queue.length} correct</div>
      <button class="start-btn" id="quiz-retry" style="margin-top:24px">Try again</button>
      <br>
      <button class="start-btn" id="quiz-back"
        style="margin-top:12px;background:var(--soft);color:var(--ink)">Change mode</button>
    </div>
  `;

  document.getElementById('quiz-retry').addEventListener('click', startSession);
  document.getElementById('quiz-back').addEventListener('click', renderSetup);
}

/* ── Distractor generation ────────────────────────────────────────────── */

function buildOptions(card) {
  return quizMode === 'differential'
    ? buildDifferentialOptions(card)
    : buildPrimitiveOptions(card);
}

/**
 * Differential: carry techniqueName + techniqueGist so each option is
 * self-describing. Distractors come from same category → related categories
 * → any T3, in that priority order.
 */
function buildDifferentialOptions(card) {
  const correct = {
    label: card.techniqueName,
    gist:  card.techniqueGist ?? null,
    correct: true,
    explanation: null,
    code: null,
  };

  // Authored distractors take precedence
  const authored = (card.multipleChoice?.distractors ?? []).slice(0, 3).map(d => ({
    label:       d.text,
    gist:        d.gist ?? null,
    correct:     false,
    explanation: d.explanation ?? null,
    code:        null,
  }));

  if (authored.length >= 3) {
    return shuffle([correct, ...authored]).slice(0, 4);
  }

  // Siblings (explicitly related — differential diagnosis pairs)
  const siblingCards = (card.siblings ?? [])
    .map(id => allCards.find(c => c.id === id))
    .filter(c => c?.techniqueName && c.techniqueName !== card.techniqueName);

  // Same-category T3 cards
  const sameCategory = shuffle(
    allCards.filter(c =>
      c.tier === '3' && c.techniqueName &&
      c.id !== card.id && c.category === card.category &&
      !siblingCards.find(s => s.id === c.id)
    )
  );

  // Related categories
  const relCats = relatedCategories(card.category);
  const related = shuffle(
    allCards.filter(c =>
      c.tier === '3' && c.techniqueName &&
      c.id !== card.id && relCats.includes(c.category) &&
      c.category !== card.category &&
      !siblingCards.find(s => s.id === c.id) &&
      !sameCategory.find(s => s.id === c.id)
    )
  );

  // Final fallback
  const anyOther = shuffle(
    allCards.filter(c =>
      c.tier === '3' && c.techniqueName && c.id !== card.id &&
      !siblingCards.find(s => s.id === c.id) &&
      !sameCategory.find(s => s.id === c.id) &&
      !related.find(s => s.id === c.id)
    )
  );

  const pool   = [...siblingCards, ...sameCategory, ...related, ...anyOther];
  const needed = 3 - authored.length;
  const generated = pool
    .filter(c => !authored.find(a => a.label === c.techniqueName))
    .slice(0, needed)
    .map(c => ({
      label: c.techniqueName,
      gist:  c.techniqueGist ?? null,
      correct: false,
      explanation: null,
      code: null,
    }));

  return shuffle([correct, ...authored, ...generated]).slice(0, 4);
}

function buildPrimitiveOptions(card) {
  // label is intentionally empty — the question prompt is already shown above.
  // Showing card.front as the option label would give away the answer.
  const correct = { label: '', correct: true, explanation: null, code: card.code };

  // For primitive mode, authored distractors must supply code — text label is suppressed
  // to avoid giving away the answer the same way the correct option would.
  const authored = (card.multipleChoice?.distractors ?? []).slice(0, 3)
    .filter(d => d.code)
    .map(d => ({
      label: '', correct: false, explanation: d.explanation ?? null, code: d.code,
    }));

  if (authored.length >= 3) return shuffle([correct, ...authored]).slice(0, 4);

  const samecat = shuffle(
    allCards.filter(c => (c.tier === '1' || c.tier === '2') && c.code && c.id !== card.id && c.category === card.category)
  );
  const relCats = relatedCategories(card.category);
  const related = shuffle(
    allCards.filter(c =>
      (c.tier === '1' || c.tier === '2') && c.code && c.id !== card.id &&
      relCats.includes(c.category) && c.category !== card.category &&
      !samecat.find(s => s.id === c.id)
    )
  );
  const other = shuffle(
    allCards.filter(c =>
      (c.tier === '1' || c.tier === '2') && c.code && c.id !== card.id &&
      !samecat.find(s => s.id === c.id) && !related.find(s => s.id === c.id)
    )
  );

  const pool    = [...samecat, ...related, ...other];
  const needed  = 3 - authored.length;
  const generated = pool.slice(0, needed).map(c => ({
    label: '', correct: false, explanation: null, code: c.code,
  }));

  return shuffle([correct, ...authored, ...generated]).slice(0, 4);
}

function relatedCategories(cat) {
  const groups = [
    ['BFS', 'DFS', 'GRPH'],
    ['LL', 'PTR', 'WIN'],
    ['STK', 'Q'],
    ['ARR', 'WIN', 'PTR', 'SRT', 'BS'],
    ['TREE', 'BFS', 'DFS', 'REC', 'BT'],
    ['HASH', 'SET', 'ARR'],
    ['REC', 'DP', 'BT'],
    ['HEAP', 'SRT', 'Q'],
    ['STR', 'ARR', 'WIN'],
    ['LOOP', 'ARR', 'PTR'],
  ];
  for (const group of groups) {
    if (group.includes(cat)) return group.filter(c => c !== cat);
  }
  return [];
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function stripComments(code) {
  if (!code) return '';
  return code.split('\n')
    .map(line => line.replace(/#.*$/, '').trimEnd())
    .filter(line => line.trim() !== '')
    .join('\n');
}

function truncateCode(code) {
  if (!code) return '';
  const lines = stripComments(code).split('\n');
  return lines.length <= 4 ? lines.join('\n') : lines.slice(0, 4).join('\n') + '\n…';
}
