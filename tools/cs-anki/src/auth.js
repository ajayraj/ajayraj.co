/* auth.js — login/register modal and header auth chip.
   Exports initAuth(onLogin, onLogout) which wires the header button and
   handles the full login/register flow. */

import { apiLogin, apiRegister, apiLogout } from './api.js';
import { setUser, clearUser, getUser } from './store.js';

let _onLogin  = null;
let _onLogout = null;

/* ── Public API ───────────────────────────────────────────────────────── */

export function initAuth(onLogin, onLogout) {
  _onLogin  = onLogin;
  _onLogout = onLogout;

  document.getElementById('auth-btn').addEventListener('click', () => {
    if (getUser()) {
      showLogoutConfirm();
    } else {
      showModal('login');
    }
  });
}

/** Called from main.js after apiMe() resolves on boot. */
export function setAuthState(user) {
  if (user) {
    setUser(user);
    renderAuthBtn(user.username);
  } else {
    clearUser();
    renderAuthBtn(null);
  }
}

/* ── Header chip ──────────────────────────────────────────────────────── */

function renderAuthBtn(username) {
  const btn = document.getElementById('auth-btn');
  if (!btn) return;
  if (username) {
    btn.textContent = username;
    btn.title = 'Signed in — click to sign out';
    btn.classList.add('auth-logged-in');
  } else {
    btn.textContent = 'Log in';
    btn.title = 'Log in or create an account';
    btn.classList.remove('auth-logged-in');
  }
}

/* ── Modal ────────────────────────────────────────────────────────────── */

function showModal(mode) {
  removeModal();

  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-modal" id="auth-modal" role="dialog" aria-modal="true">
      <button class="auth-close" id="auth-close" aria-label="Close">✕</button>
      <div id="auth-modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) removeModal();
  });
  document.getElementById('auth-close').addEventListener('click', removeModal);
  document.addEventListener('keydown', handleEsc);

  renderForm(mode);
}

function renderForm(mode) {
  const body  = document.getElementById('auth-modal-body');
  const isReg = mode === 'register';

  body.innerHTML = `
    <h2 class="auth-title">${isReg ? 'Create account' : 'Sign in'}</h2>
    <form class="auth-form" id="auth-form" novalidate>
      <label class="auth-label">
        Username
        <input class="auth-input" type="text" id="auth-username"
          autocomplete="${isReg ? 'username' : 'username'}"
          maxlength="32" required />
      </label>
      <label class="auth-label">
        Password
        <input class="auth-input" type="password" id="auth-password"
          autocomplete="${isReg ? 'new-password' : 'current-password'}"
          required />
      </label>
      <div class="auth-error hidden" id="auth-error"></div>
      <button class="auth-submit" type="submit">
        ${isReg ? 'Create account' : 'Sign in'}
      </button>
    </form>
    <p class="auth-switch">
      ${isReg
        ? 'Already have an account? <button class="auth-switch-btn" id="auth-switch">Sign in</button>'
        : 'No account yet? <button class="auth-switch-btn" id="auth-switch">Create one</button>'
      }
    </p>
  `;

  document.getElementById('auth-username').focus();

  document.getElementById('auth-form').addEventListener('submit', e => {
    e.preventDefault();
    handleSubmit(mode);
  });

  document.getElementById('auth-switch').addEventListener('click', () => {
    renderForm(isReg ? 'login' : 'register');
  });
}

async function handleSubmit(mode) {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const submitEl = document.querySelector('.auth-submit');

  if (!username || !password) {
    showErr('Username and password are required.');
    return;
  }

  submitEl.disabled = true;
  submitEl.textContent = mode === 'register' ? 'Creating…' : 'Signing in…';
  errEl.classList.add('hidden');

  const result = mode === 'register'
    ? await apiRegister(username, password)
    : await apiLogin(username, password);

  submitEl.disabled = false;
  submitEl.textContent = mode === 'register' ? 'Create account' : 'Sign in';

  if (!result.ok) {
    showErr(result.data?.error ?? 'Something went wrong. Try again.');
    return;
  }

  const user = { username: result.data.username };
  setUser(user);
  renderAuthBtn(user.username);
  removeModal();
  _onLogin?.(user);
}

function showLogoutConfirm() {
  removeModal();
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-modal auth-modal-sm" id="auth-modal" role="dialog" aria-modal="true">
      <button class="auth-close" id="auth-close" aria-label="Close">✕</button>
      <h2 class="auth-title">Sign out?</h2>
      <p class="auth-sub">Signed in as <strong>${getUser()?.username}</strong>.<br>
        Your progress is saved on the server.</p>
      <div class="auth-actions">
        <button class="auth-submit auth-submit-outline" id="auth-cancel">Cancel</button>
        <button class="auth-submit" id="auth-confirm-logout">Sign out</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) removeModal(); });
  document.getElementById('auth-close').addEventListener('click', removeModal);
  document.getElementById('auth-cancel').addEventListener('click', removeModal);
  document.addEventListener('keydown', handleEsc);

  document.getElementById('auth-confirm-logout').addEventListener('click', async () => {
    await apiLogout();
    clearUser();
    renderAuthBtn(null);
    removeModal();
    _onLogout?.();
  });
}

function showErr(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function removeModal() {
  document.getElementById('auth-overlay')?.remove();
  document.removeEventListener('keydown', handleEsc);
}

function handleEsc(e) {
  if (e.key === 'Escape') removeModal();
}
