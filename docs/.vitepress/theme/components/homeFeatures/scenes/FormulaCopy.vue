<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { useStage } from '../stage';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

// The extension's own `formula_copied` toast, in each locale.
const COPIED: Record<string, string> = {
  'zh-CN': '✓ 公式已复制',
  'zh-TW': '✓ 公式已複製',
  'en-US': '✓ Formula copied',
  'ja-JP': '✓ 数式をコピーしました',
  'ko-KR': '✓ 수식 복사됨',
  'fr-FR': '✓ Formule copiée',
  'es-ES': '✓ Fórmula copiada',
  'pt-PT': '✓ Fórmula copiada',
  'ar-SA': '✓ تم نسخ الصيغة',
  'ru-RU': '✓ Формула скопирована',
};
const copiedLabel = computed(() => COPIED[props.lang] ?? COPIED['en-US']);

const CLIPBOARD_ICON =
  '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>';

/* The answer solves x² − 5x + 6 = 0 in formulas only, so it needs no translation. */
type Formula = 'coef' | 'root' | 'x1' | 'x2';
type Format = 'latex' | 'mathml' | 'notion';
const FORMATS: Array<{ id: Format; label: string }> = [
  { id: 'latex', label: 'LaTeX' },
  { id: 'mathml', label: 'MathML' },
  { id: 'notion', label: 'Notion' },
];
const DISPLAY: Formula[] = ['root'];
const SOURCE: Record<Formula, string> = {
  coef: 'a = 1,\\ b = -5,\\ c = 6',
  root: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
  x1: 'x_1 = 2',
  x2: 'x_2 = 3',
};
const M = (body: string, block = false) =>
  `<math xmlns="http://www.w3.org/1998/Math/MathML"${block ? ' display="block"' : ''}>${body}</math>`;
const MATHML: Record<Formula, string> = {
  coef: M(
    '<mi>a</mi><mo>=</mo><mn>1</mn><mo>,</mo><mi>b</mi><mo>=</mo><mo>−</mo><mn>5</mn><mo>,</mo><mi>c</mi><mo>=</mo><mn>6</mn>',
  ),
  root: M(
    '<mi>x</mi><mo>=</mo><mfrac><mrow><mo>−</mo><mi>b</mi><mo>±</mo><msqrt><msup><mi>b</mi><mn>2</mn></msup><mo>−</mo><mn>4</mn><mi>a</mi><mi>c</mi></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac>',
    true,
  ),
  x1: M('<msub><mi>x</mi><mn>1</mn></msub><mo>=</mo><mn>2</mn>'),
  x2: M('<msub><mi>x</mi><mn>2</mn></msub><mo>=</mo><mn>3</mn>'),
};
/** Mirrors the extension's formatFormula: LaTeX keeps $ or $$ by mode, Notion always uses $$. */
function payload(f: Formula, format: Format) {
  if (format === 'mathml') return MATHML[f];
  if (format === 'notion' || DISPLAY.includes(f)) return `$$${SOURCE[f]}$$`;
  return `$${SOURCE[f]}$`;
}

const els: Partial<Record<Formula, HTMLElement>> = {};
const setEl = (f: Formula) => (el: unknown) => {
  if (el instanceof HTMLElement) els[f] = el;
  else delete els[f];
};

const state = reactive({
  pending: true,
  hover: '' as '' | Formula,
  copied: '' as '' | Formula,
  format: 'latex' as Format,
  toast: false,
  toastKey: 0,
  flash: 0,
});
const clip = computed(() => (state.copied ? payload(state.copied, state.format) : ''));
const cursor = reactive({ x: 0, y: 0, show: false, down: false });

const timers: number[] = [];
let toastTimer = 0;
const at = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};

/** `real` comes from the visitor's own click: only then does the clipboard change. */
function copy(f: Formula, real = false) {
  if (real) navigator.clipboard?.writeText(payload(f, state.format)).catch(() => {});
  state.copied = f;
  state.toast = true;
  state.toastKey++;
  state.flash++;
  clearTimeout(toastTimer);
  // The extension shows the note for two seconds.
  toastTimer = window.setTimeout(() => (state.toast = false), 2000);
}
function setFormat(f: Format) {
  state.format = f;
  if (state.copied) state.flash++;
}

