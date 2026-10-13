import type { PluginManifest } from '../types';

/** The fixed-id Quote action, controlled by the existing quote-reply setting; no public primitive. */
export const GEMINI_QUOTE_REPLY_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-quote-reply',
  name: 'Gemini · Quote Reply',
  version: '1.0.0',
  description:
    'Show a floating button to quote selected text when text is selected in conversations',
  i18n: {
    zh: {
      name: 'Gemini · 引用回复',
      description: '在对话中选中文字时显示悬浮按钮，用于引用所选内容',
    },
    zh_TW: {
      name: 'Gemini · 引用回覆',
      description: '在對話中選取文字時顯示懸浮按鈕，用於引用所選內容',
    },
    ja: {
      name: 'Gemini · 引用返信',
      description:
        '会話でテキストを選択したときに、選択したテキストを引用するフローティングボタンを表示します',
    },
    ko: {
      name: 'Gemini · 인용 답장',
      description:
        '대화에서 텍스트를 선택할 때 선택한 텍스트를 인용할 수 있는 플로팅 버튼을 표시합니다',
    },
    fr: {
      name: 'Gemini · Citer et répondre',
      description:
        'Affiche un bouton flottant pour citer le texte sélectionné dans les conversations',
    },
    es: {
      name: 'Gemini · Responder cita',
      description:
        'Muestra un botón flotante para citar el texto seleccionado en las conversaciones',
    },
    pt: {
      name: 'Gemini · Responder Citação',
      description: 'Mostra um botão flutuante para citar o texto selecionado em conversas',
    },
    ru: {
      name: 'Gemini · Цитировать',
      description:
        'Показывать плавающую кнопку для цитирования выделенного текста при выделении текста в разговорах',
    },
    ar: {
      name: 'Gemini · رد باقتباس',
      description: 'إظهار زر عائم لاقتباس النص المحدد عند تحديد نص في المحادثات',
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
