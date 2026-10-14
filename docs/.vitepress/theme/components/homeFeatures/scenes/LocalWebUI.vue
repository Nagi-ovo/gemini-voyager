<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { promptReply, renderAnswer } from '../answer';
import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import type { Answer, DemoPrompt } from '../types';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const HOST = 'localhost:3080';
/* The popup's own top toggle for the page you are on: enablePromptManagerOnSite in src/locales.
   On a site you add yourself only the prompt manager loads (docs/guide/prompts.md), so the
   local skin fades the timeline out and the ball appears after a reload. */
const enableLabel: Record<string, string> = {
  'en-US': 'Enable Prompt Manager on {site}',
  'zh-CN': '在 {site} 上开启提示词管理器',
  'zh-TW': '在 {site} 上開啟提示詞管理器',
  'ja-JP': '{site} でプロンプトマネージャーを有効化',
  'ko-KR': '{site}에서 프롬프트 관리자 사용',
  'fr-FR': 'Activer le gestionnaire de prompts sur {site}',
  'es-ES': 'Activar el Gestor de prompts en {site}',
  'pt-PT': 'Ativar o Gerenciador de prompts no {site}',
  'ar-SA': 'تفعيل مدير الموجّهات على {site}',
  'ru-RU': 'Включить менеджер промптов на {site}',
};
const label = computed(() =>
  (enableLabel[props.lang] ?? enableLabel['en-US']).replace('{site}', HOST),
);
const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);
const prompts = computed(() => content.value.promptList.slice(0, 4));

