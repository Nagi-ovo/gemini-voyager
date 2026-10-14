<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { useStage } from '../stage';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const ASK: Record<string, string> = {
  'zh-CN': '画一张京都东山的秋日黄昏',
  'zh-TW': '畫一張京都東山的秋日黃昏',
  'en-US': 'Draw an autumn sunset over the hills of Kyoto',
  'ja-JP': '京都・東山の秋の夕暮れを描いて',
  'ko-KR': '교토 히가시야마의 가을 노을을 그려 줘',
  'fr-FR': 'Dessine un coucher de soleil d’automne sur les collines de Kyoto',
  'es-ES': 'Dibuja un atardecer de otoño sobre las colinas de Kioto',
  'pt-PT': 'Desenha um pôr do sol de outono sobre as colinas de Quioto',
  'ar-SA': 'ارسم غروب شمس خريفيًا فوق تلال كيوتو',
  'ru-RU': 'Нарисуй осенний закат над холмами Киото',
};
const ask = computed(() => ASK[props.lang] ?? ASK['en-US']);

/** Divider position in percent from the left edge: left of it is Gemini's file, right is Voyager's. */
const pos = ref(100);
const phase = ref<'typing' | 'image' | 'compare'>('typing');
const dragging = ref(false);
const frameEl = ref<HTMLElement | null>(null);

let raf = 0;
const timers: number[] = [];
const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
const follow = () => nextTick(() => stage.scrollChatToEnd());
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function tween(to: number, ms: number, done?: () => void) {
  cancelAnimationFrame(raf);
  const from = pos.value;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / ms, 1);
    pos.value = from + (to - from) * ease(t);
    if (t < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
}
function stopAuto() {
  cancelAnimationFrame(raf);
  timers.forEach((t) => clearTimeout(t));
  phase.value = 'compare';
}

function setFromPointer(e: PointerEvent) {
  const r = frameEl.value?.getBoundingClientRect();
  if (!r) return;
  pos.value = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
}
function down(e: PointerEvent) {
  stopAuto();
  dragging.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  setFromPointer(e);
}
function move(e: PointerEvent) {
  if (dragging.value) setFromPointer(e);
}
function up() {
  dragging.value = false;
}
function key(e: KeyboardEvent) {
  const step = e.shiftKey ? 10 : 4;
  const delta =
    e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : e.key === 'Home' ? -100 : 0;
  const end = e.key === 'End' ? 100 : null;
  if (!delta && end === null) return;
  e.preventDefault();
  stopAuto();
  pos.value = end ?? Math.min(100, Math.max(0, pos.value + delta));
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    phase.value = 'compare';
    pos.value = 58;
    follow();
    return;
  }
  follow();
  at(800, () => {
    phase.value = 'image';
    follow();
  });
  // Show Gemini's file with its mark, then sweep Voyager's copy across it and rest mid-way.
  at(2000, () => {
    phase.value = 'compare';
    tween(4, 1600, () => tween(58, 700));
  });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  timers.forEach((t) => clearTimeout(t));
});
</script>

