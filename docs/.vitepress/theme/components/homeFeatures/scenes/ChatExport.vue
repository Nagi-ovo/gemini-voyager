<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import type { Answer } from '../types';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const FILE_DOWN =
  '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>';
const svg = (path: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

/* The extension's own export_dialog_title strings. */
const EXPORT_LABEL: Record<string, string> = {
  'zh-CN': '导出对话',
  'zh-TW': '匯出對話',
  'en-US': 'Export Conversation',
  'ja-JP': '会話のエクスポート',
  'ko-KR': '대화 내보내기',
  'fr-FR': 'Exporter la discussion',
  'es-ES': 'Exportar conversación',
  'pt-PT': 'Exportar conversa',
  'ar-SA': 'تصدير المحادثة',
  'ru-RU': 'Экспорт разговора',
};
const exportLabel = computed(() => EXPORT_LABEL[props.lang] ?? EXPORT_LABEL['en-US']);

/* The conversation being exported: the demo's default chat. */
const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);
const chat = computed(() => content.value.chats[content.value.current]);
const plain = (a: Answer): string =>
  typeof a === 'string'
    ? a.replace(/\n- /g, ' ').replace(/\n+/g, ' ')
    : [a.lead, a.text, ...(a.list ?? []), ...(a.todo ?? [])].filter(Boolean).join(' ');
const turns = computed(() => chat.value.turns.map(([q, a]) => ({ q, a: plain(a) })));
const json = (s: string) => JSON.stringify(s);

const files = [
  { kind: 'md', ext: '.md', label: 'Markdown' },
  { kind: 'pdf', ext: '.pdf', label: 'PDF' },
  { kind: 'json', ext: '.json', label: 'JSON' },
  { kind: 'png', ext: '.png', label: 'PNG' },
] as const;

const shown = ref(false);
const pressed = ref(false);
const done = ref(false);
const timers: number[] = [];
const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

function toggle() {
  pressed.value = true;
  at(180, () => (pressed.value = false));
  done.value = !done.value;
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    shown.value = true;
    done.value = true;
    return;
  }
  at(250, () => (shown.value = true));
  at(1100, () => (pressed.value = true));
  at(1300, () => {
    pressed.value = false;
    done.value = true;
  });
});
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));
</script>

