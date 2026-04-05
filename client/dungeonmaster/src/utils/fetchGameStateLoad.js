import axios from 'axios';

/** @type {Map<string, Promise<import('axios').AxiosResponse>>} */
const inflightByGameId = new Map();

/**
 * GET /api/game-state/load/:gameId. Concurrent callers (SetupForm, ChatRoom, etc.)
 * share one in-flight request per gameId.
 *
 * @param {string} gameId
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function fetchGameStateLoad(gameId) {
    const gid = gameId != null ? String(gameId).trim() : '';
    if (!gid) {
        return Promise.reject(new Error('fetchGameStateLoad: missing gameId'));
    }
    let p = inflightByGameId.get(gid);
    if (!p) {
        p = axios.get(`/api/game-state/load/${encodeURIComponent(gid)}`).finally(() => {
            if (inflightByGameId.get(gid) === p) {
                inflightByGameId.delete(gid);
            }
        });
        inflightByGameId.set(gid, p);
    }
    return p;
}
