<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);

// lucide "quote"
const QUOTE_ICON =
  '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>';
const X_ICON = uiIcons.x;

/* Quote: the composer's quote block; sent: follow-ups the visitor sends from the final state. */
const quote = ref('');
const draft = ref('');
const sent = ref<{ quote: string; text: string }[]>([]);
const lit = ref(0);
const btn = reactive({ show: false, pressed: false, x: 0, y: 0 });
const cursor = reactive({ x: 0, y: 0, show: false, beam: false, down: false, instant: false });
const playing = ref(true);
const inputEl = ref<HTMLTextAreaElement | null>(null);
// The ball rests where the quote block grows; step it aside while a quote is in the composer.
watch(quote, (q) => (stage.view.hideBall = !!q));

const timers: number[] = [];
let frame = 0;
const at = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};

/** Positions are relative to the conversation card, which hostCover fills. */
function origin() {
  return stage.regions.hostCover?.getBoundingClientRect() ?? new DOMRect();
}
function isRtl() {
  const el = stage.chatEl;
  return !!el && getComputedStyle(el).direction === 'rtl';
}

/** The first sentence of the last answer, as a text node and character range. */
function findTarget(): { node: Text; start: number; end: number } | null {
  const answers = stage.chatEl?.querySelectorAll<HTMLElement>('.gvf-a');
  const answer = answers?.[answers.length - 1];
  if (!answer) return null;
  const walker = document.createTreeWalker(answer, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node && (node.textContent ?? '').trim().length < 12)
    node = walker.nextNode() as Text | null;
  if (!node) return null;
  const text = node.textContent ?? '';
  const match = /[.!?](?=\s|$)|[。！？؟]/.exec(text.slice(8));
  const end = match ? 8 + match.index + 1 : text.length;
  return { node, start: 0, end };
}

/** Puts the button above the selection's first line, centred on the selection, as the extension does. */
function placeButton(range: Range) {
  const o = origin();
  const rects = range.getClientRects();
  const first = rects[0];
  const all = range.getBoundingClientRect();
  if (!first) return;
  btn.x = all.left + all.width / 2 - o.left;
  btn.y = first.top - o.top - 8;
}

function caretPoint(node: Text, offset: number) {
  const r = document.createRange();
  r.setStart(node, offset);
  r.setEnd(node, offset);
  const rect = r.getClientRects()[0] ?? r.getBoundingClientRect();
  const o = origin();
  return { x: rect.left - o.left, y: rect.top - o.top + rect.height / 2 };
}

function aim(el: Element | null | undefined, fx = 0.5, fy = 0.5) {
  const r = el?.getBoundingClientRect();
  if (!r) return;
  const o = origin();
  cursor.x = r.left - o.left + r.width * fx;
  cursor.y = r.top - o.top + r.height * fy;
}

function drag(target: { node: Text; start: number; end: number }, duration: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const begin = performance.now();
  cursor.instant = true;
  const tick = (now: number) => {
    const p = Math.min((now - begin) / duration, 1);
    const eased = 1 - (1 - p) ** 2;
    const offset = Math.round(target.start + (target.end - target.start) * eased);
    sel.setBaseAndExtent(target.node, target.start, target.node, offset);
    const pt = caretPoint(target.node, offset);
    cursor.x = pt.x;
    cursor.y = pt.y;
    if (p < 1) frame = requestAnimationFrame(tick);
    else cursor.instant = false;
  };
  frame = requestAnimationFrame(tick);
}

/** Selection inside an answer or question of the chat, as the extension accepts it. */
function chatSelection(): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const chat = stage.chatEl;
  if (!chat || !chat.contains(range.commonAncestorContainer)) return null;
  if (!sel.toString().trim()) return null;
  return range;
}

function insertQuote() {
  const range = chatSelection();
  const text = (range?.toString() ?? '').replace(/\s+/g, ' ').trim();
  btn.show = false;
  btn.pressed = false;
  window.getSelection()?.removeAllRanges();
  if (!text) return;
  quote.value = text;
  lit.value++;
  nextTick(() => stage.scrollChatToEnd());
}

function onPointerUp() {
  if (playing.value) return;
  // The selection settles after pointerup.
  setTimeout(() => {
    const range = chatSelection();
    if (!range) return;
    placeButton(range);
    btn.show = true;
  }, 0);
}
function onSelectionChange() {
  if (playing.value) return;
  if (!chatSelection()) btn.show = false;
}
function onChatScroll() {
  if (!playing.value) btn.show = false;
}

function send() {
  const text = draft.value.trim();
  if (!quote.value && !text) return;
  sent.value.push({ quote: quote.value, text });
  quote.value = '';
  draft.value = '';
  nextTick(() => stage.scrollChatToEnd());
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
}

function finish() {
  playing.value = false;
  cursor.show = false;
}

