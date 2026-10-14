<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { useStage } from '../stage';

defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

/* The prompt library and the ball run on all four sites. The timeline is native on Gemini and an
   official plugin on DeepSeek (catalog/sites/deepseek/plugins/timeline); Claude and ChatGPT have
   no timeline plugin, so their skins fade the rail out. */
const sites = [
  { skin: 'gemini', label: 'Gemini', address: 'gemini.google.com' },
  { skin: 'claude', label: 'Claude', address: 'claude.ai' },
  { skin: 'chatgpt', label: 'ChatGPT', address: 'chatgpt.com' },
  { skin: 'deepseek', label: 'DeepSeek', address: 'chat.deepseek.com' },
] as const;

const current = ref(0);
function show(i: number) {
  current.value = i;
  stage.view.skin = sites[i].skin;
  stage.view.address = sites[i].address;
}

const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
function pick(i: number) {
  timers.forEach(clearTimeout);
  timers.length = 0;
  show(i);
}

show(0);
onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    show(3);
    return;
  }
  at(1300, () => show(1));
  at(2900, () => show(2));
  at(4500, () => show(3));
});
onBeforeUnmount(() => timers.forEach(clearTimeout));
</script>

<template>
  <Teleport v-if="stage.regions.topbarEnd" :to="stage.regions.topbarEnd">
    <div class="gvf-ms-switch">
      <button
        v-for="(s, i) in sites"
        :key="s.skin"
        type="button"
        class="gvf-ms-site"
        :class="[`gvf-ms-${s.skin}`, { on: current === i }]"
        :aria-pressed="current === i"
        :aria-label="s.label"
        :title="s.label"
        @click="pick(i)"
      >
        <i />
        <span>{{ s.label }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-ms-switch {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--host-text) 6%, transparent);
  animation: gvf-ms-in 0.3s ease both;
}
.gvf-ms-site {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--host-muted) !important;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.25s ease,
    color 0.25s ease;
}
.gvf-ms-site i {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--gvf-ms-dot);
}
.gvf-ms-site span {
  display: none;
  white-space: nowrap;
}
.gvf-ms-site.on {
  background: var(--host-bg);
  color: var(--host-text) !important;
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.12);
}
.gvf-ms-site.on span {
  display: inline;
  animation: gvf-ms-in 0.3s ease both;
}
.gvf-ms-site:focus-visible {
  outline: 2px solid var(--gv-brand);
  outline-offset: 1px;
}
/* Brand accents */
.gvf-ms-gemini {
  --gvf-ms-dot: oklch(0.62 0.17 255);
}
.gvf-ms-claude {
  --gvf-ms-dot: oklch(0.68 0.13 45);
}
.gvf-ms-chatgpt {
  --gvf-ms-dot: oklch(0.55 0.01 250);
}
.gvf-ms-deepseek {
  --gvf-ms-dot: oklch(0.58 0.2 268);
}
@keyframes gvf-ms-in {
  from {
    opacity: 0;
  }
}
</style>

<style>
/* Site skins: only the host page changes; the timeline (where the site has one) and the ball stay. */
.gvf-tl-host.gvf-skin-claude,
.gvf-tl-host.gvf-skin-chatgpt,
.gvf-tl-host.gvf-skin-deepseek {
  transition: background-color 0.4s ease;
}
.gvf-tl-host.gvf-skin-claude .gvf-q,
.gvf-tl-host.gvf-skin-chatgpt .gvf-q,
.gvf-tl-host.gvf-skin-deepseek .gvf-q,
.gvf-tl-host.gvf-skin-claude .gvf-composer,
.gvf-tl-host.gvf-skin-chatgpt .gvf-composer,
.gvf-tl-host.gvf-skin-deepseek .gvf-composer {
  transition:
    background-color 0.4s ease,
    border-color 0.4s ease,
    border-radius 0.4s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.4s ease;
}
.gvf-tl-host.gvf-skin-claude .gvf-tl-zone,
.gvf-tl-host.gvf-skin-chatgpt .gvf-tl-zone,
.gvf-tl-host.gvf-skin-deepseek .gvf-tl-zone {
  transition: opacity 0.35s ease;
}
/* Claude and ChatGPT: no timeline plugin. */
.gvf-tl-host.gvf-skin-claude .gvf-tl-zone,
.gvf-tl-host.gvf-skin-chatgpt .gvf-tl-zone,
.gvf-tl-host.gvf-skin-claude .gvf-tip,
.gvf-tl-host.gvf-skin-chatgpt .gvf-tip {
  opacity: 0;
  pointer-events: none;
}

