<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { promptReply, renderAnswer } from '../answer';
import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);
const source = computed(() => content.value.chats[content.value.current]);

const svg = (body: string, size = 17) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// lucide "corner-down-left"
const NEWLINE_ICON = '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>';
const ARROW_ICON = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';

/* The draft is two prompts from the library, one per line, so it reads in every language. */
const lines = computed(() => {
  const list = content.value.promptList;
  const pick = (kind: string) => list.find((p) => p.reply === kind)?.text ?? '';
  return [pick('summary'), pick('table')];
});

interface Sent {
  q: string;
  html: string;
  pending: boolean;
}
const draft = ref('');
const sent = ref<Sent[]>([]);
const mod = ref('Ctrl');
const keys = reactive({
  mod: false,
  enter: false,
  presses: 0,
  result: '' as '' | 'newline' | 'send',
});
const playing = ref(true);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const rows = computed(() => Math.min(Math.max(draft.value.split('\n').length, 1), 5));

const timers: number[] = [];
const at = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};

function isMac() {
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  return /mac|iphone|ipad/i.test(uaData?.platform || navigator.platform || '');
}

function flash(withMod: boolean, result: 'newline' | 'send') {
  keys.mod = withMod;
  keys.enter = true;
  keys.result = result;
  keys.presses++;
  at(240, () => {
    keys.enter = false;
    keys.mod = false;
  });
}

/** Types `text` at the end of the draft, one character per tick. */
function type(start: number, text: string, step = 32) {
  [...text].forEach((ch, i) => at(start + i * step, () => (draft.value += ch)));
  return start + text.length * step;
}

function send(text: string, html: string) {
  const i = sent.value.push({ q: text, html, pending: true }) - 1;
  draft.value = '';
  nextTick(() => stage.scrollChatToEnd());
  at(900, () => {
    const item = sent.value[i];
    if (item) item.pending = false;
    nextTick(() => stage.scrollChatToEnd());
  });
}

/** The draft's reply: the summary and the table those two prompts ask for. */
function draftReply() {
  const c = source.value;
  const leads = content.value.replyLeads;
  return (
    renderAnswer(promptReply('summary', c, leads)) + renderAnswer(promptReply('table', c, leads))
  );
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.isComposing || e.shiftKey) return;
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    flash(true, 'send');
    const text = draft.value.trim();
    if (text)
      send(text, renderAnswer(promptReply('plain', source.value, content.value.replyLeads)));
  } else {
    // Plain Enter keeps its native behaviour here: a new line.
    flash(false, 'newline');
  }
}
function clickSend() {
  const text = draft.value.trim();
  if (text) send(text, renderAnswer(promptReply('plain', source.value, content.value.replyLeads)));
}

function finish() {
  playing.value = false;
  stage.scrollChatToEnd();
}

onMounted(() => {
  if (isMac()) mod.value = '⌘';
  const [first, second] = lines.value;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    sent.value.push({ q: `${first}\n${second}`, html: draftReply(), pending: false });
    keys.result = 'send';
    nextTick(() => {
      const el = stage.chatEl;
      if (el) el.scrollTop = el.scrollHeight;
    });
    finish();
    return;
  }
  let t = type(400, first);
  at(t + 350, () => {
    flash(false, 'newline');
    draft.value += '\n';
  });
  t = type(t + 650, second);
  at(t + 300, () => (keys.mod = true));
  at(t + 650, () => {
    flash(true, 'send');
    send(draft.value, draftReply());
  });
  at(t + 1800, finish);
});

onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));
</script>

