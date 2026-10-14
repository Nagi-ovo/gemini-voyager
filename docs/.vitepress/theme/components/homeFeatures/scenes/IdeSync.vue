<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import type { Answer } from '../types';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

/* Popup Context Sync card strings from src/locales: contextSync, ideOnline, syncToIDE.
   Port 3030 is SyncService's default; CoBridge writes .cobridge/AI_CONTEXT.md (docs/guide/context-sync.md). */
const copy: Record<string, [string, string, string]> = {
  'en-US': ['Context Sync', 'IDE Online', 'Sync to IDE'],
  'zh-CN': ['上下文同步', 'IDE 在线', '同步到 IDE'],
  'zh-TW': ['上下文同步', 'IDE 線上', '同步到 IDE'],
  'ja-JP': ['コンテキスト同期', 'IDE オンライン', 'IDE に同期'],
  'ko-KR': ['컨텍스트 동기화', 'IDE 온라인', 'IDE 로 동기화'],
  'fr-FR': ['Synchro du contexte', 'IDE en ligne', "Synchroniser vers l'IDE"],
  'es-ES': ['Sincronización de contexto', 'IDE en línea', 'Sincronizar con IDE'],
  'pt-PT': ['Sincronização de Contexto', 'IDE Online', 'Sincronizar com IDE'],
  'ar-SA': ['مزامنة السياق', 'IDE متصل', 'مزامنة مع IDE'],
  'ru-RU': ['Синхронизация контекста', 'IDE Онлайн', 'Синхронизировать с IDE'],
};
const t = computed(() => copy[props.lang] ?? copy['en-US']);
const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);

/* AI_CONTEXT.md is the default chat itself: its title, then each question and the start of its answer. */
const plain = (a: Answer): string => {
  const raw = typeof a === 'string' ? a : (a.lead ?? a.text ?? a.list?.join(' · ') ?? '');
  return raw
    .split('\n')
    .filter((l) => l && !l.startsWith('- '))
    .join(' ');
};
const lines = computed(() => {
  const chat = content.value.chats[content.value.current];
  if (!chat) return [];
  const out: { md?: string; text: string }[] = [{ md: '#', text: chat.title }, { text: '' }];
  for (const [q, a] of chat.turns) {
    out.push({ md: '##', text: q }, { text: plain(a) }, { text: '' });
  }
  return out;
});

const popOpen = ref(false);
const syncing = ref(false);
const synced = ref(false);
const ideOpen = ref(false);
const fileOpen = ref(false);
const shown = ref(0);

const root = ref<HTMLElement | null>(null);
const extBtn = ref<HTMLElement | null>(null);
const syncBtn = ref<HTMLElement | null>(null);
const fileRow = ref<HTMLElement | null>(null);
const cursor = reactive({ x: 0, y: 0, show: false, down: false });

const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
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

let syncTimer: ReturnType<typeof setTimeout> | undefined;
let streamTimer: ReturnType<typeof setInterval> | undefined;
function setIde(open: boolean) {
  ideOpen.value = open;
  stage.view.hideBall = open;
}
function sync() {
  if (syncing.value) return;
  syncing.value = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncing.value = false;
    synced.value = true;
    popOpen.value = false;
    setIde(true);
  }, 1000);
}
function openFile(instant = false) {
  fileOpen.value = true;
  clearInterval(streamTimer);
  if (instant) {
    shown.value = lines.value.length;
    return;
  }
  shown.value = 0;
  streamTimer = setInterval(() => {
    shown.value++;
    if (shown.value >= lines.value.length) clearInterval(streamTimer);
  }, 55);
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
  const el = e.target as Element | null;
  if (popOpen.value && el && !el.closest('.gvf-ide-pop') && !el.closest('.gvf-ide-ext')) {
    popOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    synced.value = true;
    setIde(true);
    openFile(true);
    return;
  }
  auto = true;
  at(150, () => aimAt(0.42, 0.5));
  at(220, () => (cursor.show = true));
  at(400, () => aim(extBtn.value));
  at(950, () => press(() => (popOpen.value = true)));
  at(1350, () => aim(syncBtn.value));
  at(1900, () => press(sync));
  at(3500, () => aim(fileRow.value, 0.4));
  at(4050, () => press(() => openFile()));
  at(4700, () => {
    cursor.show = false;
    auto = false;
  });
});
onBeforeUnmount(() => {
  timers.forEach(clearTimeout);
  clearTimeout(syncTimer);
  clearInterval(streamTimer);
  document.removeEventListener('pointerdown', onDocPointer, true);
});
</script>

