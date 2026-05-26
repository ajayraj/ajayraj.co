/* view.js — render a clip by ID with syntax highlighting. */

import hljs from 'highlight.js/lib/core';
// Register common languages — keeps bundle ~40 KB smaller than full hljs
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';   // covers html
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import c from 'highlight.js/lib/languages/c';
import java from 'highlight.js/lib/languages/java';
import diff from 'highlight.js/lib/languages/diff';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('c', c);
hljs.registerLanguage('java', java);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('text', plaintext);

import { apiGetClip, apiDeleteClip } from './api.js';
import { wireTheme } from './theme.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

export async function renderView(el, id) {
  document.title = `clip/${id} — ajayraj.co`;

  el.innerHTML = `
    <div class="clip-shell">
      <header class="clip-header">
        <a href="/" class="back-link" id="new-clip-link">+ new clip</a>
        <button id="theme-btn" class="theme-btn" title="Toggle theme"></button>
      </header>
      <div class="view-loading">Loading clip…</div>
    </div>
  `;

  wireTheme(document.getElementById('theme-btn'));

  // Intercept the "new clip" link so it uses the SPA router
  document.getElementById('new-clip-link').addEventListener('click', e => {
    e.preventDefault();
    history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  const result = await apiGetClip(id);
  const shell  = el.querySelector('.clip-shell');

  if (!result.ok) {
    shell.innerHTML += `
      <div class="view-error">
        <div class="view-error-icon">⊘</div>
        <p>${escHtml(result.error)}</p>
        <a href="/" class="new-clip-btn">Create a new clip</a>
      </div>
    `;
    // Fix the link to use SPA navigation
    shell.querySelector('a.new-clip-btn')?.addEventListener('click', e => {
      e.preventDefault();
      history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    return;
  }

  const clip = result.data;
  document.title = clip.title ? `${clip.title} — clip` : `clip/${id} — ajayraj.co`;

  // Syntax highlight
  const lang = hljs.getLanguage(clip.language) ? clip.language : 'text';
  const highlighted = hljs.highlight(clip.content, { language: lang, ignoreIllegals: true }).value;

  const rawURL = `${API_BASE}/api/clip/${id}?raw=1`;

  shell.innerHTML = `
    <header class="clip-header">
      <a href="/" class="back-link" id="new-clip-link">+ new clip</a>
      <button id="theme-btn" class="theme-btn" title="Toggle theme"></button>
    </header>

    <div class="view-meta">
      ${clip.title ? `<h1 class="view-title">${escHtml(clip.title)}</h1>` : ''}
      <div class="view-info-row">
        <span class="lang-badge">${escHtml(clip.language)}</span>
        <span class="info-sep">·</span>
        <span class="view-stat">${clip.view_count} ${clip.view_count === 1 ? 'view' : 'views'}</span>
        <span class="info-sep">·</span>
        <span class="view-stat">${relDate(clip.created_at)}</span>
        ${clip.expires_at
          ? `<span class="info-sep">·</span><span class="view-expires">expires ${relDate(clip.expires_at)}</span>`
          : ''}
        ${clip.burn ? `<span class="info-sep">·</span><span class="burn-badge">🔥 burned</span>` : ''}
      </div>
    </div>

    <div class="code-wrap">
      <div class="code-actions">
        <button class="action-btn" id="copy-url-btn">Copy URL</button>
        <button class="action-btn" id="copy-btn">Copy</button>
        <a class="action-btn" href="${rawURL}" target="_blank" rel="noopener">Raw</a>
        <button class="action-btn" id="fork-btn">Fork</button>
        <button class="action-btn action-btn-del" id="delete-btn">Delete</button>
      </div>
      <pre class="code-pre"><code class="hljs language-${lang}">${highlighted}</code></pre>
      <div class="line-nums" id="line-nums"></div>
    </div>

    <div id="qr-wrap" class="qr-wrap" style="display:none">
      <canvas id="qr-canvas"></canvas>
      <p class="qr-url">${escHtml(clip.url)}</p>
    </div>
    <button class="qr-toggle-btn" id="qr-btn" title="Show QR code">QR</button>

    <div id="delete-confirm" class="delete-confirm" style="display:none">
      <p>Delete this clip permanently?</p>
      <div class="delete-confirm-row">
        <button class="action-btn action-btn-del" id="confirm-delete-btn">Yes, delete</button>
        <button class="action-btn" id="cancel-delete-btn">Cancel</button>
      </div>
    </div>
  `;

  wireTheme(document.getElementById('theme-btn'));
  wireNewLink(shell);
  wireActions(clip, shell);
  renderLineNums(clip.content);
  renderQR(clip.url);
}

function wireNewLink(shell) {
  shell.querySelector('#new-clip-link')?.addEventListener('click', e => {
    e.preventDefault();
    history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

function wireActions(clip, shell) {
  // Copy URL
  shell.querySelector('#copy-url-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(clip.url).catch(() => {});
    flash('copy-url-btn', 'Copied!', 'Copy URL');
  });

  // Copy content
  shell.querySelector('#copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(clip.content).catch(() => {});
    flash('copy-btn', 'Copied!', 'Copy');
  });

  // Fork — go to create page pre-filled with this clip's content
  shell.querySelector('#fork-btn')?.addEventListener('click', () => {
    sessionStorage.setItem('clip-fork', JSON.stringify({
      content:  clip.content,
      title:    clip.title ? `Fork of ${clip.title}` : '',
      language: clip.language,
    }));
    history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  // Delete (show confirm dialog)
  const deleteBtn  = shell.querySelector('#delete-btn');
  const confirmBox = shell.querySelector('#delete-confirm');
  deleteBtn?.addEventListener('click', () => {
    confirmBox.style.display = 'block';
  });
  shell.querySelector('#cancel-delete-btn')?.addEventListener('click', () => {
    confirmBox.style.display = 'none';
  });
  shell.querySelector('#confirm-delete-btn')?.addEventListener('click', async () => {
    const ok = await apiDeleteClip(clip.id);
    if (ok) {
      history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      confirmBox.innerHTML = '<p class="delete-error">Delete failed — are you logged in?</p>';
    }
  });

}


function renderLineNums(content) {
  const el = document.getElementById('line-nums');
  if (!el) return;
  const lines = content.split('\n').length;
  el.innerHTML = Array.from({ length: lines }, (_, i) =>
    `<span>${i + 1}</span>`
  ).join('');
}

function renderQR(url) {
  // Dynamic import for code-splitting — only loaded when QR button is first clicked
  const btn = document.getElementById('qr-btn');
  if (!btn) return;

  let loaded = false;
  btn.addEventListener('click', async () => {
    const wrap = document.getElementById('qr-wrap');
    if (!wrap) return;

    if (!loaded) {
      loaded = true;
      try {
        const mod = await import('qrcode');
        const lib = mod.default ?? mod; // handles both CJS default and ESM named
        const canvas = document.getElementById('qr-canvas');
        if (canvas) {
          await lib.toCanvas(canvas, url, {
            width: 160,
            margin: 2,
            color: { dark: '#ff9966', light: '#1a1128' },
          });
        }
      } catch {
        // qrcode unavailable — the URL text is still shown as fallback
      }
    }

    wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none';
  }, { once: false }); // keep listening (toggle)

  // Remove the separate click handler we wired in wireActions
  btn.dataset.qrWired = '1';
}

function flash(id, next, reset) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const prev = reset ?? btn.textContent;
  btn.textContent = next;
  setTimeout(() => { btn.textContent = prev; }, 1600);
}

function relDate(isoString) {
  if (!isoString) return '';
  const ms   = Date.now() - new Date(isoString).getTime();
  const abMs = Math.abs(ms);
  const future = ms < 0;
  const days = Math.floor(abMs / 86_400_000);
  const hrs  = Math.floor(abMs / 3_600_000);
  const mins = Math.floor(abMs / 60_000);

  let s;
  if (mins < 1)   s = 'just now';
  else if (hrs < 1)  s = `${mins}m ago`;
  else if (days < 1) s = `${hrs}h ago`;
  else if (days < 7) s = `${days}d ago`;
  else if (days < 30) s = `${Math.floor(days / 7)}w ago`;
  else s = `${Math.floor(days / 30)}mo ago`;

  if (future) s = s.replace(' ago', '').replace('just now', 'in a moment');
  return s;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
