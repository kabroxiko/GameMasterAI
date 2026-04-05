<template>
  <div class="ui-panel choose-nickname-panel">
    <h2 class="choose-heading">{{ heading }}</h2>
    <p class="choose-hint">{{ hint }}</p>
    <label class="choose-label" for="dm-nickname-input">{{ $i18n.nickname_label }}</label>
    <input
      id="dm-nickname-input"
      v-model.trim="nickname"
      type="text"
      class="choose-input"
      maxlength="40"
      autocomplete="nickname"
      :placeholder="nameHint"
      @keyup.enter="submit"
    />
    <p v-if="error" class="choose-error">{{ error }}</p>
    <UIButton class="choose-submit" :aria-label="submitLabel" :disabled="busy" @click="submit">
      {{ busy ? $i18n.sending : submitLabel }}
    </UIButton>
  </div>
</template>

<script>
import UIButton from '@/ui/Button.vue';

function safeInternalPath(p) {
  if (!p || typeof p !== 'string') return null;
  if (!p.startsWith('/') || p.startsWith('//')) return null;
  return p;
}

export default {
  name: 'ChooseNickname',
  components: { UIButton },
  data() {
    return {
      nickname: '',
      error: '',
      busy: false,
    };
  },
  computed: {
    isChangeMode() {
      return this.$route.name === 'ChangeNickname';
    },
    heading() {
      return this.isChangeMode ? this.$i18n.nickname_title_change : this.$i18n.nickname_title;
    },
    hint() {
      return this.isChangeMode ? this.$i18n.nickname_hint_change : this.$i18n.nickname_hint;
    },
    submitLabel() {
      return this.isChangeMode ? this.$i18n.nickname_submit_change : this.$i18n.nickname_submit;
    },
    nameHint() {
      return this.$i18n.nickname_placeholder_example;
    },
  },
  mounted() {
    const u = this.$store.state.user;
    const n = u && u.nickname && String(u.nickname).trim();
    if (this.isChangeMode && n) {
      this.nickname = n;
    }
  },
  methods: {
    async submit() {
      if (this.busy) return;
      this.error = '';
      const n = String(this.nickname || '').trim();
      if (!n.length) {
        this.error = this.$i18n.nickname_error_empty;
        return;
      }
      if (n.length > 40) {
        this.error = this.$i18n.nickname_error_length;
        return;
      }
      this.busy = true;
      try {
        await this.$store.dispatch('saveNickname', n);
        const redirect = safeInternalPath(this.$route.query.redirect);
        if (redirect) {
          this.$router.replace(redirect);
        } else {
          this.$router.replace({ name: 'LoadGame' });
        }
      } catch (e) {
        const msg = e.response?.data?.error || e.message || this.$i18n.nickname_error_save;
        this.error = msg;
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>

<style scoped>
.choose-nickname-panel {
  max-width: 420px;
  margin: 1rem auto;
  padding: 1.35rem 1.5rem 1.6rem;
}
.choose-heading {
  margin: 0 0 0.6rem 0;
  font-family: var(--gm-font-serif, Georgia, serif);
  font-size: 1.2rem;
  color: var(--gm-text, #e6e1d8);
}
.choose-hint {
  margin: 0 0 1rem 0;
  line-height: 1.5;
  color: var(--gm-muted, #a8a29a);
  font-size: 0.95rem;
}
.choose-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.9rem;
  color: var(--gm-text, #e6e1d8);
}
.choose-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.25);
  color: var(--gm-text, #e6e1d8);
  font-size: 1rem;
  margin-bottom: 0.75rem;
}
.choose-error {
  margin: 0 0 0.75rem 0;
  color: #ffb4a8;
  font-size: 0.9rem;
}
.choose-submit {
  margin-top: 0.25rem;
}
</style>
