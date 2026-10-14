<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

type Copy = { ask: string; diagram: string; code: string };
// Button labels match the extension's diagramButton / diagramCodeButton messages.
const copy: Record<string, Copy> = {
  'en-US': { ask: 'Draw the plan as a flowchart.', diagram: 'Diagram', code: 'Code' },
  'zh-CN': { ask: '把行程画成流程图。', diagram: '图表', code: '代码' },
  'zh-TW': { ask: '把行程畫成流程圖。', diagram: '圖表', code: '程式碼' },
  'ja-JP': { ask: '旅程をフローチャートにして。', diagram: '図', code: 'コード' },
  'ko-KR': { ask: '일정을 순서도로 그려 줘.', diagram: '다이어그램', code: '코드' },
  'fr-FR': { ask: 'Fais un organigramme du programme.', diagram: 'Diagramme', code: 'Code' },
  'es-ES': { ask: 'Dibuja el plan como diagrama de flujo.', diagram: 'Diagrama', code: 'Código' },
  'pt-PT': { ask: 'Desenha o plano como fluxograma.', diagram: 'Diagrama', code: 'Código' },
  'ar-SA': { ask: 'ارسم الخطة كمخطط انسيابي.', diagram: 'مخطط', code: 'الكود' },
  'ru-RU': { ask: 'Нарисуй план в виде блок-схемы.', diagram: 'Диаграмма', code: 'Код' },
};
const t = computed(() => copy[props.lang] ?? copy['en-US']);

// The itinerary of the default chat: one row per day, morning stop then afternoon stops.
const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);
const days = computed(() => {
  const chat = content.value.chats[content.value.current];
  return (chat?.extra.table ?? []).slice(1).map(([, am = '', pm = '']) => ({ am, pm }));
});
const source = computed(() => {
  const lines = ['flowchart TD'];
  days.value.forEach((d, i) => {
    const n = i + 1;
    if (i === 0) lines.push(`  M1(["${d.am}"]) --> A1["${d.pm}"]`);
    else {
      lines.push(`  M${i} --> M${n}(["${d.am}"])`);
      lines.push(`  M${n} --> A${n}["${d.pm}"]`);
    }
  });
  return lines;
});

const phase = ref(0); // 0 nothing, 1 asked, 2 streaming code, 3 rendered
const typed = ref(0); // source lines streamed so far
const view = ref<'diagram' | 'code'>('diagram');
const rendered = computed(() => phase.value >= 3);
const codeOpen = computed(() => !rendered.value || view.value === 'code');

const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
const stopAutoplay = () => timers.forEach(clearTimeout);
const toEnd = () => nextTick(() => stage.scrollChatToEnd());

function finish() {
  phase.value = 3;
  typed.value = source.value.length;
  toEnd();
}
function show(next: 'diagram' | 'code') {
  if (!rendered.value) {
    stopAutoplay();
    finish();
  }
  view.value = next;
  toEnd();
}

onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }
  at(300, () => {
    phase.value = 1;
    toEnd();
  });
  at(1100, () => {
    phase.value = 2;
    toEnd();
  });
  const n = source.value.length;
  for (let i = 0; i < n; i++)
    at(1250 + i * 260, () => {
      typed.value = i + 1;
      toEnd();
    });
  at(1250 + n * 260 + 600, finish);
});
onBeforeUnmount(stopAutoplay);
</script>

