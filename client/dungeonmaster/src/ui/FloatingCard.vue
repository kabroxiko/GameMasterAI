<template>
  <div :class="['floating-card', { open: isOpen }]">
    <div
      class="floating-panel parchment-panel ornate-border"
      v-show="isOpen"
      role="dialog"
      aria-modal="true"
      :aria-hidden="(!isOpen).toString()"
      tabindex="-1"
      :aria-labelledby="titleId"
    >
      <div class="floating-header">
        <h2 :id="titleId" class="ui-heading">{{ character.name }}</h2>
        <div class="floating-sub">{{ character.race }} • {{ character.class }} {{ character.level ? ('— ' + $t('level_prefix') + character.level) : '' }}</div>
      </div>
      <div class="floating-body">
        <div class="char-sheet">
          <div class="attributes-row" v-if="character.stats">
            <h3 class="cs-section-title">{{ $i18n.attributes }}</h3>
            <div class="attributes-grid">
              <div class="attr-box"><div class="attr-label">STR</div><div class="attr-value">{{ character.stats.STR }}</div></div>
              <div class="attr-box"><div class="attr-label">DEX</div><div class="attr-value">{{ character.stats.DEX }}</div></div>
              <div class="attr-box"><div class="attr-label">CON</div><div class="attr-value">{{ character.stats.CON }}</div></div>
              <div class="attr-box"><div class="attr-label">INT</div><div class="attr-value">{{ character.stats.INT }}</div></div>
              <div class="attr-box"><div class="attr-label">WIS</div><div class="attr-value">{{ character.stats.WIS }}</div></div>
              <div class="attr-box"><div class="attr-label">CHA</div><div class="attr-value">{{ character.stats.CHA }}</div></div>
            </div>
          </div>

          <div class="char-history">
            <h3 class="cs-section-title">{{ $i18n.background }}</h3>
            <div class="cs-backstory" v-if="character.brief_backstory">{{ character.brief_backstory }}</div>
          </div>

          <div class="char-equipment" v-if="character.starting_equipment && character.starting_equipment.length">
            <h3 class="cs-section-title">{{ $i18n.equipment }}</h3>
            <ul>
              <li v-for="(it,i) in character.starting_equipment" :key="i">{{ it }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Toggle button placed after the panel so it visually sits to the right (outside) of the sheet.
         The same button toggles open/close and updates its icon dynamically. -->
    <button class="floating-toggle" @click="toggle" :aria-expanded="isOpen.toString()" :title="isOpen ? closeLabel : openLabel">
      <span v-if="!isOpen">☰</span>
      <span v-else>✕</span>
    </button>
  </div>
</template>

<script>
export default {
  name: "FloatingCard",
  props: {
    character: { type: Object, required: true },
    defaultOpen: { type: Boolean, default: false },
  },
  computed: {
    // read global language from the store so UI updates reactively
    language() {
      return (this.$store && this.$store.state && this.$store.state.language) || 'English';
    }
  },
  data() {
    return {
      isOpen: this.defaultOpen,
      titleId: 'floating-card-title-' + Math.random().toString(36).slice(2,8),
      openLabel: 'Open character sheet',
      closeLabel: 'Close character sheet',
    };
  },
  methods: {
    toggle() {
      this.isOpen = !this.isOpen;
      // manage focus to avoid aria-hidden conflicts: move focus to the toggle when closing,
      // and focus the panel when opening so assistive tech sees the dialog.
      this.$nextTick(() => {
        if (!this.isOpen) {
          const btn = this.$el.querySelector('.floating-toggle');
          if (btn) btn.focus();
        } else {
          const panel = this.$el.querySelector('.floating-panel');
          if (panel) panel.focus();
        }
      });
    }
  }
};
</script>

<style src="./theme.css"></style>

