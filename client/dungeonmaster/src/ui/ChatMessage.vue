<template>
  <div :class="['chat-message', roleClass]" style="margin-bottom:10px">
    <div style="font-size:0.85rem;color:var(--gm-muted)">{{ sender }}</div>
    <div class="chat-message-body" v-html="message"></div>
  </div>
</template>

<script>
export default {
  name: "ChatMessage",
  props: {
    message: { type: String, required: true },
    sender: { type: String, default: 'DM' },
    role: { type: String, default: 'system' }, // 'player' | 'system'
  },
  computed: {
    roleClass() {
      return this.role === 'player' ? 'from-player' : 'from-system';
    },
  },
};
</script>

<style src="./theme.css"></style>

