import type { PluginManifest } from '../types';

/** The fixed-id Gemini rail follows its native settings/data policy; no catalog turnNavigator. */
export const GEMINI_TIMELINE_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-timeline',
  name: 'Gemini · Show Timeline',
  description: 'Turning this off keeps saved items. Message timestamps follow their own setting.',
  version: '1.0.0',
  i18n: {
    zh: {
      name: 'Gemini · 显示时间线',
      description: '关闭后保留收藏内容，消息时间仍由「消息时间戳」单独控制。',
    },
    zh_TW: {
      name: 'Gemini · 顯示時間軸',
      description: '關閉後保留收藏內容，訊息時間仍由「訊息時間戳記」單獨控制。',
    },
    ja: {
      name: 'Gemini · タイムラインを表示',
      description:
        'オフにしても保存済みの項目は保持されます。メッセージの時刻は専用の設定で表示・非表示を切り替えます。',
    },
    ko: {
      name: 'Gemini · 타임라인 표시',
      description:
        '꺼도 저장된 항목은 유지됩니다. 메시지 시간은 별도 설정으로 표시 여부를 제어합니다.',
    },
    fr: {
      name: 'Gemini · Afficher la chronologie',
      description:
        'Désactiver cette option conserve les éléments enregistrés. Les horodatages des messages suivent leur propre réglage.',
    },
    es: {
      name: 'Gemini · Mostrar línea de tiempo',
      description:
        'Al desactivarla se conservan los elementos guardados. Las marcas de tiempo de los mensajes dependen de su propio ajuste.',
    },
    pt: {
      name: 'Gemini · Mostrar linha do tempo',
      description:
        'Ao desativar, os itens salvos são mantidos. Os horários das mensagens seguem sua própria configuração.',
    },
    ru: {
      name: 'Gemini · Показывать таймлайн',
      description:
        'При отключении сохранённые элементы остаются. Временные метки сообщений управляются отдельной настройкой.',
    },
    ar: {
      name: 'Gemini · إظهار الجدول الزمني',
      description:
        'عند إيقافه، تبقى العناصر المحفوظة. تتحكم إعدادات مستقلة في عرض طوابع وقت الرسائل.',
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  requires: { formFactors: ['desktop', 'mobile'] },
  contributes: {},
};
