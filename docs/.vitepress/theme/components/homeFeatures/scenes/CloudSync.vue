<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import type { TreeNode } from '../types';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('folders');

const ICONS = {
  cloudUpload:
    '<path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/>',
  cloudDownload:
    '<path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/>',
  laptop:
    '<path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z"/><path d="M20.054 15.987H3.946"/>',
  compass:
    '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const icon = (path: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

/* The cloud button's menu reuses the extension's folder_cloud_upload / folder_cloud_sync strings. */
const TEXT: Record<string, { cloud: string; up: string; down: string }> = {
  'zh-CN': { cloud: '云同步', up: '上传到云端', down: '从云端同步' },
  'zh-TW': { cloud: '雲端同步', up: '上傳到雲端', down: '從雲端同步' },
  'en-US': { cloud: 'Cloud sync', up: 'Upload to Cloud', down: 'Sync from Cloud' },
  'ja-JP': { cloud: 'クラウド同期', up: 'クラウドにアップロード', down: 'クラウドから同期' },
  'ko-KR': { cloud: '클라우드 동기화', up: '클라우드에 업로드', down: '클라우드에서 동기화' },
  'fr-FR': {
    cloud: 'Synchronisation cloud',
    up: 'Téléverser vers le cloud',
    down: 'Synchroniser depuis le cloud',
  },
  'es-ES': {
    cloud: 'Sincronización en la nube',
    up: 'Subir a la nube',
    down: 'Sincronizar desde la nube',
  },
  'pt-PT': {
    cloud: 'Sincronização na nuvem',
    up: 'Enviar para a nuvem',
    down: 'Sincronizar a partir da nuvem',
  },
  'ar-SA': { cloud: 'المزامنة السحابية', up: 'رفع إلى السحابة', down: 'مزامنة من السحابة' },
  'ru-RU': {
    cloud: 'Облачная синхронизация',
    up: 'Загрузить в облако',
    down: 'Синхронизировать из облака',
  },
};
const text = computed(() => TEXT[props.lang] ?? TEXT['en-US']);

/* The folder card, redrawn row for row so the scene starts exactly where the demo is. */
const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);
type Node = { folder: string; open: boolean; kids: Node[] } | { chat: string };
const copy = (nodes: TreeNode[]): Node[] =>
  nodes.map((n) =>
    'folder' in n ? { folder: n.folder, open: !!n.open, kids: copy(n.kids) } : { chat: n.chat },
  );
const tree = ref<Node[]>(copy(content.value.tree));
const extraStars = ref<string[]>([]);
const isStarred = (id: string) => !!content.value.chats[id]?.star || extraStars.value.includes(id);

interface Row {
  key: string;
  depth: number;
  folder?: string;
  open?: boolean;
  chat?: string;
}
const rows = computed<Row[]>(() => {
  const starred = (n: Node) => 'chat' in n && isStarred(n.chat);
  const out: Row[] = [];
  const walk = (nodes: Node[], depth: number, path: string) => {
    const sorted = [...nodes].sort(
      (a, b) =>
        Number('folder' in b) - Number('folder' in a) || Number(starred(b)) - Number(starred(a)),
    );
    for (const n of sorted) {
      if ('folder' in n) {
        out.push({ key: `${path}/${n.folder}`, depth, folder: n.folder, open: n.open });
        if (n.open) walk(n.kids, depth + 1, `${path}/${n.folder}`);
      } else out.push({ key: n.chat, depth, chat: n.chat });
    }
  };
  walk(tree.value, 0, '');
  return out;
});
function toggleFolder(row: Row) {
  const find = (nodes: Node[], path: string): void => {
    for (const n of nodes) {
      if (!('folder' in n)) continue;
      const p = `${path}/${n.folder}`;
      if (p === row.key) n.open = !n.open;
      else if (row.key.startsWith(`${p}/`)) find(n.kids, p);
    }
  };
  find(tree.value, '');
}

