<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import type { TreeNode } from '../types';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

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

/* Gemini's sidebar sits at the inline start of the conversation card: a full list when open,
   its icon rail when folded. The card's page narrows beside it, as the real one does. */
const RAIL = 56;
const full = ref(240);
watch(
  open,
  (o) => {
    stage.view.sideInset = o ? full.value : RAIL;
  },
  { immediate: true },
);

/** Points the cursor at a fraction of the card; `x` is measured from the inline start. */
function aim(fx: number, fy: number) {
  if (!root.value) return;
  const w = root.value.clientWidth;
  const x = w * fx;
  cursor.x = getComputedStyle(root.value).direction === 'rtl' ? w - x : x;
  cursor.y = root.value.clientHeight * fy;
}
const aimSide = (fy: number) => aim(RAIL / 2 / (root.value?.clientWidth || 1), fy);

/* A real pointer takes over from the scripted cursor. */
function stopScript() {
  if (!auto) return;
  auto = false;
  timers.forEach(clearTimeout);
  timers.length = 0;
  cursor.show = false;
}
const sideEnter = (e: PointerEvent) => {
  if (e.pointerType === 'touch') return;
  stopScript();
  hoverEnter();
};
const sideLeave = (e: PointerEvent) => {
  if (!auto && e.pointerType !== 'touch') hoverLeave();
};
// Touch has no hover: a tap on the sidebar folds or unfolds it.
const sideTap = (e: PointerEvent) => {
  if (e.pointerType !== 'touch') return;
  stopScript();
  open.value = !open.value;
};

onMounted(() => {
  const w = root.value?.clientWidth ?? 600;
  full.value = Math.round(Math.min(240, w * 0.42));
  stage.view.sideInset = open.value ? full.value : RAIL;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    open.value = false;
    return;
  }
  auto = true;
  at(200, () => aim(0.18, 0.45));
  at(260, () => (cursor.show = true));
  // The pointer moves into the chat: the sidebar folds and the page widens.
  at(900, () => aim(0.66, 0.55));
  at(1400, hoverLeave);
  // Back to the rail: it unfolds again.
  at(2600, () => aimSide(0.4));
  at(3100, hoverEnter);
  at(4100, () => aim(0.7, 0.42));
  at(4600, hoverLeave);
  at(5400, () => {
    cursor.show = false;
    auto = false;
  });
});
onBeforeUnmount(() => {
  timers.forEach(clearTimeout);
  clearTimeout(enterTimer);
  clearTimeout(leaveTimer);
  stage.view.sideInset = 0;
});
</script>
<template>
  <Teleport v-if="stage.regions.hostCover" :to="stage.regions.hostCover">
    <div ref="root" class="gvf-sh" :class="{ open }">
      <aside
        ref="side"
        class="gvf-sh-side"
        :style="{ width: `${open ? full : RAIL}px`, '--gvf-sh-full': `${full}px` }"
        @pointerenter="sideEnter"
        @pointerleave="sideLeave"
        @pointerup="sideTap"
      >
        <div class="gvf-sh-top" aria-hidden="true">
          <span class="gvf-sh-ic" v-html="menuIcon" />
          <span class="gvf-sh-ic" v-html="penIcon" />
        </div>

        <!-- Expanded: Voyager's folders, injected into Gemini's sidebar -->
        <div class="gvf-sh-full">
          <div class="gvf-sh-label">{{ content.folders.heading }}</div>
          <div
            v-for="row in rows"
            :key="row.key"
            class="gvf-row"
            :class="{ current: row.chat === content.current }"
            :style="{ paddingInlineStart: `${10 + row.depth * 14}px` }"
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
            </template>
          </div>
        </div>

        <span class="gvf-sh-ic gvf-sh-gear" aria-hidden="true" v-html="icon('settings', 17)" />
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
/* Covers the card without taking its clicks; only the sidebar is interactive. */
.gvf-sh {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none !important;
  color: var(--host-text);
}
.gvf-sh-side {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 10px 0;
  pointer-events: auto;
  background: var(--host-side, var(--host-bg));
  border-inline-end: 1px solid var(--gvf-line);
  transition: width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-sh:not(.open) .gvf-sh-side {
  cursor: pointer;
}
.gvf-sh-top {
  display: flex;
  gap: 2px;
  padding-inline: 10px;
  color: var(--host-muted);
}
.gvf-sh-full {
  flex: 1;
  min-height: 0;
  width: var(--gvf-sh-full);
  padding: 14px 6px 0;
  overflow: hidden;
  transition: opacity 0.2s ease;
}
.gvf-sh:not(.open) .gvf-sh-full {
  opacity: 0;
}
.gvf-sh-label {
  padding: 0 10px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--host-muted);
}
.gvf-sh-full .gvf-row {
  cursor: default;
}
.gvf-sh-ic {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 999px;
}
.gvf-sh-gear {
  margin-inline-start: 10px;
  color: var(--host-muted);
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
