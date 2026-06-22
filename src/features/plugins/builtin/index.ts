import type { PluginManifest } from '../types';

/**
 * Built-in (bundled-in-the-extension) plugins — first-party data, NOT from the
 * remote marketplace.
 *
 * Use this only for genuinely first-party features that need JS and so can't be
 * expressed as remote declarative data — a "native function plugin": the
 * manifest declares no styles/domOps, and the content script binds the actual
 * behaviour by calling `registerNativeHandler(<same id>, { start, stop })` (see
 * runtime/nativeHandlers). The engine runs that handler in lockstep with the
 * plugin's mount/unmount, so the feature is visible + toggleable in the plugin
 * list and scoped by `matches`, while the code stays first-party.
 *
 * Like every plugin, builtin plugins ship DISABLED by default — the user turns
 * them on in the popup.
 */
export const BUILTIN_PLUGINS: readonly PluginManifest[] = [
  {
    id: 'voyager.formula-copy',
    name: 'Formula Copy',
    version: '1.0.0',
    description: "Click an inline or block formula to copy its LaTeX; hover shows it's clickable.",
    i18n: {
      zh: {
        name: '公式复制',
        description: '点击行内或块级公式即可复制 LaTeX；悬停时会提示可点击。',
      },
      zh_TW: {
        name: '公式複製',
        description: '點擊行內或區塊公式即可複製 LaTeX；滑鼠懸停時會提示可點擊。',
      },
      ja: {
        name: '数式コピー',
        description:
          'インラインまたはブロック数式をクリックして LaTeX をコピーできます。ホバーするとクリック可能であることが分かります。',
      },
      ko: {
        name: '수식 복사',
        description:
          '인라인 또는 블록 수식을 클릭해 LaTeX를 복사합니다. 마우스를 올리면 클릭 가능함을 표시합니다.',
      },
      fr: {
        name: 'Copie de formules',
        description:
          "Cliquez sur une formule en ligne ou en bloc pour copier son LaTeX ; le survol indique qu'elle est cliquable.",
      },
      es: {
        name: 'Copia de fórmulas',
        description:
          'Haz clic en una fórmula en línea o en bloque para copiar su LaTeX; al pasar el cursor se muestra que se puede hacer clic.',
      },
      pt: {
        name: 'Cópia de fórmulas',
        description:
          'Clique em uma fórmula inline ou em bloco para copiar o LaTeX; ao passar o cursor, ela indica que pode ser clicada.',
      },
      ru: {
        name: 'Копирование формул',
        description:
          'Нажмите на строчную или блочную формулу, чтобы скопировать её LaTeX; при наведении видно, что её можно нажать.',
      },
      ar: {
        name: 'نسخ الصيغ',
        description:
          'انقر على صيغة مضمنة أو كتلية لنسخ LaTeX الخاص بها؛ ويظهر عند التحويم أنها قابلة للنقر.',
      },
    },
    author: 'voyager-official',
    category: 'productivity',
    license: 'GPL-3.0-or-later',
    engine: '>=1.1.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*', 'https://chatgpt.com/*', 'https://chat.openai.com/*'],
    contributes: {},
  },
  {
    id: 'voyager.claude-timeline',
    name: 'Claude · Timeline',
    version: '1.0.0',
    description: 'Adds a compact conversation timeline to Claude with starred messages and search.',
    i18n: {
      zh: {
        name: 'Claude · 时间线',
        description: '为 Claude 添加紧凑的对话时间线，支持星标消息和搜索。',
      },
      zh_TW: {
        name: 'Claude · 時間線',
        description: '為 Claude 加入緊湊的對話時間線，支援星標訊息與搜尋。',
      },
      ja: {
        name: 'Claude · タイムライン',
        description:
          'Claude にコンパクトな会話タイムラインを追加し、スター付きメッセージと検索に対応します。',
      },
      ko: {
        name: 'Claude · 타임라인',
        description: 'Claude에 별표 메시지와 검색을 지원하는 간단한 대화 타임라인을 추가합니다.',
      },
      fr: {
        name: 'Claude · Timeline',
        description: 'Ajoute une timeline compacte à Claude avec messages favoris et recherche.',
      },
      es: {
        name: 'Claude · Línea de tiempo',
        description:
          'Añade a Claude una línea de tiempo compacta con mensajes destacados y búsqueda.',
      },
      pt: {
        name: 'Claude · Linha do tempo',
        description:
          'Adiciona ao Claude uma linha do tempo compacta com mensagens favoritas e busca.',
      },
      ru: {
        name: 'Claude · Таймлайн',
        description: 'Добавляет в Claude компактную шкалу диалога со звёздами и поиском.',
      },
      ar: {
        name: 'Claude · المخطط الزمني',
        description: 'يضيف إلى Claude مخططًا زمنيًا موجزًا مع الرسائل المميزة والبحث.',
      },
    },
    author: 'voyager-official',
    category: 'productivity',
    license: 'GPL-3.0-or-later',
    engine: '>=1.1.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*'],
    contributes: {},
  },
];
