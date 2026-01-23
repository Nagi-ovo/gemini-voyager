import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
    base: '/',
    title: "Gemini Voyager",
    description: "直观的导航。强大的组织。简洁优雅。",
    lang: 'zh-CN',
    head: [
        ['link', { rel: 'icon', href: '/favicon.ico' }]
    ],

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
                            { text: '交流与反馈', link: '/guide/community' }
                        ]
                    },
                    {
                        text: '核心功能',
                        items: [
                            { text: '时间轴', link: '/guide/timeline' },
                            { text: '引用回复', link: '/guide/quote-reply' },
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
                            { text: '标签页标题同步', link: '/guide/tab-title' }
                        ]
                    }
                ],
                footer: {
                    message: '本项目开源。欢迎在 <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> 上给一颗 ⭐ 支持。',
                    copyright: '基于 MIT 协议发布 | Copyright © 2025 Jesse Zhang | <a href="/privacy">隐私政策</a>'
                }
            }
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
                            { text: 'Community', link: '/en/guide/community' }
                        ]
                    },
                    {
                        text: 'Features',
                        items: [
                            { text: 'Timeline Navigation', link: '/en/guide/timeline' },
                            { text: 'Quote Reply', link: '/en/guide/quote-reply' },
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
                            { text: 'Tab Title Sync', link: '/en/guide/tab-title' }
                        ]
                    }
                ],
                footer: {
                    message: 'Open source project. Star us on <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> if you like it ⭐.',
                    copyright: 'Released under the MIT License | Copyright © 2025 Jesse Zhang | <a href="/en/privacy">Privacy Policy</a>'
                }
            }
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
                            { text: 'コミュニティ', link: '/ja/guide/community' }
                        ]
                    },
                    {
                        text: '機能',
                        items: [
                            { text: 'タイムライン', link: '/ja/guide/timeline' },
                            { text: '引用返信', link: '/ja/guide/quote-reply' },
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
                            { text: 'タブタイトルの同期', link: '/ja/guide/tab-title' }
                        ]
                    }
                ],
                footer: {
                    message: 'オープンソースプロジェクトです。<a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> でスター ⭐ をつけて応援してください。',
                    copyright: 'MIT ライセンス | Copyright © 2025 Jesse Zhang | <a href="/ja/privacy">プライバシーポリシー</a>'
                }
            }
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
                            { text: 'Communauté', link: '/fr/guide/community' }
                        ]
                    },
                    {
                        text: 'Fonctionnalités',
                        items: [
                            { text: 'Navigation Temporelle', link: '/fr/guide/timeline' },
                            { text: 'Réponse avec Citation', link: '/fr/guide/quote-reply' },
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
                            { text: 'Synchro Titre Onglet', link: '/fr/guide/tab-title' }
                        ]
                    }
                ],
                footer: {
                    message: 'Projet Open Source. Mettez une ⭐ sur <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> si vous aimez.',
                    copyright: 'Licence MIT | Copyright © 2025 Jesse Zhang | <a href="/fr/privacy">Politique de Confidentialité</a>'
                }
            }
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
                            { text: 'Comunidad', link: '/es/guide/community' }
                        ]
                    },
                    {
                        text: 'Funcionalidades',
                        items: [
                            { text: 'Navegación de Línea de Tiempo', link: '/es/guide/timeline' },
                            { text: 'Respuesta con Cita', link: '/es/guide/quote-reply' },
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
                            { text: 'Sincronización de Título de Pestaña', link: '/es/guide/tab-title' }
                        ]
                    }
                ],
                footer: {
                    message: 'Proyecto de Código Abierto. Danos una ⭐ en <a href="https://github.com/Nagi-ovo/gemini-voyager" target="_blank">GitHub</a> si te gusta.',
                    copyright: 'Licencia MIT | Copyright © 2025 Jesse Zhang | <a href="/es/privacy">Política de Privacidad</a>'
                }
            }
        }
    },

    themeConfig: {
        logo: '/logo.png',
        socialLinks: [
            { icon: 'github', link: 'https://github.com/Nagi-ovo/gemini-voyager' }
        ]
    }
})
