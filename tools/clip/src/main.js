/* main.js — SPA router for clip.ajayraj.co.
   Routes:
     /          → create form
     /CLIPID    → view clip
*/

import './style.css';
import { getTheme, applyTheme } from './theme.js';
import { renderCreate } from './create.js';
import { renderView }   from './view.js';

const app = document.getElementById('app');

// Apply saved theme immediately (avoids flash)
applyTheme(getTheme());

function route() {
  const path = window.location.pathname.replace(/^\//, '').split('?')[0].trim();

  if (path === '' || path === 'index.html') {
    // Check for a forked clip in sessionStorage
    let prefill = null;
    const raw = sessionStorage.getItem('clip-fork');
    if (raw) {
      try { prefill = JSON.parse(raw); } catch {}
      sessionStorage.removeItem('clip-fork');
    }
    renderCreate(app, prefill);
  } else {
    // Treat any non-empty path segment as a clip ID
    renderView(app, path);
  }
}

// Initial render
route();

// Handle back/forward + our own pushState calls
window.addEventListener('popstate', route);
