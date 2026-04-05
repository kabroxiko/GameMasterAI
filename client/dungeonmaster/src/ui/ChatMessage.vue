<template>
  <article :class="['chat-message', roleClass]">
    <div class="chat-message__meta">{{ sender }}</div>
    <div class="chat-message-body" v-html="message"></div>
  </article>
</template>

<script>
export default {
  name: "ChatMessage",
  props: {
    message: { type: String, required: true },
    sender: { type: String, default: 'DM' },
    /** 'player' | 'dm' (narration); legacy 'system' treated as dm */
    role: { type: String, default: 'dm' },
  },
  computed: {
    roleClass() {
      if (this.role === 'player') return 'chat-message--player';
      return 'chat-message--dm';
    },
  },
};
</script>

<style src="./theme.css"></style>

