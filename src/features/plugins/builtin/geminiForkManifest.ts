import type { PluginManifest } from '../types';

/** Gemini-only fixed-id runtime; the existing fork switch remains its sole authority. */
export const GEMINI_FORK_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-fork',
  name: 'Gemini · Conversation forks',
  version: '1.0.0',
  description: 'Show Fork button and branch indicators in Gemini conversations',
  i18n: {
    zh: {
      name: 'Gemini · 对话分叉',
      description: '在 Gemini 对话中显示 Fork 按钮和分支序号',
    },
    zh_TW: {
      name: 'Gemini · 對話分叉',
      description: '在 Gemini 對話中顯示 Fork 按鈕與分支序號',
    },
    ja: {
      name: 'Gemini · 会話の分岐',
      description: 'Gemini の会話で Fork ボタンと分岐番号を表示します',
    },
    ko: {
      name: 'Gemini · 대화 분기',
      description: 'Gemini 대화에 Fork 버튼과 분기 번호를 표시합니다',
    },
    fr: {
      name: 'Gemini · Forks de conversation',
      description:
        'Afficher le bouton Fork et les indicateurs de branche dans les conversations Gemini',
    },
    es: {
      name: 'Gemini · Bifurcaciones de conversación',
      description: 'Mostrar el botón Fork y los indicadores de rama en conversaciones de Gemini',
    },
    pt: {
      name: 'Gemini · Ramificações de conversa',
      description: 'Mostrar botão Fork e indicadores de ramificação nas conversas do Gemini',
    },
    ru: {
      name: 'Gemini · Ветки диалогов',
      description: 'Показывать кнопку Fork и индикаторы веток в диалогах Gemini',
    },
    ar: {
      name: 'Gemini · تفريعات المحادثات',
      description: 'إظهار زر Fork ومؤشرات الفروع داخل محادثات Gemini',
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
