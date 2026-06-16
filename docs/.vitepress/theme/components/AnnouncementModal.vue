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
    title: 'Gemini 侧边栏改版提示',
    intro:
      'Gemini 近期调整了侧边栏结构，部分版本的 Voyager 可能暂时看不到文件夹入口。这不是卡住，文件夹数据通常还在。',
    affected: [
      '不要清除浏览器数据，也不要为了恢复文件夹而重装扩展。',
      '修复已合入，将随下一版发布；更新后刷新 Gemini 页面即可恢复。',
      '新用户安装前看到这条提示：如果遇到文件夹入口不显示，请先更新到最新版。',
    ],
    outro: `如更新后仍异常，欢迎在 ${a('GitHub 上提 issue')} 反馈，我会继续跟进。`,
    dismiss: '知道了',
  },
  'zh-TW': {
    title: 'Gemini 側邊欄改版提醒',
    intro:
      'Gemini 近期調整了側邊欄結構，部分版本的 Voyager 可能暫時看不到資料夾入口。這不是卡住，資料夾資料通常還在。',
    affected: [
      '不要清除瀏覽器資料，也不要為了恢復資料夾而重裝擴充功能。',
      '修復已合併，將隨下一版發布；更新後重新整理 Gemini 頁面即可恢復。',
      '新使用者安裝前看到這則提醒：如果資料夾入口沒有顯示，請先更新到最新版。',
    ],
    outro: `如更新後仍異常，歡迎在 ${a('GitHub 上提 issue')} 回饋，我會繼續跟進。`,
    dismiss: '我知道了',
  },
  'en-US': {
    title: 'Gemini sidebar update notice',
    intro:
      'Gemini recently changed its sidebar structure. Some Voyager versions may temporarily hide the folder entry; this is not a freeze, and your folder data is usually still there.',
    affected: [
      'Do not clear browser data or reinstall the extension just to recover folders.',
      'A fix has landed and will ship in the next release; update Voyager and refresh Gemini.',
      'New users seeing this before install: if folders do not show up, update to the latest version first.',
    ],
    outro: `If the problem remains after updating, please open a ${a('GitHub issue')} and I will keep following it.`,
    dismiss: 'Got it',
  },
  'ja-JP': {
    title: 'Gemini サイドバー変更のお知らせ',
    intro:
      'Gemini のサイドバー構造が最近変更され、一部の Voyager バージョンではフォルダ入口が一時的に表示されない場合があります。フリーズではなく、フォルダデータは通常そのまま残っています。',
    affected: [
      'フォルダ復旧のためにブラウザデータを削除したり、拡張機能を再インストールしたりしないでください。',
      '修正はすでに取り込まれており、次のリリースで配信されます。更新後に Gemini ページを再読み込みしてください。',
      'インストール前にこの通知を見た新規ユーザーは、フォルダが表示されない場合、まず最新版へ更新してください。',
    ],
    outro: `更新後も問題が残る場合は、${a('GitHub で issue')} を作成してください。引き続き対応します。`,
    dismiss: '了解',
  },
  'ko-KR': {
    title: 'Gemini 사이드바 변경 안내',
    intro:
      'Gemini가 최근 사이드바 구조를 변경하여 일부 Voyager 버전에서 폴더 진입점이 일시적으로 보이지 않을 수 있습니다. 멈춘 것이 아니며 폴더 데이터는 보통 그대로 남아 있습니다.',
    affected: [
      '폴더를 복구하려고 브라우저 데이터를 지우거나 확장 프로그램을 다시 설치하지 마세요.',
      '수정은 이미 병합되었고 다음 버전에 포함됩니다. 업데이트 후 Gemini 페이지를 새로고침하세요.',
      '설치 전 이 안내를 보는 신규 사용자는 폴더가 보이지 않으면 먼저 최신 버전으로 업데이트하세요.',
    ],
    outro: `업데이트 후에도 문제가 계속되면 ${a('GitHub issue')}로 알려주세요. 계속 확인하겠습니다.`,
    dismiss: '확인',
  },
  'fr-FR': {
    title: 'Avis sur le changement de barre latérale Gemini',
    intro:
      "Gemini a récemment modifié la structure de sa barre latérale. Certaines versions de Voyager peuvent temporairement masquer l'entrée des dossiers ; ce n'est pas un blocage et vos données de dossiers sont normalement toujours là.",
    affected: [
      "Ne supprimez pas les données du navigateur et ne réinstallez pas l'extension juste pour récupérer les dossiers.",
      'Le correctif est déjà fusionné et sera publié dans la prochaine version ; mettez Voyager à jour puis rechargez Gemini.',
      "Nouveaux utilisateurs : si les dossiers n'apparaissent pas après l'installation, mettez d'abord Voyager à jour.",
    ],
    outro: `Si le problème persiste après la mise à jour, ouvrez une ${a('issue GitHub')} et je continuerai à suivre le sujet.`,
    dismiss: 'Compris',
  },
  'es-ES': {
    title: 'Aviso sobre la barra lateral de Gemini',
    intro:
      'Gemini cambió recientemente la estructura de su barra lateral. Algunas versiones de Voyager pueden ocultar temporalmente la entrada de carpetas; no está bloqueado y tus datos de carpetas normalmente siguen ahí.',
    affected: [
      'No borres los datos del navegador ni reinstales la extensión solo para recuperar las carpetas.',
      'La corrección ya se fusionó y llegará en la próxima versión; actualiza Voyager y recarga Gemini.',
      'Usuarios nuevos: si las carpetas no aparecen después de instalar, primero actualiza a la versión más reciente.',
    ],
    outro: `Si el problema continúa después de actualizar, abre un ${a('issue en GitHub')} y seguiré revisándolo.`,
    dismiss: 'Entendido',
  },
  'pt-PT': {
    title: 'Aviso sobre a barra lateral do Gemini',
    intro:
      'O Gemini alterou recentemente a estrutura da barra lateral. Algumas versões do Voyager podem ocultar temporariamente a entrada das pastas; não está bloqueado e os dados das pastas normalmente continuam lá.',
    affected: [
      'Não apague os dados do navegador nem reinstale a extensão apenas para recuperar as pastas.',
      'A correção já foi integrada e chegará na próxima versão; atualize o Voyager e recarregue o Gemini.',
      'Novos utilizadores: se as pastas não aparecerem após a instalação, atualize primeiro para a versão mais recente.',
    ],
    outro: `Se o problema continuar após atualizar, abra uma ${a('issue no GitHub')} e continuarei a acompanhar.`,
    dismiss: 'Entendi',
  },
  'ar-SA': {
    title: 'تنبيه حول تغيير الشريط الجانبي في Gemini',
    intro:
      'غيّر Gemini مؤخراً بنية الشريط الجانبي. قد تخفي بعض إصدارات Voyager مدخل المجلدات مؤقتاً؛ هذا ليس تجمداً، وبيانات المجلدات عادةً ما تزال موجودة.',
    affected: [
      'لا تمسح بيانات المتصفح ولا تعِد تثبيت الإضافة فقط لاستعادة المجلدات.',
      'تم دمج الإصلاح وسيصدر مع النسخة القادمة؛ حدّث Voyager ثم أعد تحميل صفحة Gemini.',
      'للمستخدمين الجدد: إذا لم تظهر المجلدات بعد التثبيت، فحدّث أولاً إلى أحدث إصدار.',
    ],
    outro: `إذا استمرت المشكلة بعد التحديث، فالرجاء فتح ${a('issue على GitHub')} وسأتابعها.`,
    dismiss: 'فهمت',
  },
  'ru-RU': {
    title: 'Уведомление об изменении боковой панели Gemini',
    intro:
      'Gemini недавно изменил структуру боковой панели. В некоторых версиях Voyager вход в папки может временно не отображаться; это не зависание, и данные папок обычно остаются на месте.',
    affected: [
      'Не очищайте данные браузера и не переустанавливайте расширение только ради восстановления папок.',
      'Исправление уже объединено и выйдет в следующем релизе; обновите Voyager и перезагрузите Gemini.',
      'Новым пользователям: если папки не отображаются после установки, сначала обновитесь до последней версии.',
    ],
    outro: `Если проблема останется после обновления, откройте ${a('issue на GitHub')}, и я продолжу разбираться.`,
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
            <span class="gv-announce-date">2026-06-16</span>
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
  transition:
    background 0.2s ease,
    color 0.2s ease;
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
  transition:
    background 0.2s ease,
    transform 0.15s ease;
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
  transition:
    transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.22s ease;
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
