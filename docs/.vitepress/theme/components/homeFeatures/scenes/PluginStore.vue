<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);

/* Official Gemini plugins (catalog/sites/gemini/plugins: chat-font-size, chat-line-height, vim-input),
   named from their manifests' i18n with the "Gemini · " prefix dropped, as PluginIdentity does. */
const pluginNames: Record<string, [string, string, string]> = {
  'en-US': ['Chat Font Size', 'Chat Spacing', 'Vim Input'],
  'zh-CN': ['对话字体大小', '对话间距', 'Vim 输入'],
  'zh-TW': ['對話字體大小', '對話間距', 'Vim 輸入'],
  'ja-JP': ['チャットのフォントサイズ', 'チャットの間隔', 'Vim 入力'],
  'ko-KR': ['대화 글꼴 크기', '대화 간격', 'Vim 입력'],
  'fr-FR': ['Taille de police du chat', 'Espacement du chat', 'Saisie Vim'],
  'es-ES': ['Tamaño de fuente del chat', 'Espaciado del chat', 'Entrada Vim'],
  'pt-PT': ['Tamanho da fonte do chat', 'Espaçamento do chat', 'Entrada Vim'],
  'ar-SA': ['حجم خط الدردشة', 'تباعد الدردشة', 'إدخال Vim'],
  'ru-RU': ['Размер шрифта чата', 'Интервалы чата', 'Ввод Vim'],
};
/* Popup strings: pluginsTitle and pluginSourceBundled from src/locales. */
const popupCopy: Record<string, [string, string]> = {
  'en-US': ['Plugins', 'Bundled'],
  'zh-CN': ['插件', '预装'],
  'zh-TW': ['外掛', '預裝'],
  'ja-JP': ['プラグイン', '同梱'],
  'ko-KR': ['플러그인', '기본 포함'],
  'fr-FR': ['Extensions', 'Fournie'],
  'es-ES': ['Complementos', 'Incluido'],
  'pt-PT': ['Plugins', 'Incluído'],
  'ar-SA': ['الإضافات', 'مرفقة'],
  'ru-RU': ['Плагины', 'В комплекте'],
};
const names = computed(() => pluginNames[props.lang] ?? pluginNames['en-US']);
const copy = computed(() => popupCopy[props.lang] ?? popupCopy['en-US']);

