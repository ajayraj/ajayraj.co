import { escHtml, renderCardMeta } from './render.js';
import { shuffle } from './util.js';

const SESSION_SIZE = 10;

let allCards   = [];
let quizMode   = null;  // 'differential' | 'primitive'
let queue      = [];
let idx        = 0;
let correct    = 0;

export function initQuiz(cards) {
  allCards = cards;
  renderSetup();
}

/* ── Setup ── */
function renderSetup() {
  const el = document.getElementById('quiz-container');
  el.innerHTML = `
    <div class="quiz-setup">
      <h2>Quiz</h2>
      <div class="quiz-mode-picker">
        <div class="quiz-mode-card${quizMode === 'differential' ? ' selected' : ''}" data-mode="differential">
          <h3>Differential</h3>
          <p>Read a problem scenario. Pick the right technique from four options. Trains pattern recognition.</p>
        </div>
        <div class="quiz-mode-card${quizMode === 'primitive' ? ' selected' : ''}" data-mode="primitive">
          <h3>Primitive Check</h3>
          <p>See a code task. Pick the right snippet. Drills the atoms your fingers should know cold.</p>
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

/* ── Session ── */
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
    pool = allCards.filter(c => c.tier === '1' && c.code && c.front);
  }
  return shuffle(pool).slice(0, SESSION_SIZE);
}

/* ── Question ── */
function renderQuestion() {
  if (idx >= queue.length) { renderDone(); return; }

  const card    = queue[idx];
  const options = buildOptions(card);
  const pct     = Math.round((idx / queue.length) * 100);
  const el      = document.getElementById('quiz-container');

  el.innerHTML = `
    <div class="quiz-progress">
      <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${pct}%"></div></div>
      <span class="quiz-progress-label">${idx + 1} / ${queue.length}</span>
    </div>

    ${renderCardMeta(card)}

    <div class="quiz-question">${escHtml(card.front)}</div>

    <div class="quiz-options">
      ${options.map((opt, i) => `
        <button class="quiz-option" data-idx="${i}" data-correct="${opt.correct}">
          ${quizMode === 'differential'
            ? escHtml(opt.label)
            : `${escHtml(opt.label)}<code>${escHtml(truncateCode(opt.code))}</code>`
          }
        </button>
      `).join('')}
    </div>

    <div id="quiz-result-area"></div>
  `;

  el.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => handleAnswer(btn, options, card));
  });
}

function handleAnswer(chosen, options, card) {
  const el        = document.getElementById('quiz-container');
  const isCorrect = chosen.dataset.correct === 'true';

  if (isCorrect) correct++;

  /* Lock all options and colour them */
  el.querySelectorAll('.quiz-option').forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.correct === 'true') btn.classList.add('correct');
    else if (btn === chosen)            btn.classList.add('wrong');
  });

  /* Build explanation */
  const correctOpt  = options.find(o => o.correct);
  const wrongOpts   = options.filter(o => !o.correct && o.explanation);

  const distractorNotes = wrongOpts.length ? `
    <div class="distractor-notes">
      ${wrongOpts.map(o => `<p><strong>${escHtml(o.label)}:</strong> ${escHtml(o.explanation)}</p>`).join('')}
    </div>
  ` : '';

  document.getElementById('quiz-result-area').innerHTML = `
    <div class="quiz-result ${isCorrect ? 'correct-result' : 'wrong-result'}">
      <strong>${isCorrect ? '✓ Correct' : '✗ Incorrect'}</strong>
      ${card.techniqueGist ? `<span>${escHtml(card.techniqueGist)}</span>` : ''}
      ${card.explanation   ? `<span>${escHtml(card.explanation)}</span>`   : ''}
      ${distractorNotes}
    </div>
    <button class="next-btn" id="quiz-next">
      ${idx + 1 < queue.length ? 'Next →' : 'See results'}
    </button>
  `;

  document.getElementById('quiz-next').addEventListener('click', () => { idx++; renderQuestion(); });
}

/* ── Done ── */
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
        style="margin-top:12px;background:var(--soft);color:var(--ink)">
        Change mode
      </button>
    </div>
  `;

  document.getElementById('quiz-retry').addEventListener('click', startSession);
  document.getElementById('quiz-back').addEventListener('click', renderSetup);
}

/* ── Distractor generation ── */
function buildOptions(card) {
  if (quizMode === 'differential') return buildDifferentialOptions(card);
  return buildPrimitiveOptions(card);
}

function buildDifferentialOptions(card) {
  const correct = { label: card.techniqueName, correct: true, explanation: null, code: null };

  /* Prefer siblings, fall back to any other T3 with a techniqueName */
  const siblingCards = (card.siblings ?? [])
    .map(id => allCards.find(c => c.id === id))
    .filter(c => c?.techniqueName);

  const otherT3 = allCards.filter(c =>
    c.tier === '3' && c.techniqueName && c.id !== card.id &&
    !siblingCards.find(s => s?.id === c.id)
  );

  const distractorPool = [...siblingCards, ...shuffle(otherT3)];

  /* Use authored distractors from multipleChoice.distractors first */
  const authored = (card.multipleChoice?.distractors ?? []).slice(0, 3).map(d => ({
    label:       d.text,
    correct:     false,
    explanation: d.explanation ?? null,
    code:        null,
  }));

  const generated = distractorPool
    .filter(c => !authored.find(a => a.label === c.techniqueName))
    .slice(0, 3 - authored.length)
    .map(c => ({ label: c.techniqueName, correct: false, explanation: null, code: null }));

  return shuffle([correct, ...authored, ...generated]).slice(0, 4);
}

function buildPrimitiveOptions(card) {
  const correct = { label: '', correct: true, explanation: null, code: card.code };

  /* Prefer same category */
  const samecat = shuffle(
    allCards.filter(c => c.tier === '1' && c.code && c.id !== card.id && c.category === card.category)
  );
  const other = shuffle(
    allCards.filter(c => c.tier === '1' && c.code && c.id !== card.id && c.category !== card.category)
  );

  const authored = (card.multipleChoice?.distractors ?? []).slice(0, 3).map(d => ({
    label:       d.text ?? '',
    correct:     false,
    explanation: d.explanation ?? null,
    code:        d.code ?? d.text ?? '',
  }));

  const pool    = [...samecat, ...other];
  const needed  = 3 - authored.length;
  const generated = pool.slice(0, needed).map(c => ({
    label: '', correct: false, explanation: null, code: c.code,
  }));

  return shuffle([correct, ...authored, ...generated]).slice(0, 4);
}

/* ── Helpers ── */
function stripComments(code) {
  if (!code) return '';
  return code.split('\n')
    .map(line => line.replace(/#.*$/, '').trimEnd())
    .filter(line => line.trim() !== '')
    .join('\n');
}

function truncateCode(code) {
  if (!code) return '';
  const stripped = stripComments(code);
  const lines = stripped.split('\n');
  if (lines.length <= 4) return stripped;
  return lines.slice(0, 4).join('\n') + '\n…';
}

