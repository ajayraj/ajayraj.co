/* Shared utilities — keep this file dependency-free. */

export const TIER_META = {
  '0': { label: 'Foundations', short: 'Foundation', sub: 'Tier 0' },
  '1': { label: 'Primitives',  short: 'Primitive',  sub: 'Tier 1' },
  '2': { label: 'Patterns',    short: 'Pattern',    sub: 'Tier 2' },
  '3': { label: 'Techniques',  short: 'Technique',  sub: 'Tier 3' },
};

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Render a row of pill/tab buttons. The caller wires its own click handler
   on the container; each button carries data-value with the option value. */
export function renderTierTabs(options, activeValue, className = 'filter-btn') {
  return options.map(o => `
    <button class="${className}${o.value === activeValue ? ' active' : ''}" data-value="${o.value}">
      ${o.label}${o.sub ? `<span class="filter-sub">${o.sub}</span>` : ''}
    </button>
  `).join('');
}
