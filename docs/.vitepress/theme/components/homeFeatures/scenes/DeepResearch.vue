<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { useStage } from '../stage';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('timeline');

const ICONS = {
  share:
    '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
  fileText:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  download:
    '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const svg = (path: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

/* Menu labels and Markdown headings follow the extension's own strings
   (deepResearchSaveReport, deepResearchDownload, deepResearch_*). */
interface Strings {
  ask: string;
  save: string;
  thinking: string;
  phase: string;
  sites: string;
  total: string;
}
const TEXT: Record<string, Strings> = {
  'zh-CN': {
    ask: '调研一下今年京都红叶的最佳观赏期',
    save: '保存报告',
    thinking: '下载 Thinking 内容',
    phase: '思考阶段',
    sites: '研究网站',
    total: '总思考阶段',
  },
  'zh-TW': {
    ask: '研究一下今年京都紅葉的最佳觀賞期',
    save: '儲存報告',
    thinking: '下載 Thinking 內容',
    phase: '思考階段',
    sites: '研究網站',
    total: '總思考階段',
  },
  'en-US': {
    ask: "Research when Kyoto's autumn leaves peak this year",
    save: 'Save report',
    thinking: 'Download thinking content',
    phase: 'Thinking Phase',
    sites: 'Researched Websites',
    total: 'Total Phases',
  },
  'ja-JP': {
    ask: '今年の京都の紅葉の見頃を調べて',
    save: 'レポートを保存',
    thinking: '思考内容をダウンロード',
    phase: '思考フェーズ',
    sites: '調査済みサイト',
    total: '総思考フェーズ',
  },
  'ko-KR': {
    ask: '올해 교토 단풍이 절정인 시기를 조사해 줘',
    save: '보고서 저장',
    thinking: '생각 내용 다운로드',
    phase: '사고 단계',
    sites: '조사한 웹사이트',
    total: '총 단계 수',
  },
  'fr-FR': {
    ask: 'Quand les feuilles d’automne de Kyoto seront-elles à leur apogée cette année ?',
    save: 'Enregistrer le rapport',
    thinking: 'Télécharger la réflexion',
    phase: 'Phase de réflexion',
    sites: 'Sites web consultés',
    total: 'Phases totales',
  },
  'es-ES': {
    ask: 'Investiga cuándo alcanzan su punto álgido las hojas otoñales de Kioto este año',
    save: 'Guardar informe',
    thinking: 'Descargar el razonamiento',
    phase: 'Fase de pensamiento',
    sites: 'Sitios web investigados',
    total: 'Fases totales',
  },
  'pt-PT': {
    ask: 'Pesquisa quando as folhas de outono de Quioto atingem o auge este ano',
    save: 'Guardar relatório',
    thinking: 'Transferir o raciocínio',
    phase: 'Fase de pensamento',
    sites: 'Sites pesquisados',
    total: 'Fases totais',
  },
  'ar-SA': {
    ask: 'ابحث عن موعد ذروة أوراق الخريف في كيوتو هذا العام',
    save: 'حفظ التقرير',
    thinking: 'تنزيل محتوى التفكير',
    phase: 'مرحلة التفكير',
    sites: 'المواقع المبحوثة',
    total: 'إجمالي المراحل',
  },
  'ru-RU': {
    ask: 'Узнай, когда в этом году пик осенней листвы в Киото',
    save: 'Сохранить отчёт',
    thinking: 'Скачать ход рассуждений',
    phase: 'Фаза размышления',
    sites: 'Исследованные сайты',
    total: 'Всего фаз',
  },
};
const text = computed(() => TEXT[props.lang] ?? TEXT['en-US']);
const isEnglish = computed(() => !TEXT[props.lang] || props.lang === 'en-US');
/* Headings are English-based; other languages show "<local> / <English>". */
const bilingual = (local: string, en: string) => (isEnglish.value ? en : `${local} / ${en}`);

const phases = [
  {
    items: [
      [86, 64],
      [92, 40],
    ],
    sites: ['jnto.go.jp', 'kyoto.travel', 'tenki.jp'],
  },
  { items: [[78, 58]], sites: ['weathernews.jp', 'japan-guide.com'] },
];
const ROWS = 5; // phase 1 head, items, sites, phase 2 head, items + sites

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const fileName = `deep-research-thinking-${stamp}.md`;

const asked = ref(false);
const shown = ref(0);
const menuOpen = ref(false);
const hot = ref<'' | 'save' | 'thinking'>('');
const saved = ref<'' | 'save' | 'thinking'>('');
const timers: number[] = [];
const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
const follow = () => nextTick(() => stage.scrollChatToEnd());

function choose(kind: 'save' | 'thinking') {
  menuOpen.value = false;
  hot.value = '';
  saved.value = kind;
  follow();
}
function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    asked.value = true;
    shown.value = ROWS;
    saved.value = 'thinking';
    follow();
    return;
  }
  asked.value = true;
  follow();
  for (let i = 1; i <= ROWS; i++)
    at(350 + i * 300, () => {
      shown.value = i;
      follow();
    });
  at(2500, () => (menuOpen.value = true));
  at(3050, () => (hot.value = 'thinking'));
  at(3500, () => choose('thinking'));
});
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)));
</script>