onMounted(() => {
  const chat = stage.chatEl;
  document.addEventListener('mouseup', onPointerUp);
  chat?.addEventListener('scroll', onChatScroll, { passive: true });
  document.addEventListener('selectionchange', onSelectionChange);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (chat) chat.scrollTop = chat.scrollHeight;
    const t = findTarget();
    if (t) quote.value = (t.node.textContent ?? '').slice(t.start, t.end).trim();
    finish();
    return;
  }

  stage.scrollChatToEnd();
  const o = origin();
  cursor.x = o.width * (isRtl() ? 0.2 : 0.8);
  cursor.y = o.height * 0.55;
  let target: ReturnType<typeof findTarget> = null;
  at(700, () => {
    target = findTarget();
    if (!target) return finish();
    cursor.beam = true;
    cursor.show = true;
    const pt = caretPoint(target.node, target.start);
    cursor.x = pt.x;
    cursor.y = pt.y;
  });
  at(1350, () => target && drag(target, 1100));
  at(2600, () => {
    // rAF pauses in background tabs: land the drag on its end before going on.
    cancelAnimationFrame(frame);
    cursor.instant = false;
    if (target)
      window.getSelection()?.setBaseAndExtent(target.node, target.start, target.node, target.end);
    const range = chatSelection();
    if (!range) return finish();
    cursor.beam = false;
    placeButton(range);
    btn.show = true;
  });
  at(3000, () => {
    cursor.x = btn.x;
    cursor.y = btn.y - 16;
  });
  at(3650, () => {
    cursor.down = true;
    btn.pressed = true;
  });
  at(3800, () => {
    cursor.down = false;
    insertQuote();
  });
  at(4200, () => aim(inputEl.value, isRtl() ? 0.7 : 0.3));
  at(4900, finish);
});

onBeforeUnmount(() => {
  timers.forEach((t) => clearTimeout(t));
  cancelAnimationFrame(frame);
  document.removeEventListener('mouseup', onPointerUp);
  stage.chatEl?.removeEventListener('scroll', onChatScroll);
  document.removeEventListener('selectionchange', onSelectionChange);
  // Leave no selection behind once the demo returns to normal.
  if (chatSelection()) window.getSelection()?.removeAllRanges();
});
</script>