/* Claude: warm canvas, serif replies, a bordered card composer, coral send */
.gvf-tl-host.gvf-skin-claude {
  background: color-mix(in oklch, var(--host-bg) 93%, oklch(0.78 0.07 65));
}
.gvf-tl-host.gvf-skin-claude .gvf-a {
  font-family: ui-serif, Georgia, 'Times New Roman', serif;
  font-size: 1.04em;
}
.gvf-tl-host.gvf-skin-claude .gvf-q {
  border-radius: 12px;
  background: color-mix(in oklch, var(--host-user) 82%, oklch(0.72 0.06 65));
}
.gvf-tl-host.gvf-skin-claude .gvf-composer {
  border-radius: 18px;
  border-color: color-mix(in oklch, var(--host-muted) 30%, transparent);
  background: color-mix(in oklch, var(--host-bg) 97%, oklch(0.78 0.07 65));
  box-shadow: 0 4px 16px -8px oklch(0.4 0.05 60 / 0.35);
}
.gvf-tl-host.gvf-skin-claude .gvf-send:disabled {
  opacity: 1;
  background: oklch(0.68 0.13 45 / 0.55);
  color: white;
  border-radius: 9px;
}

/* ChatGPT: plain white page, rounder bubbles, an outlined pill composer, black send */
.gvf-tl-host.gvf-skin-chatgpt .gvf-q {
  border-radius: 18px;
  background: color-mix(in oklch, var(--host-user) 55%, var(--host-muted) 12%);
}
.gvf-tl-host.gvf-skin-chatgpt .gvf-composer {
  border-radius: 26px;
  border-color: color-mix(in oklch, var(--host-muted) 22%, transparent);
  background: var(--host-bg);
  box-shadow: 0 6px 18px -8px oklch(0 0 0 / 0.22);
}
.gvf-tl-host.gvf-skin-chatgpt .gvf-send:disabled {
  opacity: 0.85;
  background: var(--host-text);
  color: var(--host-bg);
}

/* DeepSeek: blue-tinted bubbles and a tall rounded box with a blue send */
.gvf-tl-host.gvf-skin-deepseek .gvf-q {
  border-radius: 14px;
  background: color-mix(in oklch, var(--host-user) 88%, oklch(0.6 0.17 265) 12%);
}
.gvf-tl-host.gvf-skin-deepseek .gvf-composer {
  border-radius: 20px;
  border-color: color-mix(in oklch, var(--host-muted) 25%, transparent);
  background: var(--host-bg);
  padding-block: 14px 8px;
}
.gvf-tl-host.gvf-skin-deepseek .gvf-send:disabled {
  opacity: 1;
  background: oklch(0.58 0.2 268 / 0.5);
  color: white;
}

/* The ball lands again on each site: a distinct keyframe name restarts the animation. */
.gvf-tl-host.gvf-skin-claude .gvf-ball {
  animation: gvf-ms-land-c 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-tl-host.gvf-skin-chatgpt .gvf-ball {
  animation: gvf-ms-land-g 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-tl-host.gvf-skin-deepseek .gvf-ball {
  animation: gvf-ms-land-d 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes gvf-ms-land-c {
  50% {
    transform: scale(1.12);
  }
}
@keyframes gvf-ms-land-g {
  50% {
    transform: scale(1.12);
  }
}
@keyframes gvf-ms-land-d {
  50% {
    transform: scale(1.12);
  }
}
</style>
