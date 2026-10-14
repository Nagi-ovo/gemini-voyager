<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import type { TreeNode } from '../types';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);

const svg = (body: string, size = 14) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// lucide "git-fork" (the extension's button) and "git-branch" (the branch row)
const FORK_ICON =
  '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>';
const BRANCH_ICON =
  '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>';

/** The question the fork is taken at: the second one, so the branch keeps some context. */
const FORK_AT = 1;

/* Folder rows, built the way the demo builds them: folders first, then starred chats. */
interface Row {
  key: string;
  depth: number;
  folder?: string;
  open?: boolean;
  chat?: string;
}
const rows = computed<Row[]>(() => {
  const c = content.value;
  const starred = (n: TreeNode) => 'chat' in n && !!c.chats[n.chat]?.star;
  const out: Row[] = [];
  const walk = (nodes: TreeNode[], depth: number, path: string) => {
    const sorted = [...nodes].sort(
      (a, b) =>
        Number('folder' in b) - Number('folder' in a) || Number(starred(b)) - Number(starred(a)),
    );
    for (const n of sorted) {
      if ('folder' in n) {
        out.push({ key: `${path}/${n.folder}`, depth, folder: n.folder, open: !!n.open });
        if (n.open) walk(n.kids, depth + 1, `${path}/${n.folder}`);
      } else out.push({ key: n.chat, depth, chat: n.chat });
    }
  };
  walk(c.tree, 0, '');
  return out;
});

const state = reactive({ hover: false, pressed: false, forked: false, flash: 0 });
const pos = reactive({ x: 0, y: 0, rtl: false, visible: false });
const cursor = reactive({ x: 0, y: 0, show: false, down: false });
const forkEl = ref<HTMLElement | null>(null);
const playing = ref(true);

const timers: number[] = [];
const at = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};

function bubble(): HTMLElement | null {
  return stage.chatEl?.querySelectorAll<HTMLElement>('.gvf-q')[FORK_AT] ?? null;
}

/** Pins the fork controls beside the question; chatCover stays put while the chat scrolls. */
function place() {
  const b = bubble();
  const cover = stage.regions.chatCover?.getBoundingClientRect();
  const chat = stage.chatEl?.getBoundingClientRect();
  if (!b || !cover || !chat) return;
  const r = b.getBoundingClientRect();
  pos.rtl = getComputedStyle(b).direction === 'rtl';
  // The extension sets the button 8px off the question's inline-start edge, 9px from its top.
  pos.x = pos.rtl ? r.right - cover.left + 8 : r.left - cover.left - 8;
  pos.y = r.top - cover.top + 4;
  pos.visible = r.bottom > chat.top + 8 && r.top < chat.bottom - 8;
}

function aim(el: Element | null | undefined) {
  const r = el?.getBoundingClientRect();
  const o = stage.regions.hostCover?.getBoundingClientRect();
  if (!r || !o) return;
  cursor.x = r.left - o.left + r.width / 2;
  cursor.y = r.top - o.top + r.height / 2;
}
function click(fn: () => void) {
  cursor.down = true;
  at(140, () => {
    cursor.down = false;
    fn();
  });
}

function stacked() {
  const tl = stage.cards.timeline?.getBoundingClientRect();
  const fd = stage.cards.folders?.getBoundingClientRect();
  return !!tl && !!fd && fd.top >= tl.bottom - 1;
}

function fork() {
  if (state.forked) {
    state.flash++;
    return;
  }
  state.forked = true;
  // Stacked cards: follow the new branch down to the folder card.
  if (stacked() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    at(900, () => stage.focus('folders'));
}

/* After the demo, hovering the question reveals the button again, as in the extension. */
function onChatMove(e: PointerEvent) {
  if (playing.value) return;
  const b = bubble();
  state.hover = !!b && b.contains(e.target as Node);
}
function onChatLeave() {
  if (!playing.value) state.hover = false;
}

let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  const chat = stage.chatEl;
  chat?.addEventListener('scroll', place, { passive: true });
  chat?.addEventListener('pointermove', onChatMove);
  chat?.addEventListener('pointerleave', onChatLeave);
  resizeObserver = new ResizeObserver(place);
  if (chat) resizeObserver.observe(chat);

  const b = bubble();
  const turn = b?.closest<HTMLElement>('.gvf-turn');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (chat && turn)
    chat.scrollTo({ top: turn.offsetTop - 16, behavior: reduced ? 'auto' : 'smooth' });
  place();
  if (reduced) {
    state.forked = true;
    playing.value = false;
    return;
  }
  const o = stage.regions.hostCover?.getBoundingClientRect();
  if (o) {
    cursor.x = o.width * 0.5;
    cursor.y = o.height * 0.85;
  }
  at(450, () => {
    place();
    cursor.show = true;
    aim(b);
  });
  at(1050, () => (state.hover = true));
  at(1500, () => aim(forkEl.value));
  at(2100, () => {
    state.pressed = true;
    click(() => {
      state.pressed = false;
      fork();
    });
  });
  at(3300, () => (cursor.show = false));
  at(3600, () => {
    state.hover = false;
    playing.value = false;
  });
});

