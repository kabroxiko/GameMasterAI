/**
 * API origin for axios and EventSource (VUE_APP_DM_API_BASE / DM_API_BASE at build time).
 * Empty string means same origin as the SPA (reverse proxy or devServer proxy).
 */
export function resolveApiBaseURL() {
    const fromEnv = process.env.VUE_APP_DM_API_BASE || process.env.DM_API_BASE;
    if (fromEnv && String(fromEnv).trim()) {
        return String(fromEnv).trim().replace(/\/$/, '');
    }
    return '';
}

/**
 * EventSource URL for game-state push (SSE GET /api/game-state/events/:gameId).
 * Uses `access_token` query — EventSource cannot send Authorization in all browsers.
 * @param {string} gameId
 * @param {string} accessToken
 * @returns {string}
 */
export function resolveGameStateEventsUrl(gameId, accessToken) {
    const gid = gameId != null ? String(gameId).trim() : '';
    const tok = accessToken != null ? String(accessToken).trim() : '';
    if (!gid || !tok) return '';
    const base = resolveApiBaseURL() || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!base) return '';
    try {
        const u = new URL(base);
        const full = new URL(`/api/game-state/events/${encodeURIComponent(gid)}`, u.origin);
        full.searchParams.set('access_token', tok);
        return full.toString();
    } catch (e) {
        return '';
    }
}
