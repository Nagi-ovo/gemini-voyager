<script setup lang="ts">
import { useData } from 'vitepress';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

import { ENABLED, useAnnouncement } from '../composables/announcement';

const { lang } = useData();
const { visible, open, dismiss, hasDismissed } = useAnnouncement();
const dismissBtn = ref<HTMLButtonElement | null>(null);

interface Copy {
  title: string;
  intro: string;
  affected: string[];
  outro: string;
  dismiss: string;
}

const ISSUE_URL = 'https://github.com/Nagi-ovo/gemini-voyager/issues/new';
const a = (text: string) => `<a href="${ISSUE_URL}" target="_blank" rel="noopener">${text}</a>`;

const i18n: Record<string, Copy> = {
  'zh-CN': {
    title: 'Gemini 网页版改版适配中',
    intro: 'Gemini 网页版近期进行了较大改版，我正在适配中。当前可能受影响的功能：',
    affected: ['自动选择默认模型', '文件夹 UI'],
    outro: `整体使用应无大碍。如遇其他异常，欢迎在 ${a('GitHub 上提 issue')} 反馈，我会尽快修复。请耐心等待 Chrome Web Store 更新。`,
    dismiss: '知道了',
  },
  'zh-TW': {
    title: 'Gemini 網頁版改版適配中',
    intro: 'Gemini 網頁版近期進行了較大改版，我正在適配中。當前可能受影響的功能：',
    affected: ['自動選擇預設模型', '資料夾 UI'],
    outro: `整體使用應無大礙。如遇其他異常，歡迎在 ${a('GitHub 上提 issue')} 回饋，我會盡快修復。請耐心等待 Chrome Web Store 更新。`,
    dismiss: '我知道了',
  },
  'en-US': {
    title: 'Adapting to the new Gemini web UI',
    intro:
      "Gemini's web UI just went through a major redesign and I'm adapting. Features that may be affected:",
    affected: ['Default Model auto-selection', 'Folder UI'],
    outro: `Day-to-day usage should still be fine. If you spot other anomalies, please open a ${a('GitHub issue')} and I'll fix it as soon as I can. Please wait for the Chrome Web Store update.`,
    dismiss: 'Got it',
  },
  'ja-JP': {
    title: 'Gemini ウェブ版リニューアル対応中',
    intro: 'Gemini ウェブ版が大幅にリニューアルされたため、現在対応中です。影響を受ける可能性のある機能：',
    affected: ['デフォルトモデルの自動選択', 'フォルダ UI'],
    outro: `全体的な使用には支障はないはずです。その他の不具合を見つけた場合は、${a('GitHub で issue')} を立ててお知らせください。早急に修正します。Chrome Web Store の更新をお待ちください。`,
    dismiss: '了解',
  },
  'ko-KR': {
    title: 'Gemini 웹 UI 개편 적응 중',
    intro: 'Gemini 웹 버전이 최근 대규모로 개편되어 적응 중입니다. 영향을 받을 수 있는 기능:',
    affected: ['기본 모델 자동 선택', '폴더 UI'],
    outro: `전반적인 사용에는 큰 문제가 없을 것입니다. 다른 이상이 발견되면 ${a('GitHub issue')}로 알려주세요. 최대한 빨리 수정하겠습니다. Chrome Web Store 업데이트를 기다려 주세요.`,
    dismiss: '확인',
  },
  'fr-FR': {
    title: 'Adaptation à la nouvelle interface Gemini',
    intro:
      "L'interface web de Gemini vient de subir une refonte majeure et je suis en train de m'adapter. Fonctionnalités potentiellement affectées :",
    affected: ['Sélection automatique du modèle par défaut', 'Interface des dossiers'],
    outro: `L'utilisation globale devrait rester correcte. Si vous rencontrez d'autres anomalies, ouvrez une ${a('issue GitHub')} et je corrigerai au plus vite. Patientez le temps de la mise à jour sur le Chrome Web Store.`,
    dismiss: 'Compris',
  },
  'es-ES': {
    title: 'Adaptándome al nuevo Gemini web',
    intro:
      'La interfaz web de Gemini ha sido rediseñada recientemente y me estoy adaptando. Funciones que pueden verse afectadas:',
    affected: ['Selección automática del modelo predeterminado', 'Interfaz de carpetas'],
    outro: `El uso general debería estar bien. Si detectas otras anomalías, abre un ${a('issue en GitHub')} y lo arreglaré lo antes posible. Espera la actualización en la Chrome Web Store.`,
    dismiss: 'Entendido',
  },
  'pt-PT': {
    title: 'A adaptar-me ao novo Gemini web',
    intro:
      'A interface web do Gemini passou por uma grande reformulação e estou a adaptar-me. Funcionalidades potencialmente afetadas:',
    affected: ['Seleção automática do modelo padrão', 'Interface de pastas'],
    outro: `O uso geral deve permanecer estável. Se encontrar outras anomalias, abra uma ${a('issue no GitHub')} e corrigirei o quanto antes. Aguarde a atualização na Chrome Web Store.`,
    dismiss: 'Entendi',
  },
  'ar-SA': {
    title: 'التكيف مع واجهة Gemini الجديدة',
    intro: 'خضعت واجهة Gemini على الويب مؤخراً لتغيير كبير، وأنا أعمل على التكيف. الميزات التي قد تتأثر:',
    affected: ['الاختيار التلقائي للنموذج الافتراضي', 'واجهة المجلدات'],
    outro: `الاستخدام العام يجب أن يبقى دون مشاكل كبيرة. إذا واجهت أي مشكلات أخرى، الرجاء فتح ${a('issue على GitHub')} وسأقوم بإصلاحها في أقرب وقت. يُرجى انتظار تحديث Chrome Web Store.`,
    dismiss: 'فهمت',
  },
  'ru-RU': {
    title: 'Адаптация к обновлённому Gemini',
    intro:
      'Веб-интерфейс Gemini недавно был значительно переработан, и я адаптируюсь. Функции, на которые это может повлиять:',
    affected: ['Автоматический выбор модели по умолчанию', 'Интерфейс папок'],
    outro: `В целом использование не должно сильно пострадать. Если вы заметите другие отклонения, откройте ${a('issue на GitHub')}, и я постараюсь исправить как можно скорее. Дождитесь обновления в Chrome Web Store.`,
    dismiss: 'Понятно',
  },
};

