/**
 * Build a shareable invite URL: /join-party/:token (public, token trimmed).
 * @param {import('vue-router').Router} router
 * @param {string} inviteToken from POST /api/game-session/create-invite
 * @param {string} [origin] default: `window.location.origin` in browser
 */
export function absoluteInviteUrl(router, inviteToken, origin) {
    const token = String(inviteToken || '').trim();
    if (!token) return '';
    const base =
        origin != null && origin !== ''
            ? String(origin).replace(/\/$/, '')
            : typeof window !== 'undefined'
              ? window.location.origin
              : '';
    const rel = router.resolve({ name: 'JoinParty', params: { token } }).href;
    try {
        return new URL(rel, base || 'http://localhost').href;
    } catch (e) {
        const path = rel.startsWith('/') ? rel : `/${rel}`;
        return `${base}${path}`;
    }
}
