import type { PluginManifest } from '../types';

/** The fixed-id prevention flag, controlled by the existing opt-in setting; its bridge stays in core. */
export const GEMINI_PREVENT_AUTO_SCROLL_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-prevent-auto-scroll',
  name: 'Gemini · Prevent auto-scroll to bottom',
  version: '1.0.0',
  description:
    'Keeps your place while reading earlier turns. Gemini can still jump to the latest message right after you open or switch chats.',
  i18n: {
    zh: {
      name: 'Gemini · 防自动跳转',
      description: '阅读较早内容时保持当前位置；打开或切换对话后仍允许短暂跳到最新消息',
    },
    zh_TW: {
      name: 'Gemini · 防自動跳轉',
      description: '閱讀較早內容時保持目前位置；開啟或切換對話後仍允許短暫跳到最新訊息',
    },
    ja: {
      name: 'Gemini · 自動スクロール防止',
      description:
        '過去の回答を読んでいるときに現在位置を保ちます。チャットを開く・切り替えた直後だけ、最新メッセージへのジャンプを許可します。',
    },
    ko: {
      name: 'Gemini · 자동 스크롤 방지',
      description:
        '이전 응답을 읽는 동안 현재 위치를 유지합니다. 채팅을 열거나 전환한 직후에는 최신 메시지로 이동할 수 있습니다.',
    },
    fr: {
      name: 'Gemini · Empêcher le défilement auto',
      description:
        "Conserve votre place pendant la lecture des tours précédents. Gemini peut encore aller au dernier message juste après l'ouverture ou le changement de chat.",
    },
    es: {
      name: 'Gemini · Evitar desplazamiento automático',
      description:
        'Mantiene tu posición al leer turnos anteriores. Gemini aún puede saltar al último mensaje justo después de abrir o cambiar de chat.',
    },
    pt: {
      name: 'Gemini · Prevenir rolamento automático',
      description:
        'Mantém a sua posição ao ler turnos anteriores. O Gemini ainda pode saltar para a mensagem mais recente logo após abrir ou mudar de chat.',
    },
    ru: {
      name: 'Gemini · Предотвращение автопрокрутки',
      description:
        'Сохраняет позицию при чтении более ранних ответов. Сразу после открытия или смены чата Gemini всё ещё может перейти к последнему сообщению.',
    },
    ar: {
      name: 'Gemini · منع التمرير التلقائي',
      description:
        'يحافظ على موضعك أثناء قراءة الردود السابقة. لا يزال بإمكان Gemini الانتقال إلى أحدث رسالة مباشرة بعد فتح المحادثة أو التبديل إليها.',
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  contributes: {},
};
