/** Persists in-progress setup wizard gameId so a full reload can restore game state from the server. */
export const SESSION_SETUP_GAME_ID = 'dm_setup_game_id';
/** Setup wizard opened for joining an existing game (survives losing ?joinGame= on the URL). */
export const SESSION_JOIN_UI_GAME_ID = 'dm_join_ui_game_id';
/** One-shot invite token to consume on /setup (no invite token in the address bar). */
export const SESSION_CONSUME_INVITE = 'dm_consume_invite';
/** One-shot toast payload for ChatRoom after redirect (e.g. already in party). JSON: { message, variant? }. */
export const SESSION_CHAT_TOAST = 'dm_chat_toast';
