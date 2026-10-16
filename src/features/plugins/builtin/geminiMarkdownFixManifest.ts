import type { PluginManifest } from '../types';

/** Packaged-only repair; the sync binding preserves the previously always-on default. */
export const GEMINI_MARKDOWN_FIX_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-markdown-fix',
  name: 'Markdown rendering fix',
  version: '1.0.0',
  description:
    'Fix broken bold formatting in Gemini. Already-fixed content stays fixed when disabled.',
  i18n: {
    zh: {
      name: 'Markdown 渲染修复',
      description: '修复 Gemini 中显示异常的粗体。关闭后，已修复的内容保持不变。',
    },
    zh_TW: {
      name: 'Markdown 算繪修復',
      description: '修復 Gemini 中顯示異常的粗體。關閉後，已修復的內容維持不變。',
    },
    ja: {
      name: 'Markdown 表示の修正',
      description:
        'Gemini で正しく表示されない太字を修正します。オフにしても修正済みの内容はそのまま残ります。',
    },
    ko: {
      name: 'Markdown 렌더링 수정',
      description:
        'Gemini에서 잘못 표시되는 굵은 글씨를 수정합니다. 꺼도 이미 수정된 내용은 유지됩니다.',
    },
    fr: {
      name: 'Correction du rendu Markdown',
      description:
        'Corrige le texte en gras mal affiché dans Gemini. Les corrections déjà appliquées restent après désactivation.',
    },
    es: {
      name: 'Corrección del formato Markdown',
      description:
        'Corrige la negrita que se muestra mal en Gemini. Al desactivar, se conservan las correcciones ya aplicadas.',
    },
    pt: {
      name: 'Correção da renderização Markdown',
      description:
        'Corrige o negrito exibido incorretamente no Gemini. As correções já aplicadas permanecem após a desativação.',
    },
    ru: {
      name: 'Исправление отображения Markdown',
      description:
        'Исправляет неверное отображение жирного текста в Gemini. При отключении уже внесённые исправления сохраняются.',
    },
    ar: {
      name: 'إصلاح عرض Markdown',
      description: 'يصلح عرض النص العريض في Gemini. تبقى التصحيحات المطبّقة عند إيقافه.',
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
