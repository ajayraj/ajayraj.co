import { escHtml } from './render.js';
import { getWorkspaces, saveWorkspaces } from './store.js';

/* Workspace mode operationalises the symptom → mechanism → action loop:
   pick a Technique (T3), then a Pattern (T2) suggested by that technique's
   composes/skeletonRef, then Atoms (T0/T1) drawn from the patterns picked.

   State shape (per workspace):
   { id, name, problem, t3Id, t2Ids: [], t1Ids: [], notes, code, updatedAt } */

let allCards = [];
let cardMap  = {};
let current  = null;   // working draft

const NEW_DRAFT = () => ({
  id: 'ws-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
  name: '',
  problem: '',
  t3Id: null,
  t2Ids: [],
  t1Ids: [],
  notes: '',
  code: '',
  updatedAt: Date.now(),
});

export function initWorkspace(cards) {
  allCards = cards;
  cardMap  = Object.fromEntries(cards.map(c => [c.id, c]));
  if (!current) current = NEW_DRAFT();
  renderHome();
}

/* ── Home: list of saved workspaces + new button ── */
function renderHome() {
  const el = document.getElementById('workspace-container');
  const saved = getWorkspaces().sort((a, b) => b.updatedAt - a.updatedAt);
  el.innerHTML = `
    <div class="ws-home">
      <div class="ws-header-row">
        <h2>Workspaces</h2>
        <button class="start-btn ws-new-btn">+ New</button>
      </div>
      <p class="ws-lede">
        Walk through a problem the way the cards teach: recognise the symptom,
        recall the mechanism, execute on the atoms.
      </p>
      ${saved.length ? `
        <ul class="ws-list">
          ${saved.map(w => `
            <li class="ws-list-item" data-id="${escHtml(w.id)}">
              <div class="ws-list-name">${escHtml(w.name || 'Untitled')}</div>
              <div class="ws-list-meta">
                ${w.t3Id ? escHtml(cardMap[w.t3Id]?.techniqueName ?? w.t3Id) : 'no technique yet'}
                · ${new Date(w.updatedAt).toLocaleDateString()}
              </div>
              <div class="ws-list-actions">
                <button class="ws-open" data-id="${escHtml(w.id)}">Open</button>
                <button class="ws-export" data-id="${escHtml(w.id)}">Export</button>
                <button class="ws-delete" data-id="${escHtml(w.id)}">Delete</button>
              </div>
            </li>
          `).join('')}
        </ul>
      ` : '<div class="empty-state">No workspaces yet. Start one to walk a problem.</div>'}
    </div>
  `;

  el.querySelector('.ws-new-btn').addEventListener('click', () => {
    current = NEW_DRAFT();
    renderEditor();
  });

  el.querySelectorAll('.ws-open').forEach(b => b.addEventListener('click', e => {
    const id = e.currentTarget.dataset.id;
    const found = getWorkspaces().find(w => w.id === id);
    if (found) { current = { ...NEW_DRAFT(), ...found }; renderEditor(); }
  }));

  el.querySelectorAll('.ws-delete').forEach(b => b.addEventListener('click', e => {
    const id = e.currentTarget.dataset.id;
    if (!confirm('Delete this workspace?')) return;
    saveWorkspaces(getWorkspaces().filter(w => w.id !== id));
    renderHome();
  }));

  el.querySelectorAll('.ws-export').forEach(b => b.addEventListener('click', e => {
    const id = e.currentTarget.dataset.id;
    const found = getWorkspaces().find(w => w.id === id);
    if (found) downloadMarkdown(found);
  }));
}

