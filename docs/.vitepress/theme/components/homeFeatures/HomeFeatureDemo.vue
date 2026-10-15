<script setup lang="ts">
import { useData } from 'vitepress';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type ComponentPublicInstance,
} from 'vue';

import { escapeHtml, promptReply, renderAnswer } from './answer';
import { demoUiLabels } from './content/uiLabels';
import { useStage, type StageCard, type StageRegion } from './stage';
import type { Answer, DemoChat, DemoPrompt, HomeFeaturesContent, TreeNode } from './types';
import { uiIcons } from './uiIcons';

const props = defineProps<{ content: HomeFeaturesContent }>();
const { isDark, lang } = useData();
const ui = computed(() => demoUiLabels[lang.value] ?? demoUiLabels['en-US']);
const stage = useStage();
const view = stage.view;

/* Stage wiring: scenes teleport into these regions and drive `view`. */
type RefEl = Element | ComponentPublicInstance | null;
const region = (name: StageRegion) => (el: RefEl) => {
  if (el instanceof HTMLElement) stage.regions[name] = el;
  else delete stage.regions[name];
};
const card = (name: StageCard) => (el: RefEl) => {
  if (el instanceof HTMLElement) stage.cards[name] = el;
  else delete stage.cards[name];
};
// Send times for the timestamp scene: the conversation ends a few minutes ago, 3 minutes per turn.
const sentAt = (i: number, total: number) => {
  const d = new Date(Date.now() - (total - i) * 3 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const icon = (name: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiIcons[name] ?? ''}</svg>`;
const fill = (template: string, q: string) => template.replace('{q}', q);

/* Demo state is a per-visit copy of the locale content; interactions only touch the copy. */
interface Turn {
  q: string;
  a: Answer;
  pending?: boolean;
  /** A turn a feature scene sent, kept as its rendered markup once the scene ends. */
  kept?: { q: string; a: string };
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
  draft.value = '';
  freeReplies = 0;
  promptQuery.value = '';
  folderQuery.value = '';
  tag.value = '';
  added.value = [];
  pmView.value = 'prompts';
  adding.value = false;
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
// Searches ignore case: the Russian hint "кот" must find the title "Кот плохо ест".
const fold = (text: string) => text.toLocaleLowerCase();
const hasText = (text: string, q: string) => fold(text).includes(fold(q));
/** Escapes `text` and wraps every case-insensitive match of `q` in <mark>. */
function markMatches(text: string, q: string): string {
  const hay = fold(text);
  const needle = fold(q);
  // Lowercasing can change a string's length; then offsets no longer line up, so skip marks.
  if (!needle || hay.length !== text.length) return escapeHtml(text);
  let html = '';
  let from = 0;
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, from)) {
    html += `${escapeHtml(text.slice(from, at))}<mark>${escapeHtml(text.slice(at, at + needle.length))}</mark>`;
    from = at + needle.length;
  }
  return html + escapeHtml(text.slice(from));
}
const matches = (n: NodeState, q: string): boolean =>
  'folder' in n
    ? hasText(n.folder, q) || n.kids.some((k) => matches(k, q))
    : hasText(chats[n.chat]?.title ?? '', q);

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
  pinned = -1;
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
const spacer = ref(0);
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
  const col = el.firstElementChild as HTMLElement | null;
  const contentEnd = col ? col.offsetTop + col.offsetHeight : el.scrollHeight;
  // Room below the last turn so any turn can scroll to the top, as Gemini does; a chat that fits
  // the viewport could otherwise never move when a dot is clicked.
  const last = turns.at(-1);
  spacer.value = last ? Math.max(0, el.clientHeight - (contentEnd - last.offsetTop) - 8) : 0;
  const total = Math.max(contentEnd, 1);
  const pad = 16;
  const h = rail.clientHeight - pad * 2;
  dotTops.value = turns.map((t) => pad + (t.offsetTop / total) * h);
  syncActive();
}
// A clicked dot stays active until the reader scrolls on their own: a short chat often cannot
// scroll that turn to the top, and the "at the bottom" rule below would otherwise claim it.
let pinned = -1;
const unpin = () => {
  if (pinned < 0) return;
  pinned = -1;
  syncActive();
};
function syncActive() {
  const el = chatEl.value;
  if (!el) return;
  if (pinned >= 0) {
    active.value = pinned;
    return;
  }
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
  pinned = i;
  active.value = i;
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
    .filter((r) => !q || hasText(r.q, q))
    .map((r) => ({ ...r, html: markMatches(r.q, q) }));
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

/* Composer: type freely or insert a prompt; replies are prewritten. */
const draft = ref('');
const composerEl = ref<HTMLTextAreaElement | null>(null);
const composerPulse = ref(false);
let freeReplies = 0;
function fitComposer() {
  const el = composerEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
function choose(p: DemoPrompt) {
  // A scene that covers the composer would hide the insert; end it so the prompt lands in view.
  if (stage.regions.composerCover?.children.length) stage.stop();
  const el = composerEl.value;
  const start = el?.selectionStart ?? draft.value.length;
  const end = el?.selectionEnd ?? draft.value.length;
  draft.value = draft.value.slice(0, start) + p.text + draft.value.slice(end);
  composerPulse.value = false;
  nextTick(() => {
    composerPulse.value = true;
    fitComposer();
    el?.focus({ preventScroll: true });
    el?.setSelectionRange(start + p.text.length, start + p.text.length);
  });
}
function composerKey(e: KeyboardEvent) {
  // Enter that confirms an IME candidate must not send.
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  send();
}
function reply(text: string): Answer {
  const c = chat.value!;
  const p = allPrompts.value.find((x) => x.text && text.includes(x.text));
  if (p) return promptReply(p.reply, c.source, props.content.replyLeads);
  const lines = props.content.composer.replies;
  return lines[freeReplies++ % lines.length].replace('{add}', props.content.prompts.add);
}
function send() {
  const text = draft.value.trim();
  const c = chat.value;
  if (!text || !c) return;
  pinned = -1;
  c.turns.push({ q: text, a: reply(text), pending: true });
  draft.value = '';
  nextTick(fitComposer);
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

/* Turns a scene sent stay in the chat after it ends, as the real page would keep them. */
function keepSceneTurns() {
  const tail = stage.regions.chatTail;
  const c = chat.value;
  if (!tail || !c) return;
  const clean = (el: Element) => {
    const copy = el.cloneNode(true) as HTMLElement;
    for (const n of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
      n.removeAttribute('role');
      n.removeAttribute('tabindex');
      n.classList.remove('hover');
    }
    return copy.innerHTML;
  };
  for (const q of tail.querySelectorAll('.gvf-q')) {
    // Turns sent on another site (the local WebUI scene) do not belong to this chat.
    if (q.closest('[data-gvf-elsewhere]')) continue;
    const a = q.nextElementSibling;
    if (a?.classList.contains('gvf-typing')) continue;
    const text = [...q.childNodes].at(-1)?.textContent?.trim() || q.textContent?.trim() || '';
    c.turns.push({
      q: text,
      a: '',
      kept: { q: clean(q), a: a?.classList.contains('gvf-a') ? clean(a) : '' },
    });
  }
}
stage.keep = keepSceneTurns;

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
const added = ref<DemoPrompt[]>([]);
const allPrompts = computed(() => [...props.content.promptList, ...added.value]);
const tags = computed(() => [...new Set(allPrompts.value.map((p) => p.tag).filter(Boolean))]);
const visiblePrompts = computed(() => {
  const q = promptQuery.value.trim();
  return allPrompts.value.filter(
    (p) =>
      (!tag.value || p.tag === tag.value) &&
      (!q || hasText(p.name, q) || hasText(p.tag, q) || hasText(p.text, q)),
  );
});

/* Prompt library controls: each mirrors the extension's own behavior. */
// The panel follows the site theme until a theme is picked here, like the extension.
const pmTheme = ref<'light' | 'dark' | null>(null);
const pmDark = computed(() => (pmTheme.value ?? (isDark.value ? 'dark' : 'light')) === 'dark');
const pmLocked = ref(false);
const pmSwitching = ref(false);
let switchTimer: ReturnType<typeof setTimeout> | undefined;
function toggleTheme() {
  pmSwitching.value = true;
  pmTheme.value = pmDark.value ? 'light' : 'dark';
  clearTimeout(switchTimer);
  switchTimer = setTimeout(() => (pmSwitching.value = false), 450);
}
const pmComfortable = ref(false);
const pmView = ref<'prompts' | 'starred'>('prompts');
const adding = ref(false);
const newName = ref('');
const addInput = ref<HTMLInputElement | null>(null);
function startAdd() {
  pmView.value = 'prompts';
  adding.value = true;
  nextTick(() => addInput.value?.focus({ preventScroll: true }));
}
function commitAdd() {
  const name = newName.value.trim();
  if (name && !allPrompts.value.some((p) => p.name === name)) {
    added.value.push({ name, tag: tag.value, text: name, reply: 'plain' });
  }
  newName.value = '';
  adding.value = false;
}
function cancelAdd() {
  newName.value = '';
  adding.value = false;
}
const starredRows = computed(() =>
  Object.entries(chats).flatMap(([id, c]) =>
    [...c.starred]
      .sort((a, b) => a - b)
      .map((i) => ({ id, i, title: c.title, q: c.turns[i]?.q ?? '' }))
      .filter((r) => {
        const q = promptQuery.value.trim();
        return !q || hasText(r.q, q) || hasText(r.title, q);
      }),
  ),
);
function openStarred(id: string, i: number) {
  openChat(id);
  nextTick(() => {
    measure();
    jump(i);
  });
}

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
// Width and font changes reflow the turns; re-place the dots once the transition has settled.
let reflowTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [view.chatWidth, view.fontScale, view.timestamps],
  () => {
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => {
      reflowTimer = undefined;
      measure();
    }, 650);
  },
);
// The resize observer fires every frame of a width or font transition, and each measure re-renders
// the dots, which reflows again: batch it to one measure per frame and leave transitions to reflowTimer.
let measureFrame = 0;
function scheduleMeasure() {
  if (reflowTimer || measureFrame) return;
  measureFrame = requestAnimationFrame(() => {
    measureFrame = 0;
    measure();
  });
}
onMounted(() => {
  resizeObserver = new ResizeObserver(scheduleMeasure);
  if (chatEl.value) resizeObserver.observe(chatEl.value);
  // Scenes add content to the chat tail, which changes the scroll height but not the viewport.
  const col = chatEl.value?.firstElementChild;
  if (col) resizeObserver.observe(col);
  stage.chatEl = chatEl.value;
  document.addEventListener('pointerdown', onDocPointerDown);
  document.addEventListener('keydown', onKey);
  nextTick(measure);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  stage.chatEl = null;
  document.removeEventListener('pointerdown', onDocPointerDown);
  document.removeEventListener('keydown', onKey);
  clearTimeout(holdTimer);
  clearTimeout(previewTimer);
  clearTimeout(reflowTimer);
  cancelAnimationFrame(measureFrame);
});
</script>

<template>
  <div class="gvf-hero">
    <!-- Timeline: conversation, rail and composer -->
    <article :ref="card('timeline')" class="gvf-card">
      <div class="gvf-copy">
        <div class="gvf-eyebrow">{{ content.timeline.eyebrow }}</div>
        <h3>{{ content.timeline.title }}</h3>
        <p>{{ content.timeline.body }}</p>
        <div class="gvf-try">{{ content.timeline.hint }}</div>
      </div>
      <div class="gvf-stage">
        <div
          ref="hostEl"
          class="gvf-host gvf-tl-host"
          :class="[`gvf-skin-${view.skin}`, { 'gvf-has-address': view.address }]"
          :style="{
            '--gvf-chat-w': `${view.chatWidth}%`,
            '--gvf-font-scale': view.fontScale,
            '--gvf-side': `${view.sideInset}px`,
          }"
        >
          <div v-if="view.address" class="gvf-address">
            <span class="gvf-address-dots" aria-hidden="true"><i /><i /><i /></span>
            <span class="gvf-address-url">{{ view.address }}</span>
          </div>
          <div class="gvf-topbar">
            <span class="gvf-topbar-title">{{ chat?.title }}</span>
            <span :ref="region('topbarEnd')" class="gvf-topbar-end" />
          </div>
          <div class="gvf-convo">
            <div
              ref="chatEl"
              class="gvf-chat"
              @scroll.passive="syncActive"
              @wheel.passive="unpin"
              @touchmove.passive="unpin"
              @keydown="unpin"
            >
              <div class="gvf-chat-col">
                <div
                  v-for="(turn, i) in chat?.turns ?? []"
                  :key="i"
                  class="gvf-turn"
                  :class="{ flash: flashIdx === i }"
                >
                  <time v-if="view.timestamps" class="gvf-stamp">{{
                    sentAt(i, chat?.turns.length ?? 0)
                  }}</time>
                  <div v-if="turn.kept" class="gvf-q" v-html="turn.kept.q" />
                  <div v-else class="gvf-q">{{ turn.q }}</div>
                  <div v-if="turn.pending" class="gvf-a gvf-typing"><i /><i /><i /></div>
                  <div v-else-if="turn.kept" class="gvf-a" v-html="turn.kept.a" />
                  <div v-else class="gvf-a" v-html="renderAnswer(turn.a)" />
                </div>
                <div :ref="region('chatTail')" class="gvf-chat-tail" />
              </div>
              <div class="gvf-chat-spacer" :style="{ height: `${spacer}px` }" aria-hidden="true" />
            </div>
            <div :ref="region('chatCover')" class="gvf-region-cover" />
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
            <div :ref="region('composerCover')" class="gvf-region-cover" />
            <div
              class="gvf-composer"
              :class="{ filled: composerPulse }"
              @animationend="composerPulse = false"
            >
              <textarea
                ref="composerEl"
                v-model="draft"
                class="gvf-composer-text"
                rows="1"
                :placeholder="content.composer.placeholder"
                :aria-label="content.composer.placeholder"
                @input="fitComposer"
                @keydown="composerKey"
              />
              <div class="gvf-composer-bar">
                <span class="gvf-icon-btn" v-html="icon('plus', 17)" />
                <button
                  type="button"
                  class="gvf-icon-btn gvf-send"
                  :disabled="!draft.trim()"
                  :aria-label="content.composer.send"
                  @click="send"
                  v-html="icon('arrow-up', 17)"
                />
              </div>
            </div>
          </div>
          <div :ref="region('hostCover')" class="gvf-region-cover gvf-host-cover" />
          <button
            v-show="!view.hideBall"
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
      <article :ref="card('folders')" class="gvf-card">
        <div class="gvf-copy">
          <div class="gvf-eyebrow">{{ content.folders.eyebrow }}</div>
          <h3>{{ content.folders.title }}</h3>
          <p>{{ content.folders.body }}</p>
          <div class="gvf-try">{{ content.folders.hint }}</div>
        </div>
        <div class="gvf-stage">
          <div class="gvf-host gvf-fd-host">
            <div :ref="region('foldersCover')" class="gvf-region-cover" />
            <div class="gvf-fd">
              <div class="gvf-fd-head">
                <span class="gvf-fd-label">{{ content.folders.heading }}</span>
                <button
                  type="button"
                  class="gvf-icon-btn sm"
                  :aria-label="ui.cloud"
                  :title="ui.cloud"
                  @click="stage.play('cloud')"
                  v-html="icon('cloud', 15)"
                />
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
      <article :ref="card('prompts')" class="gvf-card">
        <div class="gvf-copy">
          <div class="gvf-eyebrow">{{ content.prompts.eyebrow }}</div>
          <h3>{{ content.prompts.title }}</h3>
          <p>{{ content.prompts.body }}</p>
          <div class="gvf-try">{{ content.prompts.hint }}</div>
        </div>
        <div class="gvf-stage">
          <div
            class="gvf-host gvf-pm-host"
            :class="[
              pmDark ? 'gvf-pm-scheme-dark' : 'gvf-pm-scheme-light',
              { switching: pmSwitching },
            ]"
          >
            <div :ref="region('promptsCover')" class="gvf-region-cover" />
            <div class="gvf-pm" :class="{ glow: pmGlow }">
              <div class="gvf-pm-header">
                <span v-if="!pmLocked" class="gvf-pm-drag" v-html="icon('grip-vertical', 12)" />
                <span class="gvf-pm-title">Voyager</span>
                <button
                  type="button"
                  class="gvf-pm-theme"
                  :class="{ dark: pmDark }"
                  :aria-label="pmDark ? ui.themeLight : ui.themeDark"
                  :title="pmDark ? ui.themeLight : ui.themeDark"
                  @click="toggleTheme"
                  v-html="icon(pmDark ? 'moon' : 'sun', 11)"
                />
                <span class="gvf-pm-version">2.0.0</span>
                <span class="gvf-pm-controls">
                  <button type="button" class="gvf-pm-add" @click="startAdd">
                    {{ content.prompts.add }}
                  </button>
                  <button
                    type="button"
                    class="gvf-pm-lock"
                    :class="{ on: pmLocked }"
                    :aria-label="pmLocked ? ui.unlock : ui.lock"
                    :aria-pressed="pmLocked"
                    :title="pmLocked ? ui.unlock : ui.lock"
                    @click="pmLocked = !pmLocked"
                    v-html="icon(pmLocked ? 'lock' : 'lock-open', 15)"
                  />
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
                <button
                  type="button"
                  class="gvf-pm-view"
                  :aria-label="pmComfortable ? ui.viewCompact : ui.viewComfortable"
                  :title="pmComfortable ? ui.viewCompact : ui.viewComfortable"
                  @click="pmComfortable = !pmComfortable"
                  v-html="icon(pmComfortable ? 'rows-3' : 'layout-grid', 15)"
                />
              </div>
              <div v-show="pmView === 'prompts'" class="gvf-chips">
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
              <div
                v-if="pmView === 'prompts'"
                class="gvf-pm-list"
                :class="{ comfortable: pmComfortable }"
              >
                <div v-if="adding" class="gvf-item gvf-item-add">
                  <input
                    ref="addInput"
                    v-model="newName"
                    type="text"
                    :placeholder="ui.namePlaceholder"
                    :aria-label="ui.namePlaceholder"
                    @keydown.enter.prevent="commitAdd"
                    @keydown.esc.prevent="cancelAdd"
                    @blur="commitAdd"
                  />
                </div>
                <button
                  v-for="p in visiblePrompts"
                  :key="p.name"
                  type="button"
                  class="gvf-item"
                  @click="choose(p)"
                >
                  <span class="gvf-item-name">{{ p.name }}</span>
                  <span v-if="p.tag" class="gvf-item-tag">{{ p.tag }}</span>
                  <span v-if="pmComfortable" class="gvf-item-text">{{ p.text }}</span>
                </button>
                <div v-if="!visiblePrompts.length && !adding" class="gvf-pm-empty">
                  {{ fill(content.prompts.noMatch, promptQuery) }}
                </div>
              </div>
              <div v-else class="gvf-pm-list gvf-pm-starred">
                <button
                  v-for="row in starredRows"
                  :key="`${row.id}-${row.i}`"
                  type="button"
                  class="gvf-item gvf-starred-item"
                  :aria-label="`${ui.starredOpen}: ${row.q}`"
                  @click="openStarred(row.id, row.i)"
                >
                  <span class="gvf-starred-star" v-html="icon('star', 13)" />
                  <span class="gvf-starred-body">
                    <span class="gvf-item-name">{{ row.q }}</span>
                    <span class="gvf-starred-chat">{{ row.title }}</span>
                  </span>
                </button>
                <div v-if="!starredRows.length" class="gvf-pm-empty">{{ ui.starredEmpty }}</div>
              </div>
              <div class="gvf-pm-footer">
                <button
                  type="button"
                  class="gvf-pm-saved"
                  :aria-pressed="pmView === 'starred'"
                  @click="pmView = pmView === 'prompts' ? 'starred' : 'prompts'"
                >
                  <span v-html="icon(pmView === 'prompts' ? 'star' : 'message-square', 14)" />{{
                    pmView === 'prompts' ? content.prompts.saved : ui.backToPrompts
                  }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style src="./homeFeatures.css"></style>
