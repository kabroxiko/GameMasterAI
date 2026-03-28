<template>
  <div class="gm-shell">
    <slot />
  </div>
</template>

<script>
export default {
  name: "GMTheme",
  mounted() {
    document.body.classList.add("gm-theme");
  },
  beforeUnmount() {
    document.body.classList.remove("gm-theme");
  },
};
</script>

<style src="./theme.css"></style>

