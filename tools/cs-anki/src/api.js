/* API client — thin wrappers over fetch() for every server endpoint.
   All calls use credentials:'include' so the session cookie travels with them.
   Returns null on network/auth failure rather than throwing, so callers can
   treat null as "not logged in / unavailable" and fall back gracefully. */

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

async function post(path, body) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status, data: await r.json() };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function get(path) {
  try {
    const r = await fetch(`${BASE}${path}`, { credentials: 'include' });
    return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/* ── Auth ─────────────────────────────────────────────────────────────── */

export async function apiRegister(username, password) {
  return post('/api/auth/register', { username, password });
}

export async function apiLogin(username, password) {
  return post('/api/auth/login', { username, password });
}

export async function apiLogout() {
  return post('/api/auth/logout', {});
}

/** Returns { username, user_id } or null if not authenticated. */
export async function apiMe() {
  const { ok, data } = await get('/api/auth/me');
  return ok ? data : null;
}

/* ── Anki ─────────────────────────────────────────────────────────────── */

/**
 * Returns { review_card_ids, seen_card_ids, new_budget } for today's session.
 * The frontend combines this with allCards to build the actual queue.
 */
export async function apiGetSession() {
  const { ok, data } = await get('/api/anki/session');
  return ok ? data : null;
}

/**
 * Submits a card review. rating: 'got_it' | 'almost' | 'no'
 * mode: 'drill' | 'quiz' — recorded in the review log for history.
 * Returns the updated SM-2 state row or null on failure.
 */
export async function apiSubmitReview(cardId, rating, mode = 'drill') {
  const { ok, data } = await post('/api/anki/review', { card_id: cardId, rating, mode });
  return ok ? data : null;
}

/**
 * Returns per-card review history summary:
 * { [card_id]: { count, modes, last_seen } }
 */
export async function apiGetCardHistory() {
  const { ok, data } = await get('/api/anki/history');
  return ok ? data : null;
}

/**
 * Returns a progress map keyed by card_id:
 * { [card_id]: { interval_days, ease_factor, repetitions, next_review, ... } }
 */
export async function apiGetProgress() {
  const { ok, data } = await get('/api/anki/progress');
  return ok ? data : null;
}

/**
 * Returns per-category mastery stats:
 * { [category]: { seen, mean_ease, total_reps, due } }
 */
export async function apiGetMastery() {
  const { ok, data } = await get('/api/anki/mastery');
  return ok ? data : null;
}
