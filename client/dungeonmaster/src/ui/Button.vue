<template>
  <button type="button" class="ui-button" :disabled="disabled" @click="$emit('click')" :aria-label="ariaLabel">
    <slot />
  </button>
</template>

<script>
export default {
  name: "UIButton",
  emits: ["click"],
  props: {
    ariaLabel: { type: String, default: "button" },
    disabled: { type: Boolean, default: false },
  },
};
</script>

<style src="./theme.css"></style>

