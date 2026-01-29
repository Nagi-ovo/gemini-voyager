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
            text: '核心功能',
            items: [
              { text: '时间轴', link: '/guide/timeline' },
              { text: '引用回复', link: '/guide/quote-reply' },
              { text: '公式复制', link: '/guide/formula-copy' },
              { text: '文件夹', link: '/guide/folders' },
              { text: '批量删除', link: '/guide/batch-delete' },
              { text: '灵感库', link: '/guide/prompts' },
              { text: '自定义网站', link: '/guide/custom-websites' },
              { text: '对话导出', link: '/guide/export' },
              { text: 'Deep Research 导出', link: '/guide/deep-research' },
              { text: 'Mermaid 图表渲染', link: '/guide/mermaid' },
              { text: 'NanoBanana 水印去除', link: '/guide/nanobanana' },
              { text: '对话宽度调整', link: '/guide/settings' },
              { text: '输入框折叠', link: '/guide/input-collapse' },
              { text: '标签页标题同步', link: '/guide/tab-title' },
              { text: '上下文同步到IDE（实验性）', link: '/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            '本项目开源。欢迎在 <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> 上给一颗 ⭐ 支持。',
          copyright:
            '基于 MIT 协议发布 | Copyright © 2025 Jesse Zhang | <a href="/privacy">隐私政策</a>',
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
              { text: '引用回覆', link: '/zh_TW/guide/quote-reply' },
              { text: '公式複製', link: '/zh_TW/guide/formula-copy' },
              { text: '資料夾', link: '/zh_TW/guide/folders' },
              { text: '批次刪除', link: '/zh_TW/guide/batch-delete' },
              { text: '提示詞庫', link: '/zh_TW/guide/prompts' },
              { text: '自定義網站', link: '/zh_TW/guide/custom-websites' },
              { text: '對話導出', link: '/zh_TW/guide/export' },
              { text: 'Deep Research 導出', link: '/zh_TW/guide/deep-research' },
              { text: 'Mermaid 圖表', link: '/zh_TW/guide/mermaid' },
              { text: 'NanoBanana', link: '/zh_TW/guide/nanobanana' },
              { text: '對話寬度', link: '/zh_TW/guide/settings' },
              { text: '輸入框摺疊', link: '/zh_TW/guide/input-collapse' },
              { text: '標籤標題同步', link: '/zh_TW/guide/tab-title' },
              { text: '上下文同步（實驗性）', link: '/zh_TW/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            '開源專案。如果您喜歡，請在 <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> 上給我們一顆 ⭐。',
          copyright:
            'MIT 授權 | Copyright © 2025 Jesse Zhang | <a href="/zh_TW/privacy">隱私政策</a>',
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
              { text: 'Quote Reply', link: '/en/guide/quote-reply' },
              { text: 'Formula Copy', link: '/en/guide/formula-copy' },
              { text: 'Folder Organization', link: '/en/guide/folders' },
              { text: 'Batch Delete', link: '/en/guide/batch-delete' },
              { text: 'Prompt Library', link: '/en/guide/prompts' },
              { text: 'Custom Websites', link: '/en/guide/custom-websites' },
              { text: 'Chat Export', link: '/en/guide/export' },
              { text: 'Deep Research Export', link: '/en/guide/deep-research' },
              { text: 'Mermaid Diagram Rendering', link: '/en/guide/mermaid' },
              { text: 'NanoBanana (Watermark Remover)', link: '/en/guide/nanobanana' },
              { text: 'Chat Width Adjustment', link: '/en/guide/settings' },
              { text: 'Input Collapse', link: '/en/guide/input-collapse' },
              { text: 'Tab Title Sync', link: '/en/guide/tab-title' },
              { text: 'Context Sync to IDE (Experimental)', link: '/en/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            'Open source project. Star us on <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> if you like it ⭐.',
          copyright:
            'Released under the MIT License | Copyright © 2025 Jesse Zhang | <a href="/en/privacy">Privacy Policy</a>',
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
              { text: '引用返信', link: '/ja/guide/quote-reply' },
              { text: '数式コピー', link: '/ja/guide/formula-copy' },
              { text: 'フォルダ管理', link: '/ja/guide/folders' },
              { text: '一括削除', link: '/ja/guide/batch-delete' },
              { text: 'プロンプト', link: '/ja/guide/prompts' },
              { text: 'カスタムサイト', link: '/ja/guide/custom-websites' },
              { text: 'エクスポート', link: '/ja/guide/export' },
              { text: 'Deep Research', link: '/ja/guide/deep-research' },
              { text: 'Mermaid', link: '/ja/guide/mermaid' },
              { text: 'NanoBanana', link: '/ja/guide/nanobanana' },
              { text: 'チャット幅', link: '/ja/guide/settings' },
              { text: '入力欄の自動非表示', link: '/ja/guide/input-collapse' },
              { text: 'タブタイトルの同期', link: '/ja/guide/tab-title' },
              { text: 'IDEへのコンテキスト同期（実験的）', link: '/ja/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            'オープンソースプロジェクトです。<a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> でスター ⭐ をつけて応援してください。',
          copyright:
            'MIT ライセンス | Copyright © 2025 Jesse Zhang | <a href="/ja/privacy">プライバシーポリシー</a>',
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
              { text: 'Réponse avec Citation', link: '/fr/guide/quote-reply' },
              { text: 'Copie de Formules', link: '/fr/guide/formula-copy' },
              { text: 'Dossiers', link: '/fr/guide/folders' },
              { text: 'Suppression par Lot', link: '/fr/guide/batch-delete' },
              { text: 'Bibliothèque de Prompts', link: '/fr/guide/prompts' },
              { text: 'Sites Personnalisés', link: '/fr/guide/custom-websites' },
              { text: 'Export de Chat', link: '/fr/guide/export' },
              { text: 'Export Deep Research', link: '/fr/guide/deep-research' },
              { text: 'Diagrammes Mermaid', link: '/fr/guide/mermaid' },
              { text: 'NanoBanana', link: '/fr/guide/nanobanana' },
              { text: 'Largeur de Chat', link: '/fr/guide/settings' },
              { text: 'Réduction Entrée', link: '/fr/guide/input-collapse' },
              { text: 'Synchro Titre Onglet', link: '/fr/guide/tab-title' },
              {
                text: "Sync du contexte vers l'IDE (Expérimental)",
                link: '/fr/guide/context-sync',
              },
            ],
          },
        ],
        footer: {
          message:
            'Projet Open Source. Mettez une ⭐ sur <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> si vous aimez.',
          copyright:
            'Licence MIT | Copyright © 2025 Jesse Zhang | <a href="/fr/privacy">Politique de Confidentialité</a>',
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
              { text: 'Respuesta con Cita', link: '/es/guide/quote-reply' },
              { text: 'Copia de Fórmulas', link: '/es/guide/formula-copy' },
              { text: 'Carpetas', link: '/es/guide/folders' },
              { text: 'Eliminación por Lote', link: '/es/guide/batch-delete' },
              { text: 'Biblioteca de Prompts', link: '/es/guide/prompts' },
              { text: 'Sitios Personalizados', link: '/es/guide/custom-websites' },
              { text: 'Exportación de Chat', link: '/es/guide/export' },
              { text: 'Exportación Deep Research', link: '/es/guide/deep-research' },
              { text: 'Gráficos Mermaid', link: '/es/guide/mermaid' },
              { text: 'NanoBanana', link: '/es/guide/nanobanana' },
              { text: 'Ancho de Chat', link: '/es/guide/settings' },
              { text: 'Colapso de Entrada', link: '/es/guide/input-collapse' },
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
            'Licencia MIT | Copyright © 2025 Jesse Zhang | <a href="/es/privacy">Política de Privacidad</a>',
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
              { text: 'Resposta com Citação', link: '/pt/guide/quote-reply' },
              { text: 'Cópia de Fórmulas', link: '/pt/guide/formula-copy' },
              { text: 'Pastas', link: '/pt/guide/folders' },
              { text: 'Exclusão em Lote', link: '/pt/guide/batch-delete' },
              { text: 'Biblioteca de Prompts', link: '/pt/guide/prompts' },
              { text: 'Sites Personalizados', link: '/pt/guide/custom-websites' },
              { text: 'Exportação de Chat', link: '/pt/guide/export' },
              { text: 'Exportação Deep Research', link: '/pt/guide/deep-research' },
              { text: 'Gráficos Mermaid', link: '/pt/guide/mermaid' },
              { text: 'NanoBanana', link: '/pt/guide/nanobanana' },
              { text: 'Largura do Chat', link: '/pt/guide/settings' },
              { text: 'Colapso de Entrada', link: '/pt/guide/input-collapse' },
              { text: 'Sincronização do Título da Aba', link: '/pt/guide/tab-title' },
              { text: 'Sincronização de Contexto (Experimental)', link: '/pt/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            'Projeto Open Source. Dê uma ⭐ no <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> se você gostar.',
          copyright:
            'Licença MIT | Copyright © 2025 Jesse Zhang | <a href="/pt/privacy">Política de Privacidade</a>',
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
              { text: 'الرد مع اقتباس', link: '/ar/guide/quote-reply' },
              { text: 'نسخ الصيغ', link: '/ar/guide/formula-copy' },
              { text: 'المجلدات', link: '/ar/guide/folders' },
              { text: 'الحذف الجماعي', link: '/ar/guide/batch-delete' },
              { text: 'مكتبة المطالبات', link: '/ar/guide/prompts' },
              { text: 'مواقع مخصصة', link: '/ar/guide/custom-websites' },
              { text: 'تصدير الدردشة', link: '/ar/guide/export' },
              { text: 'تصدير البحث العميق', link: '/ar/guide/deep-research' },
              { text: 'رسوم بيانية Mermaid', link: '/ar/guide/mermaid' },
              { text: 'NanoBanana', link: '/ar/guide/nanobanana' },
              { text: 'عرض الدردشة', link: '/ar/guide/settings' },
              { text: 'طي الإدخال', link: '/ar/guide/input-collapse' },
              { text: 'مزامنة عنوان علامة التبويب', link: '/ar/guide/tab-title' },
              { text: 'مزامنة السياق (تجريبي)', link: '/ar/guide/context-sync' },
            ],
          },
        ],
        footer: {
          message:
            'مشروع مفتوح المصدر. امنحنا ⭐ على <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> إذا أعجبك.',
          copyright:
            'رخصة MIT | حقوق النشر © 2025 Jesse Zhang | <a href="/ar/privacy">سياسة الخصوصية</a>',
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
              { text: 'Ответ с цитированием', link: '/ru/guide/quote-reply' },
              { text: 'Копирование формул', link: '/ru/guide/formula-copy' },
              { text: 'Папки', link: '/ru/guide/folders' },
              { text: 'Пакетное удаление', link: '/ru/guide/batch-delete' },
              { text: 'Библиотека промптов', link: '/ru/guide/prompts' },
              { text: 'Пользовательские сайты', link: '/ru/guide/custom-websites' },
              { text: 'Экспорт чата', link: '/ru/guide/export' },
              { text: 'Экспорт Deep Research', link: '/ru/guide/deep-research' },
              { text: 'Mermaid диаграммы', link: '/ru/guide/mermaid' },
              { text: 'NanoBanana', link: '/ru/guide/nanobanana' },
              { text: 'Ширина чата', link: '/ru/guide/settings' },
              { text: 'Сворачивание ввода', link: '/ru/guide/input-collapse' },
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
            'Лицензия MIT | Copyright © 2025 Jesse Zhang | <a href="/ru/privacy">Политика конфиденциальности</a>',
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
