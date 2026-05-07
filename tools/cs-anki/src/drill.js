import { renderCardMeta, renderCardFrontContent, renderCardBack, attachCardHandlers, cardProseContent } from './render.js';
import { getCardProgress, saveCardProgress, computeNext } from './store.js';
import { TIER_META, shuffle, renderTierTabs } from './util.js';

const SESSION_SIZE = 20;
/* Filler words and generic verbs that don't represent recall-worthy concepts.
   Curated to avoid grading the student on incidental phrasing. */
const STOPWORDS    = new Set([
  'the','and','that','this','with','from','have','when','what','some','into','your',
  'each','will','they','just','used','also','than','then','does','for','are','can',
  'not','you','its','was','were','but','use','using','which','has','all','any','been',
  'more','one','two','way','let','put','run','how','why','see','may','only','too',
  'big','small','their','tells','still','again','until','over','most','need','know',
  'something','exactly','imagine','means','might','otherwise','before','already',
  'before','after','first','last','next','step','rule','side','here','there','very',
  'extra','simpler','holds','pull','push','forward','watch','found','find','write',
  'ask','answers','data','item','items','number','numbers','list','rest','many',
  'much','new','old','once','twice','thing','things','case','cases','same','other',
  'others','must','should','these','those','make','makes','made','say','says','goes',
]);

let allCards   = [];
let queue      = [];
let idx        = 0;
let tally      = { got_it: 0, almost: 0, no: 0 };
let tierFilter = 'all';

export function initDrill(cards) {
  allCards = cards;
  renderSetup();
}

/* ── Setup screen ── */
function renderSetup() {
  const el      = document.getElementById('drill-container');
  const tierBtns = [
    { value: 'all', label: 'All tiers', sub: null },
    ...Object.entries(TIER_META).map(([v, m]) => ({ value: v, label: m.label, sub: m.sub })),
  ];

  el.innerHTML = `
    <div class="drill-setup">
      <h2>Drill</h2>
      <p>Type your answer, then reveal the back and rate yourself.<br>
         Cards you struggle with come back sooner.</p>

      <div class="drill-filters">
        ${renderTierTabs(tierBtns, tierFilter, 'drill-filter-btn')}
      </div>

      <div class="queue-summary" id="drill-queue-summary"></div>
      <button class="start-btn" id="drill-start-btn">Start session</button>
    </div>
  `;

  updateQueueSummary();

  el.querySelector('.drill-filters').addEventListener('click', e => {
    const btn = e.target.closest('.drill-filter-btn');
    if (!btn) return;
    tierFilter = btn.dataset.value;
    el.querySelectorAll('.drill-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    updateQueueSummary();
  });

  el.querySelector('#drill-start-btn').addEventListener('click', startSession);
}

function candidateCards() {
  return allCards.filter(c => tierFilter === 'all' || c.tier === tierFilter);
}

function buildQueue() {
  const now  = Date.now();
  const pool = candidateCards();

  const overdue = pool
    .filter(c => { const p = getCardProgress(c.id); return p && p.nextDue <= now; })
    .sort((a, b) => (getCardProgress(a.id)?.nextDue ?? 0) - (getCardProgress(b.id)?.nextDue ?? 0));

  const unseen = shuffle(pool.filter(c => !getCardProgress(c.id)));
  return [...overdue, ...unseen].slice(0, SESSION_SIZE);
}

function updateQueueSummary() {
  const now  = Date.now();
  const pool = candidateCards();
  const over = pool.filter(c => { const p = getCardProgress(c.id); return p && p.nextDue <= now; }).length;
  const new_ = pool.filter(c => !getCardProgress(c.id)).length;
  const total = Math.min(over + new_, SESSION_SIZE);

  document.getElementById('drill-queue-summary').innerHTML =
    `<strong>${total}</strong> cards ready — ${over} overdue, ${new_} new`;

  const btn = document.getElementById('drill-start-btn');
  if (btn) btn.disabled = total === 0;
}

/* ── Session ── */
function startSession() {
  queue = buildQueue();
  idx   = 0;
  tally = { got_it: 0, almost: 0, no: 0 };
  if (!queue.length) return;
  renderCard();
}

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
        placeholder="Write your answer before revealing…" rows="3"></textarea>

      <button class="reveal-btn" id="drill-reveal">Reveal</button>

      <div class="card-back hidden" id="drill-back">
        <div id="drill-comparison"></div>
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

  document.getElementById('drill-reveal').addEventListener('click', function () {
    const userAnswer = document.getElementById('drill-textarea')?.value ?? '';
    const back       = document.getElementById('drill-back');
    back.classList.remove('hidden');
    this.style.display = 'none';

    const comparison = document.getElementById('drill-comparison');
    if (userAnswer.trim()) {
      const grade = autograde(card, userAnswer);
      comparison.innerHTML = renderComparison(userAnswer, grade);
    }
  });

  el.querySelector('.rating-row').addEventListener('click', e => {
    const btn = e.target.closest('.rating-btn');
    if (!btn) return;
    const rating = btn.dataset.rating;
    saveCardProgress(card.id, computeNext(getCardProgress(card.id), rating));
    tally[rating]++;
    idx++;
    renderCard();
  });
}

/* ── Autograde ── */
function autograde(card, userAnswer) {
  const raw    = cardProseContent(card).toLowerCase();
  const lower  = userAnswer.toLowerCase();

  const terms = [...new Set((raw.match(/\b[a-z_][\w]{2,}\b/g) ?? [])
    .filter(w => !STOPWORDS.has(w) && w.length >= 3)
  )];

  if (!terms.length) return null;

  const matched = terms.filter(t => lower.includes(t));
  const missed  = terms.filter(t => !lower.includes(t));
  const score   = Math.round((matched.length / terms.length) * 100);

  return { score, matchedCount: matched.length, total: terms.length, missed: missed.slice(0, 10) };
}

function renderComparison(userAnswer, grade) {
  const userBlock = `
    <div class="back-label">Your answer</div>
    <div class="drill-user-answer">${userAnswer.trim()}</div>
  `;

  if (!grade) return userBlock;

  const missedHTML = grade.missed.length
    ? `<div class="autograde-terms">${grade.missed.map(t => `<span class="autograde-term">${t}</span>`).join('')}</div>`
    : `<div class="autograde-perfect">All key terms covered</div>`;

  const gradeBlock = `
    <div class="autograde">
      <div class="autograde-header">
        <span class="autograde-pct">${grade.score}%</span>
        <span class="autograde-sub">${grade.matchedCount} / ${grade.total} key terms</span>
      </div>
      ${grade.missed.length ? `<div class="autograde-missed-label">Terms not mentioned</div>` : ''}
      ${missedHTML}
    </div>
  `;

  return userBlock + gradeBlock;
}

/* ── Done screen ── */
function renderDone() {
  const el  = document.getElementById('drill-container');
  const tot = queue.length;

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

      <button class="start-btn" id="drill-again">Drill again</button>
      <br>
      <button class="start-btn" id="drill-setup-btn"
        style="margin-top:12px;background:var(--soft);color:var(--ink)">Back to setup</button>
    </div>
  `;

  document.getElementById('drill-again').addEventListener('click', startSession);
  document.getElementById('drill-setup-btn').addEventListener('click', renderSetup);
}

