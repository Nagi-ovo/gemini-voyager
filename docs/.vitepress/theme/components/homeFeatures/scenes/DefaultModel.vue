<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);

const NEW_CHAT: Record<string, string> = {
  'zh-CN': '发起新对话',
  'zh-TW': '發起新對話',
  'en-US': 'New chat',
  'ja-JP': 'チャットを新規作成',
  'ko-KR': '새 채팅',
  'fr-FR': 'Nouvelle discussion',
  'es-ES': 'Nueva conversación',
  'pt-PT': 'Nova conversa',
  'ar-SA': 'محادثة جديدة',
  'ru-RU': 'Новый чат',
};
const newChatLabel = computed(() => NEW_CHAT[props.lang] ?? NEW_CHAT['en-US']);

const svg = (body: string, size = 17, width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const CHEVRON_ICON = '<path d="m6 9 6 6 6-6"/>';
const CHECK_ICON = '<path d="M20 6 9 17l-5-5"/>';
const MIC_ICON =
  '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>';
// lucide "square-pen"
const NEW_CHAT_ICON =
  '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>';

/* Gemini's model menu: tier name plus a one-line description (drawn as a bar). No versions. */
const MODELS = [
  { id: 'Fast', desc: 46 },
  { id: 'Thinking', desc: 58 },
  { id: 'Pro', desc: 78 },
];
// A new chat starts on Gemini's own pick; Voyager then switches to the starred one.
const SITE_DEFAULT = 'Fast';

const pillEl = ref<HTMLElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const newChatEl = ref<HTMLElement | null>(null);
const rowEls = ref<HTMLElement[]>([]);
const starEls = ref<HTMLElement[]>([]);

const state = reactive({
  current: SITE_DEFAULT,
  starred: '',
  open: false,
  hover: '',
  pop: '',
  applied: 0,
  fresh: 0,
});
const cursor = reactive({ x: 0, y: 0, show: false, down: false });
// The ball rests over the open menu; step it aside while the menu is open.
watch(
  () => state.open,
  (open) => (stage.view.hideBall = open),
);

const timers: number[] = [];
const at = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};

function aim(el: Element | null | undefined, fx = 0.5, fy = 0.5) {
  const r = el?.getBoundingClientRect();
  const o = stage.regions.hostCover?.getBoundingClientRect();
  if (!r || !o) return;
  cursor.x = r.left - o.left + r.width * fx;
  cursor.y = r.top - o.top + r.height * fy;
}
function click(fn: () => void) {
  cursor.down = true;
  at(140, () => {
    cursor.down = false;
    fn();
  });
}

function pick(id: string) {
  state.current = id;
  state.open = false;
}
function toggleStar(id: string) {
  state.starred = state.starred === id ? '' : id;
  state.pop = state.starred;
}
function newChat() {
  state.open = false;
  state.current = SITE_DEFAULT;
  state.fresh++;
  if (!state.starred) return;
  at(550, () => {
    state.current = state.starred;
    state.applied++;
  });
}

const onDocDown = (e: PointerEvent) => {
  const t = e.target as Node;
  if (!state.open || menuEl.value?.contains(t) || pillEl.value?.contains(t)) return;
  state.open = false;
};

onMounted(() => {
  document.addEventListener('pointerdown', onDocDown);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    state.starred = 'Pro';
    state.current = 'Pro';
    state.fresh = 1;
    return;
  }
  const o = stage.regions.hostCover?.getBoundingClientRect();
  if (o) {
    cursor.x = o.width * 0.5;
    cursor.y = o.height * 0.7;
  }
  const pro = MODELS.findIndex((m) => m.id === 'Pro');
  at(250, () => {
    cursor.show = true;
    aim(pillEl.value);
  });
  at(900, () => click(() => (state.open = true)));
  at(1400, () => {
    aim(rowEls.value[pro], 0.35);
    state.hover = 'Pro';
  });
  at(2000, () => aim(starEls.value[pro]));
  at(2600, () => click(() => toggleStar('Pro')));
  at(3200, () => {
    state.hover = '';
    aim(newChatEl.value);
  });
  at(3850, () => click(newChat));
  at(4900, () => (cursor.show = false));
});

onBeforeUnmount(() => {
  timers.forEach((t) => clearTimeout(t));
  document.removeEventListener('pointerdown', onDocDown);
});
</script>

