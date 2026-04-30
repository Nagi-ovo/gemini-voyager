import {
  GitChangelog,
  GitChangelogMarkdownSection,
} from '@nolebase/vitepress-plugin-git-changelog/vite';
import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/',
  title: 'Voyager',
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
              { text: 'Markdown 渲染修复', link: '/guide/markdown-fix' },
              { text: 'NanoBanana 水印去除', link: '/guide/nanobanana' },
              { text: '侧边栏自动收起', link: '/guide/sidebar-auto-hide' },
              { text: '防自动跳转', link: '/guide/prevent-auto-scroll' },
              { text: '输入框折叠', link: '/guide/input-collapse' },
              { text: '隐藏最近项目和 Gem', link: '/guide/recents-hider' },
              { text: '默认模型', link: '/guide/default-model' },
              { text: '标签页标题同步', link: '/guide/tab-title' },
              { text: '对话分支 (实验性)', link: '/guide/fork' },
              { text: '上下文同步到IDE（实验性）', link: '/guide/context-sync' },
              { text: '用户消息 LaTeX 渲染', link: '/guide/user-latex' },
              { text: '消息时间戳', link: '/guide/timestamp' },
              { text: '发送行为', link: '/guide/send-behavior' },
              { text: '字体大小', link: '/guide/chat-font-size' },
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
            text: '通用功能 (Gemini & AI Studio)',
            items: [
              { text: '資料夾', link: '/zh_TW/guide/folders' },
              { text: '提示詞庫', link: '/zh_TW/guide/prompts' },
              { text: '雲同步', link: '/zh_TW/guide/cloud-sync' },
              { text: '公式複製', link: '/zh_TW/guide/formula-copy' },
              { text: '側邊欄寬度', link: '/zh_TW/guide/sidebar' },
            ],
          },
          {
            text: 'Gemini 專屬功能',
            items: [
              { text: '時間軸導航', link: '/zh_TW/guide/timeline' },
              { text: '對話導出', link: '/zh_TW/guide/export' },
              { text: '引用回覆', link: '/zh_TW/guide/quote-reply' },
              { text: '對話寬度', link: '/zh_TW/guide/settings' },
              { text: '批次刪除', link: '/zh_TW/guide/batch-delete' },
              { text: 'Deep Research 導出', link: '/zh_TW/guide/deep-research' },
              { text: 'Mermaid 圖表', link: '/zh_TW/guide/mermaid' },
              { text: 'Markdown 渲染修復', link: '/zh_TW/guide/markdown-fix' },
              { text: 'NanoBanana', link: '/zh_TW/guide/nanobanana' },
              { text: '側邊欄自動收起', link: '/zh_TW/guide/sidebar-auto-hide' },
              { text: '防自動跳轉', link: '/zh_TW/guide/prevent-auto-scroll' },
              { text: '輸入框摺疊', link: '/zh_TW/guide/input-collapse' },
              { text: '隱藏最近項目和 Gem', link: '/zh_TW/guide/recents-hider' },
              { text: '預設模型', link: '/zh_TW/guide/default-model' },
              { text: '標籤標題同步', link: '/zh_TW/guide/tab-title' },
              { text: '對話分支 (實驗性)', link: '/zh_TW/guide/fork' },
              { text: '上下文同步（實驗性）', link: '/zh_TW/guide/context-sync' },
              { text: '使用者訊息 LaTeX 渲染', link: '/zh_TW/guide/user-latex' },
              { text: '訊息時間戳', link: '/zh_TW/guide/timestamp' },
              { text: '傳送行為', link: '/zh_TW/guide/send-behavior' },
              { text: '字體大小', link: '/zh_TW/guide/chat-font-size' },
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
            text: 'Common Features (Gemini & AI Studio)',
            items: [
              { text: 'Folder Organization', link: '/en/guide/folders' },
              { text: 'Prompt Library', link: '/en/guide/prompts' },
              { text: 'Cloud Sync', link: '/en/guide/cloud-sync' },
              { text: 'Formula Copy', link: '/en/guide/formula-copy' },
              { text: 'Sidebar Width', link: '/en/guide/sidebar' },
            ],
          },
          {
            text: 'Gemini Exclusive Features',
            items: [
              { text: 'Timeline Navigation', link: '/en/guide/timeline' },
              { text: 'Chat Export', link: '/en/guide/export' },
              { text: 'Quote Reply', link: '/en/guide/quote-reply' },
              { text: 'Chat Width Adjustment', link: '/en/guide/settings' },
              { text: 'Batch Delete', link: '/en/guide/batch-delete' },
              { text: 'Deep Research Export', link: '/en/guide/deep-research' },
              { text: 'Mermaid Diagram Rendering', link: '/en/guide/mermaid' },
              { text: 'Markdown Rendering Fix', link: '/en/guide/markdown-fix' },
              { text: 'NanoBanana (Watermark Remover)', link: '/en/guide/nanobanana' },
              { text: 'Sidebar Auto-hide', link: '/en/guide/sidebar-auto-hide' },
              { text: 'Prevent Auto Scroll', link: '/en/guide/prevent-auto-scroll' },
              { text: 'Input Collapse', link: '/en/guide/input-collapse' },
              { text: 'Hide Recent Items and Gems', link: '/en/guide/recents-hider' },
              { text: 'Default Model', link: '/en/guide/default-model' },
              { text: 'Tab Title Sync', link: '/en/guide/tab-title' },
              { text: 'Conversation Fork (Experimental)', link: '/en/guide/fork' },
              { text: 'Context Sync to IDE (Experimental)', link: '/en/guide/context-sync' },
              { text: 'User Message LaTeX Rendering', link: '/en/guide/user-latex' },
              { text: 'Message Timestamps', link: '/en/guide/timestamp' },
              { text: 'Send Behavior', link: '/en/guide/send-behavior' },
              { text: 'Font Size', link: '/en/guide/chat-font-size' },
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
            text: '共通機能 (Gemini & AI Studio)',
            items: [
              { text: 'フォルダ管理', link: '/ja/guide/folders' },
              { text: 'プロンプト', link: '/ja/guide/prompts' },
              { text: 'クラウド同期', link: '/ja/guide/cloud-sync' },
              { text: '数식コピー', link: '/ja/guide/formula-copy' },
              { text: 'サイドバーの幅', link: '/ja/guide/sidebar' },
            ],
          },
          {
            text: 'Gemini 専用機能',
            items: [
              { text: 'タイムライン', link: '/ja/guide/timeline' },
              { text: 'エクスポート', link: '/ja/guide/export' },
              { text: '引用返信', link: '/ja/guide/quote-reply' },
              { text: 'チャット幅', link: '/ja/guide/settings' },
              { text: '一括削除', link: '/ja/guide/batch-delete' },
              { text: 'Deep Research', link: '/ja/guide/deep-research' },
              { text: 'Mermaid', link: '/ja/guide/mermaid' },
              { text: 'Markdown レンダリングの修正', link: '/ja/guide/markdown-fix' },
              { text: 'NanoBanana', link: '/ja/guide/nanobanana' },
              { text: 'サイドバー自動非表示', link: '/ja/guide/sidebar-auto-hide' },
              { text: '自動スクロール防止', link: '/ja/guide/prevent-auto-scroll' },
              { text: '入力欄の自動非表示', link: '/ja/guide/input-collapse' },
              { text: '最近の項目と Gem を非表示', link: '/ja/guide/recents-hider' },
              { text: 'デフォルトモデル', link: '/ja/guide/default-model' },
              { text: 'タブタイトルの同期', link: '/ja/guide/tab-title' },
              { text: '会話の分岐 (実験的)', link: '/ja/guide/fork' },
              { text: 'IDEへのコンテキスト同期（実験的）', link: '/ja/guide/context-sync' },
              { text: 'ユーザーメッセージ LaTeX レンダリング', link: '/ja/guide/user-latex' },
              { text: 'メッセージタイムスタンプ', link: '/ja/guide/timestamp' },
              { text: '送信動作', link: '/ja/guide/send-behavior' },
              { text: 'フォントサイズ', link: '/ja/guide/chat-font-size' },
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
    ko: {
      label: '한국어',
      lang: 'ko-KR',
      link: '/ko/',
      themeConfig: {
        nav: [
          { text: '홈', link: '/ko/' },
          { text: '가이드', link: '/ko/guide/installation' },
        ],
        sidebar: [
          {
            text: '소개',
            items: [
              { text: '설치', link: '/ko/guide/installation' },
              { text: '시작하기', link: '/ko/guide/getting-started' },
              { text: '후원', link: '/ko/guide/sponsor' },
              { text: '커뮤니티', link: '/ko/guide/community' },
            ],
          },
          {
            text: '공통 기능 (Gemini & AI Studio)',
            items: [
              { text: '폴더 관리', link: '/ko/guide/folders' },
              { text: '프롬프트 라이브러리', link: '/ko/guide/prompts' },
              { text: '클라우드 동기화', link: '/ko/guide/cloud-sync' },
              { text: '수식 복사', link: '/ko/guide/formula-copy' },
              { text: '사이드바 너비', link: '/ko/guide/sidebar' },
            ],
          },
          {
            text: 'Gemini 전용 기능',
            items: [
              { text: '타임라인 탐색', link: '/ko/guide/timeline' },
              { text: '대화 내보내기', link: '/ko/guide/export' },
              { text: '인용 답장', link: '/ko/guide/quote-reply' },
              { text: '대화 너비 조정', link: '/ko/guide/settings' },
              { text: '일괄 삭제', link: '/ko/guide/batch-delete' },
              { text: 'Deep Research 내보내기', link: '/ko/guide/deep-research' },
              { text: 'Mermaid 다이어그램 렌더링', link: '/ko/guide/mermaid' },
              { text: 'Markdown 렌더링 수정', link: '/ko/guide/markdown-fix' },
              { text: 'NanoBanana (워터마크 제거)', link: '/ko/guide/nanobanana' },
              { text: '사이드바 자동 숨김', link: '/ko/guide/sidebar-auto-hide' },
              { text: '자동 스크롤 방지', link: '/ko/guide/prevent-auto-scroll' },
              { text: '입력창 접기', link: '/ko/guide/input-collapse' },
              { text: '최근 항목 및 Gem 숨기기', link: '/ko/guide/recents-hider' },
              { text: '기본 모델', link: '/ko/guide/default-model' },
              { text: '탭 제목 동기화', link: '/ko/guide/tab-title' },
              { text: '대화 분기 (실험적)', link: '/ko/guide/fork' },
              { text: 'IDE 컨텍스트 동기화 (실험적)', link: '/ko/guide/context-sync' },
              { text: '사용자 메시지 LaTeX 렌더링', link: '/ko/guide/user-latex' },
              { text: '메시지 타임스탬프', link: '/ko/guide/timestamp' },
              { text: '전송 동작', link: '/ko/guide/send-behavior' },
              { text: '글꼴 크기', link: '/ko/guide/chat-font-size' },
            ],
          },
        ],
        footer: {
          message:
            '오픈 소스 프로젝트입니다. 마음에 드신다면 <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a>에서 ⭐를 눌러주세요.',
          copyright:
            'GPLv3 라이선스 하에 배포됨 | Copyright © 2026 Jesse Zhang | <a href="/ko/privacy">개인정보 처리방침</a>',
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
            text: 'Fonctionnalités Communes (Gemini & AI Studio)',
            items: [
              { text: 'Dossiers', link: '/fr/guide/folders' },
              { text: 'Bibliothèque de Prompts', link: '/fr/guide/prompts' },
              { text: 'Synchronisation Cloud', link: '/fr/guide/cloud-sync' },
              { text: 'Copie de Formules', link: '/fr/guide/formula-copy' },
              { text: 'Largeur de la barre latérale', link: '/fr/guide/sidebar' },
            ],
          },
          {
            text: 'Fonctionnalités Exclusives Gemini',
            items: [
              { text: 'Navigation Temporelle', link: '/fr/guide/timeline' },
              { text: 'Export de Chat', link: '/fr/guide/export' },
              { text: 'Réponse avec Citation', link: '/fr/guide/quote-reply' },
              { text: 'Largeur de Chat', link: '/fr/guide/settings' },
              { text: 'Suppression par Lot', link: '/fr/guide/batch-delete' },
              { text: 'Export Deep Research', link: '/fr/guide/deep-research' },
              { text: 'Diagrammes Mermaid', link: '/fr/guide/mermaid' },
              { text: 'Correction du Rendu Markdown', link: '/fr/guide/markdown-fix' },
              { text: 'NanoBanana', link: '/fr/guide/nanobanana' },
              { text: 'Masquage auto barre latérale', link: '/fr/guide/sidebar-auto-hide' },
              { text: 'Empêcher le défilement auto', link: '/fr/guide/prevent-auto-scroll' },
              { text: 'Réduction Entrée', link: '/fr/guide/input-collapse' },
              { text: 'Masquer les éléments récents et les Gems', link: '/fr/guide/recents-hider' },
              { text: 'Modèle par Défaut', link: '/fr/guide/default-model' },
              { text: 'Synchro Titre Onglet', link: '/fr/guide/tab-title' },
              { text: 'Bifurcation de Conversation (Expérimental)', link: '/fr/guide/fork' },
              { text: 'Synchro Contexte IDE', link: '/fr/guide/context-sync' },
              { text: 'Rendu LaTeX des messages', link: '/fr/guide/user-latex' },
              { text: 'Horodatage des Messages', link: '/fr/guide/timestamp' },
              { text: "Comportement d'Envoi", link: '/fr/guide/send-behavior' },
              { text: 'Taille de Police', link: '/fr/guide/chat-font-size' },
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
            text: 'Funciones Comunes (Gemini & AI Studio)',
            items: [
              { text: 'Carpetas', link: '/es/guide/folders' },
              { text: 'Biblioteca de Prompts', link: '/es/guide/prompts' },
              { text: 'Sincronización en la Nube', link: '/es/guide/cloud-sync' },
              { text: 'Copia de Fórmulas', link: '/es/guide/formula-copy' },
              { text: 'Ancho de la barra lateral', link: '/es/guide/sidebar' },
            ],
          },
          {
            text: 'Funciones Exclusivas de Gemini',
            items: [
              { text: 'Navegación de Línea de Tiempo', link: '/es/guide/timeline' },
              { text: 'Exportación de Chat', link: '/es/guide/export' },
              { text: 'Respuesta con Cita', link: '/es/guide/quote-reply' },
              { text: 'Ancho de Chat', link: '/es/guide/settings' },
              { text: 'Eliminación por Lote', link: '/es/guide/batch-delete' },
              { text: 'Exportación Deep Research', link: '/es/guide/deep-research' },
              { text: 'Gráficos Mermaid', link: '/es/guide/mermaid' },
              { text: 'Corrección de Renderizado Markdown', link: '/es/guide/markdown-fix' },
              { text: 'NanoBanana', link: '/es/guide/nanobanana' },
              { text: 'Ocultar barra lateral auto', link: '/es/guide/sidebar-auto-hide' },
              { text: 'Evitar desplazamiento automático', link: '/es/guide/prevent-auto-scroll' },
              { text: 'Colapso de Entrada', link: '/es/guide/input-collapse' },
              { text: 'Ocultar elementos recientes y Gems', link: '/es/guide/recents-hider' },
              { text: 'Modelo Predeterminado', link: '/es/guide/default-model' },
              {
                text: 'Sincronización de Título de Pestaña',
                link: '/es/guide/tab-title',
              },
              {
                text: 'Bifurcación de Conversación (Experimental)',
                link: '/es/guide/fork',
              },
              {
                text: 'Sincronización de contexto a IDE (Experimental)',
                link: '/es/guide/context-sync',
              },
              { text: 'Renderizado LaTeX de mensajes', link: '/es/guide/user-latex' },
              { text: 'Marca de Tiempo', link: '/es/guide/timestamp' },
              { text: 'Comportamiento de Envío', link: '/es/guide/send-behavior' },
              { text: 'Tamaño de Fuente', link: '/es/guide/chat-font-size' },
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
            text: 'Funcionalidades Comuns (Gemini & AI Studio)',
            items: [
              { text: 'Pastas', link: '/pt/guide/folders' },
              { text: 'Biblioteca de Prompts', link: '/pt/guide/prompts' },
              { text: 'Sincronização na Nuvem', link: '/pt/guide/cloud-sync' },
              { text: 'Cópia de Fórmulas', link: '/pt/guide/formula-copy' },
              { text: 'Largura da barra lateral', link: '/pt/guide/sidebar' },
            ],
          },
          {
            text: 'Funcionalidades Exclusivas Gemini',
            items: [
              { text: 'Navegação na Linha do Tempo', link: '/pt/guide/timeline' },
              { text: 'Exportação de Chat', link: '/pt/guide/export' },
              { text: 'Resposta com Citação', link: '/pt/guide/quote-reply' },
              { text: 'Largura do Chat', link: '/pt/guide/settings' },
              { text: 'Exclusão em Lote', link: '/pt/guide/batch-delete' },
              { text: 'Exportação Deep Research', link: '/pt/guide/deep-research' },
              { text: 'Gráficos Mermaid', link: '/pt/guide/mermaid' },
              { text: 'Correção de Renderização Markdown', link: '/pt/guide/markdown-fix' },
              { text: 'NanoBanana', link: '/pt/guide/nanobanana' },
              { text: 'Ocultar barra lateral auto', link: '/pt/guide/sidebar-auto-hide' },
              { text: 'Prevenir rolamento automático', link: '/pt/guide/prevent-auto-scroll' },
              { text: 'Colapso de Entrada', link: '/pt/guide/input-collapse' },
              { text: 'Ocultar Itens Recentes e Gems', link: '/pt/guide/recents-hider' },
              { text: 'Modelo Padrão', link: '/pt/guide/default-model' },
              { text: 'Sincronização do Título da Aba', link: '/pt/guide/tab-title' },
              { text: 'Bifurcação de Conversa (Experimental)', link: '/pt/guide/fork' },
              { text: 'Sincronização de Contexto (Experimental)', link: '/pt/guide/context-sync' },
              { text: 'Renderização LaTeX de mensagens', link: '/pt/guide/user-latex' },
              { text: 'Carimbo de Data/Hora', link: '/pt/guide/timestamp' },
              { text: 'Comportamento de Envio', link: '/pt/guide/send-behavior' },
              { text: 'Tamanho da Fonte', link: '/pt/guide/chat-font-size' },
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
            text: 'الميزات العامة (Gemini & AI Studio)',
            items: [
              { text: 'المجلدات', link: '/ar/guide/folders' },
              { text: 'مكتبة المطالبات', link: '/ar/guide/prompts' },
              { text: 'مزامنة السحابية', link: '/ar/guide/cloud-sync' },
              { text: 'نسخ الصيغ', link: '/ar/guide/formula-copy' },
              { text: 'عرض الشريط الجانبي', link: '/ar/guide/sidebar' },
            ],
          },
          {
            text: 'ميزات Gemini الحصرية',
            items: [
              { text: 'تصفح الجدول الزمني', link: '/ar/guide/timeline' },
              { text: 'تصدير الدردشة', link: '/ar/guide/export' },
              { text: 'الرد مع اقتباس', link: '/ar/guide/quote-reply' },
              { text: 'عرض الدردشة', link: '/ar/guide/settings' },
              { text: 'الحذف الجماعي', link: '/ar/guide/batch-delete' },
              { text: 'تصدير البحث العميق', link: '/ar/guide/deep-research' },
              { text: 'رسوم بيانية Mermaid', link: '/ar/guide/mermaid' },
              { text: 'إصلاح عرض Markdown', link: '/ar/guide/markdown-fix' },
              { text: 'NanoBanana', link: '/ar/guide/nanobanana' },
              { text: 'إخفاء الشريط الجانبي تلقائياً', link: '/ar/guide/sidebar-auto-hide' },
              { text: 'منع التمرير التلقائي', link: '/ar/guide/prevent-auto-scroll' },
              { text: 'طي الإدخال', link: '/ar/guide/input-collapse' },
              { text: 'إخفاء العناصر الأخيرة والـ Gems', link: '/ar/guide/recents-hider' },
              { text: 'النموذج الافتراضي', link: '/ar/guide/default-model' },
              { text: 'مزامنة عنوان علامة التبويب', link: '/ar/guide/tab-title' },
              { text: 'تفريع المحادثة (تجريبي)', link: '/ar/guide/fork' },
              { text: 'مزامنة السياق (تجريبي)', link: '/ar/guide/context-sync' },
              { text: 'عرض LaTeX في رسائل المستخدم', link: '/ar/guide/user-latex' },
              { text: 'طابع الوقت', link: '/ar/guide/timestamp' },
              { text: 'سلوك الإرسال', link: '/ar/guide/send-behavior' },
              { text: 'حجم الخط', link: '/ar/guide/chat-font-size' },
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
            text: 'Общие функции (Gemini & AI Studio)',
            items: [
              { text: 'Папки', link: '/ru/guide/folders' },
              { text: 'Библиотека промптов', link: '/ru/guide/prompts' },
              { text: 'Облачная синхронизация', link: '/ru/guide/cloud-sync' },
              { text: 'Копирование формул', link: '/ru/guide/formula-copy' },
              { text: 'Ширина боковой панели', link: '/ru/guide/sidebar' },
            ],
          },
          {
            text: 'Эксклюзивные функции Gemini',
            items: [
              { text: 'Навигация по таймлайну', link: '/ru/guide/timeline' },
              { text: 'Экспорт чата', link: '/ru/guide/export' },
              { text: 'Ответ с цитированием', link: '/ru/guide/quote-reply' },
              { text: 'Ширина чата', link: '/ru/guide/settings' },
              { text: 'Пакетное удаление', link: '/ru/guide/batch-delete' },
              { text: 'Экспорт Deep Research', link: '/ru/guide/deep-research' },
              { text: 'Mermaid диаграммы', link: '/ru/guide/mermaid' },
              { text: 'Исправление рендеринга Markdown', link: '/ru/guide/markdown-fix' },
              { text: 'NanoBanana', link: '/ru/guide/nanobanana' },
              { text: 'Авто-скрытие боковой панели', link: '/ru/guide/sidebar-auto-hide' },
              { text: 'Предотвращение автопрокрутки', link: '/ru/guide/prevent-auto-scroll' },
              { text: 'Сворачивание ввода', link: '/ru/guide/input-collapse' },
              { text: 'Скрытие недавних элементов и Gems', link: '/ru/guide/recents-hider' },
              { text: 'Модель по умолчанию', link: '/ru/guide/default-model' },
              {
                text: 'Синхронизация заголовка',
                link: '/ru/guide/tab-title',
              },
              {
                text: 'Ветвление разговора (Экспериментально)',
                link: '/ru/guide/fork',
              },
              {
                text: 'Синхронизация контекста (Экспериментально)',
                link: '/ru/guide/context-sync',
              },
              { text: 'Рендеринг LaTeX в сообщениях', link: '/ru/guide/user-latex' },
              { text: 'Временные метки сообщений', link: '/ru/guide/timestamp' },
              { text: 'Поведение отправки', link: '/ru/guide/send-behavior' },
              { text: 'Размер шрифта', link: '/ru/guide/chat-font-size' },
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
    outline: [2, 4],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Nagi-ovo/gemini-voyager' },
      { icon: 'x', link: 'https://x.com/Nag1ovo' },
      { icon: 'discord', link: 'https://discord.gg/TEUFxdMbGb' },
      { icon: 'bilibili', link: 'https://space.bilibili.com/312249633' },
      {
        icon: {
          svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z"/></svg>',
        },
        link: 'https://www.xiaohongshu.com/user/profile/5d366136000000001101950a',
        ariaLabel: 'Xiaohongshu',
      },
      { icon: 'zhihu', link: 'https://www.zhihu.com/people/bu-xue-hao-shu-xue-wu-li-bu-gai-ming' },
    ],
    search: {
      provider: 'local',
    },
  },
  vite: {
    plugins: [
      GitChangelog({
        repoURL: () => 'https://github.com/Nagi-ovo/gemini-voyager',
        // Only track the Chinese source docs to avoid 281-file EAGAIN;
        // translated copies share the same git history via the source.
        include: ['docs/guide/**/*.md'],
        maxGitLogCount: 200,
      }),
      GitChangelogMarkdownSection(),
    ],
    ssr: {
      noExternal: ['vue3-marquee', '@nolebase/vitepress-plugin-git-changelog'],
    },
  },
});