<template>
  <Teleport v-if="stage.regions.chatTail" :to="stage.regions.chatTail">
    <div v-if="asked" class="gvf-dr-turn">
      <div class="gvf-q">{{ text.ask }}</div>

      <!-- The research report: its thinking, then the share and export menu -->
      <div class="gvf-dr-card">
        <div class="gvf-dr-head">
          <span class="gvf-dr-spark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M12 2c.3 5.4 4.6 9.7 10 10-5.4.3-9.7 4.6-10 10-.3-5.4-4.6-9.7-10-10 5.4-.3 9.7-4.6 10-10Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <b class="gvf-dr-brand">Deep Research</b>
          <button
            type="button"
            class="gvf-icon-btn sm gvf-dr-share"
            :class="{ on: menuOpen }"
            :aria-label="`${text.save} / ${text.thinking}`"
            :aria-expanded="menuOpen"
            @click="toggleMenu"
            v-html="svg(ICONS.share, 15)"
          />
          <div class="gvf-dr-menu" :class="{ open: menuOpen }" role="menu">
            <button
              type="button"
              role="menuitem"
              :class="{ hot: hot === 'save' }"
              :tabindex="menuOpen ? 0 : -1"
              @click="choose('save')"
            >
              <span v-html="svg(ICONS.fileText, 16)" />{{ text.save }}
            </button>
            <button
              type="button"
              role="menuitem"
              :class="{ hot: hot === 'thinking' }"
              :tabindex="menuOpen ? 0 : -1"
              @click="choose('thinking')"
            >
              <span v-html="svg(ICONS.download, 16)" />{{ text.thinking }}
            </button>
          </div>
        </div>

        <div class="gvf-dr-thinking" aria-hidden="true">
          <template v-for="(p, pi) in phases" :key="pi">
            <div class="gvf-dr-phase" :class="{ in: shown > (pi === 0 ? 0 : 3) }">
              <span class="gvf-dr-num">{{ pi + 1 }}</span>
              <i :style="{ width: pi === 0 ? '46%' : '38%' }" class="gvf-dr-strong" />
            </div>
            <div
              v-for="(item, ii) in p.items"
              :key="ii"
              class="gvf-dr-item"
              :class="{ in: shown > (pi === 0 ? 1 : 4) }"
            >
              <i :style="{ width: `${item[0]}%` }" /><i :style="{ width: `${item[1]}%` }" />
            </div>
            <div class="gvf-dr-sites" :class="{ in: shown > (pi === 0 ? 2 : 4) }">
              <span v-for="s in p.sites" :key="s" class="gvf-dr-site" dir="ltr">
                <b>{{ s[0] }}</b
                >{{ s }}
              </span>
            </div>
          </template>
        </div>
      </div>

      <!-- The downloaded file -->
      <Transition name="gvf-dr-file">
        <div
          v-if="saved"
          :key="saved"
          class="gvf-dr-file"
          role="region"
          :aria-label="saved === 'save' ? text.save : text.thinking"
        >
          <div class="gvf-dr-file-head">
            <span class="gvf-dr-file-ic" v-html="svg(ICONS.fileText, 14)" />
            <span class="gvf-dr-file-name" dir="ltr">{{
              saved === 'save' ? 'deep-research-report.pdf' : fileName
            }}</span>
            <span class="gvf-dr-file-ok" v-html="svg(ICONS.check, 13)" />
          </div>
          <div v-if="saved === 'save'" class="gvf-dr-report" aria-hidden="true">
            <i class="gvf-dr-h1" />
            <p><i style="width: 92%" /></p>
            <p><i style="width: 70%" /><sup>1</sup></p>
            <p><i style="width: 86%" /></p>
            <p><i style="width: 54%" /><sup>2</sup></p>
            <ol>
              <li><b>1</b>jnto.go.jp/…</li>
              <li><b>2</b>tenki.jp/…</li>
            </ol>
          </div>
          <div v-else class="gvf-dr-md" dir="ltr" aria-hidden="true">
            <p class="gvf-dr-md-h1"><em>#</em> {{ text.ask }}</p>
            <p class="gvf-dr-muted">
              <em>**</em>{{ bilingual(text.total, 'Total Phases') }}:<em>**</em>&nbsp;2
            </p>
            <p><em>##</em> {{ bilingual(`${text.phase} 1`, 'Thinking Phase 1') }}</p>
            <p><em>###</em> <i style="width: 34%" /></p>
            <p class="gvf-dr-muted"><i style="width: 70%" /></p>
            <p><em>####</em> {{ bilingual(text.sites, 'Researched Websites') }}</p>
            <p v-for="s in phases[0].sites" :key="s">
              <em>-</em
              ><span class="gvf-dr-link"
                >[{{ s }}]<u>(https://{{ s }}/…)</u></span
              >
            </p>
            <p><em>##</em> {{ bilingual(`${text.phase} 2`, 'Thinking Phase 2') }}</p>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
/* Same box as .gvf-turn; that class stays off so the timeline's dots keep matching the chat. */
.gvf-dr-turn {
  display: grid;
  gap: 8px;
  padding-block: 8px 14px;
  animation: gvf-dr-in 0.35s ease both;
}
@keyframes gvf-dr-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
i {
  display: block;
  height: 7px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--host-muted) 22%, transparent);
}

