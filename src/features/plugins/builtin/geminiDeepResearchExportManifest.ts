import type { PluginManifest } from '../types';

/** Fixed-id menu affordance; accepted exports keep their independent native lifetime. */
export const GEMINI_DEEP_RESEARCH_EXPORT_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-deep-research-export',
  name: 'Gemini · Deep Research export',
  version: '1.0.0',
  description: 'Add Markdown and image export options to the Deep Research report menu.',
  i18n: {
    zh: {
      name: 'Gemini · Deep Research 导出',
      description: '在 Deep Research 报告菜单中添加 Markdown 和图片导出选项。',
    },
    zh_TW: {
      name: 'Gemini · Deep Research 匯出',
      description: '在 Deep Research 報告選單中加入 Markdown 和圖片匯出選項。',
    },
    ja: {
      name: 'Gemini · Deep Research のエクスポート',
      description:
        'Deep Research のレポートメニューに、Markdown と画像のエクスポート項目を追加します。',
    },
    ko: {
      name: 'Gemini · Deep Research 내보내기',
      description: 'Deep Research 보고서 메뉴에 Markdown 및 이미지 내보내기 옵션을 추가합니다.',
    },
    fr: {
      name: 'Gemini · Export Deep Research',
      description:
        'Ajoutez au menu du rapport Deep Research des options d’export en Markdown et en image.',
    },
    es: {
      name: 'Gemini · Exportar Deep Research',
      description:
        'Añade opciones para exportar en Markdown o como imagen al menú del informe de Deep Research.',
    },
    pt: {
      name: 'Gemini · Exportar Deep Research',
      description:
        'Adicione opções de exportação em Markdown e imagem ao menu do relatório do Deep Research.',
    },
    ru: {
      name: 'Gemini · Экспорт Deep Research',
      description: 'Добавляет в меню отчёта Deep Research экспорт в Markdown и в виде изображения.',
    },
    ar: {
      name: 'Gemini · تصدير Deep Research',
      description: 'أضف خيارات التصدير بصيغة Markdown أو كصورة إلى قائمة تقرير Deep Research.',
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
