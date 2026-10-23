import {
  GitChangelog,
  GitChangelogMarkdownSection,
} from '@nolebase/vitepress-plugin-git-changelog/vite';
import { fileURLToPath } from 'node:url';
import { type HeadConfig, defineConfig } from 'vitepress';

import ar from './locales/ar';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import ja from './locales/ja';
import ko from './locales/ko';
import pt from './locales/pt';
import root from './locales/root';
import ru from './locales/ru';
import zh_TW from './locales/zh_TW';

// https://vitepress.dev/reference/site-config
const siteUrl = 'https://voyager.nagi.fun';

const localeHreflang: { prefix: string; hreflang: string }[] = [
  { prefix: '', hreflang: 'zh-CN' },
  { prefix: 'zh_TW/', hreflang: 'zh-TW' },
  { prefix: 'en/', hreflang: 'en-US' },
  { prefix: 'ja/', hreflang: 'ja-JP' },
  { prefix: 'ko/', hreflang: 'ko-KR' },
  { prefix: 'fr/', hreflang: 'fr-FR' },
  { prefix: 'es/', hreflang: 'es-ES' },
  { prefix: 'pt/', hreflang: 'pt-PT' },
  { prefix: 'ar/', hreflang: 'ar-SA' },
  { prefix: 'ru/', hreflang: 'ru-RU' },
];

export default defineConfig({
  base: '/',
  // public/ files are served verbatim; the agent skill there is raw Markdown, not a page.
  srcExclude: ['public/**'],
  title: 'Voyager',
  description: '直观的导航。强大的组织。简洁优雅。',
  lang: 'zh-CN',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { property: 'og:site_name', content: 'Voyager' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:image', content: `${siteUrl}/logo.png` }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:site', content: '@Nag1ovo' }],
  ],

  sitemap: {
    hostname: siteUrl,
  },

  // Changelog pages are generated per locale (`[lang]/changelog.paths.ts`); their
  // description rides on the route params since the template's front matter is shared.
  transformPageData(pageData) {
    const description = pageData.params?.description;
    if (typeof description === 'string') pageData.description = description;
  },

  transformHead({ pageData }) {
    const head: HeadConfig[] = [];
    const pagePath = pageData.relativePath.replace(/\.md$/, '.html').replace(/index\.html$/, '');
    const pageUrl = `${siteUrl}/${pagePath}`;
    const title = pageData.frontmatter.title || pageData.title;
    const description = pageData.frontmatter.description || pageData.description;

    head.push(['link', { rel: 'canonical', href: pageUrl }]);
    head.push(['meta', { property: 'og:title', content: title }]);
    head.push(['meta', { property: 'og:url', content: pageUrl }]);
    if (description) {
      head.push(['meta', { property: 'og:description', content: description }]);
    }

    const rawMdUrl = `https://raw.githubusercontent.com/voyager-crew/voyager/main/docs/${pageData.relativePath}`;
    head.push(['link', { rel: 'alternate', type: 'text/markdown', href: rawMdUrl }]);

    // hreflang alternates for all locales
    let basePath = pagePath;
    for (const { prefix } of localeHreflang) {
      if (prefix && pagePath.startsWith(prefix)) {
        basePath = pagePath.slice(prefix.length);
        break;
      }
    }
    for (const { prefix, hreflang } of localeHreflang) {
      head.push(['link', { rel: 'alternate', hreflang, href: `${siteUrl}/${prefix}${basePath}` }]);
    }
    head.push([
      'link',
      { rel: 'alternate', hreflang: 'x-default', href: `${siteUrl}/en/${basePath}` },
    ]);

    return head;
  },

  locales: {
    root,
    zh_TW,
    en,
    ja,
    ko,
    fr,
    es,
    pt,
    ar,
    ru,
  },

  themeConfig: {
    logo: '/logo.png',
    outline: [2, 4],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/voyager-crew/voyager' },
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
    ],
    search: {
      provider: 'local',
    },
  },
  vite: {
    resolve: {
      alias: [
        {
          // Exact match only: the shim itself imports the `date-fns/locale/<code>` subpaths.
          find: /^date-fns\/locale$/,
          replacement: fileURLToPath(new URL('./theme/dateFnsLocales.ts', import.meta.url)),
        },
      ],
    },
    plugins: [
      // vite 7 ↔ vitepress-bundled vite 5 Plugin type mismatch
      GitChangelog({
        repoURL: () => 'https://github.com/voyager-crew/voyager',
        // Only track the Chinese source docs to avoid 281-file EAGAIN;
        // translated copies share the same git history via the source.
        include: ['docs/guide/**/*.md'],
        maxGitLogCount: 200,
        // Collapse split identities into one contributor each, and give the
        // ones whose commit email is not a GitHub account a real avatar.
        mapAuthors: [
          {
            // The maintainer commits under two names and several emails
            // (incl. a typo'd trailing-dot noreply and a personal gmail).
            name: 'Nagi-ovo',
            username: 'Nagi-ovo',
            mapByNameAliases: ['Jesse Zhang'],
            mapByEmailAliases: [
              '101612750+Nagi-ovo@users.noreply.github.com',
              '101612750+Nagi-ovo@users.noreply.github.com.',
              'j3ssezhang102@gmail.com',
            ],
          },
          {
            // Every Claude model co-authors under noreply@anthropic.com but with
            // a different display name (Sonnet 5, Opus 4.6/4.7/4.8, Fable 5, …).
            // Merge them all by email; the avatar is the official claude[bot]
            // GitHub App (github.com/apps/claude) so it matches Claude's real
            // GitHub identity instead of a gravatar placeholder.
            name: 'Claude',
            avatar: 'https://avatars.githubusercontent.com/in/1236702?v=4',
            links: 'https://github.com/apps/claude',
            mapByEmailAliases: ['noreply@anthropic.com'],
          },
          {
            // OpenAI's Codex / GPT-5.5 co-authors under a few names; avatar is
            // the official chatgpt-codex-connector[bot] GitHub App.
            name: 'Codex',
            avatar: 'https://avatars.githubusercontent.com/in/1144995?v=4',
            links: 'https://github.com/apps/chatgpt-codex-connector',
            mapByEmailAliases: ['codex@openai.com', 'codex@users.noreply.github.com'],
          },
          {
            // Commits as "Windfall"; the GitHub account is "Winddfall" (two d's).
            name: 'Windfall',
            username: 'Winddfall',
            mapByEmailAliases: ['23373517@buaa.edu.cn', '794556487@qq.com'],
          },
          {
            name: 'ZidongChen25',
            username: 'ZidongChen25',
            mapByEmailAliases: [
              '164652964+ZidongChen25@users.noreply.github.com',
              'zchen223@sheffield.ac.uk',
            ],
          },
        ],
        // oxlint-disable-next-line typescript/no-explicit-any
      }) as any,
      // oxlint-disable-next-line typescript/no-explicit-any
      GitChangelogMarkdownSection() as any,
    ],
    ssr: {
      noExternal: ['vue3-marquee', '@nolebase/vitepress-plugin-git-changelog'],
    },
  },
});
