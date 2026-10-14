<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { useStage } from '../stage';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

type Kind = 'snow' | 'rain' | 'sakura';
const KINDS: Kind[] = ['snow', 'rain', 'sakura'];

// Labels match the extension's visualEffectSnow / Rain / Sakura messages.
const labels: Record<string, Record<Kind, string>> = {
  'en-US': { snow: 'Snow', rain: 'Rain', sakura: 'Sakura' },
  'zh-CN': { snow: '飘雪', rain: '雨', sakura: '樱花' },
  'zh-TW': { snow: '飄雪', rain: '雨', sakura: '櫻花' },
  'ja-JP': { snow: '雪', rain: '雨', sakura: '桜' },
  'ko-KR': { snow: '눈', rain: '비', sakura: '벚꽃' },
  'fr-FR': { snow: 'Neige', rain: 'Pluie', sakura: 'Sakura' },
  'es-ES': { snow: 'Nieve', rain: 'Lluvia', sakura: 'Sakura' },
  'pt-PT': { snow: 'Neve', rain: 'Chuva', sakura: 'Sakura' },
  'ar-SA': { snow: 'ثلج', rain: 'مطر', sakura: 'ساكورا' },
  'ru-RU': { snow: 'Снег', rain: 'Дождь', sakura: 'Сакура' },
};
const t = computed(() => labels[props.lang] ?? labels['en-US']);

const icons: Record<Kind, string> = {
  snow: '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>',
  rain: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>',
  sakura:
    '<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 7.5V9"/><path d="M7.5 12H9"/><path d="M16.5 12H15"/><path d="M12 16.5V15"/><path d="m8 8 1.88 1.88"/><path d="M14.12 9.88 16 8"/><path d="m8 16 1.88-1.88"/><path d="M14.12 14.12 16 16"/>',
};

/* Particle layers follow src/pages/content/visualEffects (snow.ts, rain.ts, sakuraScene.ts),
   with counts scaled to the stage and a darker palette on the light page so it stays visible.
   The canvas covers the whole conversation card and lets every click through. */
type Range = readonly [number, number];
interface Layer {
  count: number;
  size: Range;
  speed: Range;
  opacity: Range;
  drift: Range;
}
const LAYERS: Record<Kind, Layer[]> = {
  snow: [
    { count: 30, size: [0.3, 0.6], speed: [0.15, 0.4], opacity: [0.2, 0.4], drift: [0.05, 0.2] },
    { count: 26, size: [0.7, 1.3], speed: [0.4, 1.0], opacity: [0.35, 0.65], drift: [0.15, 0.45] },
    { count: 16, size: [1.4, 2.8], speed: [0.8, 1.6], opacity: [0.55, 0.85], drift: [0.25, 0.6] },
  ],
  // size = streak length; drift = line width
  rain: [
    { count: 22, size: [6, 14], speed: [3, 6], opacity: [0.08, 0.16], drift: [0.3, 0.6] },
    { count: 16, size: [14, 28], speed: [7, 13], opacity: [0.14, 0.28], drift: [0.5, 1.0] },
    { count: 8, size: [26, 48], speed: [12, 20], opacity: [0.22, 0.4], drift: [0.8, 1.5] },
  ],
  sakura: [
    { count: 10, size: [2.5, 4.5], speed: [0.1, 0.3], opacity: [0.15, 0.3], drift: [0.15, 0.4] },
    { count: 10, size: [4.5, 7.5], speed: [0.25, 0.55], opacity: [0.3, 0.55], drift: [0.35, 0.8] },
    { count: 6, size: [7.5, 11], speed: [0.4, 0.75], opacity: [0.45, 0.7], drift: [0.5, 1.0] },
  ],
};
const REF_AREA = 534 * 420;
const WIND = 0.14; // rain falls ~8° off vertical
const WIND_DX = Math.sin(WIND);
const WIND_DY = Math.cos(WIND);
// Richer than the extension's dark palette: on the small dark card the paler petals read as grey.
const PETAL_DARK = [350, 348, 345, 340, 346, 342, 352, 338].map(
  (h, i) =>
    `hsl(${h} ${[75, 78, 80, 72, 82, 70, 68, 76][i]}% ${[86, 84, 82, 85, 80, 86, 88, 81][i]}%)`,
);
const PETAL_LIGHT = [350, 348, 345, 340, 346, 342, 352, 338].map(
  (h, i) =>
    `hsl(${h} ${[70, 72, 75, 68, 78, 66, 64, 74][i]}% ${[82, 80, 78, 81, 76, 82, 84, 77][i]}%)`,
);