<template>
  <Teleport v-if="stage.regions.topbarEnd" :to="stage.regions.topbarEnd">
    <button
      type="button"
      class="gvf-icon-btn sm gvf-ex-btn"
      :class="{ 'gvf-ex-in': shown, 'gvf-ex-pressed': pressed, 'gvf-ex-on': done }"
      :aria-label="exportLabel"
      :title="exportLabel"
      :aria-pressed="done"
      @click="toggle"
      v-html="svg(FILE_DOWN, 17)"
    />
  </Teleport>

  <Teleport v-if="stage.regions.chatCover" :to="stage.regions.chatCover">
    <div class="gvf-ex" :class="{ 'gvf-ex-done': done }">
      <ul class="gvf-ex-files">
        <li v-for="(f, i) in files" :key="f.kind" class="gvf-ex-file" :style="{ '--i': i }">
          <div class="gvf-ex-sheet" :class="`gvf-ex-${f.kind}`" aria-hidden="true">
            <template v-if="f.kind === 'md'">
              <p class="gvf-ex-h1"><em>#</em> {{ chat.title }}</p>
              <p><em>**Turns**:</em> {{ turns.length }}</p>
              <template v-for="(t, n) in turns.slice(0, 3)" :key="n">
                <p class="gvf-ex-h2"><em>##</em> Turn {{ n + 1 }}</p>
                <p class="gvf-ex-wrap">{{ t.q }}</p>
              </template>
            </template>
            <template v-else-if="f.kind === 'pdf'">
              <p class="gvf-ex-pdf-title">{{ chat.title }}</p>
              <template v-for="(t, n) in turns.slice(0, 3)" :key="n">
                <p class="gvf-ex-pdf-q">{{ t.q }}</p>
                <p class="gvf-ex-pdf-a">{{ t.a }}</p>
              </template>
              <span class="gvf-ex-page">1</span>
            </template>
            <template v-else-if="f.kind === 'json'">
              <p>{</p>
              <p class="gvf-ex-ind"><em>"format"</em>: <u>"gemini-voyager.chat.v1"</u>,</p>
              <p class="gvf-ex-ind">
                <em>"title"</em>: <u>{{ json(chat.title) }}</u
                >,
              </p>
              <p class="gvf-ex-ind">
                <em>"count"</em>: <b>{{ turns.length }}</b
                >,
              </p>
              <p class="gvf-ex-ind"><em>"items"</em>: [</p>
              <template v-for="(t, n) in turns.slice(0, 2)" :key="n">
                <p class="gvf-ex-ind2">
                  { <em>"user"</em>: <u>{{ json(t.q) }}</u
                  >,
                </p>
                <p class="gvf-ex-ind2">
                  &nbsp;&nbsp;<em>"assistant"</em>: <u>{{ json(t.a) }}</u> },
                </p>
              </template>
            </template>
            <template v-else>
              <p class="gvf-ex-png-title">{{ chat.title }}</p>
              <template v-for="(t, n) in turns.slice(0, 3)" :key="n">
                <p class="gvf-ex-png-q">{{ t.q }}</p>
                <p class="gvf-ex-png-a">{{ t.a }}</p>
              </template>
            </template>
          </div>
          <div class="gvf-ex-meta">
            <b>{{ f.label }}</b>
            <span dir="ltr" :class="`gvf-ex-tag-${f.kind}`">{{ f.ext }}</span>
          </div>
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<style scoped>
/* Export button in the title bar */
.gvf-ex-btn {
  opacity: 0;
  transform: scale(0.6);
  transition:
    opacity 0.25s ease,
    transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3),
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.3s ease;
}
.gvf-ex-btn.gvf-ex-in {
  opacity: 1;
  transform: none;
}
.gvf-ex-btn.gvf-ex-pressed {
  transform: scale(0.88);
  background: var(--gv-brand-soft);
  box-shadow: 0 0 0 4px var(--gv-brand-soft);
}
.gvf-ex-btn.gvf-ex-on {
  color: var(--gv-brand);
}

/* The chat recedes behind a frosted layer and the files come out of it. */
.gvf-ex {
  --gvf-ex-red: oklch(0.6 0.19 25);
  --gvf-ex-amber: oklch(0.66 0.14 70);
  --gvf-ex-blue: oklch(0.6 0.14 250);
  position: absolute;
  inset: 0;
  container-type: inline-size;
  pointer-events: none;
  background: color-mix(in srgb, var(--host-bg) 0%, transparent);
  backdrop-filter: blur(0);
  transition:
    background 0.45s ease,
    backdrop-filter 0.45s ease;
}
.gvf-ex.gvf-ex-done {
  pointer-events: auto;
  background: color-mix(in srgb, var(--host-bg) 86%, transparent);
  backdrop-filter: blur(6px);
}
.gvf-ex-files {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 16px 52px 24px 20px;
  padding-inline: 20px 52px;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  align-content: center;
  gap: 14px;
}
.gvf-ex-file {
  display: grid;
  justify-items: center;
  gap: 10px;
  opacity: 0;
  transform: translateY(-24px) scale(0.5);
  transition:
    opacity 0.3s ease,
    transform 0.5s cubic-bezier(0.2, 0.9, 0.25, 1.15);
  transition-delay: calc((3 - var(--i)) * 50ms);
}
.gvf-ex-done .gvf-ex-file {
  opacity: 1;
  transform: none;
  transition-delay: calc(0.15s + var(--i) * 90ms);
}
.gvf-ex-sheet {
  position: relative;
  width: 100%;
  max-width: 116px;
  aspect-ratio: 3 / 4;
  display: grid;
  align-content: start;
  gap: 3px;
  padding: 11px 9px;
  border: 1px solid var(--gv-border);
  border-radius: 8px;
  background: var(--gv-surface);
  color: var(--gv-text);
  box-shadow:
    0 1px 2px oklch(0 0 0 / 0.04),
    0 8px 22px -10px oklch(0 0 0 / 0.22);
  overflow: hidden;
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease;
}
.gvf-ex-file:hover .gvf-ex-sheet {
  transform: translateY(-4px);
  box-shadow:
    0 1px 2px oklch(0 0 0 / 0.04),
    0 14px 28px -12px oklch(0 0 0 / 0.3);
}
/* Folded corner */
.gvf-ex-sheet::after {
  content: '';
  position: absolute;
  top: -1px;
  inset-inline-end: -1px;
  width: 14px;
  height: 14px;
  background: linear-gradient(225deg, var(--host-bg) 50%, var(--gv-row) 50%);
  border-end-start-radius: 4px;
}
[dir='rtl'] .gvf-ex-sheet::after {
  background: linear-gradient(135deg, var(--host-bg) 50%, var(--gv-row) 50%);
}
/* Fades the page out at the bottom, so cut-off text reads as more to come. */
.gvf-ex-sheet::before {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 26%;
  background: linear-gradient(transparent, var(--gv-surface));
  pointer-events: none;
}
.gvf-ex-sheet p {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 7px;
  line-height: 1.45;
}
.gvf-ex-md p,
.gvf-ex-json p {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 6.5px;
}
.gvf-ex-sheet em {
  font-style: normal;
  color: var(--gv-brand);
}
.gvf-ex-sheet u {
  text-decoration: none;
  color: var(--gvf-ex-amber);
}
.gvf-ex-sheet b {
  font-weight: 500;
  color: var(--gvf-ex-blue);
}
.gvf-ex-md .gvf-ex-h1 {
  font-size: 8px;
  font-weight: 700;
}
.gvf-ex-md .gvf-ex-h2 {
  margin-top: 3px;
  font-weight: 600;
}
.gvf-ex-pdf-a,
.gvf-ex-png-a {
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: color-mix(in srgb, var(--gv-text) 70%, transparent);
}
.gvf-ex-ind {
  padding-inline-start: 6px;
}
.gvf-ex-ind2 {
  padding-inline-start: 12px;
}
.gvf-ex-md,
.gvf-ex-json {
  direction: ltr;
  text-align: left;
}
.gvf-ex-md p:not(:first-child),
.gvf-ex-json p {
  unicode-bidi: plaintext;
}

/* PDF: a printed page */
.gvf-ex-pdf {
  gap: 4px;
}
.gvf-ex-pdf-title {
  font-size: 8.5px !important;
  font-weight: 700;
  padding-bottom: 3px;
  border-bottom: 1px solid var(--gv-border);
}
.gvf-ex-pdf-q {
  justify-self: end;
  max-width: 80%;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--host-user);
}
.gvf-ex-page {
  position: absolute;
  bottom: 5px;
  inset-inline: 0;
  z-index: 1;
  text-align: center;
  font-size: 6px;
  color: var(--gvf-muted);
}

