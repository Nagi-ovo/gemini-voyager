import type { PluginManifest } from '../types';

/**
 * Gemini's research pack, as a packaged builtin plugin. A builtin rather than
 * a catalog plugin because its runtime is first-party code (pack buttons on
 * answers, the pack panel and its background-owned store), bound to this id in
 * `pluginNativeRegistration.ts`. It declares no settings: the plugin host
 * turns it on and off from `gvResearchPackEnabled`, on only when that key is
 * `true`. The receiver on ChatGPT and Claude stays in core.
 *
 * Whether it or the native module runs the feature is decided per build by
 * `sites/featureOwners.ts`; while that entry is `legacy`, it is never admitted.
 * The texts are the popup's own (`researchPackEnable`, `researchPackEnableHint`).
 */
export const GEMINI_RESEARCH_PACK_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-research-pack',
  name: 'Gemini · Research Pack',
  version: '1.0.0',
  description:
    'Adds a pack button to Gemini answers. Collect answers and their sources into one Markdown pack, then copy, download or insert it into another chat.',
  i18n: {
    zh: {
      name: 'Gemini · 研究资料包',
      description:
        '在 Gemini 回答下添加资料包按钮。把多条回答及其来源汇总成一份 Markdown，再复制、下载或插入到另一个对话。',
    },
    zh_TW: {
      name: 'Gemini · 研究資料包',
      description:
        '在 Gemini 回答下新增資料包按鈕。把多則回答及其來源彙整成一份 Markdown，再複製、下載或插入到另一個對話。',
    },
    ja: {
      name: 'Gemini · リサーチパック',
      description:
        'Gemini の回答にパックボタンを追加します。回答と出典を 1 つの Markdown にまとめ、コピー・ダウンロード・別のチャットへの挿入ができます。',
    },
    ko: {
      name: 'Gemini · 리서치 팩',
      description:
        'Gemini 답변에 팩 버튼을 추가합니다. 답변과 출처를 하나의 Markdown 팩으로 모아 복사, 다운로드하거나 다른 채팅에 삽입하세요.',
    },
    fr: {
      name: 'Gemini · Dossier de recherche',
      description:
        'Ajoute un bouton aux réponses de Gemini. Rassemblez réponses et sources dans un seul Markdown à copier, télécharger ou insérer dans une autre conversation.',
    },
    es: {
      name: 'Gemini · Paquete de investigación',
      description:
        'Añade un botón a las respuestas de Gemini. Reúne respuestas y fuentes en un solo Markdown para copiarlo, descargarlo o insertarlo en otro chat.',
    },
    pt: {
      name: 'Gemini · Pacote de pesquisa',
      description:
        'Adiciona um botão às respostas do Gemini. Reúna respostas e fontes em um único Markdown para copiar, baixar ou inserir em outro chat.',
    },
    ru: {
      name: 'Gemini · Исследовательский пакет',
      description:
        'Добавляет кнопку к ответам Gemini. Соберите ответы и их источники в один Markdown, чтобы скопировать, скачать или вставить его в другой чат.',
    },
    ar: {
      name: 'Gemini · حزمة البحث',
      description:
        'يضيف زرًا إلى إجابات Gemini. اجمع الإجابات ومصادرها في ملف Markdown واحد لنسخه أو تنزيله أو إدراجه في محادثة أخرى.',
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