<template>
  <Teleport v-if="stage.regions.topbarEnd" :to="stage.regions.topbarEnd">
    <button
      ref="extBtn"
      type="button"
      class="gvf-ide-ext"
      :class="{ on: popOpen }"
      aria-label="Voyager"
      :aria-expanded="popOpen"
      @click="popOpen = !popOpen"
    >
      <img src="/logo.png" alt="" width="18" height="18" draggable="false" />
    </button>
  </Teleport>

  <!-- The page being read while it syncs -->
  <Teleport v-if="stage.regions.chatCover && syncing" :to="stage.regions.chatCover">
    <div class="gvf-ide-scan" aria-hidden="true" />
  </Teleport>

  <Teleport v-if="stage.regions.hostCover" :to="stage.regions.hostCover">
    <div ref="root" class="gvf-ide">
      <!-- Voyager popup: Context Sync card -->
      <div class="gvf-ide-pop" :class="{ open: popOpen }" :aria-hidden="!popOpen">
        <div class="gvf-ide-pop-head">
          <img src="/logo.png" alt="" width="16" height="16" draggable="false" />
          <b>Voyager</b>
        </div>
        <div class="gvf-ide-card">
          <b>{{ t[0] }}</b>
          <div class="gvf-ide-status">
            <span class="gvf-ide-online" />
            <span>{{ t[1] }}</span>
            <code>:3030</code>
          </div>
          <button
            ref="syncBtn"
            type="button"
            class="gvf-ide-sync"
            :class="{ busy: syncing }"
            :disabled="syncing"
            :tabindex="popOpen ? 0 : -1"
            @click="sync"
          >
            <svg
              v-if="syncing"
              class="gvf-ide-spin"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            </svg>
            <svg
              v-else-if="synced"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <svg
              v-else
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="m17 8-5-5-5 5" />
              <path d="M12 3v12" />
            </svg>
            <span>{{ t[2] }}</span>
          </button>
        </div>
      </div>

      <!-- VS Code with the CoBridge output -->
      <section class="gvf-ide-app" :class="{ open: ideOpen }" :aria-hidden="!ideOpen" dir="ltr">
        <div class="gvf-ide-title">
          <span class="gvf-ide-lights"><i /><i /><i /></span>
          <span class="gvf-ide-name">AI_CONTEXT.md — your-project</span>
          <button
            type="button"
            class="gvf-ide-close"
            aria-label="Close"
            :tabindex="ideOpen ? 0 : -1"
            @click="setIde(false)"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div class="gvf-ide-body">
          <div class="gvf-ide-tree">
            <div class="gvf-ide-root">YOUR-PROJECT</div>
            <div v-if="synced" class="gvf-ide-new">
              <div class="gvf-ide-row d1"><span class="gvf-ide-chev">⌄</span>.cobridge</div>
              <button
                ref="fileRow"
                type="button"
                class="gvf-ide-row d2 gvf-ide-file"
                :class="{ cur: fileOpen }"
                :tabindex="ideOpen ? 0 : -1"
                @click="openFile()"
              >
                <span class="gvf-ide-md">M↓</span>AI_CONTEXT.md
              </button>
            </div>
            <div class="gvf-ide-row d1"><span class="gvf-ide-chev">›</span>.github</div>
            <div class="gvf-ide-row d1"><span class="gvf-ide-chev">›</span>src</div>
            <div class="gvf-ide-row d1 dim">.cursorrules</div>
            <div class="gvf-ide-row d1 dim">.gitignore</div>
            <div class="gvf-ide-row d1 dim">package.json</div>
          </div>
          <div class="gvf-ide-editor">
            <template v-if="fileOpen">
              <div class="gvf-ide-tabs"><span class="gvf-ide-tab">AI_CONTEXT.md</span></div>
              <div class="gvf-ide-code">
                <div v-for="(l, k) in lines.slice(0, shown)" :key="k" class="gvf-ide-line">
                  <em>{{ k + 1 }}</em>
                  <span :class="{ h: l.md }"
                    ><b v-if="l.md">{{ `${l.md} ` }}</b
                    >{{ l.text }}</span
                  >
                </div>
              </div>
            </template>
            <div v-else class="gvf-ide-empty" aria-hidden="true">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m16 18 6-6-6-6" />
                <path d="m8 6-6 6 6 6" />
              </svg>
            </div>
          </div>
        </div>
        <div class="gvf-ide-statusbar">
          <span>CoBridge :3030</span>
          <span v-if="synced">✓ AI_CONTEXT.md</span>
        </div>
      </section>

      <svg
        class="gvf-ide-cursor"
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
</template>

