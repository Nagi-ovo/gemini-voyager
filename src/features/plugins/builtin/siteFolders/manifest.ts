import type { PluginManifest } from '../../types';

/**
 * A plugin site's folders manifest: one wording for every site, with the
 * site's name in it. `hideFiledChats` is the shared hide-filed setting.
 */
export function siteFoldersManifest(
  id: string,
  site: string,
  matches: readonly string[],
): PluginManifest {
  return {
    id,
    name: `${site} · Folders`,
    version: '1.0.0',
    description: `Organize ${site} conversations into folders in the sidebar or a floating panel, with import and export.`,
    i18n: {
      zh: {
        name: `${site} · 文件夹`,
        description: `在侧边栏或浮动面板中用文件夹整理 ${site} 对话，支持导入和导出。`,
        settings: { hideFiledChats: { label: '在侧边栏的聊天列表中隐藏已放入文件夹的对话' } },
      },
      zh_TW: {
        name: `${site} · 資料夾`,
        description: `在側邊欄或浮動面板中用資料夾整理 ${site} 對話，支援匯入與匯出。`,
        settings: { hideFiledChats: { label: '在側邊欄的聊天列表中隱藏已放入資料夾的對話' } },
      },
      ja: {
        name: `${site} · フォルダ`,
        description: `サイドバーやフローティングパネルで ${site} の会話をフォルダに整理できます。インポートとエクスポートにも対応。`,
        settings: {
          hideFiledChats: {
            label: 'フォルダに入れたチャットをサイドバーのチャット一覧に表示しない',
          },
        },
      },
      ko: {
        name: `${site} · 폴더`,
        description: `사이드바나 플로팅 패널에서 ${site} 대화를 폴더로 정리합니다. 가져오기와 내보내기를 지원합니다.`,
        settings: { hideFiledChats: { label: '폴더에 넣은 채팅을 사이드바 채팅 목록에서 숨기기' } },
      },
      fr: {
        name: `${site} · Dossiers`,
        description: `Classez vos conversations ${site} dans des dossiers depuis la barre latérale ou un panneau flottant, avec import et export.`,
        settings: {
          hideFiledChats: {
            label: 'Masquer les chats classés dans un dossier de la liste latérale',
          },
        },
      },
      es: {
        name: `${site} · Carpetas`,
        description: `Organiza las conversaciones de ${site} en carpetas desde la barra lateral o un panel flotante, con importación y exportación.`,
        settings: {
          hideFiledChats: {
            label: 'Ocultar de la lista lateral los chats que ya están en carpetas',
          },
        },
      },
      pt: {
        name: `${site} · Pastas`,
        description: `Organize as conversas do ${site} em pastas na barra lateral ou num painel flutuante, com importação e exportação.`,
        settings: {
          hideFiledChats: { label: 'Ocultar da lista lateral as conversas que já estão em pastas' },
        },
      },
      ru: {
        name: `${site} · Папки`,
        description: `Раскладывайте диалоги ${site} по папкам в боковой панели или в плавающей панели, с импортом и экспортом.`,
        settings: {
          hideFiledChats: {
            label: 'Скрывать из списка в боковой панели чаты, уже разложенные по папкам',
          },
        },
      },
      ar: {
        name: `${site} · المجلدات`,
        description: `نظّم محادثات ${site} في مجلدات من الشريط الجانبي أو لوحة عائمة، مع الاستيراد والتصدير.`,
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
    matches: [...matches],
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
}