interface P {
  kind: Kind;
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  drift: number;
  phase: number;
  freq: number;
  rot: number;
  spin: number;
  wobble: number;
  color: number;
  splash: boolean;
  fade: number; // 1 while active; counts down once its effect is switched off
  appear: number; // ramps to 1 after a switch so the new effect fades in
}
interface Splash {
  x: number;
  r: number;
  max: number;
  opacity: number;
}

const active = ref<Kind>('snow');
const rootEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

let ctx: CanvasRenderingContext2D | null = null;
let w = 0;
let h = 0;
let particles: P[] = [];
let splashes: Splash[] = [];
let raf = 0;
let last = 0;
let still = false;
let ro: ResizeObserver | null = null;
const timers: ReturnType<typeof setTimeout>[] = [];
const rand = (r: Range) => r[0] + Math.random() * (r[1] - r[0]);

function spawn(kind: Kind, initial: boolean) {
  // Slow snow and petals fade in across the stage; rain is fast enough to fall in from above.
  const scatter = initial || kind !== 'rain';
  const scale = Math.max(0.45, (w * h) / REF_AREA);
  LAYERS[kind].forEach((layer, li) => {
    const n = Math.round(layer.count * scale);
    for (let i = 0; i < n; i++) {
      const size = rand(layer.size);
      particles.push({
        kind,
        x: Math.random() * w,
        y: scatter ? Math.random() * h : -Math.random() * h * 0.5 - size,
        size,
        opacity: rand(layer.opacity),
        speed: rand(layer.speed),
        drift: rand(layer.drift),
        phase: Math.random() * Math.PI * 2,
        freq: kind === 'snow' ? rand([0.0003, 0.0012]) : rand([0.0003, 0.0009]),
        rot: Math.random() * Math.PI * 2,
        spin: rand([0.001, 0.008]) * (Math.random() > 0.5 ? 1 : -1),
        wobble: rand([0.0006, 0.002]),
        color: Math.floor(Math.random() * PETAL_DARK.length),
        splash: kind === 'rain' && li >= 1,
        fade: 1,
        appear: initial ? 1 : 0,
      });
    }
  });
}

function select(kind: Kind, user = false) {
  if (user) timers.forEach(clearTimeout);
  if (kind === active.value) return;
  active.value = kind;
  if (still) {
    particles = [];
    splashes = [];
    spawn(kind, true);
    draw(performance.now(), 0);
    return;
  }
  // The outgoing effect keeps falling and fades, like the extension's draining transition.
  for (const p of particles) p.fade = Math.min(p.fade, 0.999);
  spawn(kind, false);
}

function tracePetal(c: CanvasRenderingContext2D, size: number) {
  const pw = size * 0.85;
  c.beginPath();
  c.moveTo(0, size);
  c.quadraticCurveTo(pw * 1.1, size * 0.15, pw * 0.2, -size * 0.85);
  c.quadraticCurveTo(pw * 0.05, -size * 0.55, 0, -size * 0.65);
  c.quadraticCurveTo(-pw * 0.05, -size * 0.55, -pw * 0.2, -size * 0.85);
  c.quadraticCurveTo(-pw * 1.1, size * 0.15, 0, size);
  c.closePath();
}

