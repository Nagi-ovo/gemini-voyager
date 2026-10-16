import type { PluginManifest } from '../types';

/** Fixed-id packaged runtime; its legacy sync switch remains the source of truth. */
export const GEMINI_SIDEBAR_FULL_HIDE_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-sidebar-full-hide',
  name: 'Gemini · Fully hide sidebar',
  version: '1.0.0',
  description:
    'Completely hide the collapsed Gemini sidebar. With auto-hide also on, hover over the edge of the page to reveal it.',
  i18n: {
    zh: {
      name: 'Gemini · 完全隐藏侧栏',
      description: '完全隐藏 Gemini 收起后的侧栏。同时开启自动隐藏后，将鼠标移到页面边缘即可展开。',
    },
    zh_TW: {
      name: 'Gemini · 完全隱藏側欄',
      description: '完全隱藏 Gemini 收合後的側欄。同時開啟自動隱藏後，將滑鼠移到頁面邊緣即可展開。',
    },
    ja: {
      name: 'Gemini · サイドバーを完全に隠す',
      description:
        '折りたたんだGeminiのサイドバーを完全に隠します。自動非表示もオンにすると、ページの端にポインターを合わせて表示できます。',
    },
    ko: {
      name: 'Gemini · 사이드바 완전히 숨김',
      description:
        '접힌 Gemini 사이드바를 완전히 숨깁니다. 자동 숨김도 켜면 페이지 가장자리에 포인터를 올려 펼칠 수 있습니다.',
    },
    fr: {
      name: 'Gemini · Masquer complètement la barre latérale',
      description:
        'Masque complètement la barre latérale repliée de Gemini. Si le masquage automatique est aussi activé, survolez le bord de la page pour la faire apparaître.',
    },
    es: {
      name: 'Gemini · Ocultar por completo la barra lateral',
      description:
        'Oculta por completo la barra lateral contraída de Gemini. Si también activas la ocultación automática, pasa el puntero por el borde de la página para mostrarla.',
    },
    pt: {
      name: 'Gemini · Ocultar completamente a barra lateral',
      description:
        'Oculta completamente a barra lateral recolhida do Gemini. Com a ocultação automática também ativada, passe o ponteiro sobre a borda da página para exibi-la.',
    },
    ru: {
      name: 'Gemini · Полностью скрывать боковую панель',
      description:
        'Полностью скрывает свёрнутую боковую панель Gemini. Если также включено автоматическое скрытие, наведите указатель на край страницы, чтобы показать панель.',
    },
    ar: {
      name: 'Gemini · إخفاء الشريط الجانبي بالكامل',
      description:
        'يخفي الشريط الجانبي المطوي في Gemini بالكامل. عند تفعيل الإخفاء التلقائي أيضًا، مرّر المؤشر فوق حافة الصفحة لإظهاره.',
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
