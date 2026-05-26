/* store.js — state management layer.
   When a user is logged in, progress is backed by the server and held in
   memory. When offline or logged out, localStorage is the fallback.
   Components should call getCardProgress/saveCardProgress without knowing
   which layer is active. */

/* ── Keys ─────────────────────────────────────────────────────────────── */

const PROGRESS_KEY  = 'cs-anki-progress-v1';
const THEME_KEY     = 'cs-anki-theme';
const MODE_KEY      = 'cs-anki-mode';
const ONBOARDED_KEY = 'cs-anki-onboarded-v1';
const WORKSPACE_KEY = 'cs-anki-workspaces-v1';

/* ── Auth state ───────────────────────────────────────────────────────── */

let _user         = null;  // { username, user_id } | null
let _serverProg   = null;  // server progress map or null (not loaded)

export function getUser()       { return _user; }
export function isLoggedIn()    { return _user !== null; }

export function setUser(u)      { _user = u; }
export function clearUser()     { _user = null; _serverProg = null; }

/** Called on boot after fetching /api/anki/progress. Replaces localStorage. */
export function setServerProgress(map_) { _serverProg = map_ ?? {}; }

/* ── Progress (card SM-2 state) ───────────────────────────────────────── */

export function getProgress() {
  if (_serverProg !== null) return _serverProg;
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) ?? {}; }
  catch { return {}; }
}

export function getCardProgress(id) {
  return getProgress()[id] ?? null;
}

/**
 * Update the in-memory (or localStorage) progress cache immediately.
 * The actual server call is fire-and-forget from the calling component —
 * this just keeps the local view consistent so the session queue doesn't
 * show a card as "new" again in the same tab.
 */
export function saveCardProgress(id, update) {
  if (_serverProg !== null) {
    _serverProg[id] = { ...(_serverProg[id] ?? {}), ...update };
  } else {
    const all = getProgress();
    all[id] = { ...(all[id] ?? {}), ...update };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  }
}

/* ── SM-2 ─────────────────────────────────────────────────────────────── */

/**
 * Computes the next SM-2 state locally (used for localStorage path and for
 * immediate in-memory update while the server call is in flight).
 * rating: 'got_it' | 'almost' | 'no'
 */
export function computeNext(existing, rating) {
  const ef0  = existing?.ease_factor  ?? 2.5;
  const rep0 = existing?.repetitions  ?? 0;
  const int0 = existing?.interval_days ?? 1;

  const q = rating === 'got_it' ? 5 : rating === 'almost' ? 3 : 1;

  let ef       = ef0;
  let rep      = rep0;
  let interval = int0;

  if (q < 3) {
    rep      = 0;
    interval = 1;
  } else {
    switch (rep) {
      case 0:  interval = 1;   break;
      case 1:  interval = 6;   break;
      default: interval = Math.round(interval * ef); break;
    }
    rep++;
  }

  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;
  ef = Math.round(ef * 1000) / 1000;

  const nextReview = new Date(Date.now() + interval * 86_400_000)
    .toISOString().slice(0, 10);

  return {
    card_id:       existing?.card_id,
    interval_days: interval,
    ease_factor:   ef,
    repetitions:   rep,
    next_review:   nextReview,
    last_rating:   rating,
    last_reviewed: new Date().toISOString(),
  };
}

/** Returns true if a card is due for review today. */
export function isDue(id) {
  const p = getCardProgress(id);
  if (!p || !p.next_review) return false;
  return p.next_review <= new Date().toISOString().slice(0, 10);
}

/** Returns true if this card has never been reviewed. */
export function isUnseen(id) {
  return !getProgress()[id];
}

/* ── Daily new-card budget tracking ──────────────────────────────────── */

const DAILY_NEW_KEY = 'cs-anki-daily-new-v1';

/** Returns how many new (unseen) cards have been drilled today. */
export function getDailyNewDrilled() {
  try {
    const d = JSON.parse(localStorage.getItem(DAILY_NEW_KEY));
    const today = new Date().toISOString().slice(0, 10);
    return (d?.date === today ? d.count : 0) ?? 0;
  } catch { return 0; }
}

/** Adds n to today's new-card drill count (persists across page reloads). */
export function addDailyNewDrilled(n) {
  const today = new Date().toISOString().slice(0, 10);
  const prev  = getDailyNewDrilled();
  localStorage.setItem(DAILY_NEW_KEY, JSON.stringify({ date: today, count: prev + n }));
}

/* ── Preferences ─────────────────────────────────────────────────────── */

export function getTheme()  { return localStorage.getItem(THEME_KEY) ?? 'dark'; }
export function saveTheme(t) { localStorage.setItem(THEME_KEY, t); }

export function getMode()   { return localStorage.getItem(MODE_KEY) ?? 'browse'; }
export function saveMode(m) { localStorage.setItem(MODE_KEY, m); }

export function isOnboarded()  { return localStorage.getItem(ONBOARDED_KEY) === '1'; }
export function markOnboarded() { localStorage.setItem(ONBOARDED_KEY, '1'); }

export function getWorkspaces() {
  try { return JSON.parse(localStorage.getItem(WORKSPACE_KEY)) ?? []; }
  catch { return []; }
}
export function saveWorkspaces(ws) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
}
