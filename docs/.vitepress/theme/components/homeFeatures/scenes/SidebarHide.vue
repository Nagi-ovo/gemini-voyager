<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import type { TreeNode } from '../types';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('folders');

const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);

const icon = (name: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiIcons[name] ?? ''}</svg>`;
const raw = (paths: string, size = 18) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const menuIcon = raw('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>');
const penIcon = raw(
  '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
  17,
);

/* The folder card's rows, in its order: folders first, then starred chats. */
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
      } else {
        out.push({ key: n.chat, depth, chat: n.chat });
      }
    }
  };
  walk(c.tree, 0, '');
  return out;
});

/* Hover intent as in src/pages/content/sidebarAutoHide/hoverIntent.ts:
   expand 150 ms after the pointer enters, collapse 400 ms after it leaves. */
const ENTER_DELAY_MS = 150;
const LEAVE_DELAY_MS = 400;
const open = ref(true);
let enterTimer: ReturnType<typeof setTimeout> | undefined;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;
function hoverEnter() {
  clearTimeout(leaveTimer);
  clearTimeout(enterTimer);
  if (!open.value) enterTimer = setTimeout(() => (open.value = true), ENTER_DELAY_MS);
}
function hoverLeave() {
  clearTimeout(enterTimer);
  clearTimeout(leaveTimer);
  if (open.value) leaveTimer = setTimeout(() => (open.value = false), LEAVE_DELAY_MS);
}

const root = ref<HTMLElement | null>(null);
const side = ref<HTMLElement | null>(null);
const cursor = reactive({ x: 0, y: 0, show: false });
const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
let auto = false;
function aimAt(fx: number, fy: number) {
  if (!root.value) return;
  cursor.x = root.value.clientWidth * fx;
  cursor.y = root.value.clientHeight * fy;
}
function aimOff(fy: number) {
  if (!root.value) return;
  cursor.x = root.value.clientWidth + 16;
  cursor.y = root.value.clientHeight * fy;
}

/* A real pointer takes over from the scripted cursor. */
function stopScript() {
  if (!auto) return;
  auto = false;
  timers.forEach(clearTimeout);
  timers.length = 0;
  cursor.show = false;
}
function onRealEnter(e: PointerEvent) {
  if (e.pointerType !== 'touch') stopScript();
}
const sideEnter = (e: PointerEvent) => {
  if (!auto && e.pointerType !== 'touch') hoverEnter();
};
const sideLeave = (e: PointerEvent) => {
  if (!auto && e.pointerType !== 'touch') hoverLeave();
};
// Touch has no hover: a tap on the rail opens it, a tap on the page closes it.
const sideTap = () => {
  stopScript();
  if (!open.value) open.value = true;
};
const pageTap = () => {
  stopScript();
  open.value = false;
};

onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    open.value = false;
    return;
  }
  auto = true;
  at(200, () => aimAt(0.42, 0.45));
  at(260, () => (cursor.show = true));
  at(800, () => aimOff(0.55));
  at(1300, hoverLeave);
  at(2200, () => aimAt(0.62, 0.62));
  at(2800, () => {
    if (!root.value || !side.value) return;
    // The rail sits at the inline start, which is the right edge in RTL.
    const r = root.value.getBoundingClientRect();
    const s = side.value.getBoundingClientRect();
    cursor.x = s.left - r.left + s.width / 2;
    cursor.y = r.height * 0.32;
  });
  at(3300, hoverEnter);
  at(4100, () => aimOff(0.4));
  at(4600, hoverLeave);
  at(5300, () => {
    cursor.show = false;
    auto = false;
  });
});
onBeforeUnmount(() => {
  timers.forEach(clearTimeout);
  clearTimeout(enterTimer);
  clearTimeout(leaveTimer);
});
</script>

<template>
  <Teleport v-if="stage.regions.foldersCover" :to="stage.regions.foldersCover">
    <div ref="root" class="gvf-sh" :class="{ open }" @pointerenter="onRealEnter">
      <!-- The page behind the sidebar -->
      <div class="gvf-sh-page" aria-hidden="true" @click="pageTap">
        <div class="gvf-sh-q"><i style="width: 100%" /><i style="width: 55%" /></div>
        <div class="gvf-sh-a">
          <i style="width: 94%" /><i style="width: 100%" /><i style="width: 70%" />
        </div>
        <div class="gvf-sh-q"><i style="width: 72%" /></div>
        <div class="gvf-sh-a"><i style="width: 88%" /><i style="width: 52%" /></div>
      </div>

      <aside
        ref="side"
        class="gvf-sh-side"
        @pointerenter="sideEnter"
        @pointerleave="sideLeave"
        @click="sideTap"
      >
        <!-- Collapsed: Gemini's icon rail -->
        <div class="gvf-sh-rail" aria-hidden="true">
          <span class="gvf-sh-ic" v-html="menuIcon" />
          <span class="gvf-sh-ic" v-html="penIcon" />
          <span class="gvf-sh-ic gvf-sh-gear" v-html="icon('settings', 17)" />
        </div>

        <!-- Expanded: the same folder list as the card -->
        <div class="gvf-sh-full">
          <div class="gvf-fd">
            <div class="gvf-fd-head">
              <span class="gvf-fd-label">{{ content.folders.heading }}</span>
              <span class="gvf-icon-btn sm" v-html="icon('user', 15)" />
              <span class="gvf-icon-btn sm" v-html="icon('folder', 15)" />
              <span class="gvf-icon-btn sm" v-html="icon('cloud', 15)" />
              <span class="gvf-icon-btn sm" v-html="icon('settings', 15)" />
              <span class="gvf-icon-btn sm" v-html="icon('plus', 15)" />
            </div>
            <div class="gvf-fd-search">
              <input
                type="search"
                readonly
                tabindex="-1"
                :placeholder="content.folders.searchPlaceholder"
                :aria-label="content.folders.searchPlaceholder"
              />
            </div>
            <div
              v-for="row in rows"
              :key="row.key"
              class="gvf-row"
              :class="{ current: row.chat === content.current }"
              :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
            >
              <template v-if="row.folder">
                <span
                  class="gvf-chev"
                  :class="{ open: row.open }"
                  v-html="icon('chevron-right', 14)"
                />
                <span v-html="icon(row.open ? 'folder-open' : 'folder', 14)" />
                <span class="gvf-name">{{ row.folder }}</span>
              </template>
              <template v-else-if="row.chat">
                <span v-html="icon('message-square', 14)" />
                <span class="gvf-name">{{ content.chats[row.chat]?.title }}</span>
                <span
                  class="gvf-star"
                  :class="{ on: content.chats[row.chat]?.star }"
                  v-html="icon('star', 14)"
                />
              </template>
            </div>
          </div>
        </div>
      </aside>

      <svg
        class="gvf-sh-cursor"
        :class="{ show: cursor.show }"
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
.gvf-sh {
  position: absolute;
  inset: 0;
  overflow: hidden;
  container-type: size;
  background: var(--host-bg);
  color: var(--host-text);
  --gvf-sh-bar: color-mix(in srgb, var(--host-text) 11%, transparent);
  --gvf-sh-side-bg: var(--host-bg);
  --gvf-sh-rail-w: 56px;
}
.dark .gvf-sh {
  --gvf-sh-side-bg: var(--host-side);
}

/* Page: a conversation that re-centres in the space the sidebar gives back. */
.gvf-sh-page {
  position: absolute;
  inset-block: 0;
  inset-inline: var(--gvf-sh-rail-w) 0;
  padding: 22px 22px 0;
  display: grid;
  align-content: start;
  gap: 12px;
  opacity: 0;
  transform: translateX(-12px);
  transition:
    opacity 0.25s ease,
    transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}
[dir='rtl'] .gvf-sh-page {
  transform: translateX(12px);
}
.gvf-sh:not(.open) .gvf-sh-page {
  opacity: 1;
  transform: none;
  transition-delay: 0.06s;
}
.gvf-sh-page i {
  display: block;
  height: 7px;
  border-radius: 4px;
  background: var(--gvf-sh-bar);
}
.gvf-sh-q {
  justify-self: end;
  width: 54%;
  display: grid;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 16px 4px 16px 16px;
  background: var(--host-user);
}
[dir='rtl'] .gvf-sh-q {
  border-radius: 4px 16px 16px 16px;
}
.gvf-sh-a {
  display: grid;
  gap: 7px;
}

/* Sidebar: full card width when open, Gemini's icon rail when folded. */
.gvf-sh-side {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  width: 100%;
  overflow: hidden;
  background: var(--gvf-sh-side-bg);
  border-inline-end: 1px solid transparent;
  transition:
    width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.3s ease;
}
.gvf-sh:not(.open) .gvf-sh-side {
  width: var(--gvf-sh-rail-w);
  border-color: var(--gvf-line);
  cursor: pointer;
}
.gvf-sh-full {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  width: 100cqw;
  transition: opacity 0.2s ease;
}
.gvf-sh:not(.open) .gvf-sh-full {
  opacity: 0;
  pointer-events: none;
}
.gvf-sh-full .gvf-fd {
  overflow: hidden;
}
.gvf-sh-full .gvf-fd-search input {
  pointer-events: none;
}
.gvf-sh-full .gvf-row {
  cursor: default;
}
.gvf-sh-rail {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  width: var(--gvf-sh-rail-w);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 0;
  color: var(--host-muted);
  opacity: 0;
  transition: opacity 0.18s ease;
}
.gvf-sh:not(.open) .gvf-sh-rail {
  opacity: 1;
  transition-delay: 0.12s;
}
.gvf-sh-ic {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 999px;
}
.gvf-sh-gear {
  margin-top: auto;
}

.gvf-sh-cursor {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 5;
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
.gvf-sh-cursor.show {
  opacity: 1;
}
</style>
