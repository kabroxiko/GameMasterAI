<template>
  <button class="ui-button" @click="$emit('click')" :aria-label="ariaLabel">
    <slot />
  </button>
</template>

<script>
export default {
  name: "UIButton",
  props: {
    ariaLabel: { type: String, default: "button" },
  },
};
</script>

<style src="./theme.css"></style>