onBeforeUnmount(() => {
  timers.forEach((t) => clearTimeout(t));
  resizeObserver?.disconnect();
  stage.chatEl?.removeEventListener('scroll', place);
  stage.chatEl?.removeEventListener('pointermove', onChatMove);
  stage.chatEl?.removeEventListener('pointerleave', onChatLeave);
});
</script>

<template>
  <!-- Fork button and branch pills beside the question -->
  <Teleport v-if="stage.regions.chatCover" :to="stage.regions.chatCover">
    <div class="gvf-cb-layer">
      <div
        class="gvf-cb-controls"
        :class="{ rtl: pos.rtl, hidden: !pos.visible }"
        :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
        @pointerenter="state.hover = true"
        @pointerleave="!playing && (state.hover = false)"
      >
        <button
          ref="forkEl"
          type="button"
          class="gvf-cb-fork"
          :class="{ show: state.hover, pressed: state.pressed }"
          :aria-label="name"
          :title="name"
          @click="fork"
          v-html="svg(FORK_ICON)"
        />
        <span v-if="state.forked" class="gvf-cb-pills">
          <button
            v-for="n in [1, 2]"
            :key="n"
            type="button"
            class="gvf-cb-pill"
            :class="{ current: n === 1 }"
            :style="{ animationDelay: `${0.12 + (n - 1) * 0.08}s` }"
            :aria-current="n === 1"
            @click="n === 2 && state.flash++"
          >
            {{ n }}
          </button>
        </span>
      </div>
    </div>
  </Teleport>

  <Teleport v-if="stage.regions.hostCover" :to="stage.regions.hostCover">
    <div
      class="gvf-cb-cursor"
      :class="{ show: cursor.show, down: cursor.down }"
      :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }"
      aria-hidden="true"
    >
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path d="M5 3v16.2l4.4-4.3 2.9 6.6 2.6-1.1-2.9-6.5H18z" />
      </svg>
    </div>
  </Teleport>

  <!-- The folder card, row for row, with the branch growing under the current chat -->
  <Teleport v-if="stage.regions.foldersCover" :to="stage.regions.foldersCover">
    <div class="gvf-cb-fd">
      <div class="gvf-fd">
        <div class="gvf-fd-head">
          <span class="gvf-fd-label">{{ content.folders.heading }}</span>
          <span class="gvf-icon-btn sm" v-html="svg(uiIcons.user, 15)" />
          <span class="gvf-icon-btn sm" v-html="svg(uiIcons.folder, 15)" />
          <span class="gvf-icon-btn sm" v-html="svg(uiIcons.cloud, 15)" />
          <span class="gvf-icon-btn sm" v-html="svg(uiIcons.settings, 15)" />
          <span class="gvf-icon-btn sm" v-html="svg(uiIcons.plus, 15)" />
        </div>
        <div class="gvf-fd-search">
          <input
            type="search"
            disabled
            :placeholder="content.folders.searchPlaceholder"
            :aria-label="content.folders.searchPlaceholder"
          />
        </div>
        <template v-for="row in rows" :key="row.key">
          <div
            v-if="row.folder"
            class="gvf-row"
            :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
          >
            <span
              class="gvf-chev"
              :class="{ open: row.open }"
              v-html="svg(uiIcons['chevron-right'])"
            />
            <span v-html="svg(uiIcons[row.open ? 'folder-open' : 'folder'])" />
            <span class="gvf-name">{{ row.folder }}</span>
          </div>
          <template v-else-if="row.chat">
            <div
              class="gvf-row"
              :class="{ current: row.chat === content.current }"
              :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
            >
              <span v-html="svg(uiIcons['message-square'])" />
              <span class="gvf-name">{{ content.chats[row.chat]?.title }}</span>
              <span
                class="gvf-star"
                :class="{ on: content.chats[row.chat]?.star }"
                v-html="svg(uiIcons.star)"
              />
            </div>
            <div
              v-if="row.chat === content.current"
              class="gvf-cb-grow"
              :class="{ open: state.forked }"
            >
              <div>
                <div
                  :key="state.flash"
                  class="gvf-row gvf-cb-branch"
                  :class="{ flash: state.flash }"
                  :style="{ paddingLeft: `${10 + (row.depth + 1) * 14}px` }"
                >
                  <span class="gvf-cb-branch-ic" v-html="svg(BRANCH_ICON)" />
                  <span class="gvf-name">{{ content.chats[row.chat]?.title }}</span>
                  <span class="gvf-cb-tag">2</span>
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-cb-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none !important;
}
/* Anchored at the question's inline-start edge; grows away from the bubble. */
.gvf-cb-controls {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  transform: translateX(-100%);
  pointer-events: auto;
  transition: opacity 0.15s ease;
}
.gvf-cb-controls.rtl {
  transform: none;
}
.gvf-cb-controls.hidden {
  opacity: 0;
  pointer-events: none;
}
/* .gv-fork-btn */
.gvf-cb-fork {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--host-muted) !important;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s,
    transform 0.15s,
    background-color 0.15s;
}
.gvf-cb-fork.show,
.gvf-cb-fork:focus-visible {
  opacity: 1;
}
.gvf-cb-fork:hover,
.gvf-cb-fork.pressed {
  background: color-mix(in srgb, var(--host-text) 8%, transparent);
}
.gvf-cb-fork.pressed {
  transform: scale(0.9);
}
/* .gv-fork-indicator */
.gvf-cb-pills {
  display: inline-flex;
  gap: 4px;
}
.gvf-cb-pill {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  display: inline-grid;
  place-items: center;
  border-radius: 4px;
  border: 1px solid rgba(26, 115, 232, 0.28);
  background: rgba(26, 115, 232, 0.06);
  color: #1a73e8 !important;
  font:
    600 12px/1 ui-sans-serif,
    system-ui,
    sans-serif;
  cursor: pointer;
  animation: gvf-cb-pop 0.32s cubic-bezier(0.2, 0.8, 0.2, 1.4) both;
}
.gvf-cb-pill:hover {
  background: rgba(26, 115, 232, 0.16);
}
.gvf-cb-pill.current {
  background: #1a73e8;
  border-color: #1a73e8;
  color: #fff !important;
  cursor: default;
}
.dark .gvf-cb-pill {
  border-color: rgba(138, 180, 248, 0.28);
  background: rgba(138, 180, 248, 0.12);
  color: #8ab4f8 !important;
}
.dark .gvf-cb-pill.current {
  background: #8ab4f8;
  border-color: #8ab4f8;
  color: #1f1f1f !important;
}
@keyframes gvf-cb-pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
}