const icon = (name: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiIcons[name] ?? ''}</svg>`;
const reloadIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>';

stage.view.address = HOST;
stage.view.skin = 'gv-local';
stage.view.hideBall = true;

const popOpen = ref(false);
const enabled = ref(false);
const reloading = ref(false);
const pmOpen = ref(false);
const pmPos = reactive({ right: 76, bottom: 92 });
const pending = ref<DemoPrompt | null>(null);
const sent = ref<{ q: string; a: Answer }[]>([]);

const root = ref<HTMLElement | null>(null);
const extBtn = ref<HTMLElement | null>(null);
const reloadBtn = ref<HTMLElement | null>(null);
const switchEl = ref<HTMLElement | null>(null);
const items = ref<HTMLElement[]>([]);
const cursor = reactive({ x: 0, y: 0, show: false, down: false });

const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
const ballEl = () => root.value?.closest('.gvf-tl-host')?.querySelector<HTMLElement>('.gvf-ball');
function aim(el: HTMLElement | null | undefined, fx = 0.5, fy = 0.5) {
  if (!root.value || !el) return;
  const r = root.value.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  cursor.x = e.left - r.left + e.width * fx;
  cursor.y = e.top - r.top + e.height * fy;
}
function aimAt(fx: number, fy: number) {
  if (!root.value) return;
  cursor.x = root.value.clientWidth * fx;
  cursor.y = root.value.clientHeight * fy;
}
function press(fn: () => void) {
  cursor.down = true;
  fn();
  at(160, () => (cursor.down = false));
}

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function reload() {
  popOpen.value = false;
  pmOpen.value = false;
  reloading.value = true;
  stage.view.hideBall = true;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloading.value = false;
    stage.view.hideBall = !enabled.value;
  }, 520);
}
// The panel opens beside the ball, wherever the visitor has dragged it.
function togglePm() {
  const ball = ballEl();
  if (!pmOpen.value && ball && root.value) {
    const r = root.value.getBoundingClientRect();
    const b = ball.getBoundingClientRect();
    pmPos.right = Math.max(8, r.right - b.left + 10);
    pmPos.bottom = Math.max(8, Math.min(r.bottom - b.bottom, r.height - 240));
  }
  pmOpen.value = !pmOpen.value;
}
function choose(p: DemoPrompt) {
  pending.value = p;
  pmOpen.value = false;
}
function send() {
  const p = pending.value;
  const chat = content.value.chats[content.value.current];
  if (!p || !chat) return;
  sent.value.push({ q: p.text, a: promptReply(p.reply, chat, content.value.replyLeads) });
  pending.value = null;
  nextTick(() => stage.scrollChatToEnd());
}

let auto = false;
function takeOver() {
  if (!auto) return;
  auto = false;
  timers.forEach(clearTimeout);
  timers.length = 0;
  cursor.show = false;
  cursor.down = false;
}
const onDocPointer = (e: PointerEvent) => {
  if (e.isTrusted) takeOver();
  const t = e.target as Element | null;
  if (!t) return;
  if (popOpen.value && !t.closest('.gvf-lw-pop') && !t.closest('.gvf-lw-tool')) {
    popOpen.value = false;
  }
  if (pmOpen.value && !t.closest('.gvf-lw-pm') && !t.closest('.gvf-ball')) pmOpen.value = false;
};
// A real click on the ball (it sits above the cover) opens the panel, as on the live site.
const onDocClick = (e: MouseEvent) => {
  const t = e.target as Element | null;
  if (e.isTrusted && t?.closest('.gvf-ball') && root.value?.closest('.gvf-tl-host')?.contains(t)) {
    togglePm();
  }
};

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true);
  document.addEventListener('click', onDocClick);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    enabled.value = true;
    stage.view.hideBall = false;
    pending.value = prompts.value[0] ?? null;
    return;
  }
  auto = true;
  at(150, () => aimAt(0.45, 0.5));
  at(220, () => (cursor.show = true));
  at(400, () => aim(extBtn.value));
  at(950, () => press(() => (popOpen.value = true)));
  at(1350, () => aim(switchEl.value));
  at(1900, () => press(() => (enabled.value = true)));
  at(2250, () => aim(reloadBtn.value));
  at(2800, () => press(reload));
  at(3550, () => aim(ballEl()));
  at(4100, () => press(togglePm));
  at(4500, () => aim(items.value[0], 0.35));
  at(5050, () => press(() => prompts.value[0] && choose(prompts.value[0])));
  at(5700, () => {
    cursor.show = false;
    auto = false;
  });
});
onBeforeUnmount(() => {
  timers.forEach(clearTimeout);
  clearTimeout(reloadTimer);
  document.removeEventListener('pointerdown', onDocPointer, true);
  document.removeEventListener('click', onDocClick);
});
</script>

<template>
  <Teleport v-if="stage.regions.topbarEnd" :to="stage.regions.topbarEnd">
    <button
      ref="reloadBtn"
      type="button"
      class="gvf-lw-tool"
      :class="{ spin: reloading }"
      aria-label="Reload"
      @click="reload"
      v-html="reloadIcon"
    />
    <button
      ref="extBtn"
      type="button"
      class="gvf-lw-tool"
      :class="{ on: popOpen }"
      aria-label="Voyager"
      :aria-expanded="popOpen"
      @click="popOpen = !popOpen"
    >
      <img src="/logo.png" alt="" width="18" height="18" draggable="false" />
    </button>
  </Teleport>

  <!-- Messages sent from a picked prompt -->
  <Teleport v-if="stage.regions.chatTail && sent.length" :to="stage.regions.chatTail">
    <div v-for="(t, i) in sent" :key="i" class="gvf-lw-turn">
      <div class="gvf-q">{{ t.q }}</div>
      <div class="gvf-a" v-html="renderAnswer(t.a)" />
    </div>
  </Teleport>

  <Teleport v-if="stage.regions.hostCover" :to="stage.regions.hostCover">
    <div ref="root" class="gvf-lw">
      <div class="gvf-lw-reload" :class="{ on: reloading }" />

      <div class="gvf-lw-pop" :class="{ open: popOpen }" :aria-hidden="!popOpen">
        <div class="gvf-lw-pop-head">
          <img src="/logo.png" alt="" width="16" height="16" draggable="false" />
          <b>Voyager</b>
        </div>
        <div class="gvf-lw-pop-row">
          <span>{{ label }}</span>
          <button
            ref="switchEl"
            type="button"
            role="switch"
            class="gvf-lw-switch"
            :aria-checked="enabled"
            :aria-label="label"
            :tabindex="popOpen ? 0 : -1"
            @click="enabled = !enabled"
          />
        </div>
        <i class="gvf-lw-bar" style="width: 82%" />
        <i class="gvf-lw-bar" style="width: 58%" />
      </div>

      <div
        class="gvf-lw-pm"
        :class="{ open: pmOpen }"
        :style="{ right: `${pmPos.right}px`, bottom: `${pmPos.bottom}px` }"
        :aria-hidden="!pmOpen"
      >
        <div class="gvf-lw-pm-head">
          <b>Voyager</b>
          <span class="gvf-pm-version">2.0.0</span>
        </div>
        <button
          v-for="p in prompts"
          :key="p.name"
          ref="items"
          type="button"
          class="gvf-item"
          :tabindex="pmOpen ? 0 : -1"
          @click="choose(p)"
        >
          <span class="gvf-item-name">{{ p.name }}</span>
          <span class="gvf-item-tag">{{ p.tag }}</span>
        </button>
      </div>

      <svg
        class="gvf-lw-cursor"
        :class="{ show: cursor.show, down: cursor.down }"
        :style="{ transform: `translate(${cursor.x - 4}px, ${cursor.y - 3}px)` }"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"
        />
      </svg>
    </div>
  </Teleport>

  <!-- The composer, filled from the panel -->
  <Teleport v-if="stage.regions.composerCover && pending" :to="stage.regions.composerCover">
    <div class="gvf-lw-composer">
      <div class="gvf-composer filled">
        <div class="gvf-composer-text">{{ pending.text }}</div>
        <div class="gvf-composer-bar">
          <span class="gvf-icon-btn" v-html="icon('plus', 17)" />
          <button
            type="button"
            class="gvf-icon-btn gvf-send"
            :aria-label="content.composer.send"
            @click="send"
            v-html="icon('arrow-up', 17)"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-lw {
  position: absolute;
  inset: 0;
  pointer-events: none !important;
  overflow: hidden;
}

/* Toolbar */
.gvf-lw-tool {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--host-muted) !important;
  cursor: pointer;
  transition: background 0.15s ease;
  animation: gvf-lw-fade 0.3s ease both;
}
.gvf-lw-tool:hover,
.gvf-lw-tool.on {
  background: color-mix(in srgb, var(--host-text) 9%, transparent);
}
.gvf-lw-tool.spin :deep(svg) {
  animation: gvf-lw-spin 0.5s linear;
}

/* Page reload */
.gvf-lw-reload {
  position: absolute;
  inset: 0;
  background: var(--host-bg);
  opacity: 0;
  transition: opacity 0.18s ease;
}
.gvf-lw-reload.on {
  opacity: 0.92;
}
.gvf-lw-reload::before {
  content: '';
  position: absolute;
  top: 0;
  inset-inline-start: 0;
  height: 2px;
  width: 0;
  background: var(--gv-brand);
}
.gvf-lw-reload.on::before {
  animation: gvf-lw-progress 0.5s ease-out forwards;
}

/* Extension popup */
.gvf-lw-pop {
  position: absolute;
  top: 46px;
  inset-inline-end: 10px;
  width: min(264px, calc(100% - 20px));
  padding: 12px;
  display: grid;
  gap: 8px;
  border: 1px solid var(--gv-border);
  border-radius: 14px;
  background: var(--gv-surface);
  color: var(--gv-text);
  box-shadow: 0 16px 40px -12px oklch(0 0 0 / 0.32);
  transform-origin: top right;
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
  transition:
    opacity 0.18s ease,
    transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
[dir='rtl'] .gvf-lw-pop {
  transform-origin: top left;
}
.gvf-lw-pop.open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-lw-pop-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
}
.gvf-lw-pop-head b {
  font-weight: 700;
}
.gvf-lw-pop-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  background: var(--gv-brand-soft);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
}
.gvf-lw-pop-row span {
  flex: 1;
  min-width: 0;
}
.gvf-lw-bar {
  display: block;
  height: 6px;
  margin-inline: 4px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--gv-text) 10%, transparent);
}
.gvf-lw-switch {
  flex: none;
  position: relative;
  width: 32px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gv-text) 18%, transparent);
  cursor: pointer;
  transition: background 0.2s ease;
}
.gvf-lw-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  inset-inline-start: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.25);
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-lw-switch[aria-checked='true'] {
  background: var(--gv-brand);
}
.gvf-lw-switch[aria-checked='true']::after {
  transform: translateX(14px);
}
[dir='rtl'] .gvf-lw-switch[aria-checked='true']::after {
  transform: translateX(-14px);
}
.gvf-lw-switch:focus-visible {
  outline: 2px solid var(--gv-brand);
  outline-offset: 2px;
}

/* Prompt manager panel beside the ball */
.gvf-lw-pm {
  position: absolute;
  width: min(250px, calc(100% - 90px));
  padding: 8px;
  display: grid;
  gap: 4px;
  border: 1px solid var(--gv-border);
  border-radius: 14px;
  background: var(--gv-surface);
  color: var(--gv-text);
  box-shadow: 0 16px 40px -12px oklch(0 0 0 / 0.32);
  transform-origin: bottom right;
  opacity: 0;
  transform: translateY(6px) scale(0.97);
  transition:
    opacity 0.18s ease,
    transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-lw-pm.open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-lw-pm-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 6px;
  font-size: 13.5px;
}
.gvf-lw-pm-head b {
  font-weight: 700;
}

/* Composer copy */
.gvf-lw-composer {
  position: absolute;
  inset: 0;
  padding: 4px 14px 14px;
  /* Same canvas as the gv-local skin below. */
  background: color-mix(in oklch, var(--host-bg) 96%, var(--host-muted));
}
.gvf-lw-turn {
  display: grid;
  gap: 8px;
  padding-block: 8px 14px;
  animation: gvf-lw-fade 0.35s ease both;
}

/* Scripted cursor */
.gvf-lw-cursor {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 8;
  fill: var(--host-text);
  stroke: var(--host-bg);
  stroke-width: 1.5;
  stroke-linejoin: round;
  pointer-events: none;
  opacity: 0;
  filter: drop-shadow(0 1px 2px oklch(0 0 0 / 0.25));
  transition:
    transform 0.5s cubic-bezier(0.45, 0, 0.2, 1),
    opacity 0.2s ease;
}
.gvf-lw-cursor.show {
  opacity: 1;
}
.gvf-lw-cursor path {
  transition: transform 0.12s ease;
  transform-origin: 4px 4px;
}
.gvf-lw-cursor.down path {
  transform: scale(0.85);
}
@keyframes gvf-lw-fade {
  from {
    opacity: 0;
  }
}
@keyframes gvf-lw-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes gvf-lw-progress {
  to {
    width: 100%;
  }
}
</style>

<style>
/* A neutral local web UI: system font, square-ish bubbles, a bordered box composer.
   Only the prompt manager loads on a custom site, so the timeline is not there. */
.gvf-tl-host.gvf-skin-gv-local {
  background: color-mix(in oklch, var(--host-bg) 96%, var(--host-muted));
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
}
.gvf-tl-host.gvf-skin-gv-local .gvf-topbar {
  font-size: 14px;
  border-bottom: 1px solid var(--gvf-line);
  padding-bottom: 10px;
  margin-bottom: 4px;
}
.gvf-tl-host.gvf-skin-gv-local .gvf-q {
  border-radius: 10px;
  background: color-mix(in oklch, var(--host-text) 7%, transparent);
}
.gvf-tl-host.gvf-skin-gv-local .gvf-composer {
  border-radius: 12px;
  border-color: var(--gvf-line);
  background: var(--host-bg);
}
.gvf-tl-host.gvf-skin-gv-local .gvf-send:not(:disabled) {
  border-radius: 8px;
}
.gvf-tl-host.gvf-skin-gv-local .gvf-tl-zone,
.gvf-tl-host.gvf-skin-gv-local .gvf-tip {
  opacity: 0;
  pointer-events: none;
}
.gvf-tl-host.gvf-skin-gv-local .gvf-ball {
  animation: gvf-lw-ball 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes gvf-lw-ball {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.08);
  }
}
</style>