/* What another device uploaded: a new folder holding two chats, and one more starred chat. */
const remote = computed(() => {
  const roots = tree.value.filter((n): n is { chat: string } => 'chat' in n).map((n) => n.chat);
  const free = roots.filter((id) => id !== content.value.current && !isStarred(id));
  return { folder: content.value.folders.newFolder, move: free.slice(-2), star: free[1] ?? '' };
});
const merged = ref(false);
const fresh = ref<string[]>([]);
function merge() {
  if (merged.value) return;
  const { folder, move, star } = remote.value;
  tree.value = [
    { folder, open: true, kids: move.map((chat) => ({ chat })) },
    ...tree.value.filter((n) => !('chat' in n) || !move.includes(n.chat)),
  ];
  if (star) extraStars.value = [star];
  fresh.value = [`/${folder}`, ...move, star];
  merged.value = true;
}

type CloudState = 'idle' | 'up' | 'down' | 'ok';
const cloud = ref<CloudState>('idle');
const menuOpen = ref(false);
const hot = ref<'' | 'up' | 'down'>('');
const provider = ref<'drive' | 'icloud'>('drive');
/** Set after the first transfer; the header then keeps showing which service syncs. */
const linked = ref(false);
const timers: number[] = [];
const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

function run(kind: 'up' | 'down') {
  menuOpen.value = false;
  hot.value = '';
  cloud.value = kind;
  at(950, () => {
    if (kind === 'down') merge();
    cloud.value = 'ok';
    linked.value = true;
  });
}
const busy = computed(() => cloud.value === 'up' || cloud.value === 'down');
const cloudIcon = computed(() =>
  cloud.value === 'up'
    ? ICONS.cloudUpload
    : cloud.value === 'down'
      ? ICONS.cloudDownload
      : uiIcons.cloud,
);

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    merge();
    cloud.value = 'ok';
    linked.value = true;
    return;
  }
  // Upload this device's folders, then pull in what the other device added.
  at(400, () => (menuOpen.value = true));
  at(850, () => (hot.value = 'up'));
  at(1250, () => run('up'));
  at(2600, () => (menuOpen.value = true));
  at(3050, () => (hot.value = 'down'));
  at(3450, () => run('down'));
});
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));
</script>

