import { TIER_META } from './util.js';

export const TIER_LABELS = Object.fromEntries(
  Object.entries(TIER_META).map(([k, v]) => [k, v.short])
);

/* Card lookup — set once after cards are loaded so links show human-readable fronts.
   Also derives the inverse `composedBy` edge: for every (card → composes → atom),
   add atom.composedBy entry pointing back. The card schema lists this as auto-derived. */
let _cardMap = {};
export function initCardLookup(cards) {
  _cardMap = Object.fromEntries(cards.map(c => [c.id, c]));
  for (const c of cards) {
    const refs = [
      ...(c.composes ?? []),
      ...(c.skeletonRef ? [c.skeletonRef] : []),
    ];
    for (const id of refs) {
      const target = _cardMap[id];
      if (!target) continue;
      target.composedBy ??= [];
      if (!target.composedBy.includes(c.id)) target.composedBy.push(c.id);
    }
  }
}

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Encode a value for safe inclusion in a URL path segment. */
function encodePath(s) {
  return encodeURIComponent(String(s ?? ''));
}

/* Inline markdown: **bold**, *italic*, `code`
   Code spans are processed first so `**` inside backticks is never treated as bold. */
export function inlineCode(s) {
  const escaped = escHtml(s);
  const slots = [];
  const withPlaceholders = escaped.replace(/`([^`]+)`/g, (_, inner) => {
    const i = slots.length;
    slots.push(`<code>${inner}</code>`);
    return `\x00${i}\x00`;
  });
  const withMarkdown = withPlaceholders
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g,   '<em>$1</em>');
  return withMarkdown.replace(/\x00(\d+)\x00/g, (_, i) => slots[+i]);
}

export function renderCardMeta(card) {
  const tier  = card.tier ?? '';
  const label = TIER_LABELS[tier] ?? tier;
  return `
    <div class="card-meta">
      <span class="card-tier-label">T${tier} · ${label}</span>
      <div class="card-meta-right">
        ${card.pythonSpecific ? '<span class="python-badge">PY</span>' : ''}
        <span class="card-id">${escHtml(card.id)}</span>
      </div>
    </div>
  `;
}

export function renderCardFrontContent(card) {
  return `
    <div class="front front-style-${card.frontStyle ?? 'term'}">${escHtml(card.front)}</div>
    ${card.technical ? `<div class="technical">${escHtml(card.technical)}</div>` : ''}
  `;
}

export function renderCardBack(card) {
  const p = [];

  if (card.explanation) p.push(`<div class="explanation">${inlineCode(card.explanation)}</div>`);
  if (card.code)        p.push(`<pre>${escHtml(card.code)}</pre>`);
  if (card.example)     p.push(`<div class="back-label">Example</div><pre>${escHtml(card.example)}</pre>`);

  if (card.metaphor) p.push(`
    <div class="metaphor">
      <div class="annotation-label">Metaphor</div>
      ${inlineCode(card.metaphor)}
    </div>
  `);
  if (card.insight) p.push(`
    <div class="insight">
      <div class="annotation-label">Insight</div>
      ${inlineCode(card.insight)}
    </div>
  `);
  if (card.mnemonic) p.push(`
    <div class="mnemonic">
      <div class="annotation-label">Mnemonic</div>
      ${inlineCode(card.mnemonic)}
    </div>
  `);
  if (card.gotcha) p.push(`
    <div class="gotcha">
      <div class="annotation-label">Watch out</div>
      ${inlineCode(card.gotcha)}
    </div>
  `);

  if (card.pythonic) {
    p.push(`
      <span class="pythonic-toggle">▼ pythonic version</span>
      <div class="pythonic-block">
        ${card.pythonic.note ? `<div class="pythonic-note">${escHtml(card.pythonic.note)}</div>` : ''}
        ${card.pythonic.code ? `<pre>${escHtml(card.pythonic.code)}</pre>` : ''}
      </div>
    `);
  }

  if (card.techniqueName || card.techniqueGist) {
    p.push(`
      ${card.techniqueName ? `<div class="technique-name">${escHtml(card.techniqueName)}</div>` : ''}
      ${card.techniqueGist ? `<div class="technique-gist">${inlineCode(card.techniqueGist)}</div>` : ''}
    `);
  }

  if (card.skeleton) p.push(`<div class="back-label">Skeleton</div><pre>${escHtml(card.skeleton)}</pre>`);

  if (card.hints?.length) {
    p.push(`
      <div class="back-label">Hints</div>
      <ul class="hints">${card.hints.map(h => `<li>${inlineCode(h)}</li>`).join('')}</ul>
    `);
  }

  if (card.composes?.length) {
    p.push(`
      <div class="back-label">Built from</div>
      <div class="link-row">${card.composes.map(id => cardLink(id)).join(' · ')}</div>
    `);
  }
  if (card.skeletonRef) {
    p.push(`
      <div class="back-label">Pattern</div>
      <div class="link-row">${cardLink(card.skeletonRef)}</div>
    `);
  }
  if (card.composedBy?.length) {
    p.push(`
      <div class="back-label">Used in</div>
      <div class="link-row">${card.composedBy.map(id => cardLink(id)).join(' · ')}</div>
    `);
  }
  if (card.siblings?.length) {
    p.push(`
      <div class="back-label">Differential siblings</div>
      <div class="link-row">${card.siblings.map(id => cardLink(id)).join(' · ')}</div>
    `);
  }

  if (card.problems?.length) {
    p.push(`
      <div class="back-label">Anchor problems</div>
      <ul class="anchor-problems">
        ${card.problems.map(pb => `
          <li>
            <span class="lc-num">#${escHtml(pb.lc)}</span>
            <a href="https://leetcode.com/problems/${encodePath(pb.slug)}" target="_blank" rel="noopener">${escHtml(pb.name)}</a>
          </li>
        `).join('')}
      </ul>
    `);
  }

  if (card.fullCode) {
    p.push(`
      <button class="expand-btn">▼ go deeper</button>
      <div class="deep-layer">
        <div class="back-label">Full code</div>
        <pre>${escHtml(card.fullCode)}</pre>
      </div>
    `);
  }

  return p.join('\n');
}

/* Cross-reference link — shows the card's front text, not the raw ID. */
function cardLink(id) {
  const card  = _cardMap[id];
  const label = card?.front ? escHtml(card.front) : escHtml(id);
  return `<a class="card-link" data-id="${escHtml(id)}" href="#card-${escHtml(id)}">${label}</a>`;
}

/* Attach interactive handlers to an already-rendered card element. */
export function attachCardHandlers(el) {
  const revealBtn = el.querySelector('.reveal-btn');

  /* Click anywhere on the card toggles open/close, except interactive elements */
  el.addEventListener('click', e => {
    if (e.target.closest('a, button, textarea, input, pre, .pythonic-toggle')) return;
    if (!revealBtn) return;
    revealBtn.click();
  });

  revealBtn?.addEventListener('click', function () {
    const back = this.nextElementSibling;
    back.classList.toggle('hidden');
    this.textContent = back.classList.contains('hidden') ? 'Reveal' : 'Hide';
  });

  el.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.nextElementSibling;
      layer.classList.toggle('open');
      btn.textContent = layer.classList.contains('open') ? '▲ less' : '▼ go deeper';
    });
  });

  el.querySelectorAll('.pythonic-toggle').forEach(t => {
    t.addEventListener('click', () => {
      const block = t.nextElementSibling;
      block.classList.toggle('open');
      t.textContent = block.classList.contains('open') ? '▲ hide pythonic' : '▼ pythonic version';
    });
  });
}

/* Prose-only text used to derive expected key terms for autograde.
   Code, skeletons, and examples are excluded — their identifiers are
   problem-specific (variable names, Python keywords) and not the
   conceptual vocabulary a student is expected to recall in prose. */
export function cardProseContent(card) {
  return [
    card.explanation, card.techniqueName, card.techniqueGist,
    card.insight, card.mnemonic, card.gotcha, card.metaphor,
    ...(card.hints ?? []),
  ].filter(Boolean).join(' ');
}