/* ── Editor ── */
function renderEditor() {
  const el = document.getElementById('workspace-container');
  const t3 = current.t3Id ? cardMap[current.t3Id] : null;

  /* Suggested patterns — pulled from the T3's composes + its skeletonRef. */
  const suggestedT2 = t3 ? new Set([
    ...(t3.composes ?? []).filter(id => cardMap[id]?.tier === '2'),
    ...(t3.skeletonRef ? [t3.skeletonRef] : []),
  ]) : new Set();

  /* Suggested atoms — union of every selected T2's composes (T0/T1 only). */
  const suggestedT1 = new Set();
  for (const id of current.t2Ids) {
    const t2 = cardMap[id];
    for (const cid of (t2?.composes ?? [])) {
      if (['0', '1'].includes(cardMap[cid]?.tier)) suggestedT1.add(cid);
    }
  }

  el.innerHTML = `
    <div class="ws-editor">
      <div class="ws-toolbar">
        <button class="ws-back-btn">← Workspaces</button>
        <input class="ws-name-input" id="ws-name" placeholder="Workspace name…"
               value="${escHtml(current.name)}" />
        <button class="ws-save-btn start-btn">Save</button>
      </div>

      <label class="ws-field-label">Problem</label>
      <textarea class="ws-problem" id="ws-problem" rows="3"
        placeholder="Paste the problem statement…">${escHtml(current.problem)}</textarea>

      <section class="ws-step">
        <header><span class="ws-step-num">1</span> Pick a Technique <span class="ws-tier-tag t3">T3</span></header>
        <input class="ws-typeahead" id="ws-t3-input" placeholder="Search techniques…"
               autocomplete="off" />
        <div class="ws-typeahead-results" id="ws-t3-results"></div>
        <div class="ws-pick" id="ws-t3-pick"></div>
      </section>

      <section class="ws-step">
        <header><span class="ws-step-num">2</span> Pick Patterns <span class="ws-tier-tag t2">T2</span></header>
        ${suggestedT2.size ? `
          <div class="ws-suggested">
            <span class="ws-suggested-label">Suggested by your technique</span>
            <div class="ws-suggested-row">
              ${[...suggestedT2].map(id => suggestedChip(id, current.t2Ids.includes(id))).join('')}
            </div>
          </div>
        ` : ''}
        <input class="ws-typeahead" id="ws-t2-input" placeholder="Search patterns…"
               autocomplete="off" />
        <div class="ws-typeahead-results" id="ws-t2-results"></div>
        <div class="ws-picks" id="ws-t2-picks"></div>
      </section>

      <section class="ws-step">
        <header><span class="ws-step-num">3</span> Pick Atoms <span class="ws-tier-tag t1">T0/T1</span></header>
        ${suggestedT1.size ? `
          <div class="ws-suggested">
            <span class="ws-suggested-label">Suggested by your patterns</span>
            <div class="ws-suggested-row">
              ${[...suggestedT1].map(id => suggestedChip(id, current.t1Ids.includes(id))).join('')}
            </div>
          </div>
        ` : ''}
        <input class="ws-typeahead" id="ws-t1-input" placeholder="Search atoms…"
               autocomplete="off" />
        <div class="ws-typeahead-results" id="ws-t1-results"></div>
        <div class="ws-picks" id="ws-t1-picks"></div>
      </section>

      <label class="ws-field-label">Notes</label>
      <textarea class="ws-notes" id="ws-notes" rows="4"
        placeholder="Reasoning, edge cases, why this technique fits…">${escHtml(current.notes)}</textarea>

      <label class="ws-field-label">Code</label>
      <textarea class="ws-code" id="ws-code" rows="14" spellcheck="false"
        placeholder="Write the solution…">${escHtml(current.code)}</textarea>

      <div class="ws-bottom-actions">
        <button class="ws-export-btn">Export as Markdown</button>
        <button class="ws-save-btn-2 start-btn">Save</button>
      </div>
    </div>
  `;

  /* ── Wire up ── */
  el.querySelector('.ws-back-btn').addEventListener('click', () => {
    syncFromInputs();
    renderHome();
  });
  el.querySelectorAll('.ws-save-btn, .ws-save-btn-2').forEach(b =>
    b.addEventListener('click', () => { syncFromInputs(); persistCurrent(); flashSaved(b); })
  );
  el.querySelector('.ws-export-btn').addEventListener('click', () => {
    syncFromInputs(); downloadMarkdown(current);
  });

  /* Selected card panels */
  renderT3Pick();
  renderT2Picks();
  renderT1Picks();

  /* Typeaheads */
  wireTypeahead('ws-t3-input', 'ws-t3-results', c => c.tier === '3', id => {
    current.t3Id = id;
    /* Reset downstream picks to keep suggestions clean */
    current.t2Ids = [];
    current.t1Ids = [];
    syncFromInputs();
    renderEditor();
  });
  wireTypeahead('ws-t2-input', 'ws-t2-results', c => c.tier === '2', id => {
    if (!current.t2Ids.includes(id)) current.t2Ids.push(id);
    syncFromInputs(); renderEditor();
  });
  wireTypeahead('ws-t1-input', 'ws-t1-results', c => ['0', '1'].includes(c.tier), id => {
    if (!current.t1Ids.includes(id)) current.t1Ids.push(id);
    syncFromInputs(); renderEditor();
  });

  /* Suggested chip clicks toggle inclusion */
  el.querySelectorAll('.ws-suggested-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.id;
      const card = cardMap[id];
      const list = card?.tier === '2' ? current.t2Ids : current.t1Ids;
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.push(id);
      syncFromInputs(); renderEditor();
    });
  });
}