function draw(time: number, frames: number) {
  if (!ctx) return;
  const dark = document.documentElement.classList.contains('dark');
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.fade < 1) p.fade -= frames / 40;
    const out = p.y > h + p.size * 2;
    if (p.fade <= 0 || (out && p.fade < 1)) {
      particles.splice(i, 1);
      continue;
    }

    if (p.kind === 'rain') {
      p.x += p.speed * WIND_DX * frames;
      p.y += p.speed * WIND_DY * frames;
      if (p.y > h + p.size) {
        if (p.splash && Math.random() < 0.35 && splashes.length < 12)
          splashes.push({ x: p.x, r: 0.5, max: rand([3, 7]), opacity: rand([0.2, 0.4]) });
        p.y = -(p.size + Math.random() * h * 0.2);
        p.x = Math.random() * (w + 60) - 30;
      }
      if (p.x > w + 30) p.x = -30;
    } else {
      p.y += p.speed * frames;
      p.x += Math.sin(p.phase + time * p.freq) * p.drift * frames;
      p.rot += p.spin * frames;
      if (out) {
        p.y = -p.size * 2;
        p.x = Math.random() * w;
      }
      if (p.x > w + p.size * 2) p.x = -p.size * 2;
      else if (p.x < -p.size * 2) p.x = w + p.size * 2;
    }

    if (p.appear < 1) p.appear = Math.min(1, p.appear + frames / 45);
    const life = Math.max(0, p.fade) * p.appear;
    if (p.kind === 'snow') {
      ctx.globalAlpha = Math.min(1, p.opacity * (dark ? 1 : 1.3)) * life;
      ctx.fillStyle = dark ? '#fff' : 'rgb(140 160 190)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'rain') {
      ctx.globalAlpha = Math.min(1, p.opacity * (dark ? 1 : 1.7)) * life;
      ctx.strokeStyle = dark ? 'rgb(180 200 220)' : 'rgb(95 125 165)';
      ctx.lineWidth = p.drift;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.size * WIND_DX, p.y + p.size * WIND_DY);
      ctx.stroke();
    } else {
      const wob = 0.75 + Math.sin(p.phase + time * p.wobble) * 0.25;
      ctx.globalAlpha = Math.min(1, p.opacity * (dark ? 1.7 : 1.45)) * life;
      ctx.fillStyle = (dark ? PETAL_DARK : PETAL_LIGHT)[p.color];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(wob, 1);
      tracePetal(ctx, p.size);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.lineWidth = 0.7;
  ctx.strokeStyle = dark ? 'rgb(180 200 220)' : 'rgb(95 125 165)';
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.r += 0.25 * frames;
    s.opacity -= 0.012 * frames;
    if (s.opacity <= 0 || s.r >= s.max) {
      splashes.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = s.opacity;
    ctx.beginPath();
    ctx.ellipse(s.x, h - 1, s.r, s.r * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function loop(now: number) {
  const frames = Math.min(2.5, Math.max(0.5, (now - (last || now - 16.7)) / 16.7));
  last = now;
  draw(now, frames);
  raf = requestAnimationFrame(loop);
}

function resize() {
  const el = rootEl.value;
  const canvas = canvasEl.value;
  if (!el || !canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = el.clientWidth;
  h = el.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (still) draw(performance.now(), 0);
}

onMounted(() => {
  ctx = canvasEl.value?.getContext('2d') ?? null;
  if (!ctx) return;
  still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) active.value = 'sakura';
  resize();
  spawn(active.value, true);
  ro = new ResizeObserver(resize);
  if (rootEl.value) ro.observe(rootEl.value);
  if (still) {
    draw(performance.now(), 0);
    return;
  }
  raf = requestAnimationFrame(loop);
  timers.push(setTimeout(() => select('rain'), 2400));
  timers.push(setTimeout(() => select('sakura'), 4800));
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  timers.forEach(clearTimeout);
  ro?.disconnect();
  particles = [];
  splashes = [];
});
</script>

<template>
  <Teleport v-if="stage.regions.hostCover" :to="stage.regions.hostCover">
    <div ref="rootEl" class="gvf-fx" aria-hidden="true">
      <canvas ref="canvasEl" class="gvf-fx-canvas" />
    </div>
  </Teleport>
  <Teleport v-if="stage.regions.chatCover" :to="stage.regions.chatCover">
    <div class="gvf-fx-seg" role="radiogroup" :aria-label="name">
      <button
        v-for="kind in KINDS"
        :key="kind"
        type="button"
        role="radio"
        :aria-checked="active === kind"
        :class="{ active: active === kind }"
        :title="t[kind]"
        @click="select(kind, true)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" v-html="icons[kind]" />
        <span>{{ t[kind] }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-fx {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none !important;
}
.gvf-fx-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.gvf-fx-seg {
  position: absolute;
  inset-block-end: 12px;
  /* Centred over the chat column; the timeline rail takes the right 40px in every direction. */
  left: 0;
  right: 40px;
  margin-inline: auto;
  width: fit-content;
  max-width: calc(100% - 68px);
  box-sizing: border-box;
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: var(--gv-surface);
  color: var(--gv-text);
  border: 1px solid var(--gv-border);
  box-shadow: 0 12px 32px -10px oklch(0 0 0 / 0.28);
  animation: gvf-fx-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) 0.3s both;
}
@keyframes gvf-fx-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
.gvf-fx-seg button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 11px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: color-mix(in srgb, var(--gv-text) 62%, transparent);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}
.gvf-fx-seg button span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gvf-fx-seg button:hover {
  color: var(--gv-text);
}
.gvf-fx-seg button.active {
  background: var(--gv-chip-bg);
  color: var(--gv-chip-fg);
}
.gvf-fx-seg button:focus-visible {
  outline: 2px solid var(--gv-brand);
  outline-offset: 1px;
}
.gvf-fx-seg svg {
  flex: none;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
