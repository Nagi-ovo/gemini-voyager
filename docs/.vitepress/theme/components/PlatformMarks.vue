<script setup lang="ts">
// Platform logos inside a plugin's icon tile. One platform gets a single large
// mark; two or three sit apart in a row or a triangle instead of overlapping.
import { computed } from 'vue';

import type { PlatformMark } from './pluginStore';

const props = defineProps<{ marks: (PlatformMark & { color: string })[] }>();

const shown = computed(() => props.marks.slice(0, 3));
</script>

<template>
  <span class="gv-marks" :class="`gv-marks--${shown.length}`" aria-hidden="true">
    <svg
      v-for="(m, i) in shown"
      :key="i"
      class="gv-marks__mark"
      :viewBox="m.viewBox"
      fill="currentColor"
      :style="{ color: m.color }"
    >
      <path v-for="(d, j) in m.paths" :key="j" :d="d" />
    </svg>
  </span>
</template>

<style scoped>
/* Sized from the host tile (--gv-tile), set by the card or preview row. */
.gv-marks {
  --gv-t: var(--gv-tile, 44px);
  display: grid;
  place-items: center;
  place-content: center;
  width: 100%;
  height: 100%;
}

.gv-marks__mark {
  display: block;
}

.gv-marks--1 .gv-marks__mark {
  width: calc(var(--gv-t) * 0.54);
  height: calc(var(--gv-t) * 0.54);
}

.gv-marks--2 {
  grid-template-columns: repeat(2, auto);
  column-gap: calc(var(--gv-t) * 0.08);
}

.gv-marks--2 .gv-marks__mark {
  width: calc(var(--gv-t) * 0.38);
  height: calc(var(--gv-t) * 0.38);
}

/* Triangle: one mark on top, two below */
.gv-marks--3 {
  grid-template-columns: repeat(2, auto);
  gap: calc(var(--gv-t) * 0.04) calc(var(--gv-t) * 0.08);
}

.gv-marks--3 .gv-marks__mark {
  width: calc(var(--gv-t) * 0.33);
  height: calc(var(--gv-t) * 0.33);
}

.gv-marks--3 .gv-marks__mark:first-child {
  grid-column: 1 / -1;
}
</style>