<style scoped>
.gvf-ide {
  position: absolute;
  inset: 0;
  pointer-events: none !important;
  overflow: hidden;
  container-type: inline-size;
  --gvf-ide-ok: oklch(0.68 0.16 150);
  /* VS Code chrome follows the page theme. */
  --gvf-ide-bg: oklch(0.985 0.002 250);
  --gvf-ide-side: oklch(0.955 0.003 250);
  --gvf-ide-fg: oklch(0.3 0.01 250);
  --gvf-ide-dim: oklch(0.55 0.01 250);
  --gvf-ide-line: oklch(0.88 0.004 250);
  --gvf-ide-accent: oklch(0.55 0.16 250);
}
.dark .gvf-ide {
  --gvf-ide-bg: oklch(0.21 0.004 250);
  --gvf-ide-side: oklch(0.24 0.004 250);
  --gvf-ide-fg: oklch(0.86 0.004 250);
  --gvf-ide-dim: oklch(0.62 0.006 250);
  --gvf-ide-line: oklch(0.32 0.004 250);
  --gvf-ide-accent: oklch(0.7 0.14 250);
}

/* Toolbar button */
.gvf-ide-ext {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
  animation: gvf-ide-fade 0.3s ease both;
}
.gvf-ide-ext:hover,
.gvf-ide-ext.on {
  background: color-mix(in srgb, var(--host-text) 9%, transparent);
}

/* Read sweep over the chat */
.gvf-ide-scan {
  position: absolute;
  inset: 0;
  pointer-events: none !important;
  background: linear-gradient(
    180deg,
    transparent 0%,
    color-mix(in srgb, var(--gv-brand) 14%, transparent) 50%,
    transparent 100%
  );
  background-size: 100% 40%;
  background-repeat: no-repeat;
  animation: gvf-ide-sweep 1s ease-in-out;
}

/* Popup */
.gvf-ide-pop {
  position: absolute;
  top: 46px;
  inset-inline-end: 10px;
  width: min(250px, calc(100% - 20px));
  padding: 12px;
  display: grid;
  gap: 9px;
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
  z-index: 2;
}
[dir='rtl'] .gvf-ide-pop {
  transform-origin: top left;
}
.gvf-ide-pop.open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-ide-pop-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
}
.gvf-ide-pop-head b {
  font-weight: 700;
}
.gvf-ide-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--gv-border);
  border-radius: 10px;
}
.gvf-ide-card > b {
  font-size: 12.5px;
  font-weight: 600;
}
.gvf-ide-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--gvf-muted);
}
.gvf-ide-status code {
  margin-inline-start: auto;
  font: 11px/1 var(--vp-font-family-mono);
}
.gvf-ide-online {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gvf-ide-ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gvf-ide-ok) 22%, transparent);
}
.gvf-ide-sync {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: var(--gv-brand);
  color: #fff !important;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.gvf-ide-sync.busy {
  opacity: 0.75;
  cursor: progress;
}
.gvf-ide-spin {
  animation: gvf-ide-rot 0.8s linear infinite;
}

