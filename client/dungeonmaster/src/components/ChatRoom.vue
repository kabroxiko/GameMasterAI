// GMAI/client/dungeonmaster/src/components/ChatRoom.vue

<template>
    <div v-if="errorMessage" class="error-message">
        <p>Error: {{ errorMessage }}</p>
        <button @click="tryAgain">Try again</button>
    </div>
    <div v-else-if="isPartyLobby" class="party-lobby chat-room">
        <header class="chat-room__header">
            <!-- No manual sync button in lobby; reload the page if needed. -->
            <div class="campaign-heading-row">
                <h2 class="campaign-heading">{{ $i18n.lobby_title }}</h2>
                <button
                    v-if="!partyLobbyActionsFrozen && canShareInviteLink"
                    type="button"
                    class="app-banner__tool chat-room__invite-tool"
                    :disabled="inviteLoading"
                    :aria-busy="inviteLoading"
                    :title="$i18n.invite_players"
                    :aria-label="$i18n.invite_players"
                    @click="copyInviteLink"
                >
                    <span class="visually-hidden">{{ $i18n.invite_players }}</span>
                    <FontAwesomeIcon :icon="faUserPlus" class="ui-icon ui-icon--toolbar" aria-hidden="true" />
                </button>
            </div>
            <p class="party-lobby__desc">{{ $i18n.lobby_desc }}</p>
        </header>
        <p v-if="lobbyError" class="party-lobby__err" role="alert">{{ lobbyError }}</p>
        <p v-if="partyPhase === 'starting'" class="party-lobby__status" role="status">{{ $i18n.lobby_starting }}</p>
        <ul class="party-lobby__list" aria-label="Lobby members">
            <li v-if="lobbyMemberRows.length" class="party-lobby__item party-lobby__item--head" aria-hidden="true">
                <span class="party-lobby__name" />
                <span class="party-lobby__flags party-lobby__flags--head">
                    <span class="party-lobby__flag-cell party-lobby__flag-label">{{ $i18n.lobby_col_sheet }}</span>
                    <span class="party-lobby__flag-cell party-lobby__flag-label">{{ $i18n.lobby_col_table }}</span>
                </span>
            </li>
            <li v-for="row in lobbyMemberRows" :key="row.id" class="party-lobby__item">
                <div class="party-lobby__identity">
                    <span class="party-lobby__name">{{ row.display }}</span>
                    <span v-if="row.detailsLine" class="party-lobby__meta">{{ row.detailsLine }}</span>
                </div>
                <span class="party-lobby__flags">
                    <span class="party-lobby__flag-cell" :class="row.hasSheet ? 'ok' : 'miss'">{{
                        row.hasSheet ? $i18n.lobby_sheet_ok : $i18n.lobby_sheet_missing
                    }}</span>
                    <span class="party-lobby__flag-cell" :class="row.isReady ? 'ok' : 'miss'">{{
                        row.isReady ? $i18n.lobby_ready_confirmed : $i18n.lobby_ready_waiting
                    }}</span>
                </span>
            </li>
        </ul>
        <UIButton
            v-if="showLobbyCharacterEditCta"
            type="button"
            class="party-lobby__open-setup chat-toolbar__secondary"
            @click="openLobbyCharacterEditor"
        >{{ $i18n.lobby_edit_character_cta }}</UIButton>
        <section
            v-if="showLobbyCharacterSetupPanel"
            class="party-lobby__setup"
            :aria-label="$i18n.lobby_setup_section_aria"
        >
            <SetupForm
                lobby-inline
                :lobby-interactions-locked="partyLobbyActionsFrozen"
                @lobby-character-done="onLobbyInlineCharacterDone"
            />
        </section>
        <p v-if="lastStartError" class="party-lobby__warn">{{ $i18n.lobby_last_error }}: {{ lastStartError }}</p>
        <FloatingCard v-if="playerCharacter" :character="playerCharacter" :hp-snapshot="playerHitPoints" :defaultOpen="false" />
    </div>
    <div v-else class="chat-room two-column">
        <header class="chat-room__header">
            <!-- Intentionally no "sync / Sincronizar" control — reload the browser to pull latest state. -->
            <div
                v-if="campaignTitle || canShareInviteLink"
                class="campaign-heading-row"
                :class="{ 'campaign-heading-row--no-title': !campaignTitle }"
            >
                <h2 v-if="campaignTitle" class="campaign-heading">{{ campaignTitle }}</h2>
                <button
                    v-if="canShareInviteLink"
                    type="button"
                    class="app-banner__tool chat-room__invite-tool"
                    :disabled="inviteLoading"
                    :aria-busy="inviteLoading"
                    :title="$i18n.invite_players"
                    :aria-label="$i18n.invite_players"
                    @click="copyInviteLink"
                >
                    <span class="visually-hidden">{{ $i18n.invite_players }}</span>
                    <FontAwesomeIcon :icon="faUserPlus" class="ui-icon ui-icon--toolbar" aria-hidden="true" />
                </button>
            </div>
            <div v-if="partyRosterRows.length > 1" class="party-roster" role="status" :aria-label="$i18n.party_heading">
                <div class="party-roster__head">
                    <span class="party-roster__title">{{ $i18n.party_heading }}</span>
                    <span class="party-roster__count">{{ partyRosterRows.length }}</span>
                </div>
                <ul class="party-roster__list">
                    <li v-for="row in partyRosterRows" :key="row.id" class="party-roster__item" :class="{ 'party-roster__item--you': row.isYou }">
                        <span class="party-roster__name">{{ row.display }}</span>
                        <span v-if="row.detailsLine" class="party-roster__meta">{{ row.detailsLine }}</span>
                    </li>
                </ul>
                <p class="party-roster__tip">{{ $i18n.party_sync_tip }}</p>
            </div>
        </header>
        <!-- floating card handled globally -->
        <div ref="transcriptRoot" class="chat-messages-container chat-room__transcript">
            <ChatMessage
              v-for="(message, index) in messages"
              :key="index"
              :message="renderMarkdown(message.text)"
              :sender="message.user"
              :role="message.role === 'player' ? 'player' : 'dm'"
            />
        </div>
        <p v-if="partyRoundWaitingOthersForViewer && !errorMessage" class="chat-room__dm-wait" role="status">{{ $i18n.party_waiting_others }}</p>
        <p v-else-if="chatInputLocked && !errorMessage" class="chat-room__dm-wait" role="status">{{ chatWaitStatusText }}</p>
        <button
            v-if="showUnlockChatInput"
            type="button"
            class="ui-button ui-button--ghost chat-room__unlock"
            @click="unlockChatInput"
        >{{ $i18n.chat_unlock_input }}</button>
        <form @submit.prevent="submitMessage" class="chat-input-form">
            <input class="chat-input" type="text" v-model="newMessage"
              :placeholder="$i18n.chat_placeholder"
              :disabled="chatInputLocked" />
            <button class="ui-button chat-send-button" type="submit" :disabled="chatInputLocked" :aria-busy="isSending">
              {{ isSending ? $i18n.sending : (dmGenerationLikelyInFlight ? $i18n.chat_dm_working : $i18n.send) }}
            </button>
        </form>
        <!-- Notetaker UI removed -->

    <!-- Floating character sheet: PC HP shown here; enemy HP is not shown to the player -->
    <FloatingCard v-if="playerCharacter" :character="playerCharacter" :hp-snapshot="playerHitPoints" :defaultOpen="false" />
    </div>
    <Teleport to="body">
        <Transition name="invite-toast">
            <div
                v-if="inviteToastVisible"
                class="invite-toast"
                :class="inviteToastVariant === 'error' ? 'invite-toast--error' : 'invite-toast--success'"
                role="status"
                aria-live="polite"
            >
                {{ inviteToastMessage }}
            </div>
        </Transition>
    </Teleport>
</template>

<script>
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import ChatMessage from '@/ui/ChatMessage.vue';
import FloatingCard from '@/ui/FloatingCard.vue';
import UIButton from '@/ui/Button.vue';
import SetupForm from '@/components/SetupForm.vue';
import { absoluteInviteUrl } from '@/utils/inviteLink.js';
import { resolveApiBaseURL, resolveGameStateWebSocketUrl } from '@/utils/apiBase.js';
import { fetchGameStateLoad } from '@/utils/fetchGameStateLoad.js';
import { SESSION_CHAT_TOAST } from '@/setupSession.js';
import { faUserPlus } from '@fortawesome/free-solid-svg-icons/faUserPlus';

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
// Force markdown renderer to emit paragraphs with zero margin to avoid CSS spacing issues
// Use renderer overrides instead of relying on global CSS (more robust)
// Render plain <p> tags; spacing handled via CSS for consistency
md.renderer.rules.paragraph_open = function() {
    return '<p>';
};
md.renderer.rules.paragraph_close = function() {
    return '</p>';
};
// Also ensure list items are rendered compactly
// Render plain <li>; spacing handled via CSS
md.renderer.rules.list_item_open = function() {
    return '<li>';
};
md.renderer.rules.heading_open = function(tokens, idx) {
    return `<${tokens[idx].tag}>`;
};
md.renderer.rules.heading_close = function(tokens, idx) {
    return `</${tokens[idx].tag}>`;
};

