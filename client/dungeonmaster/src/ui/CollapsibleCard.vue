<template>
  <div class="mola-card" :class="{ open: isOpen }" role="region" :aria-expanded="isOpen.toString()">
    <button class="mola-header" @click="toggle" :aria-controls="contentId" :aria-expanded="isOpen.toString()">
      <span class="mola-title"><slot name="title">Details</slot></span>
      <span class="mola-toggle">{{ isOpen ? '▾' : '▸' }}</span>
    </button>
    <div :id="contentId" class="mola-body" v-show="isOpen">
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: "CollapsibleCard",
  props: {
    defaultOpen: { type: Boolean, default: false },
  },
  data() {
    return {
      isOpen: this.defaultOpen,
      contentId: `mola-${Math.random().toString(36).slice(2,9)}`,
    };
  },
  methods: {
    toggle() { this.isOpen = !this.isOpen; },
  },
};
</script>

<style src="./theme.css"></style>

