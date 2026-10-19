import type { PluginManifest } from '../../types';

export const CHATGPT_FOLDERS_PLUGIN_ID = 'voyager.chatgpt-folders';

/** On by default (`pluginDefaults.ts`); `hideFiledChats` is the shared hide-filed setting. */
export const CHATGPT_FOLDERS_MANIFEST: PluginManifest = {
  id: CHATGPT_FOLDERS_PLUGIN_ID,
  name: 'ChatGPT · Folders',
  version: '1.0.0',
  description:
    'Organize ChatGPT conversations into folders in the sidebar or a floating panel, with import and export.',
  i18n: {
    zh: {
      name: 'ChatGPT · 文件夹',
      description: '在侧边栏或浮动面板中用文件夹整理 ChatGPT 对话，支持导入和导出。',
      settings: { hideFiledChats: { label: '在侧边栏的聊天列表中隐藏已放入文件夹的对话' } },
    },
    zh_TW: {
      name: 'ChatGPT · 資料夾',
      description: '在側邊欄或浮動面板中用資料夾整理 ChatGPT 對話，支援匯入與匯出。',
      settings: { hideFiledChats: { label: '在側邊欄的聊天列表中隱藏已放入資料夾的對話' } },
    },
    ja: {
      name: 'ChatGPT · フォルダ',
      description:
        'サイドバーやフローティングパネルで ChatGPT の会話をフォルダに整理できます。インポートとエクスポートにも対応。',
      settings: {
        hideFiledChats: {
          label: 'フォルダに入れたチャットをサイドバーのチャット一覧に表示しない',
        },
      },
    },
    ko: {
      name: 'ChatGPT · 폴더',
      description:
        '사이드바나 플로팅 패널에서 ChatGPT 대화를 폴더로 정리합니다. 가져오기와 내보내기를 지원합니다.',
      settings: { hideFiledChats: { label: '폴더에 넣은 채팅을 사이드바 채팅 목록에서 숨기기' } },
    },
    fr: {
      name: 'ChatGPT · Dossiers',
      description:
        'Classez vos conversations ChatGPT dans des dossiers depuis la barre latérale ou un panneau flottant, avec import et export.',
      settings: {
        hideFiledChats: {
          label: 'Masquer les chats classés dans un dossier de la liste latérale',
        },
      },
    },
    es: {
      name: 'ChatGPT · Carpetas',
      description:
        'Organiza las conversaciones de ChatGPT en carpetas desde la barra lateral o un panel flotante, con importación y exportación.',
      settings: {
        hideFiledChats: {
          label: 'Ocultar de la lista lateral los chats que ya están en carpetas',
        },
      },
    },
    pt: {
      name: 'ChatGPT · Pastas',
      description:
        'Organize as conversas do ChatGPT em pastas na barra lateral ou num painel flutuante, com importação e exportação.',
      settings: {
        hideFiledChats: { label: 'Ocultar da lista lateral as conversas que já estão em pastas' },
      },
    },
    ru: {
      name: 'ChatGPT · Папки',
      description:
        'Раскладывайте диалоги ChatGPT по папкам в боковой панели или в плавающей панели, с импортом и экспортом.',
      settings: {
        hideFiledChats: {
          label: 'Скрывать из списка в боковой панели чаты, уже разложенные по папкам',
        },
      },
    },
    ar: {
      name: 'ChatGPT · المجلدات',
      description:
        'نظّم محادثات ChatGPT في مجلدات من الشريط الجانبي أو لوحة عائمة، مع الاستيراد والتصدير.',
      settings: {
        hideFiledChats: { label: 'إخفاء المحادثات الموجودة في مجلدات من قائمة الشريط الجانبي' },
      },
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  contributes: {
    settings: {
      hideFiledChats: {
        type: 'boolean',
        label: 'Hide chats already in folders from the sidebar list',
        default: false,
      },
    },
  },
};