/* VS Code panel sliding in from the card's right */
.gvf-ide-app {
  position: absolute;
  top: 8px;
  bottom: 8px;
  right: 8px;
  width: min(62%, 420px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--gvf-ide-line);
  border-radius: 12px;
  background: var(--gvf-ide-bg);
  color: var(--gvf-ide-fg);
  box-shadow: 0 24px 60px -18px oklch(0 0 0 / 0.45);
  overflow: hidden;
  font-size: 12px;
  transform: translateX(calc(100% + 16px));
  transition: transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@container (max-width: 480px) {
  .gvf-ide-app {
    width: calc(100% - 16px);
  }
}
.gvf-ide-app.open {
  transform: none;
  pointer-events: auto;
}
.gvf-ide-title {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding-inline: 10px 4px;
  background: var(--gvf-ide-side);
  border-bottom: 1px solid var(--gvf-ide-line);
  color: var(--gvf-ide-dim);
  font-size: 11px;
}
.gvf-ide-lights {
  display: flex;
  gap: 5px;
}
.gvf-ide-lights i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--gvf-ide-dim) 40%, transparent);
}
.gvf-ide-name {
  flex: 1;
  min-width: 0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gvf-ide-close {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--gvf-ide-dim) !important;
  cursor: pointer;
}
.gvf-ide-close:hover {
  background: color-mix(in srgb, var(--gvf-ide-fg) 10%, transparent);
}
.gvf-ide-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.55fr);
}
@container (max-width: 380px) {
  .gvf-ide-body {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr);
  }
}
.gvf-ide-tree {
  padding: 8px 0;
  background: var(--gvf-ide-side);
  border-right: 1px solid var(--gvf-ide-line);
  font: 11.5px/1 var(--vp-font-family-base);
  min-width: 0;
  overflow: hidden;
}
.gvf-ide-root {
  padding: 2px 10px 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--gvf-ide-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gvf-ide-row {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  height: 22px;
  padding: 0;
  border: 0;
  background: none;
  text-align: start;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11.5px;
}
.gvf-ide-row.d1 {
  padding-left: 10px;
}
.gvf-ide-row.d2 {
  padding-left: 18px;
}
.gvf-ide-row.dim {
  color: var(--gvf-ide-dim);
  padding-left: 22px;
}
.gvf-ide-chev {
  width: 8px;
  color: var(--gvf-ide-dim);
}
.gvf-ide-new {
  animation: gvf-ide-new 0.9s ease;
}
.gvf-ide-file {
  cursor: pointer;
  color: var(--gvf-ide-fg) !important;
}
.gvf-ide-file:hover {
  background: color-mix(in srgb, var(--gvf-ide-fg) 7%, transparent);
}
.gvf-ide-file.cur {
  background: color-mix(in srgb, var(--gvf-ide-accent) 18%, transparent);
  box-shadow: inset 1px 0 0 var(--gvf-ide-accent);
}
.gvf-ide-md {
  font: 700 8.5px/1 var(--vp-font-family-mono);
  color: var(--gvf-ide-accent);
}
.gvf-ide-editor {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.gvf-ide-tabs {
  flex: none;
  display: flex;
  background: var(--gvf-ide-side);
  border-bottom: 1px solid var(--gvf-ide-line);
}
.gvf-ide-tab {
  padding: 6px 12px;
  background: var(--gvf-ide-bg);
  border-top: 1px solid var(--gvf-ide-accent);
  font-size: 11px;
  margin-bottom: -1px;
}
.gvf-ide-code {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 6px 0;
  font: 11px/1.65 var(--vp-font-family-mono);
}
.gvf-ide-line {
  display: flex;
  gap: 10px;
  padding-inline-end: 8px;
  white-space: nowrap;
  animation: gvf-ide-fade 0.2s ease both;
}
.gvf-ide-line em {
  flex: none;
  width: 22px;
  text-align: right;
  font-style: normal;
  color: var(--gvf-ide-dim);
  opacity: 0.7;
}
.gvf-ide-line span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gvf-ide-line span.h {
  font-weight: 700;
  color: var(--gvf-ide-accent);
}
.gvf-ide-line b {
  font-weight: 700;
}
.gvf-ide-empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: color-mix(in srgb, var(--gvf-ide-dim) 50%, transparent);
}
.gvf-ide-statusbar {
  flex: none;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  height: 20px;
  padding-inline: 10px;
  align-items: center;
  background: var(--gvf-ide-accent);
  color: #fff;
  font: 10px/1 var(--vp-font-family-mono);
  white-space: nowrap;
  overflow: hidden;
}

/* Scripted cursor */
.gvf-ide-cursor {
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
.gvf-ide-cursor.show {
  opacity: 1;
}
.gvf-ide-cursor path {
  transition: transform 0.12s ease;
  transform-origin: 4px 4px;
}
.gvf-ide-cursor.down path {
  transform: scale(0.85);
}
@keyframes gvf-ide-fade {
  from {
    opacity: 0;
  }
}
@keyframes gvf-ide-rot {
  to {
    transform: rotate(360deg);
  }
}
@keyframes gvf-ide-sweep {
  from {
    background-position: 0 -60%;
  }
  to {
    background-position: 0 160%;
  }
}
@keyframes gvf-ide-new {
  from {
    background: color-mix(in srgb, var(--gvf-ide-ok) 25%, transparent);
  }
}
</style>
