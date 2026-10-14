<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

// The extension's range (CHAT_WIDTH_PERCENT); the stage's chat area stands in for the screen.
const MIN = 30;
const MAX = 100;
const NARROW = 40;

const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);
const chat = computed(() => content.value.chats[content.value.current]);
const question = computed(
  () => content.value.promptList.find((p) => p.reply === 'table')?.text ?? '',
);
const table = computed(() => chat.value?.extra.table ?? []);

const phase = ref(0); // 0 nothing, 1 asked, 2 answered
const cardOn = ref(false);
const overflow = ref(false);
const scrollEl = ref<HTMLElement | null>(null);

const width = computed(() => stage.view.chatWidth);
const setWidth = (v: number) => (stage.view.chatWidth = v);

let raf = 0;
const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
let ro: ResizeObserver | undefined;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function tween(to: number, ms: number, done?: () => void) {
  const from = width.value;
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    setWidth(from + (to - from) * ease(p));
    if (p < 1) raf = requestAnimationFrame(step);
    else done?.();
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
  setWidth(Number((e.target as HTMLInputElement).value));
}

// Wide tables scroll sideways in Gemini; the edge fade shows that columns are cut off.
function measure() {
  const el = scrollEl.value;
  overflow.value = !!el && el.scrollWidth > el.clientWidth + 1;
}
function show(step: number) {
  phase.value = step;
  nextTick(() => {
    if (step === 2 && scrollEl.value) {
      ro = new ResizeObserver(measure);
      ro.observe(scrollEl.value);
      measure();
    }
    stage.scrollChatToEnd();
  });
}

onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    show(2);
    cardOn.value = true;
    setWidth(MAX);
    return;
  }
  setWidth(NARROW);
  at(500, () => show(1));
  at(1300, () => show(2));
  at(2300, () => {
    cardOn.value = true;
    stage.scrollChatToEnd();
  });
  // Text reflows as the column widens, so settle on the end of the chat once it is done.
  at(2900, () => tween(MAX, 1800, () => at(650, () => stage.scrollChatToEnd())));
});
onBeforeUnmount(() => {
  stopAutoplay();
  ro?.disconnect();
});
</script>

<template>
  <Teleport v-if="stage.regions.chatTail" :to="stage.regions.chatTail">
    <div v-if="phase" class="gvf-cw-turn">
      <div class="gvf-q">{{ question }}</div>
      <div v-if="phase === 1" class="gvf-a gvf-typing"><i /><i /><i /></div>
      <div v-else class="gvf-a gvf-cw-answer">
        <p>{{ content.replyLeads.table }}</p>
        <div ref="scrollEl" class="gvf-cw-scroll" :class="{ cut: overflow }">
          <table>
            <thead>
              <tr>
                <th v-for="cell in table[0]" :key="cell">{{ cell }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in table.slice(1)" :key="row.join()">
                <td v-for="(cell, i) in row" :key="i">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Teleport>
  <Teleport v-if="stage.regions.chatCover" :to="stage.regions.chatCover">
    <div class="gvf-cw-card" :class="{ on: cardOn }">
      <div class="gvf-cw-head">
        <b>{{ name }}</b>
        <span class="gvf-cw-val">{{ Math.round(width) }}%</span>
      </div>
      <input
        class="gvf-cw-range"
        type="range"
        :min="MIN"
        :max="MAX"
        step="1"
        :value="Math.round(width)"
        :aria-label="name"
        :tabindex="cardOn ? 0 : -1"
        :style="{ '--p': `${((width - MIN) / (MAX - MIN)) * 100}%` }"
        @input="onInput"
      />
    </div>
  </Teleport>
</template>

<style scoped>
/* Same box as the demo's .gvf-turn; kept separate so the timeline does not count it. */
.gvf-cw-turn {
  display: grid;
  gap: 8px;
  /* Extra room at the end so the slider card does not hide the table. */
  padding-block: 8px 84px;
  animation: gvf-cw-in 0.35s ease both;
}
@keyframes gvf-cw-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
.gvf-cw-answer {
  min-width: 0;
  animation: gvf-cw-in 0.35s ease both;
}
.gvf-cw-scroll {
  overflow-x: auto;
  scrollbar-width: thin;
  border-radius: 8px;
}
.gvf-cw-scroll.cut {
  -webkit-mask-image: linear-gradient(to var(--gvf-cw-end, right), #000 82%, transparent);
  mask-image: linear-gradient(to var(--gvf-cw-end, right), #000 82%, transparent);
}
.gvf-cw-scroll:dir(rtl) {
  --gvf-cw-end: left;
}
.gvf-cw-scroll table {
  width: max-content;
  min-width: 100%;
  margin: 0;
  white-space: nowrap;
}

.gvf-cw-card {
  position: absolute;
  inset-block-end: 14px;
  /* Centred over the chat column; the timeline rail takes the right 40px in every direction. */
  left: 0;
  right: 40px;
  margin-inline: auto;
  width: min(260px, calc(100% - 68px));
  box-sizing: border-box;
  padding: 10px 14px 12px;
  border-radius: 14px;
  background: var(--gv-surface);
  color: var(--gv-text);
  border: 1px solid var(--gv-border);
  box-shadow: 0 12px 32px -10px oklch(0 0 0 / 0.28);
  display: grid;
  gap: 8px;
  font-size: 13px;
  line-height: 1.4;
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  pointer-events: none !important;
  transition:
    opacity 0.3s ease,
    transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-cw-card.on {
  opacity: 1;
  transform: none;
  pointer-events: auto !important;
}
.gvf-cw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.gvf-cw-head b {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gvf-cw-val {
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
.gvf-cw-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 16px;
  margin: 0;
  background: none;
  cursor: pointer;
  --track: color-mix(in srgb, var(--gv-text) 12%, transparent);
}
.gvf-cw-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--gv-brand) var(--p), var(--track) var(--p));
}
.gvf-cw-range::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--gv-brand) var(--p), var(--track) var(--p));
}
.gvf-cw-range:dir(rtl)::-webkit-slider-runnable-track {
  background: linear-gradient(to left, var(--gv-brand) var(--p), var(--track) var(--p));
}
.gvf-cw-range:dir(rtl)::-moz-range-track {
  background: linear-gradient(to left, var(--gv-brand) var(--p), var(--track) var(--p));
}
.gvf-cw-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 50%;
  background: var(--gv-surface);
  border: 2px solid var(--gv-brand);
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.2);
}
.gvf-cw-range::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gv-surface);
  border: 2px solid var(--gv-brand);
}
.gvf-cw-range:focus-visible {
  outline: 2px solid var(--gv-brand-soft);
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
