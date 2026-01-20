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
        }
    },

    themeConfig: {
        logo: '/logo.png',
        socialLinks: [
            { icon: 'github', link: 'https://github.com/Nagi-ovo/gemini-voyager' }
        ]
    }
})