function aim(el: HTMLElement | undefined) {
  const o = stage.regions.hostCover?.getBoundingClientRect();
  const r = el?.getBoundingClientRect();
  if (!o || !r) return;
  cursor.x = r.left - o.left + r.width * 0.55;
  cursor.y = r.top - o.top + r.height * 0.6;
}
function click(fn: () => void) {
  cursor.down = true;
  at(140, () => {
    cursor.down = false;
    fn();
  });
}
const toEnd = () => nextTick(() => stage.scrollChatToEnd());

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    state.pending = false;
    state.copied = 'root';
    nextTick(() => {
      const el = stage.chatEl;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return;
  }
  toEnd();
  at(800, () => {
    state.pending = false;
    toEnd();
  });
  const o = stage.regions.hostCover?.getBoundingClientRect();
  if (o) {
    cursor.x = o.width * 0.8;
    cursor.y = o.height * 0.9;
  }
  at(1500, () => {
    cursor.show = true;
    aim(els.root);
  });
  at(2050, () => (state.hover = 'root'));
  at(2450, () => click(() => copy('root')));
  at(3800, () => {
    state.hover = '';
    aim(els.x1);
  });
  at(4300, () => (state.hover = 'x1'));
  at(4650, () => click(() => copy('x1')));
  at(5600, () => {
    state.hover = '';
    cursor.show = false;
  });
});

onBeforeUnmount(() => {
  timers.forEach((t) => clearTimeout(t));
  clearTimeout(toastTimer);
});
</script>

<template>
  <Teleport v-if="stage.regions.chatTail" :to="stage.regions.chatTail">
    <div class="gvf-fc-turn">
      <div class="gvf-q" dir="ltr">x² − 5x + 6 = 0</div>
      <div v-if="state.pending" class="gvf-a gvf-typing"><i /><i /><i /></div>
      <div v-else class="gvf-a gvf-fc-a">
        <p>
          <span
            :ref="setEl('coef')"
            class="gvf-fc-math"
            :class="{ hover: state.hover === 'coef' }"
            role="button"
            tabindex="0"
            dir="ltr"
            @click="copy('coef', true)"
            @keydown.enter="copy('coef', true)"
            ><i>a</i> = 1, <i>b</i> = −5, <i>c</i> = 6</span
          >
        </p>
        <div class="gvf-fc-block">
          <span
            :ref="setEl('root')"
            class="gvf-fc-math display"
            :class="{ hover: state.hover === 'root' }"
            role="button"
            tabindex="0"
            dir="ltr"
            @click="copy('root', true)"
            @keydown.enter="copy('root', true)"
          >
            <i>x</i>
            <span class="op">=</span>
            <span class="frac">
              <span class="num"
                >−<i>b</i><span class="op">±</span
                ><span class="sqrt"
                  ><span class="rad">√</span
                  ><span class="under"
                    ><i>b</i><sup>2</sup><span class="op">−</span>4<i>ac</i></span
                  ></span
                ></span
              >
              <span class="den">2<i>a</i></span>
            </span>
          </span>
        </div>
        <p>
          <span
            v-for="(f, i) in ['x1', 'x2'] as const"
            :key="f"
            :ref="setEl(f)"
            class="gvf-fc-math"
            :class="{ hover: state.hover === f }"
            role="button"
            tabindex="0"
            dir="ltr"
            @click="copy(f, true)"
            @keydown.enter="copy(f, true)"
            ><i>x</i><sub>{{ i + 1 }}</sub> = {{ i + 2 }}</span
          >
        </p>
      </div>
    </div>
    <!-- Room for the clipboard card, so the last formula can scroll clear of it. -->
    <div class="gvf-fc-spacer" aria-hidden="true" />
  </Teleport>

  <Teleport v-if="stage.regions.chatCover" :to="stage.regions.chatCover">
    <div class="gvf-fc-dock">
      <div v-if="state.toast" :key="state.toastKey" class="gvf-fc-toast" role="status">
        <span class="gvf-fc-dot" aria-hidden="true" />{{ copiedLabel }}
      </div>
      <div class="gvf-fc-clip" :class="{ show: state.copied }">
        <div class="gvf-fc-clip-head">
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
            v-html="CLIPBOARD_ICON"
          />
          <div class="gvf-fc-formats" role="radiogroup">
            <button
              v-for="f in FORMATS"
              :key="f.id"
              type="button"
              class="gvf-fc-format"
              :class="{ on: state.format === f.id }"
              role="radio"
              :aria-checked="state.format === f.id"
              @click="setFormat(f.id)"
            >
              {{ f.label }}
            </button>
          </div>
        </div>
        <code :key="state.flash" class="gvf-fc-code" dir="ltr">{{ clip }}</code>
      </div>
    </div>
  </Teleport>

  <Teleport v-if="stage.regions.hostCover" :to="stage.regions.hostCover">
    <div
      class="gvf-fc-cursor"
      :class="{ show: cursor.show, down: cursor.down }"
      :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }"
      aria-hidden="true"
    >
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path d="M5 3v16.2l4.4-4.3 2.9 6.6 2.6-1.1-2.9-6.5H18z" />
      </svg>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-fc-turn {
  display: grid;
  gap: 8px;
  padding-block: 8px 14px;
  animation: gvf-fc-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes gvf-fc-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
.gvf-fc-turn .gvf-q {
  font-family: 'Latin Modern Math', 'STIX Two Math', 'Cambria Math', 'Times New Roman', serif;
  font-size: 1.12em;
}
.gvf-fc-a {
  animation: gvf-fc-fade 0.3s ease both;
}
@keyframes gvf-fc-fade {
  from {
    opacity: 0;
  }
}
.gvf-fc-a p {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.gvf-fc-spacer {
  height: 120px;
}

/* Formulas set in HTML with a math serif; hover matches the extension's click-to-copy hint. */
.gvf-fc-math {
  position: relative;
  font-family: 'Latin Modern Math', 'STIX Two Math', 'Cambria Math', 'Times New Roman', serif;
  font-size: 1.12em;
  line-height: 1.3;
  white-space: nowrap;
  padding: 1px 5px;
  border-radius: 4px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;
}
.gvf-fc-math:hover,
.gvf-fc-math.hover,
.gvf-fc-math:focus-visible {
  outline: none;
  background: var(--gv-brand-soft);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--gv-brand) 30%, transparent);
}
.gvf-fc-math i {
  font-style: italic;
  padding-inline-end: 0.04em;
}
.gvf-fc-math sup {
  font-size: 0.7em;
  vertical-align: 0.55em;
  line-height: 0;
}
.gvf-fc-math sub {
  font-size: 0.7em;
  vertical-align: -0.25em;
  line-height: 0;
}
.gvf-fc-math .op {
  padding-inline: 0.22em;
}
.gvf-fc-block {
  display: flex;
  justify-content: center;
  margin: 8px 0 12px;
}
.gvf-fc-math.display {
  display: inline-flex;
  align-items: center;
  font-size: 1.4em;
  padding: 6px 10px;
}
.frac {
  display: inline-grid;
  text-align: center;
  margin-inline-start: 0.1em;
}
.num {
  padding: 0 0.2em 0.12em;
  border-bottom: 1px solid currentColor;
}
.den {
  padding-top: 0.12em;
}
.sqrt {
  display: inline-flex;
  align-items: flex-end;
}
.rad {
  font-size: 1.12em;
  line-height: 1;
  margin-inline-end: -0.04em;
}
.under {
  border-top: 1px solid currentColor;
  padding: 0.12em 0.1em 0;
  margin-top: 0.08em;
}

