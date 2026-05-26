import { markOnboarded } from './store.js';

/* First-visit explainer. One screen, dismissible, never re-shown.
   Mirrors the loop the cards are designed to teach: symptom → mechanism → atom. */
export function showOnboarding() {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-modal" role="dialog" aria-labelledby="ob-title">
      <h2 id="ob-title">Welcome to Recall</h2>
      <p class="onboarding-lede">
        A study deck for learning algorithm problem-solving from the ground up,
        inspired by anki studying techniques.
      </p>

      <div class="onboarding-tiers">
        <div class="ob-tier">
          <span class="ob-tier-strip" style="background:var(--accent-leaf-pale)"></span>
          <div>
            <strong>Tier 0 · Foundations</strong>
            <p>Concepts. <em>What's an index?</em> Mental models, not code.</p>
          </div>
        </div>
        <div class="ob-tier">
          <span class="ob-tier-strip" style="background:var(--accent-leaf)"></span>
          <div>
            <strong>Tier 1 · Primitives</strong>
            <p>Code your fingers should know cold. <em>Read a single item by position.</em></p>
          </div>
        </div>
        <div class="ob-tier">
          <span class="ob-tier-strip" style="background:var(--accent-warm)"></span>
          <div>
            <strong>Tier 2 · Patterns</strong>
            <p>4–8 line skeletons. The phrases of the language.</p>
          </div>
        </div>
        <div class="ob-tier">
          <span class="ob-tier-strip" style="background:var(--accent-rose)"></span>
          <div>
            <strong>Tier 3 · Techniques</strong>
            <p>Symptom-keyed recognition. <em>You hear a problem, you match it to a technique.</em></p>
          </div>
        </div>
      </div>

      <div class="onboarding-modes">
        <strong>Modes</strong>
        <ul>
          <li><b>Browse</b> — read the deck.</li>
          <li><b>Drill</b> — typed recall + spaced repetition.</li>
          <li><b>Quiz</b> — multiple choice on technique recognition or fluency.</li>
          <li><b>Workspace</b> — assemble a solution: pick T3 → T2 → T1, then write code.</li>
        </ul>
      </div>

      <p class="onboarding-card-id">
        Card IDs follow <code>T{tier}-{category}-{number}</code> — e.g. <code>T2-WIN-001</code>
        is the first Tier 2 card in the Window category.
      </p>

      <button class="onboarding-dismiss start-btn">Got it</button>

      <div class="onboarding-amy">I love you Amy ❤️</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const dismiss = () => {
    markOnboarded();
    overlay.remove();
  };
  overlay.querySelector('.onboarding-dismiss').addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
}