/* Report card */
.gvf-dr-card {
  position: relative;
  border: 1px solid var(--gvf-line);
  border-radius: 14px;
}
.gvf-dr-head {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-block: 6px;
  padding-inline: 12px 6px;
  border-bottom: 1px solid var(--gvf-line);
}
.gvf-dr-spark {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--host-input);
  color: oklch(0.6 0.15 265);
}
.gvf-dr-brand {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
}
.gvf-dr-share.on {
  background: var(--host-input);
  color: var(--host-text);
}
.gvf-dr-menu {
  position: absolute;
  top: calc(100% - 2px);
  inset-inline-end: 6px;
  min-width: 200px;
  max-width: calc(100% - 12px);
  padding: 6px;
  display: grid;
  border-radius: 12px;
  background: var(--host-bg);
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
[dir='rtl'] .gvf-dr-menu {
  transform-origin: top left;
}
.gvf-dr-menu.open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-dr-menu button {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--host-text);
  font-size: 13px;
  text-align: start;
  cursor: pointer;
  transition: background 0.15s ease;
}
.gvf-dr-menu button span {
  display: grid;
  color: var(--host-muted);
}
.gvf-dr-menu button:hover,
.gvf-dr-menu button:focus-visible,
.gvf-dr-menu button.hot {
  background: var(--host-input);
  outline: none;
}
.gvf-dr-menu button.hot span {
  color: var(--gv-brand);
}

