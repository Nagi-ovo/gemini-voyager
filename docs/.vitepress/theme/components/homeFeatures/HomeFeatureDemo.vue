<script setup lang="ts">
import { useData } from 'vitepress';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { escapeHtml, promptReply, renderAnswer } from './answer';
import type { Answer, DemoChat, DemoPrompt, HomeFeaturesContent, TreeNode } from './types';
import { uiIcons } from './uiIcons';

const props = defineProps<{ content: HomeFeaturesContent }>();
const { isDark } = useData();

const icon = (name: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiIcons[name] ?? ''}</svg>`;
const fill = (template: string, q: string) => template.replace('{q}', q);

/* Demo state is a per-visit copy of the locale content; interactions only touch the copy. */
interface Turn {
  q: string;
  a: Answer;
  pending?: boolean;
}
interface ChatState {
  title: string;
  star: boolean;
  starred: Set<number>;
  turns: Turn[];
  source: DemoChat;
}
type NodeState = { folder: string; open: boolean; kids: NodeState[] } | { chat: string };

const chats = reactive<Record<string, ChatState>>({});
const tree = ref<NodeState[]>([]);
const current = ref('');

function reset(c: HomeFeaturesContent) {
  for (const key of Object.keys(chats)) delete chats[key];
  for (const [id, chat] of Object.entries(c.chats)) {
    chats[id] = {
      title: chat.title,
      star: !!chat.star,
      starred: new Set(chat.starred ?? []),
      turns: chat.turns.map(([q, a]) => ({ q, a })),
      source: chat,
    };
  }
  const copy = (nodes: TreeNode[]): NodeState[] =>
    nodes.map((n) =>
      'folder' in n ? { folder: n.folder, open: !!n.open, kids: copy(n.kids) } : { chat: n.chat },
    );
  tree.value = copy(c.tree);
  current.value = c.current;
  pending.value = null;
  promptQuery.value = '';
  folderQuery.value = '';
  tag.value = '';
}

const chat = computed(() => chats[current.value]);

/* Folders */
const folderQuery = ref('');
const isStarred = (n: NodeState) => 'chat' in n && !!chats[n.chat]?.star;
const sorted = (nodes: NodeState[]) =>
  // Folders first, then starred chats, matching the extension's sidebar order.
  [...nodes].sort(
    (a, b) =>
      Number('folder' in b) - Number('folder' in a) || Number(isStarred(b)) - Number(isStarred(a)),
  );
const matches = (n: NodeState, q: string): boolean =>
  'folder' in n
    ? n.folder.includes(q) || n.kids.some((k) => matches(k, q))
    : (chats[n.chat]?.title.includes(q) ?? false);

interface Row {
  key: string;
  depth: number;
  node: NodeState;
  open?: boolean;
  parent: NodeState[];
}
const rows = computed<Row[]>(() => {
  const q = folderQuery.value.trim();
  const out: Row[] = [];
  const walk = (nodes: NodeState[], depth: number, path: string) => {
    for (const n of sorted(nodes)) {
      if (q && !matches(n, q)) continue;
      if ('folder' in n) {
        const open = q ? true : n.open;
        out.push({ key: `${path}/${n.folder}`, depth, node: n, open, parent: nodes });
        if (open) walk(n.kids, depth + 1, `${path}/${n.folder}`);
      } else {
        out.push({ key: n.chat, depth, node: n, parent: nodes });
      }
    }
  };
  walk(tree.value, 0, '');
  return out;
});

function openChat(id: string) {
  if (current.value === id) return;
  current.value = id;
  closePreview();
  nextTick(() => {
    if (chatEl.value) chatEl.value.scrollTop = 0;
    measure();
  });
}
let folderCount = 0;
function newFolder() {
  folderCount++;
  tree.value.unshift({
    folder:
      folderCount > 1
        ? `${props.content.folders.newFolder} ${folderCount}`
        : props.content.folders.newFolder,
    open: false,
    kids: [],
  });
}
let dragging: { node: NodeState; parent: NodeState[] } | null = null;
const startDrag = (row: Row) => (dragging = { node: row.node, parent: row.parent });
const endDrag = () => (dragging = null);
function toggleFolder(node: NodeState) {
  if ('folder' in node) node.open = !node.open;
}
function toggleStar(id: string) {
  const c = chats[id];
  if (c) c.star = !c.star;
}
const chatId = (node: NodeState) => ('chat' in node ? node.chat : '');
const folderName = (node: NodeState) => ('folder' in node ? node.folder : '');
const dropKey = ref('');
function onDrop(row: Row) {
  dropKey.value = '';
  if (!dragging || !('folder' in row.node) || dragging.parent === row.node.kids) return;
  dragging.parent.splice(dragging.parent.indexOf(dragging.node), 1);
  row.node.kids.push(dragging.node);
  row.node.open = true;
  dragging = null;
}

/* Conversation + timeline */
const chatEl = ref<HTMLElement | null>(null);
const railEl = ref<HTMLElement | null>(null);
const dotTops = ref<number[]>([]);
const active = ref(0);
const tip = reactive({ show: false, top: 0, text: '', starred: false });
const flashIdx = ref(-1);
const bornIdx = ref(-1);
const holdIdx = ref(-1);

function measure() {
  const el = chatEl.value;
  const rail = railEl.value;
  if (!el || !rail) return;
  const turns = [...el.querySelectorAll<HTMLElement>('.gvf-turn')];
  const total = Math.max(el.scrollHeight, 1);
  const pad = 16;
  const h = rail.clientHeight - pad * 2;
  dotTops.value = turns.map((t) => pad + (t.offsetTop / total) * h);
  syncActive();
}
function syncActive() {
  const el = chatEl.value;
  if (!el) return;
  const turns = [...el.querySelectorAll<HTMLElement>('.gvf-turn')];
  let cur = 0;
  turns.forEach((t, i) => {
    if (t.offsetTop <= el.scrollTop + 40) cur = i;
  });
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) cur = turns.length - 1;
  active.value = cur;
}
function jump(i: number) {
  const el = chatEl.value;
  const turn = el?.querySelectorAll<HTMLElement>('.gvf-turn')[i];
  if (!el || !turn) return;
  el.scrollTo({ top: turn.offsetTop - 8, behavior: 'smooth' });
  flashIdx.value = i;
  setTimeout(() => flashIdx.value === i && (flashIdx.value = -1), 700);
}
function showTip(i: number) {
  if (!railEl.value || !chat.value) return;
  tip.text = chat.value.turns[i].q;
  tip.starred = chat.value.starred.has(i);
  tip.top = railEl.value.offsetTop + (dotTops.value[i] ?? 0);
  tip.show = true;
}
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let held = false;
function dotDown(i: number) {
  held = false;
  holdIdx.value = i;
  holdTimer = setTimeout(() => {
    held = true;
    holdIdx.value = -1;
    const s = chat.value.starred;
    if (s.has(i)) s.delete(i);
    else s.add(i);
    showTip(i);
  }, 550);
}
function dotUp(i: number) {
  clearTimeout(holdTimer);
  holdIdx.value = -1;
  if (!held) jump(i);
}
function dotLeave() {
  tip.show = false;
  clearTimeout(holdTimer);
  holdIdx.value = -1;
}

/* Timeline overview panel */
const previewOpen = ref(false);
const previewQuery = ref('');
const previewInput = ref<HTMLInputElement | null>(null);
let previewTimer: ReturnType<typeof setTimeout> | undefined;
const previewRows = computed(() => {
  const q = previewQuery.value.trim();
  return (chat.value?.turns ?? [])
    .map((t, i) => ({ i, q: t.q }))
    .filter((r) => !q || r.q.includes(q))
    .map((r) => ({
      ...r,
      html: q
        ? escapeHtml(r.q)
            .split(escapeHtml(q))
            .join(`<mark>${escapeHtml(q)}</mark>`)
        : escapeHtml(r.q),
    }));
});
const cancelPreviewClose = () => clearTimeout(previewTimer);
function openPreview() {
  clearTimeout(previewTimer);
  previewOpen.value = true;
}
function closePreview() {
  clearTimeout(previewTimer);
  previewOpen.value = false;
  previewQuery.value = '';
}
function schedulePreviewClose() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (document.activeElement !== previewInput.value || !previewQuery.value) closePreview();
  }, 260);
}

/* Composer: read-only, filled from the prompt library; replies are prewritten. */
const pending = ref<DemoPrompt | null>(null);
const composerPulse = ref(0);
function choose(p: DemoPrompt) {
  pending.value = p;
  composerPulse.value++;
}
function send() {
  const p = pending.value;
  const c = chat.value;
  if (!p || !c) return;
  c.turns.push({
    q: p.text,
    a: promptReply(p.reply, c.source, props.content.replyLeads),
    pending: true,
  });
  pending.value = null;
  const i = c.turns.length - 1;
  bornIdx.value = i;
  nextTick(() => {
    measure();
    chatEl.value?.scrollTo({ top: chatEl.value.scrollHeight, behavior: 'smooth' });
  });
  setTimeout(() => {
    // Write through the reactive array: the local `turn` is the raw object.
    const live = c.turns[i];
    if (live) live.pending = false;
    nextTick(() => {
      measure();
      chatEl.value?.scrollTo({ top: chatEl.value.scrollHeight, behavior: 'smooth' });
    });
  }, 900);
}

/* Voyager ball: draggable; a click highlights the prompt library. */
const hostEl = ref<HTMLElement | null>(null);
const ball = reactive({ right: 22, bottom: 92 });
const pmGlow = ref(false);
const promptSearch = ref<HTMLInputElement | null>(null);
let ballDrag: { x: number; y: number; right: number; bottom: number; moved: boolean } | null = null;
function ballDown(e: PointerEvent) {
  ballDrag = { x: e.clientX, y: e.clientY, right: ball.right, bottom: ball.bottom, moved: false };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function ballMove(e: PointerEvent) {
  if (!ballDrag || !hostEl.value) return;
  const dx = e.clientX - ballDrag.x;
  const dy = e.clientY - ballDrag.y;
  if (!ballDrag.moved && Math.hypot(dx, dy) < 4) return;
  ballDrag.moved = true;
  const { clientWidth: w, clientHeight: h } = hostEl.value;
  ball.right = Math.min(Math.max(ballDrag.right - dx, 6), w - 52);
  ball.bottom = Math.min(Math.max(ballDrag.bottom - dy, 6), h - 52);
}
function ballUp() {
  const wasDrag = ballDrag?.moved;
  ballDrag = null;
  if (wasDrag) return;
  pmGlow.value = true;
  setTimeout(() => (pmGlow.value = false), 900);
  promptSearch.value?.focus({ preventScroll: true });
}

/* Prompt library */
const promptQuery = ref('');
const tag = ref('');
const tags = computed(() => [...new Set(props.content.promptList.map((p) => p.tag))]);
const visiblePrompts = computed(() => {
  const q = promptQuery.value.trim();
  return props.content.promptList.filter(
    (p) =>
      (!tag.value || p.tag === tag.value) &&
      (!q || p.name.includes(q) || p.tag.includes(q) || p.text.includes(q)),
  );
});

/* Lifecycle */
let resizeObserver: ResizeObserver | undefined;
const onDocPointerDown = (e: PointerEvent) => {
  if (!(e.target as HTMLElement).closest?.('.gvf-tl-zone')) closePreview();
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && previewOpen.value) closePreview();
};
watch(
  () => props.content,
  (c) => {
    reset(c);
    nextTick(measure);
  },
  { immediate: true },
);
watch(
  () => chat.value?.turns.length,
  () => nextTick(measure),
);
onMounted(() => {
  resizeObserver = new ResizeObserver(measure);
  if (chatEl.value) resizeObserver.observe(chatEl.value);
  document.addEventListener('pointerdown', onDocPointerDown);
  document.addEventListener('keydown', onKey);
  nextTick(measure);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  document.removeEventListener('pointerdown', onDocPointerDown);
  document.removeEventListener('keydown', onKey);
  clearTimeout(holdTimer);
  clearTimeout(previewTimer);
});
</script>

<template>
  <div class="gvf-hero">
    <!-- Timeline: conversation, rail and composer -->
    <article class="gvf-card">
      <div class="gvf-copy">
        <div class="gvf-eyebrow">{{ content.timeline.eyebrow }}</div>
        <h3>{{ content.timeline.title }}</h3>
        <p>{{ content.timeline.body }}</p>
        <div class="gvf-try">{{ content.timeline.hint }}</div>
      </div>
      <div class="gvf-stage">
        <div ref="hostEl" class="gvf-host gvf-tl-host">
          <div class="gvf-topbar">{{ chat?.title }}</div>
          <div class="gvf-convo">
            <div ref="chatEl" class="gvf-chat" @scroll.passive="syncActive">
              <div
                v-for="(turn, i) in chat?.turns ?? []"
                :key="i"
                class="gvf-turn"
                :class="{ flash: flashIdx === i }"
              >
                <div class="gvf-q">{{ turn.q }}</div>
                <div v-if="turn.pending" class="gvf-a gvf-typing"><i /><i /><i /></div>
                <div v-else class="gvf-a" v-html="renderAnswer(turn.a)" />
              </div>
            </div>
            <div
              class="gvf-tl-zone"
              @pointerleave="schedulePreviewClose"
              @pointerenter="cancelPreviewClose"
            >
              <div ref="railEl" class="gvf-rail">
                <button
                  v-for="(top, i) in dotTops"
                  :key="i"
                  type="button"
                  class="gvf-dot"
                  :class="{
                    active: active === i,
                    starred: chat?.starred.has(i),
                    holding: holdIdx === i,
                    born: bornIdx === i,
                  }"
                  :style="{ top: `${top}px` }"
                  :aria-label="chat?.turns[i]?.q"
                  @pointerenter="showTip(i)"
                  @pointerleave="dotLeave"
                  @pointerdown="dotDown(i)"
                  @pointerup="dotUp(i)"
                  @focus="showTip(i)"
                  @blur="tip.show = false"
                  @keydown.enter.prevent="jump(i)"
                  @contextmenu.prevent
                />
              </div>
              <button
                type="button"
                class="gvf-pv-toggle"
                :class="{ active: previewOpen }"
                :aria-label="content.timeline.overview"
                :aria-pressed="previewOpen"
                @pointerenter="openPreview"
                @click="previewOpen ? closePreview() : openPreview()"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
              <div
                class="gvf-pv-panel"
                :class="{ visible: previewOpen }"
                role="dialog"
                :aria-label="content.timeline.overview"
              >
                <div class="gvf-pv-search">
                  <span v-html="icon('search', 14)" />
                  <input
                    ref="previewInput"
                    v-model="previewQuery"
                    type="search"
                    :placeholder="content.timeline.searchPlaceholder"
                    :aria-label="content.timeline.searchPlaceholder"
                  />
                </div>
                <div class="gvf-pv-list">
                  <button
                    v-for="row in previewRows"
                    :key="row.i"
                    type="button"
                    class="gvf-pv-item"
                    :class="{ active: active === row.i, starred: chat?.starred.has(row.i) }"
                    @click="jump(row.i)"
                  >
                    <span class="gvf-pv-index">{{ row.i + 1 }}</span>
                    <span class="gvf-pv-text" v-html="row.html" />
                  </button>
                  <div v-if="!previewRows.length" class="gvf-pv-empty">
                    {{ fill(content.timeline.noMatch, previewQuery) }}
                  </div>
                </div>
              </div>
            </div>
            <div class="gvf-tip" :class="{ show: tip.show }" :style="{ top: `${tip.top}px` }">
              <b v-if="tip.starred">★ </b>{{ tip.text }}
            </div>
          </div>
          <div class="gvf-composer-wrap">
            <div :key="composerPulse" class="gvf-composer" :class="{ filled: composerPulse > 0 }">
              <div class="gvf-composer-text" :class="{ empty: !pending }">
                {{ pending ? pending.text : content.composer.placeholder }}
              </div>
              <div class="gvf-composer-bar">
                <span class="gvf-icon-btn" v-html="icon('plus', 17)" />
                <button
                  type="button"
                  class="gvf-icon-btn gvf-send"
                  :disabled="!pending"
                  :aria-label="content.composer.send"
                  @click="send"
                  v-html="icon('arrow-up', 17)"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            class="gvf-ball"
            :style="{ right: `${ball.right}px`, bottom: `${ball.bottom}px` }"
            :aria-label="content.composer.ball"
            @pointerdown="ballDown"
            @pointermove="ballMove"
            @pointerup="ballUp"
            @keydown.enter.prevent="ballUp"
          >
            <img src="/logo.png" alt="" width="24" height="24" draggable="false" />
          </button>
        </div>
      </div>
    </article>

    <div class="gvf-right">
      <!-- Folders -->
      <article class="gvf-card">
        <div class="gvf-copy">
          <div class="gvf-eyebrow">{{ content.folders.eyebrow }}</div>
          <h3>{{ content.folders.title }}</h3>
          <p>{{ content.folders.body }}</p>
          <div class="gvf-try">{{ content.folders.hint }}</div>
        </div>
        <div class="gvf-stage">
          <div class="gvf-host gvf-fd-host">
            <div class="gvf-fd">
              <div class="gvf-fd-head">
                <span class="gvf-fd-label">{{ content.folders.heading }}</span>
                <span class="gvf-icon-btn sm" v-html="icon('user', 15)" />
                <span class="gvf-icon-btn sm" v-html="icon('folder', 15)" />
                <span class="gvf-icon-btn sm" v-html="icon('cloud', 15)" />
                <span class="gvf-icon-btn sm" v-html="icon('settings', 15)" />
                <button
                  type="button"
                  class="gvf-icon-btn sm"
                  :aria-label="content.folders.newFolder"
                  @click="newFolder"
                  v-html="icon('plus', 15)"
                />
              </div>
              <div class="gvf-fd-search">
                <input
                  v-model="folderQuery"
                  type="search"
                  :placeholder="content.folders.searchPlaceholder"
                  :aria-label="content.folders.searchPlaceholder"
                />
              </div>
              <template v-for="row in rows" :key="row.key">
                <button
                  v-if="'folder' in row.node"
                  type="button"
                  class="gvf-row"
                  :class="{ drop: dropKey === row.key }"
                  :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
                  :aria-expanded="row.open"
                  @click="toggleFolder(row.node)"
                  @dragover.prevent="dropKey = row.key"
                  @dragleave="dropKey = ''"
                  @drop.prevent="onDrop(row)"
                >
                  <span
                    class="gvf-chev"
                    :class="{ open: row.open }"
                    v-html="icon('chevron-right', 14)"
                  />
                  <span v-html="icon(row.open ? 'folder-open' : 'folder', 14)" />
                  <span class="gvf-name">{{ folderName(row.node) }}</span>
                </button>
                <div
                  v-else
                  class="gvf-row"
                  :class="{ current: chatId(row.node) === current }"
                  :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
                  role="button"
                  tabindex="0"
                  draggable="true"
                  @click="openChat(chatId(row.node))"
                  @keydown.enter="openChat(chatId(row.node))"
                  @dragstart="startDrag(row)"
                  @dragend="endDrag"
                >
                  <span v-html="icon('message-square', 14)" />
                  <span class="gvf-name">{{ chats[chatId(row.node)]?.title }}</span>
                  <button
                    type="button"
                    class="gvf-star"
                    :class="{ on: chats[chatId(row.node)]?.star }"
                    :aria-label="content.folders.star"
                    @click.stop="toggleStar(chatId(row.node))"
                    v-html="icon('star', 14)"
                  />
                </div>
              </template>
              <div v-if="!rows.length" class="gvf-fd-empty">
                {{ fill(content.folders.noMatch, folderQuery) }}
              </div>
            </div>
          </div>
        </div>
      </article>

      <!-- Prompt library -->
      <article class="gvf-card">
        <div class="gvf-copy">
          <div class="gvf-eyebrow">{{ content.prompts.eyebrow }}</div>
          <h3>{{ content.prompts.title }}</h3>
          <p>{{ content.prompts.body }}</p>
          <div class="gvf-try">{{ content.prompts.hint }}</div>
        </div>
        <div class="gvf-stage">
          <div class="gvf-host gvf-pm-host">
            <div class="gvf-pm" :class="{ glow: pmGlow }">
              <div class="gvf-pm-header">
                <span class="gvf-pm-drag" v-html="icon('grip-vertical', 12)" />
                <span class="gvf-pm-title">Voyager</span>
                <span
                  class="gvf-pm-theme"
                  aria-hidden="true"
                  v-html="icon(isDark ? 'moon' : 'sun', 12)"
                />
                <span class="gvf-pm-version">2.0.0</span>
                <span class="gvf-pm-controls">
                  <span class="gvf-pm-add">{{ content.prompts.add }}</span>
                  <span class="gvf-pm-lock" v-html="icon('lock-open', 15)" />
                </span>
              </div>
              <div class="gvf-pm-search">
                <input
                  ref="promptSearch"
                  v-model="promptQuery"
                  type="search"
                  :placeholder="content.prompts.searchPlaceholder"
                  :aria-label="content.prompts.searchPlaceholder"
                />
                <span class="gvf-pm-view" v-html="icon('layout-grid', 15)" />
              </div>
              <div class="gvf-chips">
                <button type="button" class="gvf-chip" :class="{ on: !tag }" @click="tag = ''">
                  {{ content.prompts.all }}
                </button>
                <button
                  v-for="t in tags"
                  :key="t"
                  type="button"
                  class="gvf-chip"
                  :class="{ on: tag === t }"
                  @click="tag = t"
                >
                  {{ t }}
                </button>
              </div>
              <div class="gvf-pm-list">
                <button
                  v-for="p in visiblePrompts"
                  :key="p.name"
                  type="button"
                  class="gvf-item"
                  @click="choose(p)"
                >
                  <span class="gvf-item-name">{{ p.name }}</span>
                  <span class="gvf-item-tag">{{ p.tag }}</span>
                </button>
                <div v-if="!visiblePrompts.length" class="gvf-pm-empty">
                  {{ fill(content.prompts.noMatch, promptQuery) }}
                </div>
              </div>
              <div class="gvf-pm-footer">
                <span class="gvf-pm-saved"
                  ><span v-html="icon('star', 14)" />{{ content.prompts.saved }}</span
                >
                <span class="gvf-pm-settings">⚙ {{ content.prompts.settings }}</span>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style src="./homeFeatures.css"></style>