<template>
  <!-- New chat button in the title bar; after a new chat, the bar shows a fresh, untitled page. -->
  <Teleport v-if="stage.regions.topbarEnd && !state.fresh" :to="stage.regions.topbarEnd">
    <button
      ref="newChatEl"
      type="button"
      class="gvf-icon-btn gvf-dm-new"
      :aria-label="newChatLabel"
      :title="newChatLabel"
      @click="newChat"
      v-html="svg(NEW_CHAT_ICON)"
    />
  </Teleport>

  <Teleport v-if="stage.regions.hostCover" :to="stage.regions.hostCover">
    <div v-if="state.fresh" class="gvf-topbar gvf-dm-bar">
      <span class="gvf-topbar-title">Gemini</span>
      <span class="gvf-topbar-end">
        <button
          ref="newChatEl"
          type="button"
          class="gvf-icon-btn gvf-dm-new"
          :aria-label="newChatLabel"
          :title="newChatLabel"
          @click="newChat"
          v-html="svg(NEW_CHAT_ICON)"
        />
      </span>
    </div>
    <div
      class="gvf-dm-cursor"
      :class="{ show: cursor.show, down: cursor.down }"
      :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }"
      aria-hidden="true"
    >
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path d="M5 3v16.2l4.4-4.3 2.9 6.6 2.6-1.1-2.9-6.5H18z" />
      </svg>
    </div>
  </Teleport>

  <!-- A blank new chat over the conversation -->
  <Teleport v-if="stage.regions.chatCover && state.fresh" :to="stage.regions.chatCover">
    <div :key="state.fresh" class="gvf-dm-page">
      <div class="gvf-dm-hello" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24">
          <defs>
            <linearGradient id="gvf-dm-spark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#4285f4" />
              <stop offset="0.6" stop-color="#9b72cb" />
              <stop offset="1" stop-color="#d96570" />
            </linearGradient>
          </defs>
          <path
            fill="url(#gvf-dm-spark)"
            d="M12 1c.6 5.6 4.4 10.4 11 11-6.6.6-10.4 5.4-11 11-.6-5.6-4.4-10.4-11-11 6.6-.6 10.4-5.4 11-11z"
          />
        </svg>
        <span class="gvf-dm-hello-bar" />
        <span class="gvf-dm-hello-bar short" />
      </div>
    </div>
  </Teleport>

  <!-- The same composer with Gemini's model picker -->
  <Teleport v-if="stage.regions.composerCover" :to="stage.regions.composerCover">
    <div class="gvf-dm-wrap">
      <div :key="state.fresh" class="gvf-composer" :class="{ 'gvf-dm-fresh': state.fresh }">
        <div class="gvf-composer-text empty">{{ content.composer.placeholder }}</div>
        <div class="gvf-composer-bar">
          <span class="gvf-icon-btn" v-html="svg(uiIcons.plus)" />
          <button
            ref="pillEl"
            type="button"
            class="gvf-dm-pill"
            :class="{ open: state.open }"
            aria-haspopup="menu"
            :aria-expanded="state.open"
            @click="state.open = !state.open"
          >
            <Transition name="gvf-dm-swap" mode="out-in">
              <span :key="state.current">{{ state.current }}</span>
            </Transition>
            <span class="gvf-dm-chev" v-html="svg(CHEVRON_ICON, 15)" />
            <span v-if="state.applied" :key="state.applied" class="gvf-dm-ring" />
          </button>
          <span class="gvf-icon-btn gvf-dm-mic" v-html="svg(MIC_ICON)" />
        </div>
      </div>

      <div ref="menuEl" class="gvf-dm-menu" :class="{ open: state.open }" role="menu">
        <div
          v-for="m in MODELS"
          :key="m.id"
          ref="rowEls"
          class="gvf-dm-row"
          :class="{ hover: state.hover === m.id, current: state.current === m.id }"
          role="menuitemradio"
          :aria-checked="state.current === m.id"
          tabindex="-1"
          @click="pick(m.id)"
        >
          <div class="gvf-dm-name">
            <span>{{ m.id }}</span>
            <button
              ref="starEls"
              type="button"
              class="gvf-dm-star"
              :class="{ on: state.starred === m.id, pop: state.pop === m.id }"
              :aria-pressed="state.starred === m.id"
              :aria-label="`${m.id} ★`"
              @click.stop="toggleStar(m.id)"
              v-html="svg(uiIcons.star, 15)"
            />
          </div>
          <span class="gvf-dm-desc" :style="{ width: `${m.desc}%` }" />
          <span class="gvf-dm-check" v-html="svg(CHECK_ICON, 12, 3.2)" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-dm-new {
  color: var(--host-text);
}
/* Title bar of the new chat, drawn over the old one with the same metrics. */
.gvf-dm-bar {
  position: absolute;
  top: 0;
  inset-inline: 0;
  background: var(--host-bg);
  animation: gvf-dm-in 0.3s ease both;
}
.gvf-dm-bar .gvf-topbar-title {
  font-weight: 500;
}