/* Toast and clipboard dock at the bottom of the chat, clear of the timeline rail. */
.gvf-fc-dock {
  position: absolute;
  bottom: 10px;
  /* Physical sides: the timeline rail and the ball stay on the right in every language. */
  left: 16px;
  right: 76px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none !important;
}
/* .gv-toast, success tone */
.gvf-fc-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 12px;
  background: var(--gv-surface);
  color: var(--gv-text);
  border: 1px solid var(--gv-border);
  box-shadow: 0 6px 20px oklch(0 0 0 / 0.16);
  font:
    13px/1.4 ui-sans-serif,
    system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
  white-space: nowrap;
  animation: gvf-fc-toast 0.16s ease-out;
}
@keyframes gvf-fc-toast {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
.gvf-fc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--gv-brand);
}
.gvf-fc-clip {
  align-self: stretch;
  padding: 10px 12px 12px;
  border-radius: 12px;
  background: var(--gv-surface);
  border: 1px solid var(--gv-border);
  color: var(--gv-text);
  box-shadow: 0 10px 28px -14px oklch(0 0 0 / 0.3);
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 0.3s ease,
    transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-fc-clip.show {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-fc-clip-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--gv-brand);
}
.gvf-fc-formats {
  display: flex;
  gap: 4px;
  margin-inline-start: auto;
}
.gvf-fc-format {
  height: 24px;
  padding: 0 9px;
  border: 0;
  border-radius: 12px;
  background: none;
  color: var(--gvf-muted) !important;
  font:
    500 11.5px/1 ui-sans-serif,
    system-ui,
    sans-serif;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.gvf-fc-format:hover {
  background: var(--gv-row);
}
.gvf-fc-format.on {
  background: var(--gv-chip-bg);
  color: var(--gv-chip-fg) !important;
}
.gvf-fc-code {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  min-height: 2.9em;
  font:
    12.5px/1.45 ui-monospace,
    'SF Mono',
    Menlo,
    Consolas,
    monospace;
  word-break: break-all;
  text-align: left;
  background: none;
  padding: 0;
  color: inherit;
  animation: gvf-fc-flash 0.5s ease-out;
}
@keyframes gvf-fc-flash {
  from {
    opacity: 0.2;
  }
}

.gvf-fc-cursor {
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
.gvf-fc-cursor.show {
  opacity: 1;
}
.gvf-fc-cursor svg {
  display: block;
  margin: -3px 0 0 -4px;
  filter: drop-shadow(0 1px 1.5px oklch(0 0 0 / 0.3));
  transition: transform 0.12s ease;
}
.gvf-fc-cursor.down svg {
  transform: scale(0.82);
}
.gvf-fc-cursor path {
  fill: #1f1f1f;
  stroke: #fff;
  stroke-width: 1.4;
  stroke-linejoin: round;
}
</style>
