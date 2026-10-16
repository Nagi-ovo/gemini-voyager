import type { PluginManifest } from '../types';

/** Packaged selection lifecycle; folder data and commands remain native. */
export const GEMINI_BATCH_DELETE_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-batch-delete',
  name: 'Gemini · Batch delete',
  version: '1.0.0',
  description:
    'Long-press a conversation to select multiple conversations, then confirm their deletion.',
  i18n: {
    zh: {
      name: 'Gemini · 批量删除',
      description: '长按对话进入多选模式，确认后批量删除选中的对话。',
    },
    zh_TW: {
      name: 'Gemini · 批次刪除',
      description: '長按對話進入多選模式，確認後批次刪除選取的對話。',
    },
    ja: {
      name: 'Gemini · 一括削除',
      description: '会話を長押しして複数選択し、確認してからまとめて削除します。',
    },
    ko: {
      name: 'Gemini · 일괄 삭제',
      description: '대화를 길게 눌러 여러 개를 선택하고 확인 후 한 번에 삭제합니다.',
    },
    fr: {
      name: 'Gemini · Suppression groupée',
      description:
        'Appuyez longuement sur une conversation pour en sélectionner plusieurs, puis confirmez leur suppression.',
    },
    es: {
      name: 'Gemini · Eliminación por lotes',
      description:
        'Mantén pulsada una conversación para seleccionar varias y confirma su eliminación.',
    },
    pt: {
      name: 'Gemini · Exclusão em lote',
      description:
        'Pressione e segure uma conversa para selecionar várias e confirme para excluir.',
    },
    ru: {
      name: 'Gemini · Пакетное удаление',
      description:
        'Нажмите и удерживайте разговор, чтобы выбрать несколько, затем подтвердите удаление.',
    },
    ar: {
      name: 'Gemini · الحذف الجماعي',
      description: 'اضغط مطولاً على محادثة لتحديد عدة محادثات، ثم أكّد حذفها.',
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
