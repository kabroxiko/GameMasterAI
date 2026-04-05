// api.js — optional axios instance (align with main.js base URL rules).
import axios from 'axios';

function resolveApiBasePath() {
    const fromEnv = process.env.VUE_APP_DM_API_BASE || process.env.DM_API_BASE;
    if (fromEnv && String(fromEnv).trim()) {
        return `${String(fromEnv).trim().replace(/\/$/, '')}/api`;
    }
    return '/api';
}

const api = axios.create({
    baseURL: resolveApiBasePath(),
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
