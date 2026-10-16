import type { PluginManifest } from '../types';

/** Fixed-id packaged runtime; its legacy sync switch remains the source of truth. */
export const GEMINI_SIDEBAR_FULL_HIDE_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-sidebar-full-hide',
  name: 'Gemini · Fully hide sidebar',
  version: '1.0.0',
  description:
    'Hide the collapsed Gemini sidebar and reveal it by moving the pointer to the edge of the page.',
  i18n: {
    zh: {
      name: 'Gemini · 完全隐藏侧栏',
      description: '隐藏 Gemini 收起后的侧栏，将鼠标移到页面边缘即可展开。',
    },
    zh_TW: {
      name: 'Gemini · 完全隱藏側欄',
      description: '隱藏 Gemini 收合後的側欄，將滑鼠移到頁面邊緣即可展開。',
    },
    ja: {
      name: 'Gemini · サイドバーを完全に隠す',
      description:
        '折りたたんだ Gemini のサイドバーを隠し、ページの端にポインターを合わせると展開します。',
    },
    ko: {
      name: 'Gemini · 사이드바 완전히 숨김',
      description: '접힌 Gemini 사이드바를 숨기고, 페이지 가장자리에 포인터를 올리면 펼칩니다.',
    },
    fr: {
      name: 'Gemini · Masquer complètement la barre latérale',
      description:
        'Masque la barre latérale repliée de Gemini et la révèle au passage du pointeur sur le bord de la page.',
    },
    es: {
      name: 'Gemini · Ocultar por completo la barra lateral',
      description:
        'Oculta la barra lateral contraída de Gemini y la muestra al acercar el puntero al borde de la página.',
    },
    pt: {
      name: 'Gemini · Ocultar completamente a barra lateral',
      description:
        'Oculta a barra lateral recolhida do Gemini e a revela ao mover o ponteiro para a borda da página.',
    },
    ru: {
      name: 'Gemini · Полностью скрывать боковую панель',
      description:
        'Скрывает свёрнутую боковую панель Gemini и показывает её при наведении на край страницы.',
    },
    ar: {
      name: 'Gemini · إخفاء الشريط الجانبي بالكامل',
      description: 'يخفي الشريط الجانبي المطوي في Gemini ويُظهره عند تحريك المؤشر إلى حافة الصفحة.',
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