const t = computed<Copy>(() => i18n[lang.value] || i18n['en-US']);
const isRTL = computed(() => lang.value === 'ar-SA');

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) dismiss();
}

function maybeOpenFromHash() {
  if (typeof location === 'undefined') return;
  if (location.hash === '#announcement') {
    open();
    // Clear the hash so it doesn't linger in the URL and so consecutive
    // clicks on the same nav entry still re-fire hashchange.
    history.replaceState(null, '', location.pathname + location.search);
  }
}

onMounted(() => {
  if (!ENABLED) return;
  if (!hasDismissed()) visible.value = true;
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', maybeOpenFromHash);
  maybeOpenFromHash();
  if (visible.value) nextTick(() => dismissBtn.value?.focus());
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('hashchange', maybeOpenFromHash);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="gv-announce">
      <div
        v-if="visible"
        class="gv-announce-backdrop"
        :dir="isRTL ? 'rtl' : 'ltr'"
        @click.self="dismiss"
      >
        <div class="gv-announce-card" role="dialog" aria-modal="true" :aria-label="t.title">
          <button class="gv-announce-close" :aria-label="t.dismiss" @click="dismiss">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                fill="none"
              />
            </svg>
          </button>
          <h3 class="gv-announce-title">
            <span class="gv-announce-badge" aria-hidden="true">⚠️</span>
            {{ t.title }}
          </h3>
          <p class="gv-announce-text">{{ t.intro }}</p>
          <ul class="gv-announce-list">
            <li v-for="item in t.affected" :key="item">{{ item }}</li>
          </ul>
          <p class="gv-announce-text" v-html="t.outro"></p>
          <div class="gv-announce-footer">
            <span class="gv-announce-date">2026-05-19</span>
            <button ref="dismissBtn" class="gv-announce-btn" @click="dismiss">
              {{ t.dismiss }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.gv-announce-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.gv-announce-card {
  position: relative;
  max-width: 480px;
  width: 100%;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  padding: 28px 28px 22px;
  box-shadow: 0 25px 60px -10px rgba(0, 0, 0, 0.35);
  color: var(--vp-c-text-1);
}

.gv-announce-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

[dir='rtl'] .gv-announce-close {
  right: auto;
  left: 12px;
}

.gv-announce-close:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.gv-announce-title {
  margin: 0 0 14px;
  font-size: 1.1em;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.4;
}

.gv-announce-badge {
  font-size: 1.05em;
  line-height: 1;
}

.gv-announce-text {
  margin: 0 0 12px;
  font-size: 0.94em;
  line-height: 1.65;
  color: var(--vp-c-text-1);
}

.gv-announce-text :deep(a) {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;
}

.gv-announce-text :deep(a:hover) {
  color: var(--vp-c-brand-2);
}

.gv-announce-list {
  margin: 0 0 14px;
  padding-inline-start: 1.3em;
  font-size: 0.94em;
  line-height: 1.7;
  color: var(--vp-c-text-1);
}

.gv-announce-list li {
  margin: 0 0 2px;
}

.gv-announce-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
}

.gv-announce-date {
  font-size: 0.82em;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}

.gv-announce-btn {
  appearance: none;
  border: none;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  padding: 9px 20px;
  border-radius: 10px;
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;
}

.gv-announce-btn:hover {
  background: var(--vp-c-brand-2);
  transform: translateY(-1px);
}

.gv-announce-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.gv-announce-enter-active,
.gv-announce-leave-active {
  transition: opacity 0.22s ease;
}

.gv-announce-enter-active .gv-announce-card,
.gv-announce-leave-active .gv-announce-card {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease;
}

.gv-announce-enter-from,
.gv-announce-leave-to {
  opacity: 0;
}

.gv-announce-enter-from .gv-announce-card,
.gv-announce-leave-to .gv-announce-card {
  opacity: 0;
  transform: translateY(20px) scale(0.96);
}

@media (max-width: 480px) {
  .gv-announce-card {
    padding: 24px 22px 20px;
    border-radius: 12px;
  }
  .gv-announce-footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .gv-announce-btn {
    width: 100%;
  }
  .gv-announce-date {
    text-align: center;
  }
}
</style>
