<template>
  <div class="ui-panel join-game-panel">
    <h2 class="join-heading">{{ $i18n.join_game_title }}</h2>
    <p v-if="status" class="join-status">{{ status }}</p>
    <p v-if="error" class="join-status join-error">{{ error }}</p>
    <p v-if="awaitingAuth" class="join-home-hint">
      <router-link to="/" class="join-link">{{ $i18n.join_go_home_sign_in }}</router-link>
    </p>
  </div>
</template>

<script>
import { SESSION_CONSUME_INVITE, SESSION_SETUP_GAME_ID } from '@/setupSession.js';

export default {
  name: 'JoinGame',
  data() {
    return {
      status: '',
      error: null,
      awaitingAuth: false,
    };
  },
  async mounted() {
    const token = String(this.$route.params.token || '').trim();
    if (!token) {
      this.error = this.$i18n.join_game_missing_token;
      return;
    }
    try {
      sessionStorage.removeItem(SESSION_SETUP_GAME_ID);
      sessionStorage.setItem('dm_pending_invite', token);
    } catch (e) {
      /* ignore */
    }
    if (!this.$store.getters.isAuthenticated) {
      this.awaitingAuth = true;
      this.error = this.$i18n.join_game_sign_in_first;
      return;
    }
    try {
      sessionStorage.setItem(SESSION_CONSUME_INVITE, token);
    } catch (e) {
      /* ignore */
    }
    await this.$router.replace({ name: 'Setup' });
  },
};
</script>

<style scoped>
.join-game-panel {
  max-width: 480px;
  margin: 1rem auto;
  padding: 1.25rem 1.5rem;
}
.join-heading {
  margin: 0 0 0.75rem 0;
  font-family: var(--gm-font-serif, Georgia, serif);
  font-size: 1.25rem;
  color: var(--gm-text, #e6e1d8);
}
.join-status {
  margin: 0.5rem 0;
  color: var(--gm-text, #e6e1d8);
}
.join-error {
  color: #ffb4a8;
}
.join-home-hint {
  margin: 0.75rem 0 0 0;
}
.join-link {
  display: inline-block;
  margin-top: 0.75rem;
  color: var(--gm-accent, #c9a227);
}
</style>
