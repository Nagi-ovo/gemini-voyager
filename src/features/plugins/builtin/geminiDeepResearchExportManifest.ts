import type { PluginManifest } from '../types';

/** Fixed-id menu affordance; accepted exports keep their independent native lifetime. */
export const GEMINI_DEEP_RESEARCH_EXPORT_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-deep-research-export',
  name: 'Gemini · Deep Research export',
  version: '1.0.0',
  description:
    'Add “Save Report” (PDF, image, Markdown, JSON) and “Download thinking content” to the Deep Research report menu.',
  i18n: {
    zh: {
      name: 'Gemini · Deep Research 导出',
      description:
        '在 Deep Research 报告菜单中加入“保存报告”（PDF、图片、Markdown、JSON）和“下载 Thinking 内容”。',
    },
    zh_TW: {
      name: 'Gemini · Deep Research 匯出',
      description:
        '在 Deep Research 報告選單中加入「儲存報告」（PDF、圖片、Markdown、JSON）與「下載 Thinking 內容」。',
    },
    ja: {
      name: 'Gemini · Deep Research のエクスポート',
      description:
        'Deep Research のレポートメニューに「レポートを保存」（PDF・画像・Markdown・JSON）と「思考内容をダウンロード」を追加します。',
    },
    ko: {
      name: 'Gemini · Deep Research 내보내기',
      description:
        "Deep Research 보고서 메뉴에 '보고서 저장'(PDF, 이미지, Markdown, JSON)과 '생각 내용 다운로드'를 추가합니다.",
    },
    fr: {
      name: 'Gemini · Export Deep Research',
      description:
        'Ajoute au menu du rapport Deep Research « Enregistrer le rapport » (PDF, image, Markdown, JSON) et « Télécharger la réflexion ».',
    },
    es: {
      name: 'Gemini · Exportar Deep Research',
      description:
        'Añade al menú del informe de Deep Research «Guardar informe» (PDF, imagen, Markdown, JSON) y «Descargar contenido de pensamiento».',
    },
    pt: {
      name: 'Gemini · Exportar Deep Research',
      description:
        'Adiciona ao menu do relatório do Deep Research “Salvar relatório” (PDF, imagem, Markdown, JSON) e “Baixar conteúdo de pensamento”.',
    },
    ru: {
      name: 'Gemini · Экспорт Deep Research',
      description:
        'Добавляет в меню отчёта Deep Research «Сохранить отчёт» (PDF, изображение, Markdown, JSON) и «Скачать содержимое мыслей».',
    },
    ar: {
      name: 'Gemini · تصدير Deep Research',
      description:
        'يضيف إلى قائمة تقرير Deep Research خيارَي «حفظ التقرير» (PDF وصورة وMarkdown وJSON) و«تنزيل محتوى التفكير».',
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