<template>
  <Teleport v-if="stage.regions.chatTail" :to="stage.regions.chatTail">
    <div v-if="phase" class="gvf-mm-turn">
      <div class="gvf-q">{{ t.ask }}</div>
      <div v-if="phase === 1" class="gvf-a gvf-typing"><i /><i /><i /></div>
      <div v-else class="gvf-a gvf-mm-a">
        <!-- Mirrors .gv-mermaid-toggle: a small icon group above the block, at the inline end. -->
        <div class="gvf-mm-toolbar" :class="{ on: rendered }" role="group">
          <button
            type="button"
            :class="{ active: view === 'diagram' }"
            :aria-pressed="view === 'diagram'"
            :aria-label="t.diagram"
            :title="t.diagram"
            :tabindex="rendered ? 0 : -1"
            @click="show('diagram')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect width="8" height="8" x="3" y="3" rx="2" />
              <path d="M7 11v4a2 2 0 0 0 2 2h4" />
              <rect width="8" height="8" x="13" y="13" rx="2" />
            </svg>
          </button>
          <button
            type="button"
            :class="{ active: view === 'code' }"
            :aria-pressed="view === 'code'"
            :aria-label="t.code"
            :title="t.code"
            :tabindex="rendered ? 0 : -1"
            @click="show('code')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m18 16 4-4-4-4" />
              <path d="m6 8-4 4 4 4" />
              <path d="m14.5 4-5 16" />
            </svg>
          </button>
        </div>
        <div class="gvf-mm-body">
          <div class="gvf-mm-code" :class="{ off: !codeOpen }">
            <div class="gvf-mm-code-head">
              <span>mermaid</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            </div>
            <pre><code><span v-for="(line, i) in source.slice(0, typed)" :key="i" class="gvf-mm-line">{{ line }}
</span><span v-if="!rendered" class="gvf-mm-caret" /></code></pre>
          </div>
          <div
            class="gvf-mm-diagram"
            :class="{ on: rendered && view === 'diagram' }"
            dir="ltr"
            role="img"
            aria-label="flowchart"
          >
            <template v-for="(d, i) in days" :key="i">
              <div v-if="i" class="gvf-mm-vrow">
                <span class="gvf-mm-edge v" :style="{ '--d': `${0.15 + i * 0.32}s` }" />
              </div>
              <div class="gvf-mm-row">
                <span class="gvf-mm-node start" dir="auto" :style="{ '--d': `${i * 0.32}s` }">{{
                  d.am
                }}</span>
                <span class="gvf-mm-edge h" :style="{ '--d': `${0.12 + i * 0.32}s` }" />
                <span class="gvf-mm-node" dir="auto" :style="{ '--d': `${0.22 + i * 0.32}s` }">{{
                  d.pm
                }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Same box as the demo's .gvf-turn; kept separate so the timeline does not count it. */
.gvf-mm-turn {
  display: grid;
  gap: 8px;
  padding-block: 8px 14px;
  animation: gvf-mm-in 0.35s ease both;
}
@keyframes gvf-mm-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
.gvf-mm-a {
  display: grid;
  min-width: 0;
}
.gvf-mm-toolbar {
  display: flex;
  width: fit-content;
  margin-block: 0 6px;
  margin-inline-start: auto;
  gap: 4px;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--gvf-line);
  background: color-mix(in srgb, var(--host-muted) 7%, var(--host-bg));
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  pointer-events: none;
}
.gvf-mm-toolbar.on {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-mm-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--host-muted);
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}
.gvf-mm-toolbar button:hover {
  background: color-mix(in srgb, var(--host-muted) 14%, transparent);
}
.gvf-mm-toolbar button.active {
  background: var(--gv-brand);
  color: #fff;
}
.gvf-mm-toolbar button:focus-visible {
  outline: 2px solid var(--gv-brand);
  outline-offset: 1px;
}
.gvf-mm-toolbar svg,
.gvf-mm-code-head svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.gvf-mm-body {
  display: grid;
}
.gvf-mm-body > * {
  grid-area: 1 / 1;
  min-width: 0;
}
.gvf-mm-code {
  align-self: start;
  border-radius: 12px;
  background: color-mix(in srgb, var(--host-muted) 9%, var(--host-bg));
  overflow: hidden;
  direction: ltr;
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}
.gvf-mm-code.off {
  opacity: 0;
  transform: scale(0.98);
  pointer-events: none;
  visibility: hidden;
  transition:
    opacity 0.35s ease,
    transform 0.35s ease,
    visibility 0s 0.35s;
}
.gvf-mm-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px 0;
  font-size: 12px;
  color: var(--host-muted);
}
.gvf-mm-code pre {
  margin: 0;
  padding: 6px 12px 12px;
  font: 11.5px/1.7 var(--vp-font-family-mono);
  color: var(--host-text);
  text-align: left;
  white-space: pre;
  overflow-x: auto;
  scrollbar-width: none;
}
.gvf-mm-code code {
  font: inherit;
  background: none;
  padding: 0;
  color: inherit;
}
.gvf-mm-line {
  animation: gvf-mm-fade 0.25s ease both;
}
@keyframes gvf-mm-fade {
  from {
    opacity: 0;
  }
}
.gvf-mm-caret {
  display: inline-block;
  width: 6px;
  height: 1.2em;
  vertical-align: text-bottom;
  background: color-mix(in srgb, var(--host-text) 45%, transparent);
  animation: gvf-mm-blink 1s steps(1) infinite;
}
@keyframes gvf-mm-blink {
  50% {
    opacity: 0;
  }
}

