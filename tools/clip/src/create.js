/* create.js — clip creation form. */

import { apiCreateClip } from './api.js';
import { getTheme, saveTheme, wireTheme } from './theme.js';

const LANGUAGES = [
  ['text',       'plaintext'],
  ['javascript', 'javascript'],
  ['typescript', 'typescript'],
  ['python',     'python'],
  ['go',         'go'],
  ['rust',       'rust'],
  ['bash',       'bash / shell'],
  ['html',       'html'],
  ['css',        'css'],
  ['json',       'json'],
  ['sql',        'sql'],
  ['markdown',   'markdown'],
  ['yaml',       'yaml'],
  ['c',          'c / c++'],
  ['java',       'java'],
  ['diff',       'diff'],
];

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

export function renderCreate(el, prefill = null) {
  document.title = 'clip — ajayraj.co';

  el.innerHTML = `
    <div class="clip-shell">
      <header class="clip-header">
        <a href="https://ajayraj.co" class="back-link">← ajayraj.co</a>
        <button id="theme-btn" class="theme-btn" title="Toggle theme"></button>
      </header>

      <div class="clip-hero">
        <h1 class="hero-title">clip<span class="hero-dot">.</span></h1>
        <p class="hero-sub">paste it, share it.</p>
      </div>

      <form id="clip-form" class="clip-form" autocomplete="off">

        <input
          type="text"
          id="clip-title-input"
          class="clip-title-input"
          placeholder="Title (optional)"
          maxlength="200"
          value="${prefill?.title ? escHtml(prefill.title) : ''}"
        />

        <div class="editor-wrap">
          <textarea
            id="clip-content"
            class="clip-content"
            placeholder="Paste your text or code here…"
            spellcheck="false"
            rows="16"
          >${prefill?.content ? escHtml(prefill.content) : ''}</textarea>
          <div class="editor-meta-bar">
            <span id="char-count">0 chars</span>
            <span id="line-count">0 lines</span>
          </div>
        </div>

        <div class="clip-options">
          <label class="opt-label">
            <span class="opt-label-text">Language</span>
            <select id="lang-select" class="opt-select">
              ${LANGUAGES.map(([val, lbl]) =>
                `<option value="${val}"${(prefill?.language ?? 'text') === val ? ' selected' : ''}>${lbl}</option>`
              ).join('')}
            </select>
          </label>

          <label class="opt-label">
            <span class="opt-label-text">Expires</span>
            <select id="expiry-select" class="opt-select">
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
              <option value="7d" selected>7 days</option>
              <option value="30d">30 days</option>
              <option value="">never</option>
            </select>
          </label>

          <label class="opt-check" id="burn-label" title="Clip is deleted after the first read">
            <input type="checkbox" id="burn-check" />
            <span class="burn-icon">🔥</span>
            <span>burn once</span>
          </label>
        </div>

        <div id="form-error" class="form-error" style="display:none"></div>

        <button type="submit" class="submit-btn" id="submit-btn">
          Create clip →
        </button>

        <p class="submit-hint">Cmd+Enter to submit</p>
      </form>

      <details class="api-hint">
        <summary>CLI usage</summary>
        <pre class="api-pre"><code id="api-example"></code></pre>
      </details>
    </div>
  `;

  // Set API hint example
  document.getElementById('api-example').textContent =
    `# Create a clip from stdin\n` +
    `echo "hello world" | curl -s -X POST ${API_BASE}/api/clip \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -d "{\\"content\\":\\"$(cat)\\"}" | jq -r .url\n\n` +
    `# Or pipe a file\n` +
    `curl -s -X POST ${API_BASE}/api/clip \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -d "{\\"content\\":\\"$(cat yourfile.js)\\",\\"language\\":\\"javascript\\"}" | jq -r .url`;

  wireTheme(document.getElementById('theme-btn'));
  wireCounters();
  wireForm(el);
}

function wireCounters() {
  const ta      = document.getElementById('clip-content');
  const charEl  = document.getElementById('char-count');
  const lineEl  = document.getElementById('line-count');

  function update() {
    const v = ta.value;
    charEl.textContent = `${v.length.toLocaleString()} chars`;
    const lines = v === '' ? 0 : v.split('\n').length;
    lineEl.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'}`;
  }

  update(); // Run once for prefilled content
  ta.addEventListener('input', update);
}

function wireForm(el) {
  const form      = document.getElementById('clip-form');
  const textarea  = document.getElementById('clip-content');
  const submitBtn = document.getElementById('submit-btn');
  const errorEl   = document.getElementById('form-error');

  // Cmd/Ctrl+Enter shortcut
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const content = textarea.value.trim();
    if (!content) {
      showError('Content is required.');
      textarea.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';

    const result = await apiCreateClip({
      content,
      title:      document.getElementById('clip-title-input').value.trim(),
      language:   document.getElementById('lang-select').value,
      expires_in: document.getElementById('expiry-select').value,
      burn:       document.getElementById('burn-check').checked,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create clip →';

    if (!result.ok) {
      showError(result.error ?? 'Something went wrong.');
      return;
    }

    // Navigate to the view page
    const clipId = result.data.id;
    history.pushState({}, '', `/${clipId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
