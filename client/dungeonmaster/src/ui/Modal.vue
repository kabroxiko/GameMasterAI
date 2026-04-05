<template>
  <div
    class="modal-backdrop"
    role="presentation"
    @click.self="$emit('close')"
  >
    <div class="modal-panel ui-panel">
      <button
        type="button"
        class="modal-close"
        aria-label="Close"
        @click="$emit('close')"
      >×</button>
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: "UIModal",
};
</script>

<style src="./theme.css"></style>

