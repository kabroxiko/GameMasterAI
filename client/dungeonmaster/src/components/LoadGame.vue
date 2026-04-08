<template>
    <div class="ui-panel game-load-panel">
        <header class="game-load-header">
            <h2 class="game-load-heading">{{ $i18n.load_game }}</h2>
            <p class="game-load-subtitle">{{ $i18n.load_game_subtitle }}</p>
        </header>
        <p v-if="sessionToast" class="game-load-status" :class="sessionToast.variant === 'error' ? 'game-load-error' : ''">
            {{ sessionToast.message }}
        </p>
        <p v-if="loading" class="game-load-status">{{ $i18n.loading }}</p>
        <p v-else-if="error" class="game-load-status game-load-error">{{ error }}</p>
        <p v-else-if="games.length === 0" class="game-load-status game-load-empty">{{ $i18n.load_game_empty }}</p>
        <ul v-else class="game-load-list" role="list">
            <li v-for="game in games" :key="game.gameId" class="game-load-card">
                <div class="game-load-card__main">
                    <router-link class="game-load-card__title-link" :to="`/chat-room/${game.gameId}`">
                        {{ displayTitle(game) }}
                    </router-link>
                    <div class="game-load-meta" aria-label="Table details">
                        <span class="game-load-badge" :class="`game-load-badge--${game.partyPhase || 'lobby'}`">{{
                            phaseLabel(game.partyPhase)
                        }}</span>
                        <span class="game-load-meta__sep" aria-hidden="true">·</span>
                        <span>{{ roleLabel(game) }}</span>
                        <span class="game-load-meta__sep" aria-hidden="true">·</span>
                        <span>{{ interpolate($i18n.load_game_members, game.memberCount) }}</span>
                        <span class="game-load-meta__sep" aria-hidden="true">·</span>
                        <span>{{ interpolate($i18n.load_game_messages, game.messageCount) }}</span>
                        <span class="game-load-meta__sep" aria-hidden="true">·</span>
                        <span>{{ campaignShort(game) }}</span>
                        <span class="game-load-meta__sep" aria-hidden="true">·</span>
                        <span>{{ $i18n.load_game_language }}: {{ game.language }}</span>
                        <template v-if="game.createdAt">
                            <span class="game-load-meta__sep" aria-hidden="true">·</span>
                            <span>{{ $i18n.load_game_created }}: {{ formatCreated(game.createdAt) }}</span>
                        </template>
                    </div>
                </div>
                <div class="game-load-card__actions">
                    <router-link class="ui-button game-load-open" :to="`/chat-room/${game.gameId}`">{{
                        $i18n.load_game_open
                    }}</router-link>
                    <button
                        v-if="game.viewerIsOwner"
                        type="button"
                        class="ui-button ui-button--ghost game-load-delete"
                        :disabled="deletingGameId === game.gameId"
                        :aria-label="$i18n.load_game_delete_aria"
                        @click="deleteGame(game)"
                    >
                        <FontAwesomeIcon :icon="faTrash" class="game-load-delete-icon" aria-hidden="true" />
                        {{ deletingGameId === game.gameId ? $i18n.load_game_deleting : $i18n.load_game_delete }}
                    </button>
                </div>
            </li>
        </ul>
        <Teleport to="body">
            <UIModal v-if="deleteConfirmGame" @close="onDeleteModalDismiss">
                <div
                    class="game-load-delete-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="game-load-delete-modal-title"
                >
                    <h2 id="game-load-delete-modal-title" class="game-load-delete-modal__title">
                        {{ $i18n.load_game_delete_modal_title }}
                    </h2>
                    <p class="game-load-delete-modal__name">{{ displayTitle(deleteConfirmGame) }}</p>
                    <p class="game-load-delete-modal__body">{{ $i18n.load_game_delete_confirm }}</p>
                    <footer class="game-load-delete-modal__footer">
                        <button
                            type="button"
                            class="ui-button ui-button--ghost game-load-delete-modal__btn"
                            :disabled="Boolean(deletingGameId)"
                            @click="onDeleteModalDismiss"
                        >
                            {{ $i18n.load_game_delete_cancel }}
                        </button>
                        <button
                            type="button"
                            class="ui-button game-load-delete game-load-delete-modal__btn game-load-delete-modal__btn--danger"
                            :disabled="Boolean(deletingGameId)"
                            @click="confirmDeleteGame"
                        >
                            {{ deletingGameId ? $i18n.load_game_deleting : $i18n.load_game_delete }}
                        </button>
                    </footer>
                </div>
            </UIModal>
        </Teleport>
    </div>
