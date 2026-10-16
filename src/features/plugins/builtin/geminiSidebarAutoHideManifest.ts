import type { PluginManifest } from '../types';

/** Fixed-id packaged runtime; its legacy sync switch remains the source of truth. */
export const GEMINI_SIDEBAR_AUTO_HIDE_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-sidebar-auto-hide',
  name: 'Gemini · Auto-hide sidebar',
  version: '1.0.0',
  description:
    'Collapse the Gemini sidebar when the pointer leaves it, and expand it when the pointer returns.',
  i18n: {
    zh: {
      name: 'Gemini · 自动隐藏侧栏',
      description: '鼠标离开 Gemini 侧栏时自动收起，移回时展开。',
    },
    zh_TW: {
      name: 'Gemini · 自動隱藏側欄',
      description: '滑鼠離開 Gemini 側欄時自動收合，移回時展開。',
    },
    ja: {
      name: 'Gemini · サイドバーを自動的に隠す',
      description: 'ポインターが Gemini のサイドバーから離れると折りたたみ、戻ると展開します。',
    },
    ko: {
      name: 'Gemini · 사이드바 자동 숨김',
      description: '포인터가 Gemini 사이드바를 벗어나면 접고, 다시 올리면 펼칩니다.',
    },
    fr: {
      name: 'Gemini · Masquer automatiquement la barre latérale',
      description:
        'Replie la barre latérale de Gemini quand le pointeur la quitte et la déplie à son retour.',
    },
    es: {
      name: 'Gemini · Ocultar automáticamente la barra lateral',
      description:
        'Contrae la barra lateral de Gemini al retirar el puntero y la expande al volver a colocarlo encima.',
    },
    pt: {
      name: 'Gemini · Ocultar automaticamente a barra lateral',
      description:
        'Recolhe a barra lateral do Gemini quando o ponteiro sai e a expande quando ele volta.',
    },
    ru: {
      name: 'Gemini · Автоматически скрывать боковую панель',
      description:
        'Сворачивает боковую панель Gemini, когда указатель покидает её, и разворачивает при наведении.',
    },
    ar: {
      name: 'Gemini · إخفاء الشريط الجانبي تلقائيًا',
      description: 'يطوي الشريط الجانبي في Gemini عند ابتعاد المؤشر عنه ويوسّعه عند عودته.',
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