<template>
  <Teleport v-if="stage.regions.chatTail" :to="stage.regions.chatTail">
    <div class="gvf-wm-turn">
      <div class="gvf-q">{{ ask }}</div>
      <div v-if="phase === 'typing'" class="gvf-a gvf-typing"><i /><i /><i /></div>
      <div
        v-else
        ref="frameEl"
        class="gvf-wm-frame"
        :class="{ dragging, compare: phase === 'compare' }"
        dir="ltr"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
      >
        <svg
          v-for="layer in ['before', 'after']"
          :key="layer"
          class="gvf-wm-img"
          :style="layer === 'after' ? { clipPath: `inset(0 0 0 ${pos}%)` } : undefined"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <linearGradient :id="`gvf-wm-sky-${layer}`" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#ffd9a8" />
              <stop offset="0.55" stop-color="#ffb38a" />
              <stop offset="1" stop-color="#f08a7a" />
            </linearGradient>
            <linearGradient :id="`gvf-wm-lake-${layer}`" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#6a5a9e" />
              <stop offset="1" stop-color="#3b3570" />
            </linearGradient>
          </defs>
          <rect width="400" height="300" :fill="`url(#gvf-wm-sky-${layer})`" />
          <circle cx="262" cy="120" r="34" fill="#fff4d6" />
          <circle cx="262" cy="120" r="50" fill="#fff4d6" opacity="0.25" />
          <path
            d="M0 190 L70 120 L120 160 L190 92 L260 170 L320 128 L400 180 V300 H0Z"
            fill="#b5658a"
          />
          <!-- A five-storey pagoda on the near ridge -->
          <g fill="#5e3b6e">
            <rect x="111" y="118" width="3" height="86" />
            <path d="M96 136h33l-6-7h-21Z" />
            <path d="M98 150h29l-6-7h-17Z" />
            <path d="M100 164h25l-5-7h-15Z" />
            <path d="M101 178h23l-5-7h-13Z" />
            <path d="M102 192h21l-5-7h-11Z" />
          </g>
          <path
            d="M0 214 L60 176 L130 206 L210 150 L290 204 L350 180 L400 200 V300 H0Z"
            fill="#7d4f86"
          />
          <rect y="222" width="400" height="78" :fill="`url(#gvf-wm-lake-${layer})`" />
          <rect x="232" y="232" width="60" height="3" rx="1.5" fill="#fff4d6" opacity="0.55" />
          <rect x="244" y="242" width="36" height="3" rx="1.5" fill="#fff4d6" opacity="0.4" />
          <rect x="252" y="252" width="20" height="3" rx="1.5" fill="#fff4d6" opacity="0.3" />
          <!-- Gemini's visible watermark: a translucent sparkle near the bottom-right corner -->
          <path
            v-if="layer === 'before'"
            d="M356 242c.6 7.4 6.5 13.4 14 14-7.5.6-13.4 6.6-14 14-.6-7.4-6.5-13.4-14-14 7.5-.6 13.4-6.6 14-14Z"
            fill="#fff"
            opacity="0.62"
          />
        </svg>

        <!-- Which side is which: Gemini's file on the left, Voyager's on the right -->
        <span
          class="gvf-wm-tag gvf-wm-tag-before"
          :style="{ opacity: pos > 18 ? 1 : 0 }"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width="12" height="12">
            <path
              d="M12 2c.3 5.4 4.6 9.7 10 10-5.4.3-9.7 4.6-10 10-.3-5.4-4.6-9.7-10-10 5.4-.3 9.7-4.6 10-10Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span
          class="gvf-wm-tag gvf-wm-tag-after"
          :style="{ opacity: phase === 'compare' && pos < 82 ? 1 : 0 }"
          aria-hidden="true"
        >
          <img src="/logo.png" alt="" width="14" height="14" draggable="false" />
        </span>

        <div
          v-if="phase === 'compare'"
          class="gvf-wm-divider"
          :style="{ left: `${pos}%` }"
          role="slider"
          tabindex="0"
          :aria-label="props.name"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(pos)"
          @keydown="key"
        >
          <span class="gvf-wm-handle">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m9 7-5 5 5 5" />
              <path d="m15 7 5 5-5 5" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Same box as .gvf-turn; that class stays off so the timeline's dots keep matching the chat. */
.gvf-wm-turn {
  display: grid;
  gap: 8px;
  padding-block: 8px 14px;
  animation: gvf-wm-in 0.35s ease both;
}
@keyframes gvf-wm-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.gvf-wm-frame {
  position: relative;
  justify-self: start;
  width: min(100%, 340px);
  aspect-ratio: 4 / 3;
  border-radius: 14px;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  box-shadow: 0 0 0 1px var(--gvf-line);
  animation: gvf-wm-reveal 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.gvf-wm-frame.compare {
  cursor: ew-resize;
}
@keyframes gvf-wm-reveal {
  from {
    opacity: 0;
    filter: blur(10px);
    transform: scale(0.98);
  }
}
.gvf-wm-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.gvf-wm-tag {
  position: absolute;
  top: 8px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 99px;
  background: oklch(1 0 0 / 0.8);
  color: oklch(0.55 0.16 265);
  box-shadow: 0 1px 4px oklch(0 0 0 / 0.18);
  backdrop-filter: blur(4px);
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.gvf-wm-tag-before {
  left: 8px;
}
.gvf-wm-tag-after {
  right: 8px;
}
.gvf-wm-tag img {
  display: block;
}
.gvf-wm-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #fff;
  box-shadow: 0 0 8px oklch(0 0 0 / 0.25);
  outline: none;
  animation: gvf-wm-fade 0.25s ease both;
}
@keyframes gvf-wm-fade {
  from {
    opacity: 0;
  }
}
.gvf-wm-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #fff;
  color: oklch(0.3 0.01 285);
  box-shadow: 0 2px 10px oklch(0 0 0 / 0.25);
  transform: translate(-50%, -50%);
  transition: transform 0.15s ease;
}
.gvf-wm-frame.dragging .gvf-wm-handle,
.gvf-wm-divider:focus-visible .gvf-wm-handle {
  transform: translate(-50%, -50%) scale(1.1);
}
.gvf-wm-divider:focus-visible .gvf-wm-handle {
  box-shadow:
    0 0 0 3px var(--gv-brand),
    0 2px 10px oklch(0 0 0 / 0.25);
}
</style>
