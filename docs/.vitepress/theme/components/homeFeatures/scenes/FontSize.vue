<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { useStage } from '../stage';

defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

// The extension's range (CHAT_FONT_SIZE_PERCENT), applied to the whole conversation.
const MIN = 80;
const MAX = 150;

const cardOn = ref(false);
const size = computed(() => stage.view.fontScale * 100);
const setSize = (v: number) => (stage.view.fontScale = v / 100);

let raf = 0;
const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function tween(to: number, ms: number) {
  const from = size.value;
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    setSize(from + (to - from) * ease(p));
    if (p < 1) raf = requestAnimationFrame(step);
  };
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(step);
}
function stopAutoplay() {
  cancelAnimationFrame(raf);
  timers.forEach(clearTimeout);
}
function onInput(e: Event) {
  stopAutoplay();
  cardOn.value = true;
  setSize(Number((e.target as HTMLInputElement).value));
}

onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cardOn.value = true;
    setSize(125);
    return;
  }
  // Smaller for density first, then larger for comfort; it ends on the larger size.
  at(300, () => (cardOn.value = true));
  at(900, () => tween(85, 1000));
  at(2400, () => tween(125, 1600));
});
onBeforeUnmount(stopAutoplay);
</script>

<template>
  <Teleport v-if="stage.regions.chatCover" :to="stage.regions.chatCover">
    <div class="gvf-fs-card" :class="{ on: cardOn }">
      <div class="gvf-fs-head">
        <b>{{ name }}</b>
        <span class="gvf-fs-val">{{ Math.round(size) }}%</span>
      </div>
      <div class="gvf-fs-slider">
        <span class="gvf-fs-a1" aria-hidden="true">A</span>
        <input
          class="gvf-fs-range"
          type="range"
          :min="MIN"
          :max="MAX"
          step="1"
          :value="Math.round(size)"
          :aria-label="name"
          :tabindex="cardOn ? 0 : -1"
          :style="{ '--p': `${((size - MIN) / (MAX - MIN)) * 100}%` }"
          @input="onInput"
        />
        <span class="gvf-fs-a2" aria-hidden="true">A</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-fs-card {
  position: absolute;
  inset-block-end: 14px;
  /* Centred over the chat column; the timeline rail takes the right 40px in every direction. */
  left: 0;
  right: 40px;
  margin-inline: auto;
  width: min(260px, calc(100% - 68px));
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--gv-surface);
  color: var(--gv-text);
  border: 1px solid var(--gv-border);
  box-shadow: 0 12px 32px -10px oklch(0 0 0 / 0.28);
  display: grid;
  gap: 6px;
  font-size: 13px;
  line-height: 1.4;
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  pointer-events: none !important;
  transition:
    opacity 0.3s ease,
    transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-fs-card.on {
  opacity: 1;
  transform: none;
  pointer-events: auto !important;
}
.gvf-fs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.gvf-fs-head b {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gvf-fs-val {
  flex: none;
  min-width: 3.4em;
  text-align: center;
  padding: 1px 7px;
  border-radius: 6px;
  background: var(--gv-chip-bg);
  color: var(--gv-chip-fg);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.gvf-fs-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  color: color-mix(in srgb, var(--gv-text) 55%, transparent);
  font-weight: 600;
}
.gvf-fs-a1 {
  font-size: 10px;
}
.gvf-fs-a2 {
  font-size: 15px;
}
.gvf-fs-range {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  min-width: 0;
  height: 16px;
  margin: 0;
  background: none;
  cursor: pointer;
  --track: color-mix(in srgb, var(--gv-text) 12%, transparent);
}
.gvf-fs-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--gv-brand) var(--p), var(--track) var(--p));
}
.gvf-fs-range::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--gv-brand) var(--p), var(--track) var(--p));
}
.gvf-fs-range:dir(rtl)::-webkit-slider-runnable-track {
  background: linear-gradient(to left, var(--gv-brand) var(--p), var(--track) var(--p));
}
.gvf-fs-range:dir(rtl)::-moz-range-track {
  background: linear-gradient(to left, var(--gv-brand) var(--p), var(--track) var(--p));
}
.gvf-fs-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 50%;
  background: var(--gv-surface);
  border: 2px solid var(--gv-brand);
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.2);
}
.gvf-fs-range::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gv-surface);
  border: 2px solid var(--gv-brand);
}
.gvf-fs-range:focus-visible {
  outline: 2px solid var(--gv-brand-soft);
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