</template>

<script>
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash';
import { SESSION_CHAT_TOAST } from '@/setupSession.js';
import UIModal from '@/ui/Modal.vue';

export default {
    components: { FontAwesomeIcon, UIModal },
    data() {
        return {
            games: [],
            loading: false,
            error: null,
            sessionToast: null,
            deletingGameId: null,
            deleteConfirmGame: null,
            faTrash,
        };
    },
    watch: {
        deleteConfirmGame(val) {
            this.unbindDeleteModalEsc();
            if (val) this.bindDeleteModalEsc();
        },
    },
    beforeUnmount() {
        this.unbindDeleteModalEsc();
    },
    methods: {
        interpolate(template, n) {
            const v = n != null && !Number.isNaN(Number(n)) ? Number(n) : 0;
            return String(template || '').replace(/\{n\}/g, String(v));
        },
        displayTitle(game) {
            if (!game) return '';
            const t = game.campaignTitle != null ? String(game.campaignTitle).trim() : '';
            if (t) return t;
            return game.gameId || '';
        },
        phaseLabel(phase) {
            const p = phase != null ? String(phase).toLowerCase() : 'lobby';
            if (p === 'starting') return this.$i18n.load_game_phase_starting;
            if (p === 'playing') return this.$i18n.load_game_phase_playing;
            return this.$i18n.load_game_phase_lobby;
        },
        roleLabel(game) {
            if (!game) return '';
            return game.viewerIsOwner ? this.$i18n.load_game_role_host : this.$i18n.load_game_role_guest;
        },
        campaignShort(game) {
            if (!game) return '';
            return game.hasCampaign ? this.$i18n.load_game_campaign_ready : this.$i18n.load_game_no_campaign_yet;
        },
        formatCreated(iso) {
            if (!iso) return '';
            try {
                const d = new Date(iso);
                if (Number.isNaN(d.getTime())) return '';
                const lang = this.$store.state.language && String(this.$store.state.language).toLowerCase();
                const loc = lang && lang.startsWith('span') ? 'es' : 'en';
                return new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
            } catch (e) {
                return '';
            }
        },
        deleteGame(game) {
            if (!game || !game.gameId || !game.viewerIsOwner) return;
            this.deleteConfirmGame = game;
        },
        onDeleteModalDismiss() {
            if (this.deletingGameId) return;
            this.deleteConfirmGame = null;
        },
        bindDeleteModalEsc() {
            document.addEventListener('keydown', this.onDeleteModalEsc);
        },
        unbindDeleteModalEsc() {
            document.removeEventListener('keydown', this.onDeleteModalEsc);
        },
        onDeleteModalEsc(e) {
            if (e.key === 'Escape') this.onDeleteModalDismiss();
        },
        async confirmDeleteGame() {
            const game = this.deleteConfirmGame;
            if (!game || !game.gameId || !game.viewerIsOwner) return;
            const gid = String(game.gameId);
            this.deletingGameId = gid;
            this.error = null;
            try {
                await axios.delete(`/api/game-state/mine/${encodeURIComponent(gid)}`);
                this.games = this.games.filter((g) => g && g.gameId !== gid);
                this.deleteConfirmGame = null;
            } catch (err) {
                const detail =
                    err &&
                    err.response &&
                    err.response.data &&
                    (err.response.data.error || err.response.data.message);
                this.error = detail ? String(detail) : this.$i18n.load_game_delete_error;
                this.deleteConfirmGame = null;
            } finally {
                this.deletingGameId = null;
            }
        },
    },
    async created() {
        try {
            const raw = sessionStorage.getItem(SESSION_CHAT_TOAST);
            if (raw) {
                sessionStorage.removeItem(SESSION_CHAT_TOAST);
                const o = JSON.parse(raw);
                const msg = o && typeof o.message === 'string' ? o.message.trim() : '';
                if (msg) {
                    this.sessionToast = {
                        message: msg,
                        variant: o.variant === 'error' ? 'error' : 'success',
                    };
                }
            }
        } catch (e) {
            /* ignore */
        }
        if (!this.$store.getters.isAuthenticated) {
            this.loading = false;
            return;
        }
        this.loading = true;
        try {
            const response = await axios.get('/api/game-state/mine');
            const data = response.data;
            this.games = Array.isArray(data) ? data : [];
        } catch (error) {
            this.error = this.$i18n.load_game_error;
        } finally {
            this.loading = false;
        }
    },
};
</script>

