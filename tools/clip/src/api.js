/* api.js — thin fetch wrappers for the clip API. */

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

/**
 * Create a clip.
 * @param {{ content, title, language, expires_in, burn }} opts
 * @returns {{ id, url, content, language, title, expires_at, burn, view_count, created_at } | null}
 */
export async function apiCreateClip({ content, title = '', language = 'text', expires_in = '7d', burn = false }) {
  try {
    const r = await fetch(`${BASE}/api/clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title, language, expires_in, burn }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, error: d.error ?? `HTTP ${r.status}` };
    }
    return { ok: true, data: await r.json() };
  } catch (e) {
    return { ok: false, error: 'Network error — is the API running?' };
  }
}

/**
 * Fetch a clip by ID.
 * @returns {{ id, url, content, language, title, expires_at, burn, view_count, created_at } | null}
 */
export async function apiGetClip(id) {
  try {
    const r = await fetch(`${BASE}/api/clip/${encodeURIComponent(id)}`);
    if (r.status === 404) return { ok: false, error: 'Clip not found.' };
    if (r.status === 410) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, error: d.error ?? 'Clip has expired or been burned.' };
    }
    if (!r.ok) return { ok: false, error: `Server error (${r.status})` };
    return { ok: true, data: await r.json() };
  } catch {
    return { ok: false, error: 'Network error.' };
  }
}

/**
 * Delete a clip. Requires the session cookie (logged-in user only).
 */
export async function apiDeleteClip(id) {
  try {
    const r = await fetch(`${BASE}/api/clip/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return r.ok;
  } catch {
    return false;
  }
}