/* Hand-laid flowchart TD: the morning stops form the spine, afternoons branch to the right.
   Mermaid draws left to right whatever the page direction, so the diagram stays LTR. */
.gvf-mm-diagram {
  padding: 6px 2px 8px;
  font-size: 12.5px;
  line-height: 1.35;
}
.gvf-mm-row {
  display: flex;
  align-items: stretch;
}
.gvf-mm-node {
  display: grid;
  place-items: center;
  text-align: center;
  flex: 1 1 0;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--gv-brand) 11%, var(--host-bg));
  border: 1.5px solid color-mix(in srgb, var(--gv-brand) 60%, var(--host-bg));
  color: var(--host-text);
  overflow-wrap: anywhere;
}
.gvf-mm-node.start {
  flex: 0 0 40%;
  border-radius: 999px;
}
.gvf-mm-edge {
  position: relative;
  flex: none;
}
.gvf-mm-edge::before,
.gvf-mm-edge::after {
  content: '';
  position: absolute;
}
.gvf-mm-edge.h {
  width: 30px;
}
.gvf-mm-edge.h::before {
  inset-block-start: 50%;
  left: 0;
  right: 5px;
  height: 1.5px;
  margin-top: -0.75px;
  background: var(--host-muted);
  transform-origin: left;
}
.gvf-mm-edge.h::after {
  right: 0;
  top: 50%;
  margin-top: -4px;
  border-block: 4px solid transparent;
  border-left: 7px solid var(--host-muted);
}
.gvf-mm-vrow {
  width: 40%;
  display: flex;
  justify-content: center;
}
.gvf-mm-edge.v {
  width: 8px;
  height: 22px;
}
.gvf-mm-edge.v::before {
  left: 50%;
  top: 0;
  bottom: 5px;
  width: 1.5px;
  margin-left: -0.75px;
  background: var(--host-muted);
  transform-origin: top;
}
.gvf-mm-edge.v::after {
  bottom: 0;
  left: 0;
  border-inline: 4px solid transparent;
  border-top: 7px solid var(--host-muted);
}
/* Nodes pop in, then edges draw; all keyed to .on so the Code button can hide it again. */
.gvf-mm-diagram .gvf-mm-node,
.gvf-mm-diagram .gvf-mm-edge::after {
  opacity: 0;
  transition: opacity 0.3s ease;
}
.gvf-mm-diagram .gvf-mm-node {
  transform: scale(0.92);
  transition:
    opacity 0.3s ease,
    transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1.2);
}
.gvf-mm-diagram .gvf-mm-edge.h::before {
  transform: scaleX(0);
  transition: transform 0.35s ease;
}
.gvf-mm-diagram .gvf-mm-edge.v::before {
  transform: scaleY(0);
  transition: transform 0.35s ease;
}
.gvf-mm-diagram.on .gvf-mm-node,
.gvf-mm-diagram.on .gvf-mm-edge::after {
  opacity: 1;
  transform: none;
  transition-delay: var(--d);
}
.gvf-mm-diagram.on .gvf-mm-edge::before {
  transform: none;
  transition-delay: var(--d);
}
.gvf-mm-diagram.on .gvf-mm-edge::after {
  transition-delay: calc(var(--d) + 0.25s);
}
.gvf-mm-diagram:not(.on) {
  visibility: hidden;
  transition: visibility 0s 0.35s;
}
</style>