/* Thinking stream */
.gvf-dr-thinking {
  display: grid;
  gap: 10px;
  padding: 14px 16px 16px;
}
.gvf-dr-phase,
.gvf-dr-item,
.gvf-dr-sites {
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 0.35s ease,
    transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.gvf-dr-thinking .in {
  opacity: 1;
  transform: none;
}
.gvf-dr-phase {
  display: flex;
  align-items: center;
  gap: 10px;
}
.gvf-dr-num {
  flex: none;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 99px;
  background: var(--host-input);
  color: var(--host-muted);
  font-size: 10.5px;
  font-weight: 600;
}
.gvf-dr-strong {
  height: 8px;
  background: color-mix(in srgb, var(--host-text) 30%, transparent);
}
.gvf-dr-item {
  display: grid;
  gap: 7px;
  padding-inline-start: 28px;
}
.gvf-dr-sites {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-inline-start: 28px;
}
.gvf-dr-site {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px 3px 4px;
  border-radius: 99px;
  background: var(--host-input);
  color: var(--host-muted);
  font-size: 11.5px;
  line-height: 1.3;
}
.gvf-dr-site b {
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--host-bg);
  color: var(--host-text);
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
}

/* Downloaded file */
.gvf-dr-file {
  justify-self: end;
  width: min(360px, 100%);
  border: 1px solid var(--gv-border);
  border-radius: 12px;
  background: var(--gv-surface);
  color: var(--gv-text);
  box-shadow: 0 14px 34px -16px oklch(0 0 0 / 0.35);
}
.gvf-dr-file-enter-active {
  transition:
    opacity 0.3s ease,
    transform 0.45s cubic-bezier(0.2, 0.9, 0.25, 1.1);
}
.gvf-dr-file-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.97);
}
.gvf-dr-file-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-block: 7px;
  padding-inline: 12px 10px;
  border-bottom: 1px solid var(--gv-border);
}
.gvf-dr-file-ic,
.gvf-dr-file-ok {
  display: grid;
  color: var(--gv-brand);
}
.gvf-dr-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font:
    500 11.5px/1.4 ui-monospace,
    'SF Mono',
    Menlo,
    monospace;
}
.gvf-dr-md {
  display: grid;
  gap: 2px;
  padding: 10px 14px 12px;
  text-align: left;
}
.gvf-dr-md p {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font:
    500 11px/1.55 ui-monospace,
    'SF Mono',
    Menlo,
    monospace;
}
.gvf-dr-md-h1 {
  font-weight: 700 !important;
}
.gvf-dr-md p i {
  flex: none;
  height: 5px;
  background: color-mix(in srgb, var(--gv-text) 18%, transparent);
}
.gvf-dr-md em {
  font-style: normal;
  color: var(--gv-brand);
}
.gvf-dr-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gvf-dr-md u {
  text-decoration: none;
  color: var(--gvf-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}
.gvf-dr-md .gvf-dr-muted {
  color: var(--gvf-muted);
  gap: 0;
}
.gvf-dr-report {
  display: grid;
  gap: 6px;
  padding: 12px 16px 14px;
}
.gvf-dr-report p {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 2px;
}
.gvf-dr-report i {
  height: 6px;
  background: color-mix(in srgb, var(--gv-text) 16%, transparent);
}
.gvf-dr-report .gvf-dr-h1 {
  width: 58%;
  height: 9px;
  margin-bottom: 4px;
  background: color-mix(in srgb, var(--gv-text) 40%, transparent);
}
.gvf-dr-report sup {
  margin-top: -4px;
  font-size: 9px;
  font-weight: 600;
  color: var(--gv-brand);
}
.gvf-dr-report ol {
  margin: 6px 0 0;
  padding: 8px 0 0;
  list-style: none;
  border-top: 1px solid var(--gv-border);
  display: grid;
  gap: 3px;
}
.gvf-dr-report li {
  display: flex;
  align-items: center;
  gap: 8px;
  font:
    500 11px/1.5 ui-monospace,
    'SF Mono',
    Menlo,
    monospace;
  color: var(--gvf-muted);
  direction: ltr;
  text-align: left;
}
.gvf-dr-report li b {
  color: var(--gv-brand);
}
</style>
