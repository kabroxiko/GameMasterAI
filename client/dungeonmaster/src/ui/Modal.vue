<template>
  <div class="modal-backdrop" @click.self="$emit('close')" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:1000;">
    <div class="ui-panel" style="max-width:720px;width:90%;">
      <button @click="$emit('close')" style="float:right;background:none;border:none;color:var(--gm-muted);font-weight:bold">×</button>
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