<style scoped>
.game-load-panel {
    padding: 1.35rem 1.5rem 1.75rem;
    width: 100%;
    max-width: min(100%, var(--gm-app-column-max, 980px));
    margin: 0 auto;
    box-sizing: border-box;
}

.game-load-header {
    margin-bottom: 1.1rem;
}

.game-load-heading {
    margin: 0 0 0.35rem 0;
    font-family: var(--gm-font-serif, Georgia, serif);
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--gm-text, #e6e1d8);
    letter-spacing: 0.02em;
}

.game-load-subtitle {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.45;
    color: var(--gm-muted, #9a8f85);
}

.game-load-status {
    margin: 0 0 0.75rem 0;
    color: var(--gm-text, #e6e1d8);
    font-size: 1rem;
    line-height: 1.5;
}

.game-load-error {
    color: #ffb4a8;
}

.game-load-empty {
    color: var(--gm-muted, #9a8f85);
    font-style: italic;
}

.game-load-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.game-load-card {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px 16px;
    padding: 1rem 1.1rem;
    border-radius: 12px;
    border: 1px solid rgba(212, 180, 106, 0.18);
    background: linear-gradient(165deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.22));
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
}

.game-load-card__main {
    flex: 1 1 220px;
    min-width: 0;
}

.game-load-card__title-link {
    display: inline-block;
    margin: 0 0 0.4rem 0;
    font-family: var(--gm-font-serif, Georgia, serif);
    font-size: 1.12rem;
    font-weight: 700;
    color: #f2e6c9;
    text-decoration: none;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
    line-height: 1.3;
}

.game-load-card__title-link:hover {
    color: #fffdf6;
    text-decoration: underline;
    text-decoration-color: rgba(255, 253, 246, 0.5);
}

.game-load-card__title-link:focus-visible {
    outline: 2px solid rgba(255, 220, 160, 0.95);
    outline-offset: 3px;
    border-radius: 4px;
}

.game-load-meta {
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--gm-muted, #9a8f85);
    flex-wrap: wrap;
}

.game-load-meta__sep {
    margin: 0 0.2rem;
    opacity: 0.65;
}

.game-load-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(230, 225, 216, 0.92);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.game-load-badge--lobby {
    border-color: rgba(212, 180, 106, 0.35);
    color: rgba(212, 180, 106, 0.95);
}

.game-load-badge--starting {
    border-color: rgba(120, 180, 255, 0.4);
    color: rgba(180, 210, 255, 0.95);
}

.game-load-badge--playing {
    border-color: rgba(120, 200, 150, 0.45);
    color: rgba(190, 235, 200, 0.95);
}

.game-load-card__actions {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.game-load-open {
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 14px;
    font-size: 0.92rem;
}

.game-load-delete {
    min-height: 40px;
    padding: 0 12px;
    font-size: 0.88rem;
    border-color: rgba(255, 120, 100, 0.45);
    color: rgba(255, 200, 190, 0.95);
}

.game-load-delete:hover:not(:disabled) {
    border-color: rgba(255, 160, 140, 0.65);
    color: #fff;
}

.game-load-delete:disabled {
    opacity: 0.65;
    cursor: not-allowed;
}

.game-load-delete-icon {
    width: 0.85rem;
    height: 0.85rem;
    margin-right: 0.35rem;
    vertical-align: -0.08em;
}

.game-load-delete-modal {
    padding: 0.25rem 0.35rem 0.15rem 0;
    max-width: min(100%, 26rem);
}

.game-load-delete-modal__title {
    margin: 0 0 0.5rem 0;
    font-family: var(--gm-font-serif, Georgia, serif);
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--gm-text, #e6e1d8);
    padding-right: 2rem;
}

.game-load-delete-modal__name {
    margin: 0 0 0.65rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #f2e6c9;
    line-height: 1.35;
    word-break: break-word;
}

.game-load-delete-modal__body {
    margin: 0 0 1.15rem 0;
    font-size: 0.92rem;
    line-height: 1.5;
    color: var(--gm-muted, #9a8f85);
}

.game-load-delete-modal__footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
}

.game-load-delete-modal__btn {
    min-height: 40px;
    padding: 0 14px;
    font-size: 0.9rem;
}

.game-load-delete-modal__btn--danger {
    border-color: rgba(255, 120, 100, 0.45);
    color: rgba(255, 200, 190, 0.95);
}

.game-load-delete-modal__btn--danger:hover:not(:disabled) {
    border-color: rgba(255, 160, 140, 0.65);
    color: #fff;
}
</style>
