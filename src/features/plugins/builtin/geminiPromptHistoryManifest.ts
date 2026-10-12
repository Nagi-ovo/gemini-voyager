import type { PluginManifest } from '../types';

/**
 * Gemini's prompt history, as a packaged builtin plugin. A builtin rather than
 * a catalog plugin because its runtime is first-party code (send capture, a
 * panel, and history stored per account), bound to this id in
 * `pluginNativeRegistration.ts`. It declares no settings: the plugin host turns
 * it on and off from `gvPromptHistoryEnabled`.
 *
 * Whether it or the native module runs the feature is decided per build by
 * `sites/featureOwners.ts`; while that entry is `legacy`, it is never admitted.
 */
export const GEMINI_PROMPT_HISTORY_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-prompt-history',
  name: 'Gemini · Prompt History',
  version: '1.0.0',
  description:
    'Keep the prompts you send or edit on Gemini, per account, to copy or insert them again.',
  i18n: {
    zh: {
      name: 'Gemini · 输入历史',
      description: '按账号保存你在 Gemini 发送或编辑过的提示词，可再次复制或插入。',
    },
    zh_TW: {
      name: 'Gemini · 輸入歷史',
      description: '依帳號保存你在 Gemini 傳送或編輯過的提示詞，可再次複製或插入。',
    },
    ja: {
      name: 'Gemini · 入力履歴',
      description:
        'Gemini で送信または編集したプロンプトをアカウントごとに保存し、もう一度コピーや挿入ができます。',
    },
    ko: {
      name: 'Gemini · 입력 기록',
      description:
        'Gemini에서 보내거나 수정한 프롬프트를 계정별로 저장해 다시 복사하거나 삽입할 수 있습니다.',
    },
    fr: {
      name: 'Gemini · Historique des prompts',
      description:
        'Conserve, compte par compte, les prompts envoyés ou modifiés sur Gemini pour les copier ou les insérer à nouveau.',
    },
    es: {
      name: 'Gemini · Historial de prompts',
      description:
        'Guarda por cuenta los prompts que envías o editas en Gemini para copiarlos o insertarlos de nuevo.',
    },
    pt: {
      name: 'Gemini · Histórico de prompts',
      description:
        'Guarda por conta os prompts que você envia ou edita no Gemini para copiá-los ou inseri-los novamente.',
    },
    ru: {
      name: 'Gemini · История запросов',
      description:
        'Сохраняет отправленные и изменённые в Gemini запросы отдельно для каждого аккаунта, чтобы их можно было снова скопировать или вставить.',
    },
    ar: {
      name: 'Gemini · سجل الطلبات',
      description:
        'يحفظ الطلبات التي ترسلها أو تعدّلها في Gemini لكل حساب على حدة، لتنسخها أو تدرجها مرة أخرى.',
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  contributes: {},
};