<template>
  <Teleport v-if="stage.regions.foldersCover" :to="stage.regions.foldersCover">
    <div class="gvf-cs">
      <div class="gvf-fd">
        <div class="gvf-fd-head">
          <span class="gvf-fd-label">
            <Transition name="gvf-cs-swap" mode="out-in">
              <span v-if="linked" class="gvf-cs-seg" role="radiogroup" :aria-label="text.cloud">
                <button
                  type="button"
                  role="radio"
                  :aria-checked="provider === 'drive'"
                  :class="{ on: provider === 'drive' }"
                  @click="provider = 'drive'"
                >
                  Google Drive
                </button>
                <button
                  type="button"
                  role="radio"
                  title="Safari"
                  :aria-checked="provider === 'icloud'"
                  :class="{ on: provider === 'icloud' }"
                  @click="provider = 'icloud'"
                >
                  <span class="gvf-cs-safari" v-html="icon(ICONS.compass, 11)" />iCloud
                </button>
              </span>
              <span v-else>{{ content.folders.heading }}</span>
            </Transition>
          </span>
          <span class="gvf-icon-btn sm" v-html="icon(uiIcons.user, 15)" />
          <span class="gvf-icon-btn sm" v-html="icon(uiIcons.folder, 15)" />
          <button
            type="button"
            class="gvf-icon-btn sm gvf-cs-cloud"
            :class="[`gvf-cs-st-${cloud}`, { open: menuOpen }]"
            :aria-label="text.cloud"
            :title="text.cloud"
            :aria-expanded="menuOpen"
            :disabled="busy"
            @click="menuOpen = !menuOpen"
          >
            <span :key="cloud" class="gvf-cs-glyph" v-html="icon(cloudIcon, 15)" />
            <b v-if="cloud === 'ok'" class="gvf-cs-ok" v-html="icon(ICONS.check, 8)" />
          </button>
          <span class="gvf-icon-btn sm" v-html="icon(uiIcons.settings, 15)" />
          <span class="gvf-icon-btn sm" v-html="icon(uiIcons.plus, 15)" />
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
        <TransitionGroup tag="div" name="gvf-cs-row">
          <component
            :is="row.folder ? 'button' : 'div'"
            v-for="row in rows"
            :key="row.key"
            :type="row.folder ? 'button' : undefined"
            class="gvf-row"
            :class="{
              current: row.chat === content.current,
              'gvf-cs-new': fresh.includes(row.key),
            }"
            :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
            @click="row.folder && toggleFolder(row)"
          >
            <template v-if="row.folder">
              <span
                class="gvf-chev"
                :class="{ open: row.open }"
                v-html="icon(uiIcons['chevron-right'], 14)"
              />
              <span v-html="icon(row.open ? uiIcons['folder-open'] : uiIcons.folder, 14)" />
              <span class="gvf-name">{{ row.folder }}</span>
              <span
                v-if="fresh[0] === row.key"
                class="gvf-cs-device"
                v-html="icon(ICONS.laptop, 14)"
              />
            </template>
            <template v-else>
              <span v-html="icon(uiIcons['message-square'], 14)" />
              <span class="gvf-name">{{ content.chats[row.chat!]?.title }}</span>
              <span
                class="gvf-star"
                :class="{ on: isStarred(row.chat!) }"
                v-html="icon(uiIcons.star, 14)"
              />
            </template>
          </component>
        </TransitionGroup>
      </div>

      <i class="gvf-cs-progress" :class="{ on: busy }" aria-hidden="true" />

      <!-- The cloud button's menu: Upload and Sync, for whichever provider is chosen -->
      <div class="gvf-cs-menu" :class="{ open: menuOpen }" role="menu">
        <button
          type="button"
          role="menuitem"
          :class="{ hot: hot === 'up' }"
          :tabindex="menuOpen ? 0 : -1"
          @click="run('up')"
        >
          <span v-html="icon(ICONS.cloudUpload, 16)" />{{ text.up }}
        </button>
        <button
          type="button"
          role="menuitem"
          :class="{ hot: hot === 'down' }"
          :tabindex="menuOpen ? 0 : -1"
          @click="run('down')"
        >
          <span v-html="icon(ICONS.cloudDownload, 16)" />{{ text.down }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-cs {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--host-bg);
}
.dark .gvf-cs {
  background: var(--host-side);
}
.gvf-cs .gvf-fd {
  height: 100%;
}
.gvf-cs .gvf-fd-label {
  min-width: 0;
  display: flex;
  overflow: hidden;
}

/* Cloud button */
.gvf-cs-cloud {
  position: relative;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}
.gvf-cs-cloud:disabled {
  cursor: default;
}
.gvf-cs-cloud.open,
.gvf-cs-cloud.gvf-cs-st-up,
.gvf-cs-cloud.gvf-cs-st-down {
  background: var(--gv-brand-soft);
  color: var(--gv-brand);
}
.gvf-cs-cloud.gvf-cs-st-ok {
  color: var(--gv-brand);
}
.gvf-cs-glyph {
  display: grid;
  animation: gvf-cs-pop 0.25s ease both;
}
.gvf-cs-st-up .gvf-cs-glyph {
  animation: gvf-cs-lift 0.6s ease-in-out infinite;
}
.gvf-cs-st-down .gvf-cs-glyph {
  animation: gvf-cs-drop 0.6s ease-in-out infinite;
}
@keyframes gvf-cs-pop {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
}
@keyframes gvf-cs-lift {
  50% {
    transform: translateY(-2px);
  }
}
@keyframes gvf-cs-drop {
  50% {
    transform: translateY(2px);
  }
}
.gvf-cs-ok {
  position: absolute;
  bottom: 1px;
  inset-inline-end: 1px;
  width: 11px;
  height: 11px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--gv-brand);
  color: #fff;
  box-shadow: 0 0 0 1.5px var(--host-bg);
  animation: gvf-cs-badge 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
}
.dark .gvf-cs-ok {
  box-shadow: 0 0 0 1.5px var(--host-side);
}
@keyframes gvf-cs-badge {
  from {
    transform: scale(0);
  }
}

