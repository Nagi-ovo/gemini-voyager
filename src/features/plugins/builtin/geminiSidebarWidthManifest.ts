// Relative import: the docs plugin table has no @/ alias.
import { SIDEBAR_WIDTH_PX } from '../../../core/utils/sidebarWidthValues';
import type { PluginManifest } from '../types';

/** Fixed-id packaged runtime; its legacy sync switch remains the source of truth. */
export const GEMINI_SIDEBAR_WIDTH_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-sidebar-width',
  name: 'Gemini · Sidebar width',
  version: '1.0.0',
  description:
    'Adjust the Gemini sidebar width to make conversation and folder names easier to read.',
  i18n: {
    zh: {
      name: 'Gemini · 侧栏宽度',
      description: '调整 Gemini 侧栏的宽度，让对话和文件夹名称更易阅读。',
      settings: {
        widthPx: {
          label: '侧栏宽度（px）',
          minLabel: '窄',
          maxLabel: '宽',
        },
      },
    },
    zh_TW: {
      name: 'Gemini · 側欄寬度',
      description: '調整 Gemini 側欄的寬度，讓對話和資料夾名稱更易閱讀。',
      settings: {
        widthPx: {
          label: '側欄寬度（px）',
          minLabel: '窄',
          maxLabel: '寬',
        },
      },
    },
    ja: {
      name: 'Gemini · サイドバーの幅',
      description: 'Gemini のサイドバーの幅を調整して、会話やフォルダーの名前を読みやすくします。',
      settings: {
        widthPx: {
          label: 'サイドバーの幅（px）',
          minLabel: '狭い',
          maxLabel: '広い',
        },
      },
    },
    ko: {
      name: 'Gemini · 사이드바 너비',
      description: 'Gemini 사이드바 너비를 조절해 대화와 폴더 이름을 더 쉽게 읽을 수 있습니다.',
      settings: {
        widthPx: {
          label: '사이드바 너비(px)',
          minLabel: '좁게',
          maxLabel: '넓게',
        },
      },
    },
    fr: {
      name: 'Gemini · Largeur de la barre latérale',
      description:
        'Ajustez la largeur de la barre latérale de Gemini pour mieux lire les noms des conversations et des dossiers.',
      settings: {
        widthPx: {
          label: 'Largeur de la barre latérale (px)',
          minLabel: 'Étroite',
          maxLabel: 'Large',
        },
      },
    },
    es: {
      name: 'Gemini · Ancho de la barra lateral',
      description:
        'Ajusta el ancho de la barra lateral de Gemini para leer mejor los nombres de las conversaciones y carpetas.',
      settings: {
        widthPx: {
          label: 'Ancho de la barra lateral (px)',
          minLabel: 'Estrecha',
          maxLabel: 'Ancha',
        },
      },
    },
    pt: {
      name: 'Gemini · Largura da barra lateral',
      description:
        'Ajuste a largura da barra lateral do Gemini para ler melhor os nomes das conversas e pastas.',
      settings: {
        widthPx: {
          label: 'Largura da barra lateral (px)',
          minLabel: 'Estreita',
          maxLabel: 'Larga',
        },
      },
    },
    ru: {
      name: 'Gemini · Ширина боковой панели',
      description:
        'Настройте ширину боковой панели Gemini, чтобы лучше видеть названия чатов и папок.',
      settings: {
        widthPx: {
          label: 'Ширина боковой панели (px)',
          minLabel: 'Узкая',
          maxLabel: 'Широкая',
        },
      },
    },
    ar: {
      name: 'Gemini · عرض الشريط الجانبي',
      description: 'اضبط عرض الشريط الجانبي في Gemini لتسهيل قراءة أسماء المحادثات والمجلدات.',
      settings: {
        widthPx: {
          label: 'عرض الشريط الجانبي (px)',
          minLabel: 'ضيق',
          maxLabel: 'عريض',
        },
      },
    },
  },
  author: 'voyager-official',
  category: 'readability',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  contributes: {
    settings: {
      widthPx: {
        type: 'number',
        label: 'Sidebar width (px)',
        minLabel: 'Narrow',
        maxLabel: 'Wide',
        default: SIDEBAR_WIDTH_PX.default,
        min: SIDEBAR_WIDTH_PX.min,
        max: SIDEBAR_WIDTH_PX.max,
      },
    },
  },
};
