// Relative, not `@/`: the docs plugin store imports the builtin list and VitePress has no alias.
import { CHAT_WIDTH_PERCENT } from '../../../core/utils/chatAppearanceValues';
import type { PluginManifest } from '../types';

/**
 * Gemini's chat width, as a packaged builtin plugin. A builtin rather than a
 * catalog plugin because its runtime is first-party code (a screen-width px
 * value recomputed as Gemini renders, plus a native health probe), bound to
 * this id in `pluginNativeRegistration.ts`. It declares only its setting: the
 * width the plugin host fills from `geminiChatWidth`.
 *
 * Whether it or the native module runs the feature is decided per build by
 * `sites/featureOwners.ts`; while that entry is `legacy`, it is never admitted.
 */
export const GEMINI_CHAT_WIDTH_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-chat-width',
  name: 'Gemini · Chat Width',
  version: '1.0.0',
  description:
    "Widen Gemini's conversation as a share of the screen width; a split-screen window is filled.",
  i18n: {
    zh: {
      name: 'Gemini · 对话区域宽度',
      description: '按屏幕宽度的比例加宽 Gemini 对话区域；分屏时铺满窗口。',
      settings: { widthPercent: { label: '对话区域宽度（%）', minLabel: '窄', maxLabel: '宽' } },
    },
    zh_TW: {
      name: 'Gemini · 對話區域寬度',
      description: '按螢幕寬度的比例加寬 Gemini 對話區域；分割畫面時填滿視窗。',
      settings: { widthPercent: { label: '對話區域寬度（%）', minLabel: '窄', maxLabel: '寬' } },
    },
    ja: {
      name: 'Gemini · チャットの幅',
      description:
        'Gemini の会話エリアを画面幅に対する割合で広げます。画面分割時はウィンドウいっぱいに表示します。',
      settings: {
        widthPercent: { label: 'チャットの幅（%）', minLabel: '狭い', maxLabel: '広い' },
      },
    },
    ko: {
      name: 'Gemini · 대화 너비',
      description:
        'Gemini 대화 영역을 화면 너비에 대한 비율로 넓힙니다. 화면 분할 시 창을 채웁니다.',
      settings: { widthPercent: { label: '대화 너비(%)', minLabel: '좁게', maxLabel: '넓게' } },
    },
    fr: {
      name: 'Gemini · Largeur du chat',
      description:
        "Élargit la conversation Gemini en proportion de la largeur de l'écran ; une fenêtre en écran partagé est remplie.",
      settings: {
        widthPercent: { label: 'Largeur du chat (%)', minLabel: 'Étroit', maxLabel: 'Large' },
      },
    },
    es: {
      name: 'Gemini · Ancho del chat',
      description:
        'Ensancha la conversación de Gemini en proporción al ancho de la pantalla; una ventana en pantalla dividida se llena.',
      settings: {
        widthPercent: { label: 'Ancho del chat (%)', minLabel: 'Estrecho', maxLabel: 'Ancho' },
      },
    },
    pt: {
      name: 'Gemini · Largura do chat',
      description:
        'Alarga a conversa do Gemini em proporção à largura da tela; uma janela em tela dividida é preenchida.',
      settings: {
        widthPercent: { label: 'Largura do chat (%)', minLabel: 'Estreita', maxLabel: 'Larga' },
      },
    },
    ru: {
      name: 'Gemini · Ширина чата',
      description:
        'Расширяет диалог Gemini в долях от ширины экрана; окно в режиме разделённого экрана заполняется целиком.',
      settings: {
        widthPercent: { label: 'Ширина чата (%)', minLabel: 'Узкая', maxLabel: 'Широкая' },
      },
    },
    ar: {
      name: 'Gemini · عرض الدردشة',
      description: 'يوسّع محادثة Gemini بنسبة من عرض الشاشة؛ وتُملأ النافذة عند تقسيم الشاشة.',
      settings: { widthPercent: { label: 'عرض الدردشة (%)', minLabel: 'ضيق', maxLabel: 'عريض' } },
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
      widthPercent: {
        type: 'number',
        label: 'Chat width (%)',
        minLabel: 'Narrow',
        maxLabel: 'Wide',
        default: CHAT_WIDTH_PERCENT.default,
        min: CHAT_WIDTH_PERCENT.min,
        max: CHAT_WIDTH_PERCENT.max,
      },
    },
  },
};
