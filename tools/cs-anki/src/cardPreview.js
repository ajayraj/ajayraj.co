/* cardPreview.js — floating card preview overlay.
   Triggered by card links in browse, drill, quiz, and progress.
   Shows the full card (front + reveal mechanic) in a modal layer
   without navigating away from the current view. */

import { renderCardMeta, renderCardFrontContent, renderCardBack, attachCardHandlers } from './render.js';

let _cardMap = {};

export function initCardPreview(cards) {
  _cardMap = Object.fromEntries(cards.map(c => [c.id, c]));

  // Build overlay DOM once and attach to body
  if (document.getElementById('card-preview-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id        = 'card-preview-overlay';
  overlay.className = 'card-preview-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="card-preview-backdrop"></div>
    <div class="card-preview-modal">
      <button class="card-preview-close" aria-label="Close preview" title="Close (Esc)">×</button>
      <div id="card-preview-content"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.card-preview-backdrop')
    .addEventListener('click', hideCardPreview);
  overlay.querySelector('.card-preview-close')
    .addEventListener('click', hideCardPreview);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideCardPreview();
  });
}

export function showCardPreview(cardId) {
  const card    = _cardMap[cardId];
  const overlay = document.getElementById('card-preview-overlay');
  const content = document.getElementById('card-preview-content');
  if (!card || !overlay || !content) return;

  content.innerHTML = `
    <div class="card tier-${card.tier ?? ''}">
      ${renderCardMeta(card)}
      ${renderCardFrontContent(card)}
      <div class="card-back">${renderCardBack(card)}</div>
    </div>
  `;

  attachCardHandlers(content.querySelector('.card'));
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

export function hideCardPreview() {
  const overlay = document.getElementById('card-preview-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
}