/* Indeterminate progress under the header while a transfer runs */
.gvf-cs-progress {
  position: absolute;
  top: 40px;
  inset-inline: 12px;
  height: 2px;
  border-radius: 2px;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.gvf-cs-progress.on {
  opacity: 1;
}
.gvf-cs-progress::after {
  content: '';
  position: absolute;
  inset-block: 0;
  width: 40%;
  border-radius: inherit;
  background: var(--gv-brand);
  animation: gvf-cs-run 0.9s ease-in-out infinite;
}
@keyframes gvf-cs-run {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}

/* Menu */
.gvf-cs-menu {
  position: absolute;
  top: 40px;
  inset-inline-end: 50px;
  min-width: 190px;
  max-width: calc(100% - 24px);
  padding: 6px;
  display: grid;
  border-radius: 12px;
  background: var(--host-bg);
  color: var(--host-text);
  border: 1px solid var(--gvf-line);
  box-shadow: 0 12px 32px -10px oklch(0 0 0 / 0.3);
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
  transform-origin: top right;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
[dir='rtl'] .gvf-cs-menu {
  transform-origin: top left;
}
.dark .gvf-cs-menu {
  background: var(--host-user);
}
.gvf-cs-menu.open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-cs-menu button {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  text-align: start;
  cursor: pointer;
  transition: background 0.15s ease;
}
.gvf-cs-menu button span {
  display: grid;
  color: var(--host-muted);
}
.gvf-cs-menu button:hover,
.gvf-cs-menu button:focus-visible,
.gvf-cs-menu button.hot {
  background: color-mix(in srgb, var(--host-text) 8%, transparent);
  outline: none;
}
.gvf-cs-menu button.hot span {
  color: var(--gv-brand);
}

/* Provider switch: Google Drive everywhere, iCloud in Safari */
.gvf-cs-seg {
  display: inline-flex;
  padding: 2px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--host-text) 7%, transparent);
  min-width: 0;
}
.gvf-cs-seg button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 9px;
  border: 0;
  border-radius: 99px;
  background: transparent;
  color: var(--host-muted) !important;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.6;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}
.gvf-cs-seg button.on {
  background: var(--host-bg);
  color: var(--host-text) !important;
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.12);
}
.dark .gvf-cs-seg button.on {
  background: var(--host-user);
}
.gvf-cs-seg button:focus-visible {
  outline: 2px solid var(--gv-brand);
  outline-offset: 1px;
}
.gvf-cs-safari {
  display: grid;
}
.gvf-cs-swap-enter-active,
.gvf-cs-swap-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s ease;
}
.gvf-cs-swap-enter-from,
.gvf-cs-swap-leave-to {
  opacity: 0;
  transform: translateY(3px);
}

/* Rows merged in from the other device */
.gvf-cs .gvf-row.gvf-cs-new {
  animation: gvf-cs-glow 2.4s ease-out both;
}
@keyframes gvf-cs-glow {
  0%,
  40% {
    background: var(--gv-brand-soft);
  }
  100% {
    background: color-mix(in srgb, var(--gv-brand) 6%, transparent);
  }
}
.gvf-cs .gvf-row.gvf-cs-new.current {
  animation: none;
}
.gvf-cs .gvf-row > .gvf-cs-device {
  color: var(--gv-brand);
  animation: gvf-cs-pop 0.3s ease both;
}
.gvf-cs-row-enter-active {
  transition:
    opacity 0.35s ease,
    transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.gvf-cs-row-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
.gvf-cs-row-move {
  transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
}
</style>
