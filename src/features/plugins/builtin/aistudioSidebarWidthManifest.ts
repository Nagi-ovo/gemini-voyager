// Relative import: the docs plugin table has no @/ alias.
import {
  AISTUDIO_SIDEBAR_WIDTH_DEFAULT,
  AISTUDIO_SIDEBAR_WIDTH_MIN,
  AISTUDIO_SIDEBAR_WIDTH_MAX,
} from '../../../core/utils/aistudioSidebarWidthValues';
import type { PluginManifest } from '../types';

/** Fixed-id packaged runtime; its AI Studio-only sync switch defaults to on. */
export const AISTUDIO_SIDEBAR_WIDTH_MANIFEST: PluginManifest = {
  id: 'voyager.aistudio-sidebar-width',
  name: 'AI Studio · Sidebar width',
  version: '1.0.0',
  description:
    'Adjust the AI Studio sidebar width to make conversation and folder names easier to read.',
  i18n: {
    zh: {
      name: 'AI Studio · 侧栏宽度',
      description: '调整 AI Studio 侧栏的宽度，让对话和文件夹名称更易阅读。',
      settings: {
        widthPx: {
          label: '侧栏宽度（px）',
          minLabel: '窄',
          maxLabel: '宽',
        },
      },
    },
    zh_TW: {
      name: 'AI Studio · 側欄寬度',
      description: '調整 AI Studio 側欄的寬度，讓對話和資料夾名稱更易閱讀。',
      settings: {
        widthPx: {
          label: '側欄寬度（px）',
          minLabel: '窄',
          maxLabel: '寬',
        },
      },
    },
    ja: {
      name: 'AI Studio · サイドバーの幅',
      description:
        'AI Studio のサイドバーの幅を調整して、会話やフォルダーの名前を読みやすくします。',
      settings: {
        widthPx: {
          label: 'サイドバーの幅（px）',
          minLabel: '狭い',
          maxLabel: '広い',
        },
      },
    },
    ko: {
      name: 'AI Studio · 사이드바 너비',
      description: 'AI Studio 사이드바 너비를 조절해 대화와 폴더 이름을 더 쉽게 읽을 수 있습니다.',
      settings: {
        widthPx: {
          label: '사이드바 너비(px)',
          minLabel: '좁게',
          maxLabel: '넓게',
        },
      },
    },
    fr: {
      name: 'AI Studio · Largeur de la barre latérale',
      description:
        'Ajustez la largeur de la barre latérale d’AI Studio pour mieux lire les noms des conversations et des dossiers.',
      settings: {
        widthPx: {
          label: 'Largeur de la barre latérale (px)',
          minLabel: 'Étroite',
          maxLabel: 'Large',
        },
      },
    },
    es: {
      name: 'AI Studio · Ancho de la barra lateral',
      description:
        'Ajusta el ancho de la barra lateral de AI Studio para leer mejor los nombres de las conversaciones y carpetas.',
      settings: {
        widthPx: {
          label: 'Ancho de la barra lateral (px)',
          minLabel: 'Estrecha',
          maxLabel: 'Ancha',
        },
      },
    },
    pt: {
      name: 'AI Studio · Largura da barra lateral',
      description:
        'Ajuste a largura da barra lateral do AI Studio para ler melhor os nomes das conversas e pastas.',
      settings: {
        widthPx: {
          label: 'Largura da barra lateral (px)',
          minLabel: 'Estreita',
          maxLabel: 'Larga',
        },
      },
    },
    ru: {
      name: 'AI Studio · Ширина боковой панели',
      description:
        'Настройте ширину боковой панели AI Studio, чтобы лучше видеть названия чатов и папок.',
      settings: {
        widthPx: {
          label: 'Ширина боковой панели (px)',
          minLabel: 'Узкая',
          maxLabel: 'Широкая',
        },
      },
    },
    ar: {
      name: 'AI Studio · عرض الشريط الجانبي',
      description: 'اضبط عرض الشريط الجانبي في AI Studio لتسهيل قراءة أسماء المحادثات والمجلدات.',
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
  matches: ['https://aistudio.google.com/*', 'https://aistudio.google.cn/*'],
  contributes: {
    settings: {
      widthPx: {
        type: 'number',
        label: 'Sidebar width (px)',
        minLabel: 'Narrow',
        maxLabel: 'Wide',
        default: AISTUDIO_SIDEBAR_WIDTH_DEFAULT,
        min: AISTUDIO_SIDEBAR_WIDTH_MIN,
        max: AISTUDIO_SIDEBAR_WIDTH_MAX,
      },
    },
  },
};