<template>
  <!-- Follow-ups sent from the final state -->
  <Teleport v-if="stage.regions.chatTail" :to="stage.regions.chatTail">
    <div v-for="(m, i) in sent" :key="i" class="gvf-qr-turn">
      <div class="gvf-q gvf-qr-sent">
        <div v-if="m.quote" class="gvf-qr-block">{{ m.quote }}</div>
        <div v-if="m.text">{{ m.text }}</div>
      </div>
    </div>
    <!-- Room for the quote block, which grows the composer over the chat's end. -->
    <div class="gvf-qr-room" :class="{ open: quote }" aria-hidden="true" />
  </Teleport>

  <!-- Quote button and cursor float over the conversation card -->
  <Teleport v-if="stage.regions.hostCover" :to="stage.regions.hostCover">
    <div class="gvf-qr-layer">
      <button
        type="button"
        class="gvf-qr-btn"
        :class="{ show: btn.show, pressed: btn.pressed }"
        :style="{ left: `${btn.x}px`, top: `${btn.y}px` }"
        :aria-label="name"
        :tabindex="btn.show ? 0 : -1"
        @pointerdown.prevent
        @click="insertQuote"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          v-html="QUOTE_ICON"
        />
      </button>
      <div
        class="gvf-qr-cursor"
        :class="{ show: cursor.show, down: cursor.down, instant: cursor.instant }"
        :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }"
        aria-hidden="true"
      >
        <svg v-if="cursor.beam" class="beam" width="16" height="22" viewBox="0 0 16 22">
          <path d="M4 2h8M4 20h8M8 2v18" />
        </svg>
        <svg v-else class="arrow" width="20" height="20" viewBox="0 0 24 24">
          <path d="M5 3v16.2l4.4-4.3 2.9 6.6 2.6-1.1-2.9-6.5H18z" />
        </svg>
      </div>
    </div>
  </Teleport>

  <!-- The same composer, now holding the quote -->
  <Teleport v-if="stage.regions.composerCover" :to="stage.regions.composerCover">
    <div class="gvf-qr-wrap">
      <div :key="lit" class="gvf-composer" :class="{ filled: lit > 0 }">
        <div class="gvf-qr-slot" :class="{ open: quote }">
          <div>
            <div class="gvf-qr-quote">
              <span class="gvf-qr-quote-text">{{ quote }}</span>
              <button
                type="button"
                class="gvf-qr-clear"
                aria-label="×"
                @click="quote = ''"
                v-html="
                  `<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${X_ICON}</svg>`
                "
              />
            </div>
          </div>
        </div>
        <div class="gvf-qr-input">
          <textarea
            ref="inputEl"
            v-model="draft"
            class="gvf-composer-text"
            rows="1"
            :readonly="playing"
            :placeholder="quote ? '' : content.composer.placeholder"
            :aria-label="name"
            @keydown="onKey"
          />
          <span v-if="quote && !draft && !playing" class="gvf-qr-caret" aria-hidden="true" />
        </div>
        <div class="gvf-composer-bar">
          <span
            class="gvf-icon-btn"
            v-html="
              `<svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${uiIcons.plus}</svg>`
            "
          />
          <button
            type="button"
            class="gvf-icon-btn gvf-send"
            :disabled="!quote && !draft.trim()"
            :aria-label="content.composer.send"
            @click="send"
            v-html="
              `<svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${uiIcons['arrow-up']}</svg>`
            "
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-qr-room {
  height: 0;
}
.gvf-qr-room.open {
  height: 64px;
}
.gvf-qr-turn {
  display: grid;
  gap: 8px;
  padding-block: 8px 14px;
  animation: gvf-qr-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes gvf-qr-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.gvf-qr-sent {
  display: grid;
  gap: 6px;
  white-space: pre-wrap;
}
.gvf-qr-block {
  padding-inline-start: 10px;
  border-inline-start: 3px solid color-mix(in srgb, var(--gv-brand) 70%, transparent);
  color: var(--host-muted);
}

.gvf-qr-layer {
  position: absolute;
  inset: 0;
  pointer-events: none !important;
}
.gvf-qr-btn {
  position: absolute;
  display: grid;
  place-items: center;
  height: 30px;
  padding-inline: 12px;
  border: 0;
  border-radius: 8px;
  background: var(--host-text);
  color: var(--host-bg) !important;
  box-shadow: 0 6px 18px -6px oklch(0 0 0 / 0.35);
  cursor: pointer;
  opacity: 0;
  transform: translate(-50%, -100%) translateY(4px) scale(0.92);
  transition:
    opacity 0.2s ease,
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}
.dark .gvf-qr-btn {
  background: color-mix(in srgb, var(--host-text) 22%, var(--host-bg));
  color: var(--host-text) !important;
}
.gvf-qr-btn.show {
  opacity: 1;
  transform: translate(-50%, -100%);
  pointer-events: auto;
}
.gvf-qr-btn.show.pressed {
  transform: translate(-50%, -100%) scale(0.92);
}

/* Composer replica: anchored at the bottom so the quote grows the composer upwards. */
.gvf-qr-wrap {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  min-height: 100%;
  padding: 4px 14px 14px;
  background: var(--host-bg);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.gvf-qr-slot {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  margin-inline-end: 8px;
}
.gvf-qr-slot > div {
  overflow: hidden;
  min-height: 0;
}
.gvf-qr-slot.open {
  grid-template-rows: 1fr;
}
/* After the extension's .gv-composer-quote-line. */
.gvf-qr-quote {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-block: 2px 6px;
  padding: 8px 8px 8px 12px;
  border-inline-start: 3px solid color-mix(in srgb, var(--gv-brand) 78%, transparent);
  border-start-end-radius: 12px;
  border-end-end-radius: 12px;
  background: color-mix(in srgb, var(--gv-brand) 9%, transparent);
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 0.35s ease 0.1s,
    transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s;
}
.gvf-qr-slot.open .gvf-qr-quote {
  opacity: 1;
  transform: none;
}
.gvf-qr-quote-text {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--host-muted);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
.gvf-qr-clear {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--host-muted) !important;
  cursor: pointer;
}
.gvf-qr-clear:hover {
  background: color-mix(in srgb, var(--host-text) 8%, transparent);
}
.gvf-qr-input {
  position: relative;
  margin-inline-end: 8px;
}
.gvf-qr-input textarea {
  display: block;
  width: 100%;
  border: 0;
  outline: none;
  resize: none;
  background: none;
  font: inherit;
  color: var(--host-text);
}
.gvf-qr-input textarea::placeholder {
  color: var(--host-muted);
  opacity: 1;
}
.gvf-qr-caret {
  position: absolute;
  inset-inline-start: 0;
  top: 4px;
  width: 1.5px;
  height: 17px;
  background: var(--host-text);
  pointer-events: none;
  animation: gvf-qr-blink 1s steps(1) infinite;
}
@keyframes gvf-qr-blink {
  50% {
    opacity: 0;
  }
}

.gvf-qr-cursor {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  pointer-events: none;
  opacity: 0;
  transition:
    transform 0.6s cubic-bezier(0.45, 0, 0.2, 1),
    opacity 0.25s ease;
}
.gvf-qr-cursor.instant {
  transition: opacity 0.25s ease;
}
.gvf-qr-cursor.show {
  opacity: 1;
}
.gvf-qr-cursor svg {
  display: block;
  filter: drop-shadow(0 1px 1.5px oklch(0 0 0 / 0.3));
}
.gvf-qr-cursor .arrow {
  margin: -3px 0 0 -4px;
  transition: transform 0.12s ease;
}
.gvf-qr-cursor.down .arrow {
  transform: scale(0.82);
}
.gvf-qr-cursor .arrow path {
  fill: #1f1f1f;
  stroke: #fff;
  stroke-width: 1.4;
  stroke-linejoin: round;
}
.gvf-qr-cursor .beam {
  margin: -11px 0 0 -8px;
}
.gvf-qr-cursor .beam path {
  fill: none;
  stroke: var(--host-text);
  stroke-width: 1.6;
  stroke-linecap: round;
}
</style>
