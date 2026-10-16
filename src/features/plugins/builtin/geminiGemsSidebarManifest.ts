import {
  DEFAULT_GEMS_SIDEBAR_COUNT,
  MAX_GEMS_SIDEBAR_COUNT,
  MIN_GEMS_SIDEBAR_COUNT,
} from '../../../core/utils/gemsSidebarValues';
import type { PluginManifest } from '../types';

/** Fixed-id runtime; the master switch and recent count remain separate sync settings. */
export const GEMINI_GEMS_SIDEBAR_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-gems-sidebar',
  name: 'Gemini · Recent Gems in sidebar',
  version: '1.0.0',
  description: 'Keep pinned and recently used Gems within reach in the Gemini sidebar.',
  i18n: {
    zh: {
      name: 'Gemini · 侧栏最近使用的 Gem',
      description: '在 Gemini 侧栏快速访问置顶和最近使用的 Gem。',
      settings: { count: { label: '最近使用的 Gem 数量' } },
    },
    zh_TW: {
      name: 'Gemini · 側欄最近使用的 Gem',
      description: '在 Gemini 側欄快速存取釘選和最近使用的 Gem。',
      settings: { count: { label: '最近使用的 Gem 數量' } },
    },
    ja: {
      name: 'Gemini · サイドバーに最近使った Gem を表示',
      description: '固定した Gem や最近使った Gem に Gemini のサイドバーからすぐアクセスできます。',
      settings: { count: { label: '最近使った Gem の表示数' } },
    },
    ko: {
      name: 'Gemini · 사이드바에 최근 Gem 표시',
      description: 'Gemini 사이드바에서 고정하거나 최근에 사용한 Gem에 빠르게 접근하세요.',
      settings: { count: { label: '최근 Gem 표시 개수' } },
    },
    fr: {
      name: 'Gemini · Gems récents dans la barre latérale',
      description:
        'Accédez rapidement aux Gems épinglés et récemment utilisés dans la barre latérale de Gemini.',
      settings: { count: { label: 'Nombre de Gems récents' } },
    },
    es: {
      name: 'Gemini · Gems recientes en la barra lateral',
      description:
        'Accede rápidamente a tus Gems fijados y usados recientemente desde la barra lateral de Gemini.',
      settings: { count: { label: 'Número de Gems recientes' } },
    },
    pt: {
      name: 'Gemini · Gems recentes na barra lateral',
      description:
        'Acesse rapidamente os Gems fixados e usados recentemente pela barra lateral do Gemini.',
      settings: { count: { label: 'Número de Gems recentes' } },
    },
    ru: {
      name: 'Gemini · Недавние Gems на боковой панели',
      description:
        'Быстро открывайте закреплённые и недавно использованные Gems с боковой панели Gemini.',
      settings: { count: { label: 'Количество недавних Gems' } },
    },
    ar: {
      name: 'Gemini · أحدث Gems في الشريط الجانبي',
      description: 'افتح Gems المثبّتة والمستخدمة مؤخرًا بسرعة من الشريط الجانبي في Gemini.',
      settings: { count: { label: 'عدد Gems المستخدمة مؤخرًا' } },
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  contributes: {
    settings: {
      count: {
        type: 'number',
        label: 'Recent Gems count',
        default: DEFAULT_GEMS_SIDEBAR_COUNT,
        min: MIN_GEMS_SIDEBAR_COUNT,
        max: MAX_GEMS_SIDEBAR_COUNT,
      },
    },
  },
};
