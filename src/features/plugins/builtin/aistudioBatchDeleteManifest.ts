import type { PluginManifest } from '../types';

/** Packaged selection lifecycle; folder data and commands remain native. */
export const AISTUDIO_BATCH_DELETE_MANIFEST: PluginManifest = {
  id: 'voyager.aistudio-batch-delete',
  name: 'AI Studio · Batch delete',
  version: '1.0.0',
  description:
    'Long-press a conversation to select multiple conversations, then confirm their deletion.',
  i18n: {
    zh: {
      name: 'AI Studio · 批量删除',
      description: '长按对话进入多选模式，确认后批量删除选中的对话。',
    },
    zh_TW: {
      name: 'AI Studio · 批次刪除',
      description: '長按對話進入多選模式，確認後批次刪除選取的對話。',
    },
    ja: {
      name: 'AI Studio · 一括削除',
      description: '会話を長押しして複数選択し、確認してからまとめて削除します。',
    },
    ko: {
      name: 'AI Studio · 일괄 삭제',
      description: '대화를 길게 눌러 여러 개를 선택하고 확인 후 한 번에 삭제합니다.',
    },
    fr: {
      name: 'AI Studio · Suppression groupée',
      description:
        'Appuyez longuement sur une conversation pour en sélectionner plusieurs, puis confirmez leur suppression.',
    },
    es: {
      name: 'AI Studio · Eliminación por lotes',
      description:
        'Mantén pulsada una conversación para seleccionar varias y confirma su eliminación.',
    },
    pt: {
      name: 'AI Studio · Exclusão em lote',
      description:
        'Pressione e segure uma conversa para selecionar várias e confirme para excluir.',
    },
    ru: {
      name: 'AI Studio · Пакетное удаление',
      description:
        'Нажмите и удерживайте разговор, чтобы выбрать несколько, затем подтвердите удаление.',
    },
    ar: {
      name: 'AI Studio · الحذف الجماعي',
      description: 'اضغط مطولاً على محادثة لتحديد عدة محادثات، ثم أكّد حذفها.',
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://aistudio.google.com/*', 'https://aistudio.google.cn/*'],
  contributes: {},
};
