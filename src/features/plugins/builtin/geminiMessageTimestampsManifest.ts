import type { PluginManifest } from '../types';

/** Packaged-only owner; gvShowMessageTimestamps remains the opt-in switch. */
export const GEMINI_MESSAGE_TIMESTAMPS_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-message-timestamps',
  name: 'Message timestamps',
  version: '1.0.0',
  description: 'Show timestamps above your Gemini messages, even with the timeline hidden.',
  i18n: {
    zh: {
      name: '消息时间戳',
      description: '在你发送的 Gemini 消息上方显示时间，隐藏时间线后仍可使用。',
    },
    zh_TW: {
      name: '訊息時間戳記',
      description: '在你傳送的 Gemini 訊息上方顯示時間，隱藏時間軸後仍可使用。',
    },
    ja: {
      name: 'メッセージのタイムスタンプ',
      description:
        'Gemini に送信したメッセージの上に時刻を表示します。タイムラインを非表示にしても使えます。',
    },
    ko: {
      name: '메시지 타임스탬프',
      description:
        'Gemini에 보낸 메시지 위에 시간을 표시합니다. 타임라인을 숨겨도 사용할 수 있습니다.',
    },
    fr: {
      name: 'Horodatage des messages',
      description:
        'Affiche la date et l’heure au-dessus de vos messages Gemini, même si la chronologie est masquée.',
    },
    es: {
      name: 'Marcas de tiempo de mensajes',
      description:
        'Muestra la fecha y hora sobre tus mensajes de Gemini, incluso con la línea de tiempo oculta.',
    },
    pt: {
      name: 'Data e hora das mensagens',
      description:
        'Mostra a data e a hora acima das suas mensagens do Gemini, mesmo com a linha do tempo oculta.',
    },
    ru: {
      name: 'Время сообщений',
      description:
        'Показывает дату и время над вашими сообщениями в Gemini, даже если временная шкала скрыта.',
    },
    ar: {
      name: 'الطوابع الزمنية للرسائل',
      description: 'يعرض التاريخ والوقت فوق رسائلك في Gemini، حتى عند إخفاء المخطط الزمني.',
    },
  },
  author: 'voyager-official',
  category: 'readability',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  contributes: {},
};
