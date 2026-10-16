// Relative, not `@/`: the docs plugin store imports the builtin list and VitePress has no alias.
import { EDIT_INPUT_WIDTH_PERCENT } from '../../../core/utils/chatAppearanceValues';
import type { PluginManifest } from '../types';

/**
 * Gemini's edit input width, as a packaged builtin plugin. A builtin rather
 * than a catalog plugin, like chat width: its runtime is first-party code (a
 * stylesheet re-applied as Gemini renders, plus the stored-value
 * normalization the native module did), bound to this id in
 * `pluginNativeRegistration.ts`. It declares only its setting: the width the
 * plugin host fills from `geminiEditInputWidth`. Its switch stays
 * `gvEditInputWidthEnabled` (`legacySettingBindings.ts`).
 */
export const GEMINI_EDIT_INPUT_WIDTH_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-edit-input-width',
  name: 'Gemini · Edit input width',
  version: '1.0.0',
  description:
    'Widen the box for editing a sent message, and the message input, as a share of the window width.',
  i18n: {
    zh: {
      name: 'Gemini · 编辑输入框宽度',
      description: '按窗口宽度的比例加宽编辑已发送消息时的输入框和消息输入框。',
      settings: { widthPercent: { label: '编辑输入框宽度（%）', minLabel: '窄', maxLabel: '宽' } },
    },
    zh_TW: {
      name: 'Gemini · 編輯輸入框寬度',
      description: '按視窗寬度的比例加寬編輯已傳送訊息時的輸入框和訊息輸入框。',
      settings: { widthPercent: { label: '編輯輸入框寬度（%）', minLabel: '窄', maxLabel: '寬' } },
    },
    ja: {
      name: 'Gemini · 入力欄の幅',
      description:
        '送信済みメッセージを編集する入力欄とメッセージ入力欄を、ウィンドウ幅に対する割合で広げます。',
      settings: { widthPercent: { label: '入力欄の幅（%）', minLabel: '狭い', maxLabel: '広い' } },
    },
    ko: {
      name: 'Gemini · 편집 입력창 너비',
      description:
        '보낸 메시지를 편집하는 입력창과 메시지 입력창을 창 너비에 대한 비율로 넓힙니다.',
      settings: {
        widthPercent: { label: '편집 입력창 너비(%)', minLabel: '좁게', maxLabel: '넓게' },
      },
    },
    fr: {
      name: "Gemini · Largeur de l'éditeur",
      description:
        "Élargit la zone de modification d'un message envoyé, ainsi que la zone de saisie, en proportion de la largeur de la fenêtre.",
      settings: {
        widthPercent: { label: "Largeur de l'éditeur (%)", minLabel: 'Étroit', maxLabel: 'Large' },
      },
    },
    es: {
      name: 'Gemini · Ancho del campo de edición',
      description:
        'Ensancha el cuadro para editar un mensaje enviado, y el campo de mensaje, en proporción al ancho de la ventana.',
      settings: {
        widthPercent: {
          label: 'Ancho del campo de edición (%)',
          minLabel: 'Estrecho',
          maxLabel: 'Ancho',
        },
      },
    },
    pt: {
      name: 'Gemini · Largura da entrada de edição',
      description:
        'Alarga a caixa para editar uma mensagem enviada, e a caixa de mensagem, em proporção à largura da janela.',
      settings: {
        widthPercent: {
          label: 'Largura da entrada de edição (%)',
          minLabel: 'Estreita',
          maxLabel: 'Larga',
        },
      },
    },
    ru: {
      name: 'Gemini · Ширина поля ввода',
      description:
        'Расширяет поле редактирования отправленного сообщения и поле ввода в долях от ширины окна.',
      settings: {
        widthPercent: { label: 'Ширина поля ввода (%)', minLabel: 'Узкая', maxLabel: 'Широкая' },
      },
    },
    ar: {
      name: 'Gemini · عرض حقل التحرير',
      description: 'يوسّع مربع تحرير رسالة مُرسلة ومربع كتابة الرسائل بنسبة من عرض النافذة.',
      settings: {
        widthPercent: { label: 'عرض حقل التحرير (%)', minLabel: 'ضيق', maxLabel: 'عريض' },
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
      widthPercent: {
        type: 'number',
        label: 'Edit input width (%)',
        minLabel: 'Narrow',
        maxLabel: 'Wide',
        default: EDIT_INPUT_WIDTH_PERCENT.default,
        min: EDIT_INPUT_WIDTH_PERCENT.min,
        max: EDIT_INPUT_WIDTH_PERCENT.max,
      },
    },
  },
};