<template>
  <Teleport v-if="stage.regions.chatTail" :to="stage.regions.chatTail">
    <div v-for="(m, i) in sent" :key="i" class="gvf-sb-turn">
      <div class="gvf-q gvf-sb-q">{{ m.q }}</div>
      <div v-if="m.pending" class="gvf-a gvf-typing"><i /><i /><i /></div>
      <!-- renderAnswer escapes every string, so its output is safe here. -->
      <div v-else class="gvf-a gvf-sb-a" v-html="m.html" />
    </div>
    <!-- Room for the keycaps that sit over the chat's end. -->
    <div class="gvf-sb-room" aria-hidden="true" />
  </Teleport>

  <Teleport v-if="stage.regions.composerCover" :to="stage.regions.composerCover">
    <div class="gvf-sb-wrap">
      <!-- Keycaps above the composer show each press and what it did. -->
      <div class="gvf-sb-keys" aria-hidden="true">
        <kbd class="gvf-sb-key" :class="{ down: keys.mod }">{{ mod }}</kbd>
        <span class="gvf-sb-plus" :class="{ lit: keys.mod }">+</span>
        <kbd class="gvf-sb-key wide" :class="{ down: keys.enter }">Enter</kbd>
        <span class="gvf-sb-arrow" :class="{ on: keys.result }" v-html="svg(ARROW_ICON, 13)" />
        <span
          :key="keys.presses"
          class="gvf-sb-result"
          :class="[keys.result, { on: keys.result }]"
          v-html="svg(keys.result === 'send' ? uiIcons['arrow-up'] : NEWLINE_ICON, 15)"
        />
      </div>
      <div class="gvf-composer">
        <textarea
          ref="inputEl"
          v-model="draft"
          class="gvf-composer-text gvf-sb-input"
          :rows="rows"
          :readonly="playing"
          :aria-label="name"
          @keydown="onKey"
        />
        <div class="gvf-composer-bar">
          <span class="gvf-icon-btn" v-html="svg(uiIcons.plus)" />
          <button
            type="button"
            class="gvf-icon-btn gvf-send"
            :class="{ lit: keys.result === 'send' && keys.enter }"
            :disabled="!draft.trim()"
            :aria-label="content.composer.send"
            @click="clickSend"
            v-html="svg(uiIcons['arrow-up'])"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-sb-turn {
  display: grid;
  gap: 8px;
  padding-block: 8px 14px;
  animation: gvf-sb-rise 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes gvf-sb-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
.gvf-sb-room {
  height: 44px;
}
.gvf-sb-q {
  white-space: pre-line;
}
.gvf-sb-a {
  animation: gvf-sb-fade 0.3s ease both;
}
@keyframes gvf-sb-fade {
  from {
    opacity: 0;
  }
}

/* Composer replica, anchored at the bottom so new lines grow it upwards. */
.gvf-sb-wrap {
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
.gvf-sb-input {
  display: block;
  width: 100%;
  margin: 0;
  border: 0;
  outline: none;
  resize: none;
  background: none;
  font: inherit;
  color: var(--host-text);
  padding-inline-end: 8px;
  line-height: 1.5;
}

.gvf-sb-keys {
  position: absolute;
  bottom: calc(100% + 6px);
  inset-inline: 0;
  margin-inline: auto;
  width: max-content;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--host-bg) 86%, transparent);
  backdrop-filter: blur(8px);
  border: 1px solid var(--gvf-line);
  box-shadow: 0 8px 24px -14px oklch(0 0 0 / 0.35);
}
.gvf-sb-key {
  min-width: 34px;
  height: 30px;
  padding: 0 9px;
  display: grid;
  place-items: center;
  font:
    500 12.5px/1 ui-sans-serif,
    system-ui,
    -apple-system,
    sans-serif;
  color: var(--gv-text);
  background: var(--gv-surface);
  border: 1px solid var(--gv-border);
  border-bottom-width: 3px;
  border-radius: 8px;
  transition:
    transform 0.12s ease,
    border-bottom-width 0.12s ease,
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}
.gvf-sb-key.wide {
  min-width: 60px;
}
.gvf-sb-key.down {
  transform: translateY(2px);
  border-bottom-width: 1px;
  background: var(--gv-brand-soft);
  border-color: color-mix(in srgb, var(--gv-brand) 55%, transparent);
  color: var(--gv-brand);
}
.gvf-sb-plus {
  color: var(--host-muted);
  opacity: 0.45;
  font-size: 12px;
  transition: opacity 0.2s ease;
}
.gvf-sb-plus.lit {
  opacity: 1;
}
.gvf-sb-arrow {
  display: grid;
  color: var(--host-muted);
  opacity: 0.25;
  transition: opacity 0.2s ease;
}
.gvf-sb-arrow.on {
  opacity: 0.75;
}
[dir='rtl'] .gvf-sb-arrow {
  transform: scaleX(-1);
}
.gvf-sb-result {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--host-muted);
  background: color-mix(in srgb, var(--host-text) 7%, transparent);
  opacity: 0.35;
  transition:
    opacity 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
  animation: gvf-sb-pop 0.3s cubic-bezier(0.2, 0.8, 0.2, 1.3);
}
.gvf-sb-result.on {
  opacity: 1;
}
.gvf-sb-result.send {
  background: var(--host-text);
  color: var(--host-bg);
}
@keyframes gvf-sb-pop {
  from {
    transform: scale(0.7);
  }
}
.gvf-send {
  transition: transform 0.12s ease;
}
.gvf-send.lit {
  transform: scale(0.88);
}
</style>