/* PNG: the chat rendered as one long image */
.gvf-ex-png {
  gap: 4px;
  background: var(--host-bg);
  color: var(--host-text);
}
.gvf-ex-png-title {
  font-weight: 600;
  font-size: 7.5px !important;
}
.gvf-ex-png-q {
  justify-self: end;
  max-width: 82%;
  padding: 2px 6px;
  border-radius: 7px 2px 7px 7px;
  background: var(--host-user);
}
[dir='rtl'] .gvf-ex-png-q {
  border-radius: 2px 7px 7px 7px;
}

.gvf-ex-meta {
  display: grid;
  justify-items: center;
  gap: 2px;
  line-height: 1.2;
  text-align: center;
}
.gvf-ex-meta b {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--host-text);
}
.gvf-ex-meta span {
  font:
    500 11px/1.3 ui-monospace,
    'SF Mono',
    Menlo,
    monospace;
}
.gvf-ex-tag-md {
  color: var(--gv-brand);
}
.gvf-ex-tag-pdf {
  color: var(--gvf-ex-red);
}
.gvf-ex-tag-json {
  color: var(--gvf-ex-amber);
}
.gvf-ex-tag-png {
  color: var(--gvf-ex-blue);
}

/* Narrow chat areas: a 2 × 2 grid. */
@container (max-width: 440px) {
  .gvf-ex-files {
    grid-template-columns: repeat(2, minmax(0, 104px));
    justify-content: center;
    align-content: start;
    gap: 14px 22px;
    padding-top: 18px;
    padding-inline: 16px 44px;
  }
  .gvf-ex-file {
    gap: 6px;
  }
}
</style>