/* Folder card replica: same classes as the demo, so rows line up exactly. */
.gvf-cb-fd {
  position: absolute;
  inset: 0;
  background: var(--host-bg);
}
.dark .gvf-cb-fd {
  background: var(--host-side);
}
.gvf-cb-fd .gvf-row {
  cursor: default;
}
.gvf-cb-grow {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) 0.25s;
}
.gvf-cb-grow > div {
  min-height: 0;
  overflow: hidden;
}
.gvf-cb-grow.open {
  grid-template-rows: 1fr;
}
.gvf-cb-branch {
  opacity: 0;
  transform: translateY(-6px);
  transition:
    opacity 0.3s ease 0.45s,
    transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) 0.45s;
}
.gvf-cb-grow.open .gvf-cb-branch {
  opacity: 1;
  transform: none;
}
.gvf-cb-branch.flash {
  animation: gvf-cb-flash 0.8s ease-out;
}
@keyframes gvf-cb-flash {
  0% {
    background: var(--gv-brand-soft);
    box-shadow: inset 0 0 0 1px var(--gv-brand);
  }
}
.gvf-cb-branch > .gvf-cb-branch-ic {
  color: var(--gv-brand);
}
.gvf-cb-tag {
  display: inline-grid !important;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #1a73e8 !important;
  border: 1px solid rgba(26, 115, 232, 0.28);
  background: rgba(26, 115, 232, 0.06);
}
.dark .gvf-cb-tag {
  color: #8ab4f8 !important;
  border-color: rgba(138, 180, 248, 0.28);
  background: rgba(138, 180, 248, 0.12);
}

.gvf-cb-cursor {
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
.gvf-cb-cursor.show {
  opacity: 1;
}
.gvf-cb-cursor svg {
  display: block;
  margin: -3px 0 0 -4px;
  filter: drop-shadow(0 1px 1.5px oklch(0 0 0 / 0.3));
  transition: transform 0.12s ease;
}
.gvf-cb-cursor.down svg {
  transform: scale(0.82);
}
.gvf-cb-cursor path {
  fill: #1f1f1f;
  stroke: #fff;
  stroke-width: 1.4;
  stroke-linejoin: round;
}
</style>