export default {
        components: {
            ChatMessage,
            FloatingCard,
            UIButton,
            SetupForm,
        },
        data() {
            return {
                faUserPlus,
                // summaryPrompt removed from client; server composes summary instruction
                // Initial state for the component
                newMessage: "", // Holds the current message being typed
                // language moved to global store; use computed property
                // language: 'English',
                messages: [], // Array to hold all the chat messages
                conversation: [], // Array to hold all conversation data
                summaryConversation: [], // Array to hold all summary conversation data
                summary: "", // Holds the summary of the game session
                systemMessageContentDM: "", //Holds the prompt for the AI DM
                ContextLength: 3, // The number of most recent messages to consider for generating a response
                userAndAssistantMessageCount: 0, // initialize the counter here
                totalTokenCount: 0,
                errorMessage: null, // add error message data property
                localPlayerCharacter: null,
                lastEncounterState: null,
                isSending: false,
                campaignTitle: '',
                gameOwnerUserId: null,
                /** From GET /game-state/load — host vs member for invite UI. */
                viewerIsGameOwner: null,
                inviteToastVisible: false,
                inviteToastMessage: '',
                inviteToastVariant: 'success',
                inviteToastTimer: null,
                inviteLoading: false,
                /** Poll load while server may still be finishing /generate (backup if SSE misses). */
                pendingReplyPollTimer: null,
                pendingReplyPollTicks: 0,
                /** Fingerprint of poll mode; avoids restart+immediate sync on every loadGameState (that caused a GET /load storm). */
                pendingReplyPollSig: null,
                serverLlmStartedAt: null,
                serverLlmCompletedAt: null,
                pendingAssistantUiHold: false,
                keepaliveAppendPayload: null,
                isInitialOpenBusy: false,
                onPageHideKeepalive: null,
                syncBusy: false,
                memberUserIds: [],
                /** From GET /game-state/load: Mongo user id string → trimmed nickname (lobby roster). */
                memberNicknamesByUserId: {},
                lobbyCharacterEditorOpen: false,
                lobbyError: '',
                lobbyStartingPollTimer: null,
                /** Multiplayer: this client submitted; DM runs only after every member acts. */
                partyRoundWaitingOthers: false,
                /** WebSocket push for game-state-updated; same gameId + OPEN/CONNECTING avoids reconnect churn. */
                gameStateWebSocket: null,
                gameStateWebSocketGameId: null,
                gameStateWsReconnectTimer: null,
                gameStateWsBackoffMs: 1000,
                pushSyncTimer: null,
            };
        },
        // removed duplicate data() 
        async created() {
            // language is now global in the store; no local initialization needed
            if (!this.$store.getters.isAuthenticated) {
                return;
            }

            // check if a gameId is provided in the route
            if (this.$route.params.id) {
                // Same as syncFromServer: trust server sheet for this viewer after load (parity with refresh vs button).
                await this.loadGameState(this.$route.params.id, { replaceLocalCharacter: true });
                this.systemMessageContentDM = this.$store.state.systemMessageContentDM || '';
                const inLobby =
                    this.$store.state.gameSetup &&
                    this.$store.state.gameSetup.party &&
                    (this.$store.state.gameSetup.party.phase === 'lobby' ||
                        this.$store.state.gameSetup.party.phase === 'starting');
                if (!inLobby && String(this.systemMessageContentDM || '').trim()) {
                    const systemMessageDM = {
                        role: 'system',
                        content: this.systemMessageContentDM,
                    };
                    if (!this.conversation.find(m => m.role === 'system' && m.content === this.systemMessageContentDM)) {
                        this.conversation.unshift(systemMessageDM);
                    }
                }
            }
        },

        computed: {
            myUserIdStr() {
                const id = this.$store.state.userId;
                return id != null ? String(id) : '';
            },
            /** Mirrors GET /game-state/load `viewerIsGameOwner` so UI (e.g. invite) works before `ownerUserId` is hydrated. */
            isGameOwner() {
                if (this.viewerIsGameOwner === false) return false;
                if (this.viewerIsGameOwner === true) return true;
                const oid = this.gameOwnerUserId;
                return Boolean(oid && this.myUserIdStr && String(oid) === String(this.myUserIdStr));
            },
            /** Host and invited members may copy a share link; matches server assertGameMember on create-invite. */
            canShareInviteLink() {
                if (!this.myUserIdStr) return false;
                if (this.isGameOwner) return true;
                const uid = String(this.myUserIdStr);
                const listed = Array.isArray(this.memberUserIds) ? this.memberUserIds.map(String) : [];
                return listed.includes(uid);
            },
            /** In-chat label for the current user: PC sheet name first; never OAuth real name or email. */
            playerChatLabel() {
                const c = this.playerCharacter;
                if (c && c.name != null && String(c.name).trim()) {
                    return String(c.name).trim();
                }
                const nick = this.$store.state.user && this.$store.state.user.nickname && String(this.$store.state.user.nickname).trim();
                if (nick) return nick;
                return 'Player';
            },
            playerCharacter() {
                const uid = this.myUserIdStr;
                const sheet = uid ? this.pickPlayerCharacterFromStore(uid) : null;
                if (sheet && typeof sheet === 'object') {
                    return this.localPlayerCharacter || sheet;
                }
                if (this.localPlayerCharacter) return this.localPlayerCharacter;
                return null;
            },
            /** Current/max HP for the sheet: encounterState PC row when present, else full max_hp. */
            playerHitPoints() {
                const c = this.playerCharacter;
                if (!c) return null;
                let max = c.max_hp != null ? Number(c.max_hp) : null;
                let current = max;
                const es = this.lastEncounterState;
                if (es && Array.isArray(es.participants)) {
                    const lower = (x) => String(x || '').toLowerCase();
                    const pc = es.participants.find(
                        (p) =>
                            p &&
                            (lower(p.kind) === 'pc' || p.id === 'pc' || lower(p.id) === 'player')
                    );
                    if (pc) {
                        if (pc.hp_max != null && !Number.isNaN(Number(pc.hp_max))) max = Number(pc.hp_max);
                        if (pc.hp_current != null && !Number.isNaN(Number(pc.hp_current))) current = Number(pc.hp_current);
                    }
                }
                if (max == null || Number.isNaN(max)) return null;
                if (current == null || Number.isNaN(current)) current = max;
                return { current, max };
            },
            language: {
                get() {
                    return (this.$store.state && this.$store.state.language) || 'English';
                },
                set(val) {
                    this.$store.commit('setLanguage', val);
                }
            },
            /** Roster for UI + aria: union of server members and any persisted playerCharacters keys. */
            partyRosterRows() {
                const gs = this.$store.state.gameSetup;
                const pcMap =
                    gs && gs.playerCharacters && typeof gs.playerCharacters === 'object' ? gs.playerCharacters : {};
                const listed = Array.isArray(this.memberUserIds) ? this.memberUserIds.map(String) : [];
                const idSet = new Set([...listed, ...Object.keys(pcMap).map(String)]);
                const ids = [...idSet];
                if (ids.length < 2) return [];
                const owner = this.gameOwnerUserId ? String(this.gameOwnerUserId) : '';
                ids.sort((a, b) => {
                    if (owner) {
                        if (a === owner) return -1;
                        if (b === owner) return 1;
                    }
                    return a.localeCompare(b);
                });
                const uid = this.myUserIdStr;
                return ids.map((id) => {
                    const sheet = this.pickPlayerCharacterFromStore(id);
                    const nameRaw = sheet && sheet.name != null && String(sheet.name).trim();
                    const label = nameRaw ? String(sheet.name).trim() : this.memberPrimaryLabel(id);
                    const isYou = Boolean(uid && id === uid);
                    const isHost = Boolean(owner && id === owner);
                    let display = label;
                    if (isYou) display += ` (${this.$i18n.party_you})`;
                    if (isHost) display += ` — ${this.$i18n.party_host}`;
                    const detailsLine = this.formatPartyMemberSheetSummary(sheet);
                    return { id, display, detailsLine, isYou, isHost };
                });
            },
            /**
             * True when another party member may be in the same game (realtime push + early message append).
             * Do not rely on partyRosterRows alone: roster can be empty before sheets load, while
             * memberUserIds already lists the host + guest.
             */
            gameSessionBroadcastActive() {
                const listed = Array.isArray(this.memberUserIds) ? this.memberUserIds : [];
                if (listed.length >= 2) return true;
                const oid = this.gameOwnerUserId;
                const uid = this.myUserIdStr;
                return Boolean(oid && uid && String(oid) !== String(uid));
            },
            /** Same membership as server `requiredPartyMemberIdStrings`: owner ∪ memberUserIds. */
            canonicalPartyMemberIdsSorted() {
                const listed = Array.isArray(this.memberUserIds) ? this.memberUserIds.map(String) : [];
                const owner = this.gameOwnerUserId ? String(this.gameOwnerUserId) : '';
                const idSet = new Set(listed.filter(Boolean));
                if (owner) idSet.add(owner);
                return [...idSet].filter(Boolean).sort();
            },
            /**
             * Multiplayer round: not every member has appeared in partySubmittedUserIds yet (server gameSetup).
             * While true, players who have not submitted keep the input enabled; those who submitted wait.
             */
            partyRoundCollectingActions() {
                if (!this.gameSessionBroadcastActive) return false;
                if (!this.conversationEndsAwaitingAssistant) return false;
                const req = this.canonicalPartyMemberIdsSorted;
                if (req.length < 2) return false;
                const gs = this.$store.state.gameSetup;
                const submitted =
                    gs && Array.isArray(gs.partySubmittedUserIds) ? gs.partySubmittedUserIds.map(String) : [];
                return !req.every((id) => submitted.includes(id));
            },
            /** This viewer may still send (or replace) their line for the current party round. */
            partyRoundOpenForMyAction() {
                if (!this.partyRoundCollectingActions) return false;
                const uid = this.myUserIdStr;
                if (!uid) return false;
                if (this.partyRoundWaitingOthers) return false;
                const gs = this.$store.state.gameSetup;
                const submitted =
                    gs && Array.isArray(gs.partySubmittedUserIds) ? gs.partySubmittedUserIds.map(String) : [];
                return !submitted.includes(String(uid));
            },
            /** “Waiting for others” only for players who already submitted this round (not the whole table). */
            partyRoundWaitingOthersForViewer() {
                if (this.partyRoundWaitingOthers) return true;
                if (!this.partyRoundCollectingActions || !this.myUserIdStr) return false;
                const gs = this.$store.state.gameSetup;
                const submitted =
                    gs && Array.isArray(gs.partySubmittedUserIds) ? gs.partySubmittedUserIds.map(String) : [];
                return submitted.includes(String(this.myUserIdStr));
            },
            /** Last stored turn is from the player — assistant reply might still be generating on the server. */
            conversationEndsAwaitingAssistant() {
                const c = this.conversation;
                if (!Array.isArray(c) || c.length === 0) return false;
                const last = c[c.length - 1];
                return Boolean(last && last.role === 'user');
            },
            /** True when GameState says /generate started after the last completed stamp (see server markLlmGenerateFinished). */
            dmGenerationLikelyInFlight() {
                const started = this.serverLlmStartedAt;
                if (!started || typeof started !== 'string') return false;
                const ts = Date.parse(started);
                if (Number.isNaN(ts) || Date.now() - ts > 15 * 60 * 1000) return false;
                const completed = this.serverLlmCompletedAt;
                if (!completed || typeof completed !== 'string') return true;
                const tc = Date.parse(completed);
                if (Number.isNaN(tc)) return true;
                return ts > tc;
            },
            chatInputLocked() {
                if (this.isSending || this.isInitialOpenBusy) return true;
                if (this.dmGenerationLikelyInFlight) return true;
                if (this.conversationEndsAwaitingAssistant && !this.errorMessage && this.pendingAssistantUiHold) {
                    if (this.partyRoundOpenForMyAction) return false;
                    return true;
                }
                return false;
            },
            showUnlockChatInput() {
                const dmBlocks = this.dmGenerationLikelyInFlight && !this.partyRoundCollectingActions;
                return (
                    this.conversationEndsAwaitingAssistant &&
                    !this.errorMessage &&
                    this.pendingAssistantUiHold &&
                    !dmBlocks &&
                    !this.isSending &&
                    !this.isInitialOpenBusy &&
                    !this.partyRoundOpenForMyAction &&
                    this.chatInputLocked
                );
            },
            chatWaitStatusText() {
                if (this.dmGenerationLikelyInFlight && !this.partyRoundCollectingActions) {
                    return this.$i18n.chat_waiting_dm_server;
                }
                if (
                    this.conversationEndsAwaitingAssistant &&
                    this.pendingAssistantUiHold &&
                    !this.partyRoundOpenForMyAction
                ) {
                    return this.$i18n.chat_waiting_dm_sync;
                }
                return '';
            },
            partyPhase() {
                const p = this.$store.state.gameSetup && this.$store.state.gameSetup.party;
                return p && p.phase ? String(p.phase) : '';
            },
            isPartyLobby() {
                const ph = this.partyPhase;
                return ph === 'lobby' || ph === 'starting';
            },
            lastStartError() {
                const p = this.$store.state.gameSetup && this.$store.state.gameSetup.party;
                return p && p.lastStartError ? String(p.lastStartError) : '';
            },
            /** Every roster member has marked ready (matches server allMembersReady when roster is complete). */
            partyLobbyAllMembersReady() {
                const rows = this.lobbyMemberRows;
                return rows.length > 0 && rows.every((r) => r.isReady);
            },
            /** Lobby toolbar + inline setup: no further ready toggles while starting or everyone is ready. */
            partyLobbyActionsFrozen() {
                return this.partyLobbyAllMembersReady || this.partyPhase === 'starting';
            },
            /** Invited player has already pressed mark ready — hide “edit character” so they cannot reopen the wizard. */
            viewerLobbyMarkedReady() {
                if (this.isGameOwner) return false;
                const uid = this.myUserIdStr;
                if (!uid) return false;
                const gs = this.$store.state.gameSetup;
                const ids = gs && gs.party && Array.isArray(gs.party.readyUserIds) ? gs.party.readyUserIds : [];
                return ids.map(String).includes(String(uid));
            },
            lobbyMemberRows() {
                const gs = this.$store.state.gameSetup;
                const listed = Array.isArray(this.memberUserIds) ? this.memberUserIds.map(String) : [];
                const owner = this.gameOwnerUserId ? String(this.gameOwnerUserId) : '';
                const idSet = new Set(listed);
                if (owner) idSet.add(owner);
                const ready = new Set(
                    (gs && gs.party && Array.isArray(gs.party.readyUserIds) ? gs.party.readyUserIds : []).map(String)
                );
                const uid = this.myUserIdStr;
                const ids = [...idSet];
                ids.sort((a, b) => {
                    if (owner) {
                        if (a === owner) return -1;
                        if (b === owner) return 1;
                    }
                    return a.localeCompare(b);
                });
                return ids.map((id) => {
                    const hasSheet = this.memberHasCommittedSheet(id);
                    const sheet = this.pickPlayerCharacterFromStore(id);
                    const primary = this.memberPrimaryLabel(id);
                    const isYou = Boolean(uid && id === uid);
                    const isHost = Boolean(owner && id === owner);
                    let display = primary;
                    if (isYou) display += ` (${this.$i18n.party_you})`;
                    if (isHost) display += ` — ${this.$i18n.party_host}`;
                    const detailsLine = hasSheet ? this.formatPartyMemberSheetSummary(sheet) : '';
                    return {
                        id,
                        display,
                        detailsLine,
                        hasSheet,
                        isReady: ready.has(id),
                    };
                });
            },
            /** After confirm step (mark ready / return), hide wizard until player opens “edit”. */
            lobbyCharacterFlowDoneForGame() {
                const gid =
                    this.$store.state.gameId || (this.$route.params.id ? String(this.$route.params.id) : '');
                if (!gid) return false;
                try {
                    return sessionStorage.getItem(`dm_lobby_char_done_${gid}`) === '1';
                } catch (e) {
                    return false;
                }
            },
            showLobbyCharacterSetupPanel() {
                if (!this.isPartyLobby) return false;
                if (this.lobbyCharacterEditorOpen) return true;
                return !this.lobbyCharacterFlowDoneForGame;
            },
            showLobbyCharacterEditCta() {
                if (
                    !this.isPartyLobby ||
                    !this.lobbyCharacterFlowDoneForGame ||
                    this.lobbyCharacterEditorOpen
                ) {
                    return false;
                }
                if (this.partyLobbyActionsFrozen) return false;
                if (this.viewerLobbyMarkedReady) return false;
                return true;
            },
        },

        watch: {
            '$store.state.gameId'(to, from) {
                if (String(to ?? '') !== String(from ?? '')) {
                    this.lobbyCharacterEditorOpen = false;
                }
            },
            partyPhase(ph) {
                if (ph === 'starting') {
                    if (this.lobbyStartingPollTimer) clearInterval(this.lobbyStartingPollTimer);
                    this.lobbyStartingPollTimer = null;
                    /* WebSocket delivers game-state-updated; poll only if push is down (rare safety). */
                    const pushOpen =
                        this.gameStateWebSocket && this.gameStateWebSocket.readyState === WebSocket.OPEN;
                    if (pushOpen) return;
                    const lobbyPollMs = 45000;
                    this.lobbyStartingPollTimer = setInterval(() => {
                        if (this.partyPhase !== 'starting') {
                            clearInterval(this.lobbyStartingPollTimer);
                            this.lobbyStartingPollTimer = null;
                            return;
                        }
                        if (!this.syncBusy && !this.isSending) {
                            void this.syncFromServer();
                        }
                    }, lobbyPollMs);
                } else if (this.lobbyStartingPollTimer) {
                    clearInterval(this.lobbyStartingPollTimer);
                    this.lobbyStartingPollTimer = null;
                }
            },
            gameSessionBroadcastActive() {
                this.$nextTick(() => this.maybeStartGameStateWebSocket());
            },
            'messages.length'(n, o) {
                if (n === 0) return;
                const prev = typeof o === 'number' ? o : 0;
                this.scrollChatToBottom({ smooth: prev > 0 && n > prev });
            },
        },

        mounted() {
            this.visSyncTimer = null;
            this.onDocumentVisibility = () => {
                if (document.visibilityState !== 'visible') return;
                if (!this.$route.params.id) return;
                if (!this.$store.getters.isAuthenticated) return;
                if (!this.gameSessionBroadcastActive) return;
                if (this.syncBusy || this.isSending) return;
                if (this.visSyncTimer) clearTimeout(this.visSyncTimer);
                this.visSyncTimer = setTimeout(() => {
                    this.visSyncTimer = null;
                    this.syncFromServer();
                }, 450);
            };
            document.addEventListener('visibilitychange', this.onDocumentVisibility);
            this.onPageHideKeepalive = () => this.flushKeepaliveAppend();
            window.addEventListener('pagehide', this.onPageHideKeepalive);
            this.$nextTick(() => {
                this.maybeStartGameStateWebSocket();
                this.scrollChatToBottom({ smooth: false });
                this.flushSessionChatToast();
            });
        },

        beforeUnmount() {
            if (this.onPageHideKeepalive) {
                window.removeEventListener('pagehide', this.onPageHideKeepalive);
            }
            document.removeEventListener('visibilitychange', this.onDocumentVisibility);
            if (this.visSyncTimer) {
                clearTimeout(this.visSyncTimer);
                this.visSyncTimer = null;
            }
            if (this.lobbyStartingPollTimer) {
                clearInterval(this.lobbyStartingPollTimer);
                this.lobbyStartingPollTimer = null;
            }
            if (this.inviteToastTimer) {
                clearTimeout(this.inviteToastTimer);
                this.inviteToastTimer = null;
            }
            this.stopPendingReplyPoller();
            this.stopGameStateWebSocket();
        },

        methods: {
            /** Same id/label resolution as FloatingCard (race/class lists from $i18n). */
            localizePartySheetField(value, list) {
                if (value == null || value === '') return '';
                const raw = String(value).trim();
                const id = raw.toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
                const found = (list || []).find((x) => x.id === id);
                return found ? found.label : raw;
            },
            localizePartySubclassLabel(subRaw) {
                const s = String(subRaw || '').trim();
                if (!s || s.toLowerCase() === 'random') return '';
                const labels = this.$i18n.subclass_labels || {};
                const keyUnderscore = s.toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
                if (labels[keyUnderscore]) return labels[keyUnderscore];
                return s;
            },
            /** Race · class · subclass — Level n (localized); empty if no sheet fields. */
            formatPartyMemberSheetSummary(sheet) {
                if (!sheet || typeof sheet !== 'object') return '';
                const race = this.localizePartySheetField(sheet.race, this.$i18n.races || []);
                const clsRaw =
                    sheet.class != null && String(sheet.class).trim()
                        ? sheet.class
                        : sheet.characterClass;
                const cls = this.localizePartySheetField(clsRaw, this.$i18n.classes || []);
                const subRaw =
                    sheet.subclass != null && String(sheet.subclass).trim()
                        ? sheet.subclass
                        : sheet.subclassId;
                const sub = this.localizePartySubclassLabel(subRaw);
                const lv =
                    sheet.level != null && !Number.isNaN(Number(sheet.level))
                        ? Math.min(20, Math.max(1, Math.floor(Number(sheet.level))))
                        : null;
                const parts = [];
                if (race) parts.push(race);
                if (cls) parts.push(cls);
                if (sub) parts.push(sub);
                let line = parts.join(' · ');
                if (lv != null) {
                    const lp = this.$i18n.level_prefix || 'Level ';
                    line = line ? `${line} — ${lp}${lv}` : `${lp}${lv}`;
                }
                return line;
            },
            pickPlayerCharacterFromStore(memberId) {
                const id = memberId != null ? String(memberId) : '';
                if (!id) return null;
                const gs = this.$store.state.gameSetup;
                if (!gs) return null;
                const pcMap =
                    gs.playerCharacters && typeof gs.playerCharacters === 'object' ? gs.playerCharacters : {};
                const sheet = pcMap[id];
                if (sheet && typeof sheet === 'object') return sheet;
                for (const k of Object.keys(pcMap)) {
                    if (String(k) === id && pcMap[k] && typeof pcMap[k] === 'object') return pcMap[k];
                }
                return null;
            },
            memberHasCommittedSheet(memberId) {
                const sheet = this.pickPlayerCharacterFromStore(memberId);
                return Boolean(sheet && sheet.name != null && String(sheet.name).trim());
            },
            /** Character name if saved; else account nickname from load payload; else pending i18n. */
            memberPrimaryLabel(memberId) {
                const sheet = this.pickPlayerCharacterFromStore(memberId);
                const charName = sheet && sheet.name != null && String(sheet.name).trim();
                if (charName) return String(sheet.name).trim();
                const nid = memberId != null ? String(memberId) : '';
                const map = this.memberNicknamesByUserId || {};
                const nick = map[nid] && String(map[nid]).trim();
                if (nick) return nick;
                return this.$i18n.party_character_pending;
            },
            openLobbyCharacterEditor() {
                const gid =
                    this.$store.state.gameId || (this.$route.params.id ? String(this.$route.params.id) : '');
                if (gid) {
                    try {
                        sessionStorage.removeItem(`dm_lobby_char_done_${gid}`);
                    } catch (e) {
                        /* ignore */
                    }
                }
                this.lobbyCharacterEditorOpen = true;
            },
            /** Keep the transcript pinned to the latest line after load, send, or DM push. */
            scrollChatToBottom({ smooth = false } = {}) {
                const run = () => {
                    const el = this.$refs.transcriptRoot;
                    if (!el) return;
                    const top = el.scrollHeight;
                    try {
                        if (typeof el.scrollTo === 'function') {
                            el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
                        } else {
                            el.scrollTop = top;
                        }
                    } catch (e) {
                        el.scrollTop = top;
                    }
                };
                this.$nextTick(() => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(run);
                    });
                });
            },
            stopGameStateWebSocket() {
                if (this.gameStateWsReconnectTimer) {
                    clearTimeout(this.gameStateWsReconnectTimer);
                    this.gameStateWsReconnectTimer = null;
                }
                if (this.pushSyncTimer) {
                    clearTimeout(this.pushSyncTimer);
                    this.pushSyncTimer = null;
                }
                if (this.gameStateWebSocket) {
                    try {
                        this.gameStateWebSocket.onclose = null;
                        this.gameStateWebSocket.onerror = null;
                        this.gameStateWebSocket.onmessage = null;
                        this.gameStateWebSocket.onopen = null;
                        this.gameStateWebSocket.close();
                    } catch (e) {
                        /* ignore */
                    }
                    this.gameStateWebSocket = null;
                }
                this.gameStateWebSocketGameId = null;
            },

            scheduleGameStateWebSocketReconnect() {
                if (this.gameStateWsReconnectTimer) clearTimeout(this.gameStateWsReconnectTimer);
                const id = this.$route.params.id ? String(this.$route.params.id).trim() : '';
                if (!id || !this.$store.getters.isAuthenticated) return;
                const delay = Math.min(Math.max(this.gameStateWsBackoffMs, 500), 30000);
                this.gameStateWsReconnectTimer = setTimeout(() => {
                    this.gameStateWsReconnectTimer = null;
                    this.gameStateWsBackoffMs = Math.min(this.gameStateWsBackoffMs * 2, 30000);
                    this.maybeStartGameStateWebSocket();
                }, delay);
            },

            /**
             * WebSocket push when GameState changes (same payload shape as legacy SSE).
             * Reuse OPEN/CONNECTING socket for the same gameId; GET /load only runs after push or explicit refresh.
             */
            maybeStartGameStateWebSocket() {
                const id = this.$route.params.id ? String(this.$route.params.id).trim() : '';
                const token = this.$store.state.authToken;
                if (!id || !this.$store.getters.isAuthenticated || !token || !String(token).trim()) {
                    this.stopGameStateWebSocket();
                    return;
                }
                const existing = this.gameStateWebSocket;
                if (
                    existing &&
                    this.gameStateWebSocketGameId === id &&
                    (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)
                ) {
                    if (this.gameStateWsReconnectTimer) {
                        clearTimeout(this.gameStateWsReconnectTimer);
                        this.gameStateWsReconnectTimer = null;
                    }
                    return;
                }
                if (this.gameStateWsReconnectTimer) {
                    clearTimeout(this.gameStateWsReconnectTimer);
                    this.gameStateWsReconnectTimer = null;
                }
                this.stopGameStateWebSocket();
                this.gameStateWebSocketGameId = id;
                const url = resolveGameStateWebSocketUrl(id, String(token).trim());
                if (!url || typeof WebSocket === 'undefined') {
                    this.gameStateWebSocketGameId = null;
                    return;
                }
                let ws;
                try {
                    ws = new WebSocket(url);
                } catch (e) {
                    console.warn('WebSocket failed:', e);
                    this.gameStateWebSocketGameId = null;
                    this.scheduleGameStateWebSocketReconnect();
                    return;
                }
                this.gameStateWebSocket = ws;
                ws.onopen = () => {
                    this.gameStateWsBackoffMs = 1000;
                    if (this.lobbyStartingPollTimer) {
                        clearInterval(this.lobbyStartingPollTimer);
                        this.lobbyStartingPollTimer = null;
                    }
                    this.stopPendingReplyPoller();
                };
                ws.onmessage = (ev) => {
                    let o;
                    try {
                        o = JSON.parse(ev.data);
                    } catch (err) {
                        return;
                    }
                    if (!o || o.type !== 'game-state-updated') return;
                    if (String(o.gameId || '') !== id) return;
                    if (this.syncBusy || this.isSending) return;
                    if (this.pushSyncTimer) clearTimeout(this.pushSyncTimer);
                    this.pushSyncTimer = setTimeout(() => {
                        this.pushSyncTimer = null;
                        this.syncFromServer();
                    }, 350);
                };
                ws.onclose = () => {
                    // If this socket was already replaced (stopGameStateWebSocket + new WebSocket), ignore:
                    // avoids duplicate reconnect timers and clearing pushSyncTimer owned by the new socket.
                    if (this.gameStateWebSocket !== ws) {
                        return;
                    }
                    this.gameStateWebSocket = null;
                    this.gameStateWebSocketGameId = null;
                    if (this.pushSyncTimer) {
                        clearTimeout(this.pushSyncTimer);
                        this.pushSyncTimer = null;
                    }
                    if (this.$route.params.id && String(this.$route.params.id).trim() === id && this.$store.getters.isAuthenticated) {
                        this.scheduleGameStateWebSocketReconnect();
                    }
                };
                ws.onerror = () => {
                    try {
                        ws.close();
                    } catch (e) {
                        /* ignore */
                    }
                };
            },

            stopPendingReplyPoller() {
                if (this.pendingReplyPollTimer) {
                    clearInterval(this.pendingReplyPollTimer);
                    this.pendingReplyPollTimer = null;
                }
                this.pendingReplyPollTicks = 0;
                this.pendingReplyPollSig = null;
            },

            unlockChatInput() {
                this.pendingAssistantUiHold = false;
            },

            flushKeepaliveAppend() {
                const p = this.keepaliveAppendPayload;
                const token = this.$store.state.authToken;
                if (!p || !p.gameId || !token) return;
                try {
                    const base = resolveApiBaseURL() || (typeof window !== 'undefined' ? window.location.origin : '');
                    if (!base) return;
                    const url = `${base.replace(/\/$/, '')}/api/game-state/append-player-message`;
                    fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${String(token).trim()}`,
                        },
                        body: JSON.stringify({
                            gameId: p.gameId,
                            content: p.content,
                            displayName: p.displayName,
                        }),
                        keepalive: true,
                    }).catch(() => {});
                } catch (e) {
                    /* ignore */
                }
            },

            /**
             * Rare HTTP fallback when WebSocket is down; with a live socket, push drives GET /load (no interval poll).
             */
            maybeStartPendingReplyPoller() {
                if (!this.conversationEndsAwaitingAssistant) {
                    this.stopPendingReplyPoller();
                    return;
                }
                if (this.partyRoundOpenForMyAction) {
                    this.stopPendingReplyPoller();
                    return;
                }
                const pushOpen = this.gameStateWebSocket && this.gameStateWebSocket.readyState === WebSocket.OPEN;
                if (pushOpen) {
                    this.stopPendingReplyPoller();
                    return;
                }
                const partyWait = this.partyRoundWaitingOthers === true;
                const broadcast = this.gameSessionBroadcastActive;
                const sig = `0:${partyWait ? 1 : 0}:${broadcast ? 1 : 0}`;
                /* loadGameState() calls this every sync; restarting always reset ticks and ran sync immediately → tight HTTP loop. */
                if (this.pendingReplyPollTimer && this.pendingReplyPollSig === sig) {
                    return;
                }
                this.stopPendingReplyPoller();
                this.pendingReplyPollSig = sig;
                const maxTicks = broadcast ? 24 : 36;
                const intervalMs = broadcast ? 120000 : 90000;
                const run = async () => {
                    if (this.gameStateWebSocket && this.gameStateWebSocket.readyState === WebSocket.OPEN) {
                        this.stopPendingReplyPoller();
                        return;
                    }
                    if (!this.conversationEndsAwaitingAssistant) {
                        this.stopPendingReplyPoller();
                        return;
                    }
                    if (this.isSending || this.syncBusy) return;
                    this.pendingReplyPollTicks += 1;
                    if (this.pendingReplyPollTicks > maxTicks) {
                        this.pendingAssistantUiHold = false;
                        this.stopPendingReplyPoller();
                        return;
                    }
                    try {
                        await this.syncFromServer();
                    } catch (e) {
                        /* ignore */
                    }
                };
                void run();
                this.pendingReplyPollTimer = setInterval(run, intervalMs);
            },

            /** Resolve visible label for a stored user line: character name from party map, then legacy displayName. */
            displayLabelForPlayerMessage(storedDisplayName, messageUserId) {
                const gs = this.$store.state.gameSetup;
                const mid = messageUserId != null ? String(messageUserId) : '';
                if (mid && gs && gs.playerCharacters && typeof gs.playerCharacters === 'object') {
                    const pc = gs.playerCharacters[mid];
                    if (pc && typeof pc === 'object' && pc.name != null && String(pc.name).trim()) {
                        return String(pc.name).trim();
                    }
                }
                if (mid && this.myUserIdStr && mid === this.myUserIdStr) {
                    const ch = this.playerCharacter;
                    if (ch && ch.name != null && String(ch.name).trim()) {
                        return String(ch.name).trim();
                    }
                }
                if (storedDisplayName != null && String(storedDisplayName).trim()) {
                    return String(storedDisplayName).trim();
                }
                return 'Player';
            },
            renderMarkdown(text) {
                if (!text) return '';
                try {
                    return md.render(text);
                } catch (e) {
                    console.error('Markdown render error:', e);
                    return text;
                }
            },

            narrationFromGenerateResponse(data) {
                if (data == null) return '';
                if (typeof data === 'object' && typeof data.narration === 'string') return data.narration;
                if (typeof data === 'string') return data;
                return '';
            },

            /** When the DM envelope includes coinage, sync the sheet in Vuex + local copy. */
            applyCoinageFromGenerateResponse(data) {
                if (!data || !data.coinage || typeof data.coinage !== 'object') return;
                const keys = ['pp', 'gp', 'ep', 'sp', 'cp'];
                const cur = {};
                for (const k of keys) {
                    const n = Math.floor(Number(data.coinage[k]));
                    cur[k] = Number.isFinite(n) && n >= 0 ? n : 0;
                }
                const gs = { ...this.$store.state.gameSetup };
                const uid = this.myUserIdStr;
                if (uid) {
                    const pc = { ...(gs.playerCharacters && typeof gs.playerCharacters === 'object' ? gs.playerCharacters : {}) };
                    const sheet = { ...(pc[uid] || {}) };
                    sheet.coinage = cur;
                    pc[uid] = sheet;
                    gs.playerCharacters = pc;
                }
                delete gs.generatedCharacter;
                this.$store.commit('setGameSetup', gs);
                if (this.localPlayerCharacter) {
                    this.localPlayerCharacter = { ...this.localPlayerCharacter, coinage: cur };
                }
            },
            showInviteToast(message, variant = 'success') {
                if (this.inviteToastTimer) {
                    clearTimeout(this.inviteToastTimer);
                    this.inviteToastTimer = null;
                }
                this.inviteToastMessage = message;
                this.inviteToastVariant = variant;
                this.inviteToastVisible = true;
                this.inviteToastTimer = setTimeout(() => {
                    this.inviteToastVisible = false;
                    this.inviteToastTimer = null;
                }, 3200);
            },
            flushSessionChatToast() {
                try {
                    const raw = sessionStorage.getItem(SESSION_CHAT_TOAST);
                    if (!raw) return;
                    sessionStorage.removeItem(SESSION_CHAT_TOAST);
                    const o = JSON.parse(raw);
                    const msg = o && typeof o.message === 'string' ? o.message.trim() : '';
                    if (!msg) return;
                    this.showInviteToast(msg, o.variant === 'error' ? 'error' : 'success');
                } catch (e) {
                    /* ignore */
                }
            },
            async copyInviteLink() {
                const gid = this.$route.params.id ? String(this.$route.params.id).trim() : '';
                if (this.inviteLoading) return;
                if (!gid) {
                    this.showInviteToast(this.$i18n.invite_no_game_id, 'error');
                    return;
                }
                this.inviteLoading = true;
                try {
                    const { data } = await axios.post('/api/game-session/create-invite', { gameId: gid });
                    const token = String((data && data.inviteToken) || '').trim();
                    if (!token) throw new Error('no token');
                    const url = absoluteInviteUrl(this.$router, token);
                    try {
                        await navigator.clipboard.writeText(url);
                    } catch (e) {
                        window.prompt(this.$i18n.invite_copy_prompt_title || 'Copy invite link:', url);
                    }
                    this.showInviteToast(this.$i18n.invite_copied, 'success');
                } catch (e) {
                    console.warn('create-invite failed:', e?.response?.data || e?.message || e);
                    this.showInviteToast(this.$i18n.invite_failed, 'error');
                } finally {
                    this.inviteLoading = false;
                }
            },

            /**
             * Pull latest conversation from DB (other players / other tabs).
             * WebSocket (`/api/game-state/ws/:gameId`) signals updates; this GET applies the snapshot.
             */
            async syncFromServer() {
                const id = this.$route.params.id ? String(this.$route.params.id).trim() : '';
                if (!id || this.syncBusy) return;
                this.syncBusy = true;
                this.errorMessage = null;
                try {
                    const ok = await this.loadGameState(id, { replaceLocalCharacter: true });
                    if (!ok && this.$store.getters.isAuthenticated) {
                        this.errorMessage = this.$i18n.state_refresh_failed;
                    }
                } finally {
                    this.syncBusy = false;
                }
            },

            onLobbyInlineCharacterDone(payload) {
                const p = payload && typeof payload === 'object' ? payload : {};
                const gid =
                    this.$store.state.gameId ||
                    (this.$route.params.id ? String(this.$route.params.id) : '') ||
                    (p.gameId != null ? String(p.gameId) : '');
                if (gid) {
                    try {
                        sessionStorage.setItem(`dm_lobby_char_done_${gid}`, '1');
                    } catch (e) {
                        /* ignore */
                    }
                }
                if (p.ownerUserId != null && String(p.ownerUserId).trim() !== '') {
                    this.gameOwnerUserId = String(p.ownerUserId).trim();
                }
                if (Object.prototype.hasOwnProperty.call(p, 'viewerIsGameOwner')) {
                    this.viewerIsGameOwner = p.viewerIsGameOwner === true;
                }
                this.lobbyCharacterEditorOpen = false;
                void this.syncFromServer();
            },

            incrementTokenCount(message) {
                const tokenCountForMessage = Math.ceil(message.length / 4);
                this.totalTokenCount += tokenCountForMessage;
                console.log("Total tokens processed by AI: ", this.totalTokenCount);

            },
            // summary generation is handled server-side; frontend will not request summaries

        updateSummaryInChatRoom(updatedSummary) {
                this.summary = updatedSummary;
                this.$store.commit('setSummary', updatedSummary);
            },

            /** Snapshot for server-side persist (conversation must include the latest user line before the assistant reply). */
            buildPersistPayload() {
                return {
                    gameId: this.$store.state.gameId,
                    gameSetup: this.$store.state.gameSetup,
                    conversation: this.conversation,
                    summaryConversation: this.summaryConversation,
                    summary: this.summary,
                    totalTokenCount: this.totalTokenCount,
                    userAndAssistantMessageCount: this.userAndAssistantMessageCount,
                    systemMessageContentDM: this.systemMessageContentDM,
                    encounterState: this.lastEncounterState,
                    requestingUserId: this.myUserIdStr || undefined,
                };
            },

            /** Apply a /generate-shaped payload (or partyDm from append flush) to local chat state. */
            applyDmPayloadToConversation(responseData, userMessage) {
                if (responseData && Object.prototype.hasOwnProperty.call(responseData, 'encounterState')) {
                    this.lastEncounterState = responseData.encounterState || null;
                }
                this.applyCoinageFromGenerateResponse(responseData);
                const aiMessageContent = this.narrationFromGenerateResponse(responseData);
                if (!aiMessageContent) {
                    throw new Error(responseData?.error || 'Empty narration from server');
                }
                this.incrementTokenCount(aiMessageContent);
                const aiMessage = {
                    role: 'assistant',
                    content: aiMessageContent,
                };
                this.conversation.push(aiMessage);
                this.summaryConversation.push(aiMessage);
                this.messages.push({ user: this.$i18n.dm_label, text: aiMessageContent, role: 'dm' });
                if (userMessage.role === 'user' || aiMessage.role === 'assistant') {
                    this.userAndAssistantMessageCount++;
                }
                this.pendingAssistantUiHold = false;
                this.keepaliveAppendPayload = null;
                this.stopPendingReplyPoller();
                this.partyRoundWaitingOthers = false;
            },

            async submitMessage() {
                if (this.newMessage.trim() === '') return;
                this.isSending = true;
                this.partyRoundWaitingOthers = false;
                const text = this.newMessage.trim();
                this.messages.push({ user: this.playerChatLabel, text, role: 'player' });
                const userMessage = {
                    role: 'user',
                    content: text,
                    userId: this.myUserIdStr || undefined,
                    displayName: this.playerChatLabel,
                };
                this.conversation.push(userMessage);
                this.summaryConversation.push(userMessage);

                try {
                    this.errorMessage = null;
                    const gidSend = this.$store.state.gameId;
                    this.keepaliveAppendPayload = gidSend
                        ? {
                              gameId: gidSend,
                              content: userMessage.content,
                              displayName: userMessage.displayName,
                          }
                        : null;

                    if (gidSend) {
                        try {
                            const { data: ad } = await axios.post('/api/game-state/append-player-message', {
                                gameId: gidSend,
                                content: userMessage.content,
                                displayName: userMessage.displayName,
                            });
                            this.keepaliveAppendPayload = null;

                            if (ad && ad.partyWait === true) {
                                this.partyRoundWaitingOthers = true;
                                if (this.gameSessionBroadcastActive) this.$nextTick(() => this.syncFromServer());
                                return;
                            }

                            if (ad && ad.partyDm && String(ad.partyDm.narration || '').trim()) {
                                this.applyDmPayloadToConversation(ad.partyDm, userMessage);
                                return;
                            }

                            if (ad && ad.duplicate === true) {
                                if (this.gameSessionBroadcastActive) this.$nextTick(() => this.syncFromServer());
                                return;
                            }
                        } catch (appendErr) {
                            console.warn(
                                'append-player-message failed (message may disappear on refresh until DM reply):',
                                appendErr
                            );
                        }
                    }

                    if (!this.gameSessionBroadcastActive) {
                        const lastMessages = this.conversation.slice(-this.ContextLength * 2);
                        lastMessages.forEach((message) => this.incrementTokenCount(message.content));
                        const response = await axios.post('/api/game-session/generate', {
                            messages: lastMessages.slice(),
                            language: this.language,
                            gameId: this.$store.state.gameId,
                            requestingUserId: this.myUserIdStr || undefined,
                            persist: this.buildPersistPayload(),
                        });
                        this.applyDmPayloadToConversation(response.data, userMessage);
                    } else {
                        this.$nextTick(() => this.syncFromServer());
                    }
                } catch (error) {
                    console.error('Error generating AI message:', error);
                    const apiErr = error.response?.data?.error;
                    this.errorMessage = apiErr || error.message || 'Failed to send message. Please try again.';
                    if (this.gameSessionBroadcastActive) {
                        this.$nextTick(() => this.syncFromServer());
                    } else {
                        this.maybeStartPendingReplyPoller();
                    }
                } finally {
                    this.isSending = false;
                    this.newMessage = '';
                }
            },
            
            // Generate an initial AI message using the current conversation (used when entering a new game)
            async generateInitialMessage() {
                this.isInitialOpenBusy = true;
                try {
                    const messagesToSend = this.conversation.slice(-this.ContextLength * 2);
                    // Initial opening: server uses persisted campaignSpec + GameState character; do not send PC in sessionSummary (world/PC separation).
                    const sessionSummary = '';

                        const response = await axios.post('/api/game-session/generate', {
                        gameId: this.$store.state.gameId,
                        messages: messagesToSend,
                        mode: 'initial',
                        includeFullSkill: true,
                        language: this.language,
                        sessionSummary,
                        requestingUserId: this.myUserIdStr || undefined,
                        persist: this.buildPersistPayload(),
                    });
                    if (response.data && Object.prototype.hasOwnProperty.call(response.data, 'encounterState')) {
                        this.lastEncounterState = response.data.encounterState || null;
                    }
                    this.applyCoinageFromGenerateResponse(response.data);
                    const aiMessageContent = this.narrationFromGenerateResponse(response.data);
                    if (!aiMessageContent) {
                        throw new Error(response.data?.error || 'Empty opening narration');
                    }

                    const aiMessage = {
                        role: 'assistant',
                        content: aiMessageContent,
                    };
                    this.conversation.push(aiMessage);
                    this.summaryConversation.push(aiMessage);
                    this.messages.push({ user: this.$i18n.dm_label, text: aiMessageContent, role: 'dm' });
                    this.pendingAssistantUiHold = false;
                } catch (err) {
                    console.error('Error generating initial AI message:', err);
                    const apiErr = err.response?.data?.error;
                    const preview = err.response?.data?.rawPreview;
                    this.errorMessage =
                        apiErr ||
                        (preview ? `${err.message || 'Request failed'}. ${String(preview).slice(0, 280)}` : null) ||
                        err.message ||
                        'Could not start the adventure.';
                } finally {
                    this.isInitialOpenBusy = false;
                }
            },
            tryAgain() {
                this.errorMessage = null;
                this.submitMessage(); // Retry sending the message
            },

    /*
    appendHiddenMessage(message) {
                // Add the hidden message to the end of the user input
                const hiddenMessage = "Keep response under 75 words."; // Replace with your hidden message
                return message + hiddenMessage;
            }, */

            async loadGameState(gameId, opts = {}) {
                const gidRaw = gameId != null ? String(gameId).trim() : '';
                if (!gidRaw) return false;
                const replaceLocalCharacter = opts.replaceLocalCharacter === true;
                let response;
                try {
                    response = await fetchGameStateLoad(gidRaw);
                } catch (error) {
                    const st = error && error.response && error.response.status;
                    if (st === 401 && !this.$store.getters.isAuthenticated) {
                        return false;
                    }
                    console.error('Error loading game state:', error);
                    return false;
                }
                const gameState = response.data;

                try {

                    // Restore the game state
                    this.$store.commit('setGameId', gameState.gameId);
                    this.$store.commit('setGameSetup', gameState.gameSetup);
                    this.memberNicknamesByUserId =
                        gameState.memberNicknamesByUserId &&
                        typeof gameState.memberNicknamesByUserId === 'object'
                            ? { ...gameState.memberNicknamesByUserId }
                            : {};
                    // set local language from loaded game setup
                    this.language = (gameState.gameSetup && gameState.gameSetup.language) || this.language;
                    this.gameOwnerUserId = gameState.ownerUserId != null ? String(gameState.ownerUserId) : null;
                    this.viewerIsGameOwner = Object.prototype.hasOwnProperty.call(gameState, 'viewerIsGameOwner')
                        ? gameState.viewerIsGameOwner === true
                        : null;
                    this.memberUserIds = Array.isArray(gameState.memberUserIds)
                        ? gameState.memberUserIds.map((x) => String(x))
                        : [];
                    this.serverLlmStartedAt =
                        gameState.llmCallStartedAt != null ? String(gameState.llmCallStartedAt) : null;
                    this.serverLlmCompletedAt =
                        gameState.llmCallCompletedAt != null ? String(gameState.llmCallCompletedAt) : null;
                    this.conversation = Array.isArray(gameState.conversation) ? gameState.conversation : [];
                    this.summaryConversation = gameState.summaryConversation;
                    this.summary = gameState.summary;
                    this.totalTokenCount = gameState.totalTokenCount;
                    this.userAndAssistantMessageCount = gameState.userAndAssistantMessageCount;
                    this.systemMessageContentDM = gameState.systemMessageContentDM;
                    this.lastEncounterState = gameState.encounterState || null;
                    const spec = gameState.campaignSpec;
                    this.campaignTitle =
                        spec && typeof spec.title === 'string' && spec.title.trim() ? spec.title.trim() : '';

                    const uid = this.myUserIdStr;
                    const sheetForMe = uid ? this.pickPlayerCharacterFromStore(uid) : null;
                    if (replaceLocalCharacter) {
                        if (sheetForMe && typeof sheetForMe === 'object') {
                            try {
                                this.localPlayerCharacter = JSON.parse(JSON.stringify(sheetForMe));
                            } catch (e) {
                                this.localPlayerCharacter = { ...sheetForMe };
                            }
                        } else {
                            this.localPlayerCharacter = null;
                        }
                    } else if (sheetForMe && typeof sheetForMe === 'object' && !this.localPlayerCharacter) {
                        this.localPlayerCharacter = sheetForMe;
                    }

                    // Map the conversation array to match the structure needed by this.messages
                    // And only include the messages that are not of role 'system'
                    this.messages = this.conversation
                        .filter(({ role }) => role !== 'system')  // Filter out the 'system' role messages
                        .map(({ role, content, displayName, userId }) => {
                            const isAsst = role === 'assistant';
                            const user = isAsst
                                ? this.$i18n.dm_label
                                : this.displayLabelForPlayerMessage(displayName, userId);
                            return {
                                user,
                                text: content,
                                role: isAsst ? 'dm' : 'player',
                            };
                        });

                    const lastLoaded = this.conversation.length ? this.conversation[this.conversation.length - 1] : null;
                    if (lastLoaded && lastLoaded.role === 'assistant') {
                        this.partyRoundWaitingOthers = false;
                    }

                    if (!this.conversationEndsAwaitingAssistant) {
                        this.pendingAssistantUiHold = false;
                    } else {
                        this.pendingAssistantUiHold = !this.errorMessage;
                    }

                    const ownerStr = this.gameOwnerUserId || '';
                    const listed = this.memberUserIds || [];
                    const multi =
                        listed.length >= 2 ||
                        (ownerStr && uid && String(ownerStr) !== String(uid));
                    const gs = this.$store.state.gameSetup;
                    const pcMap =
                        gs && gs.playerCharacters && typeof gs.playerCharacters === 'object'
                            ? gs.playerCharacters
                            : {};
                    const partyPh = gs && gs.party && gs.party.phase ? String(gs.party.phase) : '';
                    const inPartyLobby = partyPh === 'lobby' || partyPh === 'starting';
                    if (multi && uid && !pcMap[uid] && !inPartyLobby) {
                        await this.$router.replace({ path: '/setup', query: { joinGame: gidRaw } });
                        return true;
                    }

                    // Opening narration: solo bootstrap only (party lobby uses server start-party-adventure).
                    const hasOnlySystem = this.conversation.length === 1 && this.conversation[0]?.role === 'system';
                    if (this.messages.length === 0 && hasOnlySystem && !inPartyLobby) {
                        this.generateInitialMessage();
                    }

                    this.$nextTick(() => {
                        this.maybeStartGameStateWebSocket();
                        this.maybeStartPendingReplyPoller();
                        this.scrollChatToBottom({ smooth: false });
                    });
                    return true;
                } catch (err) {
                    console.error('Error applying game state:', err);
                    return false;
                }
            }

        }
    };</script>

<style scoped>
  .chat-room {
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .chat-room__transcript {
    margin-bottom: 0.35rem;
  }

  .two-column {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: stretch;
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
  }

  .chat-room__header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }

  .chat-room__dm-wait {
    font-size: 0.9rem;
    opacity: 0.88;
    margin: 0.25rem 0 0.15rem;
    line-height: 1.35;
  }

  .chat-room__unlock {
    align-self: flex-start;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
  }

  .party-roster {
    font-size: 0.84rem;
    line-height: 1.4;
    color: var(--gm-muted, #9a8f85);
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(212, 180, 106, 0.15);
    background: rgba(0, 0, 0, 0.22);
  }

  .party-roster__head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }

  .party-roster__title {
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 0.72rem;
    color: rgba(230, 225, 216, 0.75);
  }

  .party-roster__count {
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
  }

  .party-roster__list {
    margin: 0;
    padding-left: 1.1rem;
    color: var(--gm-text, #e8e4dc);
  }

  .party-roster__item {
    margin: 4px 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-start;
  }

  .party-roster__name {
    display: inline;
  }

  .party-roster__meta {
    display: block;
    font-size: 0.78rem;
    line-height: 1.3;
    opacity: 0.82;
    font-weight: 400;
    color: var(--gm-muted, #9a8f85);
  }

  .party-roster__item--you .party-roster__meta {
    color: rgba(212, 180, 106, 0.75);
  }

  .party-roster__item--you {
    color: rgba(212, 180, 106, 0.95);
  }

  .party-roster__tip {
    margin: 8px 0 0;
    font-size: 0.78rem;
    opacity: 0.88;
    line-height: 1.35;
  }

  .campaign-heading-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: nowrap;
    min-width: 0;
    padding-bottom: 2px;
    border-bottom: 1px solid rgba(212, 180, 106, 0.2);
  }

  .campaign-heading-row .campaign-heading {
    flex: 1 1 auto;
    min-width: 0;
  }

  .campaign-heading-row .chat-room__invite-tool {
    margin-left: auto;
    flex-shrink: 0;
  }

  .campaign-heading-row--no-title .chat-room__invite-tool {
    margin-left: 0;
  }

  .chat-room__invite-tool {
    width: 36px;
    height: 36px;
    border-radius: 9px;
  }

  .chat-room__invite-tool:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .campaign-heading {
    margin: 0;
    font-family: var(--gm-font-serif, Georgia, serif);
    font-size: clamp(1.2rem, 2.8vw, 1.45rem);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--gm-text, #e8e4dc);
    text-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
    line-height: 1.25;
  }

  .chat-toolbar__secondary {
    flex: 0 0 auto;
  }

  /* Chat input form: wider text box and aligned button */
  .chat-input-form {
    display: flex;
    gap: 12px;
    align-items: stretch;
    width: 100%;
    margin-top: 6px;
    padding-top: 4px;
  }

  .chat-input {
    flex: 1 1 auto;
    min-height: 48px;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.35);
    color: var(--gm-text);
    box-sizing: border-box;
    font-family: var(--gm-font-sans);
    font-size: 1rem;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.35);
    position: relative;
    z-index: 6;
  }

  .chat-input:hover {
    border-color: rgba(212, 180, 106, 0.22);
  }

  .chat-input:focus {
    border-color: rgba(212, 180, 106, 0.42);
    box-shadow:
      inset 0 2px 8px rgba(0, 0, 0, 0.35),
      0 0 0 3px rgba(212, 180, 106, 0.12);
  }

  .chat-input::placeholder {
    color: rgba(230, 225, 216, 0.55);
    opacity: 1;
  }

  .chat-send-button {
    flex: 0 0 auto;
    min-height: 48px;
    padding: 0 1.15rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
  }

  /* ensure form sits above any background overlays */
  .chat-input-form {
    position: relative;
    z-index: 6;
  }

  .error-message {
    color: red;
    margin: 1rem 0;
  }

  .character-sheet {
    border: 1px solid rgba(255,255,255,0.03);
    padding: 0.75rem;
    margin-bottom: 1rem;
    background: rgba(255,255,255,0.02);
    color: var(--gm-text);
    border-radius: 8px;
    box-shadow: var(--gm-shadow);
  }

  .character-sheet .cs-title {
    margin: 0 0 0.5rem 0;
    color: var(--gm-text);
  }

  .character-sheet .cs-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .character-sheet .cs-stats {
    font-family: monospace;
    color: var(--gm-text);
  }

  .character-sheet ul {
    margin: 0;
    padding-left: 1.25rem;
  }
  .right-sidebar {
    position: relative;
  }
  @media (max-width: 920px) {
    .two-column { flex-direction: column; }
    .right-sidebar { width: 100%; margin-left: 0; }
  }

  .party-lobby {
    max-width: 560px;
    margin: 0 auto;
    gap: 14px;
  }
  .party-lobby__desc {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.45;
    opacity: 0.92;
    color: var(--gm-text, #e8e4dc);
  }
  .party-lobby__err {
    margin: 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(180, 60, 50, 0.2);
    border: 1px solid rgba(255, 140, 120, 0.35);
    color: #ffc9c0;
    font-size: 0.92rem;
  }
  .party-lobby__status {
    margin: 0;
    font-weight: 600;
    color: var(--gm-accent, #9ec5fe);
  }
  .party-lobby__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .party-lobby__item {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px 12px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .party-lobby__identity {
    flex: 1 1 140px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .party-lobby__meta {
    font-size: 0.8rem;
    line-height: 1.3;
    opacity: 0.82;
    color: var(--gm-muted, #9a8f85);
  }
  .party-lobby__item--head {
    padding: 6px 12px 4px;
    background: transparent;
    border: none;
    opacity: 0.72;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .party-lobby__name {
    font-weight: 600;
  }
  .party-lobby__flags {
    display: flex;
    gap: 10px;
    font-size: 0.85rem;
  }
  .party-lobby__flags--head {
    font-size: 0.72rem;
    font-weight: 600;
  }
  .party-lobby__flag-cell {
    min-width: 7.75rem;
    text-align: right;
  }
  .party-lobby__flag-label {
    color: inherit;
  }
  .party-lobby__flags .ok {
    color: #8fd99b;
  }
  .party-lobby__flags .miss {
    opacity: 0.75;
  }
  .party-lobby__warn {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.85;
    color: #f0c674;
  }

  .party-lobby__open-setup {
    margin-top: 10px;
    align-self: flex-start;
  }

  .party-lobby__setup {
    margin-top: 12px;
    padding: 12px 10px 14px;
    border-radius: 12px;
    border: 1px solid rgba(212, 180, 106, 0.22);
    background: rgba(0, 0, 0, 0.28);
    max-height: min(78vh, 720px);
    overflow: auto;
  }

  .invite-toast {
    position: fixed;
    z-index: 10050;
    bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    max-width: min(420px, calc(100vw - 2rem));
    padding: 0.65rem 1.15rem;
    border-radius: 12px;
    font-size: 0.92rem;
    line-height: 1.35;
    text-align: center;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-family: var(--gm-font-sans, system-ui, sans-serif);
    pointer-events: none;
  }

  .invite-toast--success {
    background: rgba(32, 38, 30, 0.96);
    color: rgba(230, 225, 216, 0.96);
    border-color: rgba(143, 217, 155, 0.38);
  }

  .invite-toast--error {
    background: rgba(44, 26, 24, 0.96);
    color: #ffd4ce;
    border-color: rgba(255, 140, 120, 0.42);
  }

  .invite-toast-enter-active,
  .invite-toast-leave-active {
    transition: opacity 0.28s ease;
  }

  .invite-toast-enter-from,
  .invite-toast-leave-to {
    opacity: 0;
  }
</style>
