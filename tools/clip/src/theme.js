/* theme.js — dark/light toggle shared across create + view. */

const THEME_KEY = 'clip-theme';

export function getTheme() {
  return localStorage.getItem(THEME_KEY) ?? 'dark';
}

export function saveTheme(t) {
  localStorage.setItem(THEME_KEY, t);
}

export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
}

/** Wire a theme toggle button. Call once per render. */
export function wireTheme(btn) {
  if (!btn) return;
  const t = getTheme();
  updateBtn(btn, t);

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
    updateBtn(btn, next);
  });
}

function updateBtn(btn, t) {
  btn.textContent = t === 'dark' ? '☀︎' : '☽';
}
