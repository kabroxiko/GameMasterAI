import { h } from 'vue';
import { createRouter, createWebHistory, RouterLink } from 'vue-router';
import HomePath from './components/HomePath.vue';
import ChatRoom from "./components/ChatRoom.vue";
import store from "./store"; // Import the Vuex store
import SetupForm from '@/components/SetupForm.vue';
import LoadGame from '@/components/LoadGame.vue';
import JoinGame from '@/components/JoinGame.vue';
import ChooseNickname from '@/components/ChooseNickname.vue';

/** Shown when the URL path does not match any route (often a `publicPath` / hosting base mismatch). */
const UnknownRouteFallback = {
    render() {
        return h('div', { class: 'ui-panel', style: { maxWidth: '560px', margin: '1rem auto', padding: '1.5rem' } }, [
            h('h2', { class: 'ui-heading', style: { marginTop: 0, marginBottom: '0.75rem' } }, 'This page could not be opened'),
            h(
                'p',
                {
                    style: {
                        color: 'var(--gm-text, #e6e1d8)',
                        lineHeight: '1.55',
                        margin: '0 0 1rem 0',
                        fontSize: '1rem',
                    },
                },
                'The app loaded, but this address does not match any screen. If you opened an invite link, the site may be hosted under a path (for example /games/) that is not configured in the build — set publicPath in vue.config.js to match, then rebuild. Invites use /join-party/ followed by the token. You can go home, sign in, and ask the host for a fresh link.'
            ),
            h(
                RouterLink,
                {
                    to: { name: 'HomePath' },
                    class: 'ui-button',
                    style: { display: 'inline-block', textDecoration: 'none', textAlign: 'center' },
                },
                () => 'Home'
            ),
        ]);
    },
};

function routeIsPublic(to) {
    return to.matched.some((record) => record.meta.public === true);
}

const routes = [
    {
        path: '/',
        name: 'HomePath',
        component: HomePath,
        meta: { public: true },
    },
    {
        path: '/choose-nickname',
        name: 'ChooseNickname',
        component: ChooseNickname,
        meta: { requiresAuth: true },
    },
    {
        path: '/change-nickname',
        name: 'ChangeNickname',
        component: ChooseNickname,
        meta: { requiresAuth: true },
    },
    {
        path: "/chat-room",
        name: "ChatRoom",
        component: ChatRoom,
        meta: { requiresSetup: true, requiresAuth: true },
    },
    {
        path: "/setup",
        name: "Setup",
        component: SetupForm,
        meta: { requiresAuth: true },
    },
    {
        path: '/load-game',
        name: 'LoadGame',
        component: LoadGame,
        meta: { requiresAuth: true },
    },
    /** Shareable invite URL (public): /join-party/<token> → POST /api/auth/join → party lobby (/chat-room/:id). */
    {
        path: '/join-party/:token',
        name: 'JoinParty',
        component: JoinGame,
        meta: { public: true },
    },
    {
        path: '/chat-room/:id',
        name: 'ChatRoomWithId',
        component: ChatRoom,
        meta: { requiresAuth: true },
    },
    {
        path: '/:pathMatch(.*)*',
        name: 'UnknownRouteFallback',
        component: UnknownRouteFallback,
        meta: { public: true },
    },
];

const router = createRouter({
    // Must match vue.config.js `publicPath` (Vue CLI sets process.env.BASE_URL).
    history: createWebHistory(process.env.BASE_URL || '/'),
    routes,
});

router.beforeEach((to, from, next) => {
    const authed = store.getters.isAuthenticated;
    const needNick = authed && store.getters.needsNickname;

    if (!authed && (to.name === 'ChooseNickname' || to.name === 'ChangeNickname')) {
        next({ name: 'HomePath' });
        return;
    }

    if (!authed && !routeIsPublic(to)) {
        next({ name: 'HomePath' });
        return;
    }

    if (needNick && to.name !== 'ChooseNickname') {
        const q = to.name === 'ChangeNickname' ? {} : { redirect: to.fullPath };
        next({ name: 'ChooseNickname', query: q });
        return;
    }

    if (to.name === 'ChooseNickname' && authed && !store.getters.needsNickname) {
        next({ name: 'LoadGame' });
        return;
    }

    if (authed && to.name === 'HomePath') {
        next({ name: 'LoadGame' });
        return;
    }

    const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);
    const requiresSetup = to.matched.some((record) => record.meta.requiresSetup);

    if (requiresAuth && !store.getters.isAuthenticated) {
        next({ name: 'HomePath' });
        return;
    }
    if (requiresSetup && !store.state.gameSetup) {
        next({ name: 'HomePath' });
        return;
    }
    next();
});

export default router;
