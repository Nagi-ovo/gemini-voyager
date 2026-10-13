import type { PluginManifest } from '../types';

/** Fixed-id saved highlights and annotation UI, controlled by the existing opt-in setting. */
export const GEMINI_HIGHLIGHT_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-highlight',
  name: 'Gemini · Enable highlights',
  version: '1.0.0',
  description:
    'Highlight selected response text, choose a color, and remember the last color you used.',
  i18n: {
    zh: {
      name: 'Gemini · 启用高亮',
      description: '高亮选中的回答文本、选择颜色，并记住你上次使用的颜色。',
    },
    zh_TW: {
      name: 'Gemini · 啟用醒目標記',
      description: '標記選取的回答文字、選擇顏色，並記住上次使用的顏色。',
    },
    ja: {
      name: 'Gemini · ハイライトを有効化',
      description: '選択した回答テキストをハイライトし、色を選んで最後に使った色を記憶します。',
    },
    ko: {
      name: 'Gemini · 하이라이트 활성화',
      description:
        '선택한 답변 텍스트를 강조하고 색상을 선택하며 마지막으로 사용한 색상을 기억합니다.',
    },
    fr: {
      name: 'Gemini · Activer les surlignages',
      description:
        'Surligne le texte sélectionné, permet de choisir une couleur et mémorise la dernière utilisée.',
    },
    es: {
      name: 'Gemini · Activar resaltados',
      description:
        'Resalta el texto seleccionado, permite elegir un color y recuerda el último usado.',
    },
    pt: {
      name: 'Gemini · Ativar destaques',
      description: 'Destaca o texto selecionado, permite escolher uma cor e lembra a última usada.',
    },
    ru: {
      name: 'Gemini · Включить выделения',
      description:
        'Выделяет выбранный текст ответа, позволяет выбрать цвет и запоминает последний использованный.',
    },
    ar: {
      name: 'Gemini · تمكين التمييز',
      description: 'يميز نص الإجابة المحدد ويتيح اختيار لون ويتذكر آخر لون استخدمته.',
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