.gvf-dm-page {
  position: absolute;
  inset: 0;
  background: var(--host-bg);
  display: grid;
  place-content: center;
  animation: gvf-dm-in 0.35s ease both;
}
@keyframes gvf-dm-in {
  from {
    opacity: 0;
  }
}
.gvf-dm-hello {
  display: grid;
  justify-items: center;
  gap: 12px;
}
.gvf-dm-hello svg {
  animation: gvf-dm-spin 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes gvf-dm-spin {
  from {
    transform: rotate(-90deg) scale(0.4);
    opacity: 0;
  }
}
.gvf-dm-hello-bar {
  width: 180px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, #4285f4 45%, transparent),
    color-mix(in srgb, #d96570 45%, transparent)
  );
}
.gvf-dm-hello-bar.short {
  width: 120px;
  height: 9px;
  background: color-mix(in srgb, var(--host-text) 12%, transparent);
}

/* Composer replica; the menu opens upwards from the picker, as Gemini's does at the bottom. */
.gvf-dm-wrap {
  position: absolute;
  inset: 0;
  padding: 4px 14px 14px;
  background: var(--host-bg);
}
.gvf-dm-fresh {
  animation: gvf-dm-rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes gvf-dm-rise {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.985);
  }
}
.gvf-dm-pill {
  position: relative;
  margin-inline-start: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding-inline: 12px 8px;
  border: 0;
  border-radius: 15px;
  background: none;
  color: var(--host-text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}
.gvf-dm-pill:hover,
.gvf-dm-pill.open {
  background: color-mix(in srgb, var(--host-text) 8%, transparent);
}
.gvf-dm-chev {
  display: grid;
  color: var(--host-muted);
  transition: transform 0.2s ease;
}
.gvf-dm-pill.open .gvf-dm-chev {
  transform: rotate(180deg);
}
.gvf-dm-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  animation: gvf-dm-ring 1.1s ease-out forwards;
}
@keyframes gvf-dm-ring {
  0% {
    box-shadow:
      0 0 0 0 var(--gv-brand),
      0 0 0 0 var(--gv-brand-soft);
  }
  35% {
    box-shadow:
      0 0 0 1.5px var(--gv-brand),
      0 0 0 6px var(--gv-brand-soft);
  }
  100% {
    box-shadow:
      0 0 0 1.5px transparent,
      0 0 0 10px transparent;
  }
}
.gvf-dm-swap-enter-active,
.gvf-dm-swap-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.gvf-dm-swap-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.gvf-dm-swap-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

/* Model menu, after Gemini's own: name, star on hover, description, check on the current one. */
.gvf-dm-menu {
  position: absolute;
  z-index: 2;
  bottom: calc(100% - 4px);
  inset-inline-end: 54px;
  width: min(260px, calc(100% - 28px));
  padding: 6px 0;
  border-radius: 16px;
  background: var(--host-bg);
  border: 1px solid var(--gvf-line);
  box-shadow: 0 12px 32px -10px oklch(0 0 0 / 0.28);
  opacity: 0;
  transform: translateY(6px) scale(0.98);
  transform-origin: bottom right;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.dark .gvf-dm-menu {
  background: var(--host-user);
}
.gvf-dm-menu.open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-dm-row {
  position: relative;
  display: grid;
  gap: 6px;
  padding-block: 7px 10px;
  padding-inline: 16px 52px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.gvf-dm-row:hover,
.gvf-dm-row.hover {
  background: color-mix(in srgb, var(--host-text) 6%, transparent);
}
.gvf-dm-name {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 20px;
  font-weight: 500;
  line-height: 1;
}
.gvf-dm-desc {
  display: block;
  height: 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--host-text) 12%, transparent);
}
.gvf-dm-star {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--host-muted) !important;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.gvf-dm-row:hover .gvf-dm-star,
.gvf-dm-row.hover .gvf-dm-star,
.gvf-dm-star:focus-visible,
.gvf-dm-star.on {
  opacity: 1;
}
.gvf-dm-star.on {
  color: var(--tl-star) !important;
}
.gvf-dm-star.on :deep(svg) {
  fill: var(--tl-star);
}
.gvf-dm-star.on.pop :deep(svg) {
  animation: gvf-dm-pop 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.4);
}
@keyframes gvf-dm-pop {
  0% {
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.25);
  }
}
.gvf-dm-check {
  position: absolute;
  inset-inline-end: 16px;
  top: 50%;
  width: 20px;
  height: 20px;
  margin-top: -10px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #0b57d0;
  color: var(--host-bg);
  opacity: 0;
  transform: scale(0.6);
  transition:
    opacity 0.18s ease,
    transform 0.2s ease;
}
.dark .gvf-dm-check {
  background: #a8c7fa;
}
.gvf-dm-row.current .gvf-dm-check {
  opacity: 1;
  transform: none;
}

.gvf-dm-cursor {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  pointer-events: none !important;
  opacity: 0;
  transition:
    transform 0.6s cubic-bezier(0.45, 0, 0.2, 1),
    opacity 0.25s ease;
}
.gvf-dm-cursor.show {
  opacity: 1;
}
.gvf-dm-cursor svg {
  display: block;
  margin: -3px 0 0 -4px;
  filter: drop-shadow(0 1px 1.5px oklch(0 0 0 / 0.3));
  transition: transform 0.12s ease;
}
.gvf-dm-cursor.down svg {
  transform: scale(0.82);
}
.gvf-dm-cursor path {
  fill: #1f1f1f;
  stroke: #fff;
  stroke-width: 1.4;
  stroke-linejoin: round;
}
</style>
