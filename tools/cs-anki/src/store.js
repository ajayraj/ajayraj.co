const PROGRESS_KEY  = 'cs-anki-progress-v1';
const THEME_KEY     = 'cs-anki-theme';
const REVEALED_KEY  = 'cs-anki-revealed-v1';
const MODE_KEY      = 'cs-anki-mode';
const ONBOARDED_KEY = 'cs-anki-onboarded-v1';
const WORKSPACE_KEY = 'cs-anki-workspaces-v1';

export function getProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) ?? {}; }
  catch { return {}; }
}

export function getCardProgress(id) {
  return getProgress()[id] ?? null;
}

export function saveCardProgress(id, update) {
  const all = getProgress();
  all[id] = { ...(all[id] ?? {}), ...update };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
}

export function getTheme() {
  return localStorage.getItem(THEME_KEY) ?? 'dark';
}

export function saveTheme(t) {
  localStorage.setItem(THEME_KEY, t);
}

export function getRevealed() {
  try { return new Set(JSON.parse(localStorage.getItem(REVEALED_KEY)) ?? []); }
  catch { return new Set(); }
}

export function saveRevealed(set) {
  localStorage.setItem(REVEALED_KEY, JSON.stringify([...set]));
}

export function getMode() {
  return localStorage.getItem(MODE_KEY) ?? 'browse';
}

export function saveMode(m) {
  localStorage.setItem(MODE_KEY, m);
}

export function isOnboarded() {
  return localStorage.getItem(ONBOARDED_KEY) === '1';
}

export function markOnboarded() {
  localStorage.setItem(ONBOARDED_KEY, '1');
}

export function getWorkspaces() {
  try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY)) ?? []; }
  catch { return []; }
}

export function saveWorkspaces(ws) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
}

/* SM-2 simplified: returns updated progress object for a card. */
export function computeNext(existing, rating) {
  const now = Date.now();
  const prev = existing ?? { interval: 0, streak: 0 };

  let interval, streak;
  if (rating === 'got_it') {
    interval = prev.interval ? Math.min(prev.interval * 2.5, 30 * 24) : 24;
    streak   = (prev.streak ?? 0) + 1;
  } else if (rating === 'almost') {
    interval = prev.interval ? Math.max(prev.interval * 1.2, 12) : 12;
    streak   = prev.streak ?? 0;
  } else {
    interval = 1;
    streak   = 0;
  }

  return { lastSeen: now, interval, nextDue: now + interval * 3_600_000, streak, lastRating: rating };
}