const icon = (name: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiIcons[name] ?? ''}</svg>`;

const [FONT, SPACING, VIM] = [0, 1, 2];
const on = reactive([false, false, false]);
const popOpen = ref(false);

// Each switch changes the live demo: font size and spacing restyle the chat, Vim adds its HUD.
watch(
  () => [...on],
  ([font, spacing]) => {
    stage.view.fontScale = font ? 1.14 : 1;
    stage.view.skin = spacing ? 'gv-plugin-spacing' : 'gemini';
  },
);

const root = ref<HTMLElement | null>(null);
const extBtn = ref<HTMLElement | null>(null);
const switches = ref<HTMLElement[]>([]);
const cursor = reactive({ x: 0, y: 0, show: false, down: false });

const timers: ReturnType<typeof setTimeout>[] = [];
const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
function aim(el: HTMLElement | null | undefined, fx = 0.5, fy = 0.5) {
  if (!root.value || !el) return;
  const r = root.value.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  cursor.x = e.left - r.left + e.width * fx;
  cursor.y = e.top - r.top + e.height * fy;
}
function aimAt(fx: number, fy: number) {
  if (!root.value) return;
  cursor.x = root.value.clientWidth * fx;
  cursor.y = root.value.clientHeight * fy;
}
function press(fn: () => void) {
  cursor.down = true;
  fn();
  at(160, () => (cursor.down = false));
}
let auto = false;
function takeOver() {
  if (!auto) return;
  auto = false;
  timers.forEach(clearTimeout);
  timers.length = 0;
  cursor.show = false;
  cursor.down = false;
}
const onDocPointer = (e: PointerEvent) => {
  if (e.isTrusted) takeOver();
  const t = e.target as Element | null;
  if (popOpen.value && t && !t.closest('.gvf-ps-pop') && !t.closest('.gvf-ps-ext')) {
    popOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    on.fill(true);
    return;
  }
  auto = true;
  at(150, () => aimAt(0.42, 0.55));
  at(220, () => (cursor.show = true));
  at(400, () => aim(extBtn.value));
  at(950, () => press(() => (popOpen.value = true)));
  at(1350, () => aim(switches.value[FONT]));
  at(1900, () => press(() => (on[FONT] = true)));
  at(2250, () => aim(switches.value[SPACING]));
  at(2800, () => press(() => (on[SPACING] = true)));
  at(3150, () => aim(switches.value[VIM]));
  at(3700, () => press(() => (on[VIM] = true)));
  at(4100, () => aimAt(0.3, 0.62));
  at(4650, () => press(() => (popOpen.value = false)));
  at(5300, () => {
    cursor.show = false;
    auto = false;
  });
});
onBeforeUnmount(() => {
  timers.forEach(clearTimeout);
  document.removeEventListener('pointerdown', onDocPointer, true);
});
</script>

<template>
  <!-- Toolbar button for the extension popup -->
  <Teleport v-if="stage.regions.topbarEnd" :to="stage.regions.topbarEnd">
    <button
      ref="extBtn"
      type="button"
      class="gvf-ps-ext"
      :class="{ on: popOpen }"
      aria-label="Voyager"
      :aria-expanded="popOpen"
      @click="popOpen = !popOpen"
    >
      <img src="/logo.png" alt="" width="18" height="18" draggable="false" />
    </button>
  </Teleport>

  <Teleport v-if="stage.regions.hostCover" :to="stage.regions.hostCover">
    <div ref="root" class="gvf-ps">
      <div class="gvf-ps-pop" :class="{ open: popOpen }" :aria-hidden="!popOpen">
        <div class="gvf-ps-pop-head">
          <img src="/logo.png" alt="" width="16" height="16" draggable="false" />
          <b>Voyager</b>
        </div>
        <div class="gvf-ps-pop-title">{{ copy[0] }}</div>
        <div v-for="(n, i) in names" :key="i" class="gvf-ps-card" :class="{ on: on[i] }">
          <div class="gvf-ps-card-text">
            <b>{{ n }}</b>
            <span class="gvf-ps-meta"
              ><em>{{ copy[1] }}</em
              ><code>1.0.0</code></span
            >
          </div>
          <button
            ref="switches"
            type="button"
            role="switch"
            class="gvf-ps-switch"
            :aria-checked="on[i]"
            :aria-label="n"
            :tabindex="popOpen ? 0 : -1"
            @click="on[i] = !on[i]"
          />
        </div>
      </div>

      <svg
        class="gvf-ps-cursor"
        :class="{ show: cursor.show, down: cursor.down }"
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

  <!-- Vim Input: the same composer with the plugin's mode badge in its bottom gutter -->
  <Teleport v-if="stage.regions.composerCover && on[VIM]" :to="stage.regions.composerCover">
    <div class="gvf-ps-composer">
      <div class="gvf-composer">
        <div class="gvf-composer-text empty">{{ content.composer.placeholder }}</div>
        <div class="gvf-composer-bar">
          <span class="gvf-icon-btn" v-html="icon('plus', 17)" />
          <span class="gvf-ps-vim">VIM</span>
          <span class="gvf-icon-btn gvf-send gvf-ps-send" v-html="icon('arrow-up', 17)" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-ps {
  position: absolute;
  inset: 0;
  pointer-events: none !important;
  overflow: hidden;
}

/* Toolbar button */
.gvf-ps-ext {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
  animation: gvf-ps-in 0.3s ease both;
}
.gvf-ps-ext:hover,
.gvf-ps-ext.on {
  background: color-mix(in srgb, var(--host-text) 9%, transparent);
}

/* Extension popup with the plugin list */
.gvf-ps-pop {
  position: absolute;
  top: 46px;
  inset-inline-end: 10px;
  width: min(264px, calc(100% - 20px));
  padding: 12px;
  display: grid;
  gap: 7px;
  border: 1px solid var(--gv-border);
  border-radius: 14px;
  background: var(--gv-surface);
  color: var(--gv-text);
  box-shadow: 0 16px 40px -12px oklch(0 0 0 / 0.32);
  transform-origin: top right;
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
  transition:
    opacity 0.18s ease,
    transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
[dir='rtl'] .gvf-ps-pop {
  transform-origin: top left;
}
.gvf-ps-pop.open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-ps-pop-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
}
.gvf-ps-pop-head b {
  font-weight: 700;
}
.gvf-ps-pop-title {
  margin-top: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--gvf-muted);
}
.gvf-ps-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--gv-border);
  border-radius: 10px;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}
.gvf-ps-card.on {
  border-color: color-mix(in srgb, var(--gv-brand) 40%, transparent);
  background: color-mix(in srgb, var(--gv-brand) 6%, transparent);
}
.gvf-ps-card-text {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}
.gvf-ps-card-text b {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gvf-ps-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--gvf-muted);
}
.gvf-ps-meta em {
  font-style: normal;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--gv-chip-bg);
  color: var(--gv-chip-fg);
  font-weight: 600;
}
.gvf-ps-meta code {
  font: 10.5px/1.3 var(--vp-font-family-mono);
}
.gvf-ps-switch {
  flex: none;
  position: relative;
  width: 32px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gv-text) 18%, transparent);
  cursor: pointer;
  transition: background 0.2s ease;
}
.gvf-ps-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  inset-inline-start: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.25);
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-ps-switch[aria-checked='true'] {
  background: var(--gv-brand);
}
.gvf-ps-switch[aria-checked='true']::after {
  transform: translateX(14px);
}
[dir='rtl'] .gvf-ps-switch[aria-checked='true']::after {
  transform: translateX(-14px);
}
.gvf-ps-switch:focus-visible {
  outline: 2px solid var(--gv-brand);
  outline-offset: 2px;
}

/* Composer copy with the Vim HUD, matching .gv-input-vim-hud[data-placement='composer'] */
.gvf-ps-composer {
  position: absolute;
  inset: 0;
  padding: 4px 14px 14px;
  background: var(--host-bg);
}
.gvf-ps-send {
  opacity: 0.4;
}
.gvf-ps-vim {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid var(--tl-tip-border);
  background: var(--tl-tip-bg);
  color: var(--tl-tip-fg);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 1px 2px oklch(0 0 0 / 0.18);
  animation: gvf-ps-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

/* Scripted cursor */
.gvf-ps-cursor {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 8;
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
.gvf-ps-cursor.show {
  opacity: 1;
}
.gvf-ps-cursor path {
  transition: transform 0.12s ease;
  transform-origin: 4px 4px;
}
.gvf-ps-cursor.down path {
  transform: scale(0.85);
}
@keyframes gvf-ps-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
}
</style>

<style>
/* Chat Spacing plugin: looser line height and paragraph spacing on the live chat. */
.gvf-tl-host.gvf-skin-gv-plugin-spacing .gvf-a {
  line-height: 2.05;
}
.gvf-tl-host.gvf-skin-gv-plugin-spacing .gvf-a p,
.gvf-tl-host.gvf-skin-gv-plugin-spacing .gvf-a ul {
  margin-block: 0 12px;
}
.gvf-tl-host.gvf-skin-gv-plugin-spacing .gvf-q {
  line-height: 1.9;
}
.gvf-tl-host.gvf-skin-gv-plugin-spacing .gvf-turn {
  padding-block: 12px 18px;
}
</style>
