import type { PluginManifest } from '../types';

/**
 * Gemini's input collapse, as a packaged builtin plugin. A builtin rather than
 * a catalog plugin because its runtime is first-party code (a focus-driven
 * collapse whose expand and collapse helpers Vim, quote reply, prompt history
 * and the Prompt Manager call), bound to this id in
 * `pluginNativeRegistration.ts`. The plugin host turns it on and off from
 * `gvInputCollapseEnabled` and fills `collapseWhenNotEmpty` from
 * `gvInputCollapseWhenNotEmpty`.
 *
 * Whether it or the native module runs the feature is decided per build by
 * `sites/featureOwners.ts`; while that entry is `legacy`, it is never admitted.
 */
export const GEMINI_INPUT_COLLAPSE_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-input-collapse',
  name: 'Gemini · Input Collapse',
  version: '1.0.0',
  description:
    "Collapse Gemini's empty input box into a slim bar when you leave it, for more reading space.",
  i18n: {
    zh: {
      name: 'Gemini · 输入框折叠',
      description: '离开 Gemini 的空输入框时把它收成一条细栏，腾出阅读空间。',
      settings: { collapseWhenNotEmpty: { label: '允许折叠有内容的输入框' } },
    },
    zh_TW: {
      name: 'Gemini · 輸入框折疊',
      description: '離開 Gemini 的空輸入框時把它收成一條細欄，騰出閱讀空間。',
      settings: { collapseWhenNotEmpty: { label: '允許折疊有內容的輸入框' } },
    },
    ja: {
      name: 'Gemini · 入力欄の折りたたみ',
      description:
        'Gemini の空の入力欄からフォーカスが外れると細いバーに折りたたみ、読むスペースを広げます。',
      settings: { collapseWhenNotEmpty: { label: '内容ありでも折りたたみを許可' } },
    },
    ko: {
      name: 'Gemini · 입력창 접기',
      description: 'Gemini의 빈 입력창에서 벗어나면 얇은 막대로 접어 읽을 공간을 넓힙니다.',
      settings: { collapseWhenNotEmpty: { label: '내용이 있어도 접기 허용' } },
    },
    fr: {
      name: 'Gemini · Repli de la zone de saisie',
      description:
        'Replie la zone de saisie vide de Gemini en une fine barre quand vous la quittez, pour gagner de la place pour lire.',
      settings: { collapseWhenNotEmpty: { label: 'Autoriser le repli avec contenu' } },
    },
    es: {
      name: 'Gemini · Contraer la entrada',
      description:
        'Contrae el cuadro de entrada vacío de Gemini en una barra fina al salir de él, para dejar más espacio de lectura.',
      settings: { collapseWhenNotEmpty: { label: 'Permitir contraer con contenido' } },
    },
    pt: {
      name: 'Gemini · Recolher a entrada',
      description:
        'Recolhe a caixa de entrada vazia do Gemini numa barra fina quando você sai dela, para ganhar espaço de leitura.',
      settings: { collapseWhenNotEmpty: { label: 'Permitir recolher com conteúdo' } },
    },
    ru: {
      name: 'Gemini · Сворачивание поля ввода',
      description:
        'Сворачивает пустое поле ввода Gemini в узкую полосу, когда вы уходите из него, освобождая место для чтения.',
      settings: { collapseWhenNotEmpty: { label: 'Позволить сворачивать с содержимым' } },
    },
    ar: {
      name: 'Gemini · طي مربع الإدخال',
      description:
        'يطوي مربع الإدخال الفارغ في Gemini إلى شريط رفيع عند مغادرته، ليمنحك مساحة أكبر للقراءة.',
      settings: { collapseWhenNotEmpty: { label: 'السماح بالطي مع وجود محتوى' } },
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
      collapseWhenNotEmpty: {
        type: 'boolean',
        label: 'Allow collapse with content',
        default: false,
        messageKeys: { label: 'allowCollapseWhenNotEmpty', hint: 'allowCollapseWhenNotEmptyHint' },
      },
    },
  },
};
