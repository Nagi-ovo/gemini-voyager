import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/',
  title: 'Gemini Voyager',
  description: '直观的导航。强大的组织。简洁优雅。',
  lang: 'zh-CN',
  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      themeConfig: {
        nav: [
          { text: '首页', link: '/' },
          { text: '指南', link: '/guide/installation' },
        ],
        sidebar: [
          {
            text: '启程',
            items: [
              { text: '安装', link: '/guide/installation' },
              { text: '快速上手', link: '/guide/getting-started' },
              { text: '赞助', link: '/guide/sponsor' },
              { text: '交流与反馈', link: '/guide/community' },
            ],
          },
          {
            text: '通用功能 (Gemini & AI Studio)',
            items: [
              { text: '文件夹', link: '/guide/folders' },
              { text: '灵感库', link: '/guide/prompts' },
              { text: '云同步', link: '/guide/cloud-sync' },
              { text: '公式复制', link: '/guide/formula-copy' },
              { text: '侧边栏宽度', link: '/guide/sidebar' },
            ],
          },
          {
            text: 'Gemini 专属功能',
            items: [
              { text: '时间轴', link: '/guide/timeline' },
              { text: '对话导出', link: '/guide/export' },
              { text: '引用回复', link: '/guide/quote-reply' },
              { text: '对话宽度调整', link: '/guide/settings' },
              { text: '批量删除', link: '/guide/batch-delete' },
              { text: 'Deep Research 导出', link: '/guide/deep-research' },
              { text: 'Mermaid 图表渲染', link: '/guide/mermaid' },
              { text: 'NanoBanana 水印去除', link: '/guide/nanobanana' },
              { text: '侧边栏自动收起', link: '/guide/sidebar-auto-hide' },
              { text: '输入框折叠', link: '/guide/input-collapse' },
              { text: '隐藏最近项目', link: '/guide/recents-hider' },
              { text: '默认模型', link: '/guide/default-model' },
              { text: '标签页标题同步', link: '/guide/tab-title' },
              { text: '上下文同步到IDE（实验性）', link: '/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            '本项目开源。欢迎在 <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> 上给一颗 ⭐ 支持。',
          copyright:
            '基于 GPLv3 协议发布 | Copyright © 2026 Jesse Zhang | <a href="/privacy">隐私政策</a>',
        },
      },
    },
    zh_TW: {
      label: '繁體中文',
      lang: 'zh-TW',
      link: '/zh_TW/',
      themeConfig: {
        nav: [
          { text: '首頁', link: '/zh_TW/' },
          { text: '指南', link: '/zh_TW/guide/installation' },
        ],
        sidebar: [
          {
            text: '介紹',
            items: [
              { text: '安裝', link: '/zh_TW/guide/installation' },
              { text: '快速開始', link: '/zh_TW/guide/getting-started' },
              { text: '贊助', link: '/zh_TW/guide/sponsor' },
              { text: '社群', link: '/zh_TW/guide/community' },
            ],
          },
          {
            text: '功能',
            items: [
              { text: '時間軸導航', link: '/zh_TW/guide/timeline' },
              { text: '資料夾', link: '/zh_TW/guide/folders' },
              { text: '提示詞庫', link: '/zh_TW/guide/prompts' },
              { text: '雲同步', link: '/zh_TW/guide/cloud-sync' },
              { text: '對話導出', link: '/zh_TW/guide/export' },
              { text: '引用回覆', link: '/zh_TW/guide/quote-reply' },
              { text: '對話寬度', link: '/zh_TW/guide/settings' },
              { text: '公式複製', link: '/zh_TW/guide/formula-copy' },
              { text: '側邊欄寬度', link: '/zh_TW/guide/sidebar' },
              { text: '批次刪除', link: '/zh_TW/guide/batch-delete' },
              { text: 'Deep Research 導出', link: '/zh_TW/guide/deep-research' },
              { text: 'Mermaid 圖表', link: '/zh_TW/guide/mermaid' },
              { text: 'NanoBanana', link: '/zh_TW/guide/nanobanana' },
              { text: '側邊欄自動收起', link: '/zh_TW/guide/sidebar-auto-hide' },
              { text: '輸入框摺疊', link: '/zh_TW/guide/input-collapse' },
              { text: '隱藏最近項目', link: '/zh_TW/guide/recents-hider' },
              { text: '預設模型', link: '/zh_TW/guide/default-model' },
              { text: '標籤標題同步', link: '/zh_TW/guide/tab-title' },
              { text: '上下文同步（實驗性）', link: '/zh_TW/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            '開源專案。如果您喜歡，請在 <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> 上給我們一顆 ⭐。',
          copyright:
            'GPLv3 授權 | Copyright © 2026 Jesse Zhang | <a href="/zh_TW/privacy">隱私政策</a>',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Guide', link: '/en/guide/installation' },
        ],
        sidebar: [
          {
            text: 'Introduction',
            items: [
              { text: 'Installation', link: '/en/guide/installation' },
              { text: 'Getting Started', link: '/en/guide/getting-started' },
              { text: 'Sponsor', link: '/en/guide/sponsor' },
              { text: 'Community', link: '/en/guide/community' },
            ],
          },
          {
            text: 'Features',
            items: [
              { text: 'Timeline Navigation', link: '/en/guide/timeline' },
              { text: 'Folder Organization', link: '/en/guide/folders' },
              { text: 'Prompt Library', link: '/en/guide/prompts' },
              { text: 'Cloud Sync', link: '/en/guide/cloud-sync' },
              { text: 'Chat Export', link: '/en/guide/export' },
              { text: 'Quote Reply', link: '/en/guide/quote-reply' },
              { text: 'Chat Width Adjustment', link: '/en/guide/settings' },
              { text: 'Formula Copy', link: '/en/guide/formula-copy' },
              { text: 'Sidebar Width', link: '/en/guide/sidebar' },
              { text: 'Batch Delete', link: '/en/guide/batch-delete' },
              { text: 'Deep Research Export', link: '/en/guide/deep-research' },
              { text: 'Mermaid Diagram Rendering', link: '/en/guide/mermaid' },
              { text: 'NanoBanana (Watermark Remover)', link: '/en/guide/nanobanana' },
              { text: 'Sidebar Auto-hide', link: '/en/guide/sidebar-auto-hide' },
              { text: 'Input Collapse', link: '/en/guide/input-collapse' },
              { text: 'Hide Recent Items', link: '/en/guide/recents-hider' },
              { text: 'Default Model', link: '/en/guide/default-model' },
              { text: 'Tab Title Sync', link: '/en/guide/tab-title' },
              { text: 'Context Sync to IDE (Experimental)', link: '/en/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            'Open source project. Star us on <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> if you like it ⭐.',
          copyright:
            'Released under the GPLv3 License | Copyright © 2026 Jesse Zhang | <a href="/en/privacy">Privacy Policy</a>',
        },
      },
    },
    ja: {
      label: '日本語',
      lang: 'ja-JP',
      link: '/ja/',
      themeConfig: {
        nav: [
          { text: 'ホーム', link: '/ja/' },
          { text: 'ガイド', link: '/ja/guide/installation' },
        ],
        sidebar: [
          {
            text: 'はじめに',
            items: [
              { text: 'インストール', link: '/ja/guide/installation' },
              { text: 'クイックスタート', link: '/ja/guide/getting-started' },
              { text: 'スポンサー', link: '/ja/guide/sponsor' },
              { text: 'コミュニティ', link: '/ja/guide/community' },
            ],
          },
          {
            text: '機能',
            items: [
              { text: 'タイムライン', link: '/ja/guide/timeline' },
              { text: 'フォルダ管理', link: '/ja/guide/folders' },
              { text: 'プロンプト', link: '/ja/guide/prompts' },
              { text: 'クラウド同期', link: '/ja/guide/cloud-sync' },
              { text: 'エクスポート', link: '/ja/guide/export' },
              { text: '引用返信', link: '/ja/guide/quote-reply' },
              { text: 'チャット幅', link: '/ja/guide/settings' },
              { text: '数式コピー', link: '/ja/guide/formula-copy' },
              { text: 'サイドバーの幅', link: '/ja/guide/sidebar' },
              { text: '一括削除', link: '/ja/guide/batch-delete' },
              { text: 'Deep Research', link: '/ja/guide/deep-research' },
              { text: 'Mermaid', link: '/ja/guide/mermaid' },
              { text: 'NanoBanana', link: '/ja/guide/nanobanana' },
              { text: 'サイドバー自動非表示', link: '/ja/guide/sidebar-auto-hide' },
              { text: '入力欄の自動非表示', link: '/ja/guide/input-collapse' },
              { text: '最近の項目を非表示', link: '/ja/guide/recents-hider' },
              { text: 'デフォルトモデル', link: '/ja/guide/default-model' },
              { text: 'タブタイトルの同期', link: '/ja/guide/tab-title' },
              { text: 'IDEへのコンテキスト同期（実験的）', link: '/ja/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            'オープンソースプロジェクトです。<a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> でスター ⭐ をつけて応援してください。',
          copyright:
            'GPLv3 ライセンス | Copyright © 2026 Jesse Zhang | <a href="/ja/privacy">プライバシーポリシー</a>',
        },
      },
    },
    fr: {
      label: 'Français',
      lang: 'fr-FR',
      link: '/fr/',
      themeConfig: {
        nav: [
          { text: 'Accueil', link: '/fr/' },
          { text: 'Guide', link: '/fr/guide/installation' },
        ],
        sidebar: [
          {
            text: 'Introduction',
            items: [
              { text: 'Installation', link: '/fr/guide/installation' },
              { text: 'Commencer', link: '/fr/guide/getting-started' },
              { text: 'Sponsor', link: '/fr/guide/sponsor' },
              { text: 'Communauté', link: '/fr/guide/community' },
            ],
          },
          {
            text: 'Fonctionnalités',
            items: [
              { text: 'Navigation Temporelle', link: '/fr/guide/timeline' },
              { text: 'Dossiers', link: '/fr/guide/folders' },
              { text: 'Bibliothèque de Prompts', link: '/fr/guide/prompts' },
              { text: 'Synchronisation Cloud', link: '/fr/guide/cloud-sync' },
              { text: 'Export de Chat', link: '/fr/guide/export' },
              { text: 'Réponse avec Citation', link: '/fr/guide/quote-reply' },
              { text: 'Largeur de Chat', link: '/fr/guide/settings' },
              { text: 'Copie de Formules', link: '/fr/guide/formula-copy' },
              { text: 'Largeur de la barre latérale', link: '/fr/guide/sidebar' },
              { text: 'Suppression par Lot', link: '/fr/guide/batch-delete' },
              { text: 'Export Deep Research', link: '/fr/guide/deep-research' },
              { text: 'Diagrammes Mermaid', link: '/fr/guide/mermaid' },
              { text: 'NanoBanana', link: '/fr/guide/nanobanana' },
              { text: 'Masquage auto barre latérale', link: '/fr/guide/sidebar-auto-hide' },
              { text: 'Réduction Entrée', link: '/fr/guide/input-collapse' },
              { text: 'Masquer Éléments Récents', link: '/fr/guide/recents-hider' },
              { text: 'Modèle par Défaut', link: '/fr/guide/default-model' },
              { text: 'Synchro Titre Onglet', link: '/fr/guide/tab-title' },
              {
                link: '/fr/guide/context-sync',
              },
            ],
          },
        ],
        footer: {
          message:
            'Projet Open Source. Mettez une ⭐ sur <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> si vous aimez.',
          copyright:
            'Licence GPLv3 | Copyright © 2026 Jesse Zhang | <a href="/fr/privacy">Politique de Confidentialité</a>',
        },
      },
    },
    es: {
      label: 'Español',
      lang: 'es-ES',
      link: '/es/',
      themeConfig: {
        nav: [
          { text: 'Inicio', link: '/es/' },
          { text: 'Guía', link: '/es/guide/installation' },
        ],
        sidebar: [
          {
            text: 'Introducción',
            items: [
              { text: 'Instalación', link: '/es/guide/installation' },
              { text: 'Comenzar', link: '/es/guide/getting-started' },
              { text: 'Patrocinar', link: '/es/guide/sponsor' },
              { text: 'Comunidad', link: '/es/guide/community' },
            ],
          },
          {
            text: 'Funcionalidades',
            items: [
              { text: 'Navegación de Línea de Tiempo', link: '/es/guide/timeline' },
              { text: 'Carpetas', link: '/es/guide/folders' },
              { text: 'Biblioteca de Prompts', link: '/es/guide/prompts' },
              { text: 'Sincronización en la Nube', link: '/es/guide/cloud-sync' },
              { text: 'Exportación de Chat', link: '/es/guide/export' },
              { text: 'Respuesta con Cita', link: '/es/guide/quote-reply' },
              { text: 'Ancho de Chat', link: '/es/guide/settings' },
              { text: 'Copia de Fórmulas', link: '/es/guide/formula-copy' },
              { text: 'Ancho de la barra lateral', link: '/es/guide/sidebar' },
              { text: 'Eliminación por Lote', link: '/es/guide/batch-delete' },
              { text: 'Exportación Deep Research', link: '/es/guide/deep-research' },
              { text: 'Gráficos Mermaid', link: '/es/guide/mermaid' },
              { text: 'NanoBanana', link: '/es/guide/nanobanana' },
              { text: 'Ocultar barra lateral auto', link: '/es/guide/sidebar-auto-hide' },
              { text: 'Colapso de Entrada', link: '/es/guide/input-collapse' },
              { text: 'Ocultar Elementos Recientes', link: '/es/guide/recents-hider' },
              { text: 'Modelo Predeterminado', link: '/es/guide/default-model' },
              { text: 'Sincronización de Título de Pestaña', link: '/es/guide/tab-title' },
              {
                text: 'Sincronización de contexto a IDE (Experimental)',
                link: '/es/guide/context-sync',
              },
            ],
          },
        ],
        footer: {
          message:
            'Proyecto de Código Abierto. Danos una ⭐ en <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> si te gusta.',
          copyright:
            'Licencia GPLv3 | Copyright © 2026 Jesse Zhang | <a href="/es/privacy">Política de Privacidad</a>',
        },
      },
    },
    pt: {
      label: 'Português',
      lang: 'pt-PT',
      link: '/pt/',
      themeConfig: {
        nav: [
          { text: 'Início', link: '/pt/' },
          { text: 'Guia', link: '/pt/guide/installation' },
        ],
        sidebar: [
          {
            text: 'Introdução',
            items: [
              { text: 'Instalação', link: '/pt/guide/installation' },
              { text: 'Começar', link: '/pt/guide/getting-started' },
              { text: 'Patrocinar', link: '/pt/guide/sponsor' },
              { text: 'Comunidade', link: '/pt/guide/community' },
            ],
          },
          {
            text: 'Funcionalidades',
            items: [
              { text: 'Navegação na Linha do Tempo', link: '/pt/guide/timeline' },
              { text: 'Pastas', link: '/pt/guide/folders' },
              { text: 'Biblioteca de Prompts', link: '/pt/guide/prompts' },
              { text: 'Sincronização na Nuvem', link: '/pt/guide/cloud-sync' },
              { text: 'Exportação de Chat', link: '/pt/guide/export' },
              { text: 'Resposta com Citação', link: '/pt/guide/quote-reply' },
              { text: 'Largura do Chat', link: '/pt/guide/settings' },
              { text: 'Cópia de Fórmulas', link: '/pt/guide/formula-copy' },
              { text: 'Largura da barra lateral', link: '/pt/guide/sidebar' },
              { text: 'Exclusão em Lote', link: '/pt/guide/batch-delete' },
              { text: 'Exportação Deep Research', link: '/pt/guide/deep-research' },
              { text: 'Gráficos Mermaid', link: '/pt/guide/mermaid' },
              { text: 'NanoBanana', link: '/pt/guide/nanobanana' },
              { text: 'Ocultar barra lateral auto', link: '/pt/guide/sidebar-auto-hide' },
              { text: 'Colapso de Entrada', link: '/pt/guide/input-collapse' },
              { text: 'Ocultar Itens Recentes', link: '/pt/guide/recents-hider' },
              { text: 'Modelo Padrão', link: '/pt/guide/default-model' },
              { text: 'Sincronização do Título da Aba', link: '/pt/guide/tab-title' },
              { text: 'Sincronização de Contexto (Experimental)', link: '/pt/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            'Projeto Open Source. Dê uma ⭐ no <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> se você gostar.',
          copyright:
            'Licença GPLv3 | Copyright © 2026 Jesse Zhang | <a href="/pt/privacy">Política de Privacidade</a>',
        },
      },
    },
    ar: {
      label: 'العربية',
      lang: 'ar-SA',
      link: '/ar/',
      dir: 'rtl',
      themeConfig: {
        nav: [
          { text: 'الرئيسية', link: '/ar/' },
          { text: 'الدليل', link: '/ar/guide/installation' },
        ],
        sidebar: [
          {
            text: 'مقدمة',
            items: [
              { text: 'التثبيت', link: '/ar/guide/installation' },
              { text: 'البدء', link: '/ar/guide/getting-started' },
              { text: 'رعاية', link: '/ar/guide/sponsor' },
              { text: 'المجتمع', link: '/ar/guide/community' },
            ],
          },
          {
            text: 'الميزات',
            items: [
              { text: 'تصفح الجدول الزمني', link: '/ar/guide/timeline' },
              { text: 'المجلدات', link: '/ar/guide/folders' },
              { text: 'مكتبة المطالبات', link: '/ar/guide/prompts' },
              { text: 'مزامنة السحابية', link: '/ar/guide/cloud-sync' },
              { text: 'تصدير الدردشة', link: '/ar/guide/export' },
              { text: 'الرد مع اقتباس', link: '/ar/guide/quote-reply' },
              { text: 'عرض الدردشة', link: '/ar/guide/settings' },
              { text: 'نسخ الصيغ', link: '/ar/guide/formula-copy' },
              { text: 'عرض الشريط الجانبي', link: '/ar/guide/sidebar' },
              { text: 'الحذف الجماعي', link: '/ar/guide/batch-delete' },
              { text: 'تصدير البحث العميق', link: '/ar/guide/deep-research' },
              { text: 'رسوم بيانية Mermaid', link: '/ar/guide/mermaid' },
              { text: 'NanoBanana', link: '/ar/guide/nanobanana' },
              { text: 'إخفاء الشريط الجانبي تلقائياً', link: '/ar/guide/sidebar-auto-hide' },
              { text: 'طي الإدخال', link: '/ar/guide/input-collapse' },
              { text: 'إخفاء العناصر الأخيرة', link: '/ar/guide/recents-hider' },
              { text: 'النموذج الافتراضي', link: '/ar/guide/default-model' },
              { text: 'مزامنة عنوان علامة التبويب', link: '/ar/guide/tab-title' },
              { text: 'مزامنة السياق (تجريبي)', link: '/ar/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            'مشروع مفتوح المصدر. امنحنا ⭐ على <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> إذا أعجبك.',
          copyright:
            'رخصة GPLv3 | حقوق النشر © 2026 Jesse Zhang | <a href="/ar/privacy">سياسة الخصوصية</a>',
        },
      },
    },
    ru: {
      label: 'Русский',
      lang: 'ru-RU',
      link: '/ru/',
      themeConfig: {
        nav: [
          { text: 'Главная', link: '/ru/' },
          { text: 'Руководство', link: '/ru/guide/installation' },
        ],
        sidebar: [
          {
            text: 'Введение',
            items: [
              { text: 'Установка', link: '/ru/guide/installation' },
              { text: 'Начало работы', link: '/ru/guide/getting-started' },
              { text: 'Поддержать', link: '/ru/guide/sponsor' },
              { text: 'Сообщество', link: '/ru/guide/community' },
            ],
          },
          {
            text: 'Функции',
            items: [
              { text: 'Навигация по таймлайну', link: '/ru/guide/timeline' },
              { text: 'Папки', link: '/ru/guide/folders' },
              { text: 'Библиотека промптов', link: '/ru/guide/prompts' },
              { text: 'Облачная синхронизация', link: '/ru/guide/cloud-sync' },
              { text: 'Экспорт чата', link: '/ru/guide/export' },
              { text: 'Ответ с цитированием', link: '/ru/guide/quote-reply' },
              { text: 'Ширина чата', link: '/ru/guide/settings' },
              { text: 'Копирование формул', link: '/ru/guide/formula-copy' },
              { text: 'Ширина боковой панели', link: '/ru/guide/sidebar' },
              { text: 'Пакетное удаление', link: '/ru/guide/batch-delete' },
              { text: 'Экспорт Deep Research', link: '/ru/guide/deep-research' },
              { text: 'Mermaid диаграммы', link: '/ru/guide/mermaid' },
              { text: 'NanoBanana', link: '/ru/guide/nanobanana' },
              { text: 'Авто-скрытие боковой панели', link: '/ru/guide/sidebar-auto-hide' },
              { text: 'Сворачивание ввода', link: '/ru/guide/input-collapse' },
              { text: 'Скрытие недавних элементов', link: '/ru/guide/recents-hider' },
              { text: 'Модель по умолчанию', link: '/ru/guide/default-model' },
              { text: 'Синхронизация заголовка', link: '/ru/guide/tab-title' },
              {
                text: 'Синхронизация контекста (Экспериментально)',
                link: '/ru/guide/context-sync',
              },
            ],
          },
        ],
        footer: {
          message:
            'Проект с открытым исходным кодом. Поставьте ⭐ на <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a>, если вам нравится.',
          copyright:
            'Лицензия GPLv3 | Copyright © 2026 Jesse Zhang | <a href="/ru/privacy">Политика конфиденциальности</a>',
        },
      },
    },
  },

  themeConfig: {
    logo: '/logo.png',
    socialLinks: [{ icon: 'github', link: 'https://github.com/Nagi-ovo/gemini-voyager' }],
  },
  vite: {
    ssr: {
      noExternal: ['vue3-marquee'],
    },
  },
});