function renderT3Pick() {
  const el = document.getElementById('ws-t3-pick');
  if (!current.t3Id) { el.innerHTML = ''; return; }
  const c = cardMap[current.t3Id];
  if (!c) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="ws-pick-card">
      <div class="ws-pick-head">
        <span class="ws-pick-name">${escHtml(c.techniqueName ?? c.front)}</span>
        <button class="ws-pick-remove" data-tier="3">×</button>
      </div>
      ${c.techniqueGist ? `<div class="ws-pick-gist">${escHtml(c.techniqueGist)}</div>` : ''}
    </div>
  `;
  el.querySelector('.ws-pick-remove').addEventListener('click', () => {
    current.t3Id = null;
    syncFromInputs(); renderEditor();
  });
}

function renderT2Picks() {
  renderPickList('ws-t2-picks', current.t2Ids, id => {
    current.t2Ids = current.t2Ids.filter(x => x !== id);
    syncFromInputs(); renderEditor();
  }, c => c.skeleton);
}

function renderT1Picks() {
  renderPickList('ws-t1-picks', current.t1Ids, id => {
    current.t1Ids = current.t1Ids.filter(x => x !== id);
    syncFromInputs(); renderEditor();
  }, c => c.code);
}

function renderPickList(containerId, ids, onRemove, codeField) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!ids.length) { el.innerHTML = ''; return; }
  el.innerHTML = ids.map(id => {
    const c = cardMap[id];
    if (!c) return '';
    const code = codeField(c);
    return `
      <div class="ws-pick-card">
        <div class="ws-pick-head">
          <span class="ws-pick-name">${escHtml(c.front)}</span>
          <span class="ws-pick-id">${escHtml(c.id)}</span>
          <button class="ws-pick-remove" data-id="${escHtml(id)}">×</button>
        </div>
        ${code ? `<pre class="ws-pick-code">${escHtml(code)}</pre>` : ''}
      </div>
    `;
  }).join('');
  el.querySelectorAll('.ws-pick-remove').forEach(b => {
    b.addEventListener('click', () => onRemove(b.dataset.id));
  });
}

/* ── Typeahead ── */
function wireTypeahead(inputId, resultsId, predicate, onPick) {
  const input   = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;

  const search = q => {
    const ql = q.trim().toLowerCase();
    if (!ql) { results.innerHTML = ''; return; }
    const matches = allCards
      .filter(predicate)
      .map(c => ({ c, score: typeaheadScore(c, ql) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    results.innerHTML = matches.map(({ c }) => `
      <button class="ws-typeahead-result" data-id="${escHtml(c.id)}">
        <span class="ws-typeahead-front">${escHtml(c.techniqueName ?? c.front)}</span>
        <span class="ws-typeahead-id">${escHtml(c.id)}</span>
      </button>
    `).join('');
    results.querySelectorAll('.ws-typeahead-result').forEach(b => {
      b.addEventListener('click', () => {
        onPick(b.dataset.id);
        input.value = '';
        results.innerHTML = '';
      });
    });
  };

  input.addEventListener('input', e => search(e.target.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; results.innerHTML = ''; }
    if (e.key === 'Enter') {
      const first = results.querySelector('.ws-typeahead-result');
      if (first) first.click();
    }
  });
}

function typeaheadScore(c, ql) {
  let s = 0;
  if (c.id?.toLowerCase().includes(ql))            s += 10;
  if (c.techniqueName?.toLowerCase().includes(ql)) s += 8;
  if (c.front?.toLowerCase().includes(ql))         s += 6;
  if (c.technical?.toLowerCase().includes(ql))     s += 4;
  if (c.techniqueGist?.toLowerCase().includes(ql)) s += 3;
  if (c.explanation?.toLowerCase().includes(ql))   s += 2;
  return s;
}

function suggestedChip(id, picked) {
  const c = cardMap[id];
  if (!c) return '';
  return `
    <button class="ws-suggested-chip ${picked ? 'picked' : ''}" data-id="${escHtml(id)}">
      ${picked ? '✓ ' : '+ '}${escHtml(c.front)}
    </button>
  `;
}

/* ── Persistence ── */
function syncFromInputs() {
  const name    = document.getElementById('ws-name');
  const problem = document.getElementById('ws-problem');
  const notes   = document.getElementById('ws-notes');
  const code    = document.getElementById('ws-code');
  if (name)    current.name    = name.value;
  if (problem) current.problem = problem.value;
  if (notes)   current.notes   = notes.value;
  if (code)    current.code    = code.value;
  current.updatedAt = Date.now();
}

function persistCurrent() {
  const all = getWorkspaces();
  const i   = all.findIndex(w => w.id === current.id);
  if (i >= 0) all[i] = current; else all.push(current);
  saveWorkspaces(all);
}

function flashSaved(btn) {
  const original = btn.textContent;
  btn.textContent = 'Saved ✓';
  setTimeout(() => { btn.textContent = original; }, 1200);
}

/* ── Markdown export ── */
function downloadMarkdown(w) {
  const t3   = w.t3Id ? cardMap[w.t3Id] : null;
  const t2s  = w.t2Ids.map(id => cardMap[id]).filter(Boolean);
  const t1s  = w.t1Ids.map(id => cardMap[id]).filter(Boolean);
  const lines = [
    `# ${w.name || 'Workspace'}`,
    '',
    w.problem ? `## Problem\n\n${w.problem}\n` : '',
    t3 ? `## Technique (T3)\n\n**${t3.techniqueName ?? t3.front}** — \`${t3.id}\`\n\n${t3.techniqueGist ?? ''}\n` : '',
    t2s.length ? `## Patterns (T2)\n\n${t2s.map(c =>
      `### ${c.front} — \`${c.id}\`\n\n\`\`\`python\n${c.skeleton ?? ''}\n\`\`\`\n`).join('\n')}` : '',
    t1s.length ? `## Atoms\n\n${t1s.map(c =>
      `- **${c.front}** \`${c.id}\`${c.code ? `\n  \`\`\`python\n  ${c.code.split('\n').join('\n  ')}\n  \`\`\`` : ''}`).join('\n')}\n` : '',
    w.notes ? `## Notes\n\n${w.notes}\n` : '',
    w.code  ? `## Solution\n\n\`\`\`python\n${w.code}\n\`\`\`\n` : '',
  ].filter(Boolean);

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(w.name || 'workspace').replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
