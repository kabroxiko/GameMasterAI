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
 * WebSocket URL for game-state push (same `access_token` query pattern as SSE).
 * @param {string} gameId
 * @param {string} accessToken
 * @returns {string}
 */
export function resolveGameStateWebSocketUrl(gameId, accessToken) {
    const gid = gameId != null ? String(gameId).trim() : '';
    const tok = accessToken != null ? String(accessToken).trim() : '';
    if (!gid || !tok) return '';
    const base = resolveApiBaseURL() || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!base) return '';
    try {
        const u = new URL(base);
        const wsScheme = u.protocol === 'https:' ? 'wss:' : 'ws:';
        const full = new URL(`/api/game-state/ws/${encodeURIComponent(gid)}`, `${wsScheme}//${u.host}`);
        full.searchParams.set('access_token', tok);
        return full.toString();
    } catch (e) {
        return '';
    }
}
