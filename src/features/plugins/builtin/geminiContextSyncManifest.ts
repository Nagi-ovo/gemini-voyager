import type { PluginManifest } from '../types';

/** Fixed-id capture listener; accepted transfers complete after the plugin is disabled. */
export const GEMINI_CONTEXT_SYNC_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-context-sync',
  name: 'Gemini · Context sync',
  version: '1.0.0',
  description: 'Send Gemini conversation context to your local IDE through CoBridge.',
  i18n: {
    zh: {
      name: 'Gemini · 上下文同步',
      description: '通过 CoBridge 将 Gemini 对话上下文发送到本地 IDE。',
    },
    zh_TW: {
      name: 'Gemini · 上下文同步',
      description: '透過 CoBridge 將 Gemini 對話上下文傳送至本機 IDE。',
    },
    ja: {
      name: 'Gemini · コンテキスト同期',
      description: 'CoBridge を通じて Gemini の会話コンテキストをローカルの IDE に送信します。',
    },
    ko: {
      name: 'Gemini · 컨텍스트 동기화',
      description: 'CoBridge를 통해 Gemini 대화 컨텍스트를 로컬 IDE로 보냅니다.',
    },
    fr: {
      name: 'Gemini · Synchronisation du contexte',
      description:
        'Envoyez le contexte de vos conversations Gemini à votre IDE local via CoBridge.',
    },
    es: {
      name: 'Gemini · Sincronización de contexto',
      description:
        'Envía el contexto de tus conversaciones de Gemini a tu IDE local mediante CoBridge.',
    },
    pt: {
      name: 'Gemini · Sincronização de contexto',
      description: 'Envie o contexto das suas conversas do Gemini para o IDE local pelo CoBridge.',
    },
    ru: {
      name: 'Gemini · Синхронизация контекста',
      description: 'Отправляйте контекст беседы Gemini в локальную IDE через CoBridge.',
    },
    ar: {
      name: 'Gemini · مزامنة السياق',
      description: 'أرسل سياق محادثات Gemini إلى بيئة التطوير المحلية عبر CoBridge.',
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
