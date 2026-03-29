import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { StorageKeys } from '@/core/types/common';
import { isChrome, isFirefox } from '@/core/utils/browser';
import { EXTENSION_VERSION } from '@/core/utils/version';
import { getCurrentLanguage } from '@/utils/i18n';
import type { AppLanguage } from '@/utils/language';
import { TRANSLATIONS, type TranslationKey } from '@/utils/translations';

/**
 * Dynamically import all markdown changelog files.
 * Keyed by relative path, e.g. './notes/1.2.8.md'
 */
const changelogModules = import.meta.glob('./notes/*.md', {
  query: '?raw',
  import: 'default',
  eager: false,
}) as Record<string, () => Promise<string>>;

const MARKDOWN_IMAGE_URL_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const MARKDOWN_DOC_LINK_REGEX = /\[([^\]]*)\]\((\/guide\/[^\s)]+)\)/g;

const GITHUB_PROMOTION_PATH_PREFIX =
  '/Nagi-ovo/gemini-voyager/raw/main/docs/public/assets/promotion/';
const RAW_GITHUBUSERCONTENT_PROMOTION_PATH_PREFIX =
  '/Nagi-ovo/gemini-voyager/main/docs/public/assets/promotion/';

function getPromotionRuntimePath(filename: string): string | null {
  switch (filename) {
    case 'Promo-Banner.png':
      return 'changelog-promo-banner.png';
    case 'Promo-Banner-cn.png':
      return 'changelog-promo-banner-cn.png';
    case 'Promo-Banner-jp.png':
      return 'changelog-promo-banner-jp.png';
    case 'Promo-Banner-KO.png':
      return 'changelog-promo-banner-ko.png';
    default:
      return null;
  }
}

function getRuntimeUrl(path: string): string | null {
  try {
    const runtime = (
      globalThis as typeof globalThis & {
        browser?: { runtime?: { getURL?: (assetPath: string) => string } };
        chrome?: { runtime?: { getURL?: (assetPath: string) => string } };
      }
    ).browser?.runtime;
    const fallbackRuntime = (
      globalThis as typeof globalThis & {
        chrome?: { runtime?: { getURL?: (assetPath: string) => string } };
      }
    ).chrome?.runtime;
    const getUrl = runtime?.getURL ?? fallbackRuntime?.getURL;
    return typeof getUrl === 'function' ? getUrl(path) : null;
  } catch {
    return null;
  }
}

function extractPromotionRuntimePath(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname;
  const isGithubPromotionImage =
    (host === 'github.com' && pathname.startsWith(GITHUB_PROMOTION_PATH_PREFIX)) ||
    (host === 'raw.githubusercontent.com' &&
      pathname.startsWith(RAW_GITHUBUSERCONTENT_PROMOTION_PATH_PREFIX));
  if (!isGithubPromotionImage) return null;

  const filename = pathname.split('/').pop();
  return filename ? getPromotionRuntimePath(filename) : null;
}

export function resolveChangelogImageUrl(
  url: string,
  runtimeUrlResolver: (path: string) => string | null = getRuntimeUrl,
): string {
  try {
    const parsed = new URL(url);
    const runtimePath = extractPromotionRuntimePath(parsed);
    if (!runtimePath) return url;

    const runtimeUrl = runtimeUrlResolver(runtimePath);
    return runtimeUrl ?? url;
  } catch {
    return url;
  }
}

export function rewriteChangelogImageUrls(
  markdown: string,
  runtimeUrlResolver: (path: string) => string | null = getRuntimeUrl,
  shouldRewrite: boolean = true,
): string {
  if (!shouldRewrite) return markdown;

  return markdown.replace(MARKDOWN_IMAGE_URL_REGEX, (full, alt, url) => {
    const resolvedUrl = resolveChangelogImageUrl(url, runtimeUrlResolver);
    if (resolvedUrl === url) return full;
    return `![${alt}](${resolvedUrl})`;
  });
}

/**
 * Rewrite relative doc links (e.g. `/guide/timeline`) in changelog markdown
 * to full locale-aware URLs (e.g. `https://voyager.nagi.fun/ja/guide/timeline`).
 * zh is the root locale and gets no prefix.
 */
export function rewriteChangelogDocUrls(markdown: string, lang: AppLanguage): string {
  const base = 'https://voyager.nagi.fun';
  return markdown.replace(MARKDOWN_DOC_LINK_REGEX, (_full, text, path) => {
    const url = lang === 'zh' ? `${base}${path}` : `${base}/${lang}${path}`;
    return `[${text}](${url})`;
  });
}

/**
 * Strip optional front matter (--- ... ---) from markdown.
 */
function stripFrontMatter(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return match ? match[1] : raw;
}

/**
 * Extract the section matching the user's language from a multi-language
 * markdown file. Falls back to 'en' if the requested language is missing.
 */
export function extractLocalizedContent(raw: string, lang: AppLanguage): string {
  const body = stripFrontMatter(raw);

  // Split by <!-- lang:xx --> markers
  const sections = new Map<string, string>();
  const parts = body.split(/<!--\s*lang:(\w+)\s*-->/);

  // parts[0] is text before the first marker (usually empty)
  // parts[1] = lang code, parts[2] = content, parts[3] = lang code, etc.
  for (let i = 1; i < parts.length; i += 2) {
    const langCode = parts[i];
    const content = parts[i + 1]?.trim() ?? '';
    if (langCode && content) {
      sections.set(langCode, content);
    }
  }

  return sections.get(lang) ?? sections.get('en') ?? '';
}

/**
 * Translate a key using an explicit language, bypassing cachedLanguage.
 * This avoids race conditions when initI18n() hasn't finished yet.
 */
function t(key: TranslationKey, lang: AppLanguage): string {
  return TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key] ?? key;
}

/**
 * Get the docs URL for the current language.
 * zh is the root locale (no prefix), others use /{locale}/ prefix.
 */
function getDocsUrl(lang: AppLanguage): string {
  const base = 'https://voyager.nagi.fun';
  const path = '/guide/getting-started';
  if (lang === 'zh') return `${base}${path}`;
  return `${base}/${lang}${path}`;
}

/**
 * Get the sponsor page URL for the current language.
 * zh is the root locale (no prefix), others use /{locale}/ prefix.
 */
function getSponsorUrl(lang: AppLanguage): string {
  const base = 'https://voyager.nagi.fun';
  const path = '/guide/sponsor.html';
  if (lang === 'zh') return `${base}${path}`;
  return `${base}/${lang}${path}`;
}

/**
 * Show a full-screen lightbox preview for the given image.
 */
function showImageLightbox(src: string, alt: string): void {
  const lightbox = document.createElement('div');
  lightbox.className = 'gv-changelog-lightbox';

  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.className = 'gv-changelog-lightbox-img';

  lightbox.appendChild(img);
  document.body.appendChild(lightbox);

  const close = (): void => {
    lightbox.remove();
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  lightbox.addEventListener('click', close);
  document.addEventListener('keydown', onKeyDown);
}

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/gemini-voyager/iifacdnjakkhjjiengaffnegbndgingi';

/**
 * Read the current changelog notification mode.
 */
async function readNotifyMode(): Promise<'popup' | 'badge'> {
  try {
    const result = await chrome.storage.local.get(StorageKeys.CHANGELOG_NOTIFY_MODE);
    const mode = result[StorageKeys.CHANGELOG_NOTIFY_MODE];
    return mode === 'badge' ? 'badge' : 'popup';
  } catch {
    return 'popup';
  }
}

/**
 * Render the changelog modal DOM.
 */
function createChangelogModal(
  htmlContent: string,
  lang: AppLanguage,
  initialNotifyMode: 'popup' | 'badge' = 'popup',
): {
  overlay: HTMLDivElement;
  onClose: () => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'gv-changelog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'gv-changelog-dialog';

  // Header
  const header = document.createElement('div');
  header.className = 'gv-changelog-header';

  const title = document.createElement('span');
  title.className = 'gv-changelog-title';
  title.textContent = t('changelog_title', lang);

  const version = document.createElement('span');
  version.className = 'gv-changelog-version';
  version.textContent = `v${EXTENSION_VERSION}`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'gv-changelog-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close');

  header.appendChild(title);
  header.appendChild(version);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'gv-changelog-body';
  body.innerHTML = htmlContent;

  // Bind image zoom on all images in the body
  body.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    img.addEventListener('click', () => showImageLightbox(img.src, img.alt));
  });

  // Footer
  const footer = document.createElement('div');
  footer.className = 'gv-changelog-footer';

  // Recommendation message
  const recommendation = document.createElement('p');
  recommendation.className = 'gv-changelog-recommendation';
  recommendation.textContent = t('changelog_recommendation', lang);

  // Social media handles row
  const socialRow = document.createElement('div');
  socialRow.className = 'gv-changelog-social-row';
  const socialAccounts = [
    {
      name: t('changelog_social_xiaohongshu', lang),
      handle: '@Nagi-ovo',
      url: 'https://www.xiaohongshu.com/user/profile/5d366136000000001101950a',
      color: '#FF2442',
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z"/></svg>',
    },
    {
      handle: '@Nag1ovo',
      url: 'https://x.com/Nag1ovo',
      color: '',
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.26 5.632 5.904-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    },
    {
      name: t('changelog_social_zhihu', lang),
      handle: '@Nagi-ovo',
      url: 'https://www.zhihu.com/people/bu-xue-hao-shu-xue-wu-li-bu-gai-ming',
      color: '#0066FF',
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5.721 0C2.251 0 0 2.25 0 5.719V18.28C0 21.751 2.252 24 5.721 24h12.56C21.751 24 24 21.75 24 18.281V5.72C24 2.249 21.75 0 18.281 0zm1.964 4.078c-.271.73-.5 1.434-.68 2.11h4.587c.545-.006.445 1.168.445 1.171H9.384a58.104 58.104 0 01-.112 3.797h2.712c.388.023.393 1.251.393 1.266H9.183a9.223 9.223 0 01-.408 2.102l.757-.604c.452.456 1.512 1.712 1.906 2.177.473.681.063 2.081.063 2.081l-2.794-3.382c-.653 2.518-1.845 3.607-1.845 3.607-.523.468-1.58.82-2.64.516 2.218-1.73 3.44-3.917 3.667-6.497H4.491c0-.015.197-1.243.806-1.266h2.71c.024-.32.086-3.254.086-3.797H6.598c-.136.406-.158.447-.268.753-.594 1.095-1.603 1.122-1.907 1.155.906-1.821 1.416-3.6 1.591-4.064.425-1.124 1.671-1.125 1.671-1.125zM13.078 6h6.377v11.33h-2.573l-2.184 1.373-.401-1.373h-1.219zm1.313 1.219v8.86h.623l.263.937 1.455-.938h1.456v-8.86z"/></svg>',
    },
    {
      name: 'Bilibili',
      handle: '@卡普迪姆',
      url: 'https://space.bilibili.com/312249633',
      color: '#FB7299',
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 01-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 01.16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z"/></svg>',
    },
  ];

  for (const account of socialAccounts) {
    const item = document.createElement('a');
    item.className = 'gv-changelog-social-item';
    item.href = account.url;
    item.target = '_blank';
    item.rel = 'noopener noreferrer';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'gv-changelog-social-icon';
    iconSpan.innerHTML = account.icon;
    if (account.color) {
      iconSpan.style.color = account.color;
    }
    const textSpan = document.createElement('span');
    textSpan.textContent = account.name ? `${account.name} ${account.handle}` : account.handle;
    item.appendChild(iconSpan);
    item.appendChild(textSpan);
    socialRow.appendChild(item);
  }

  // Action row: icons on the left, "Got it" button on the right
  const actionRow = document.createElement('div');
  actionRow.className = 'gv-changelog-action-row';

  const iconGroup = document.createElement('div');
  iconGroup.className = 'gv-changelog-icon-group';

  // Sponsor (heart) link
  const sponsorLink = document.createElement('a');
  sponsorLink.className = 'gv-changelog-icon-link gv-changelog-icon-sponsor';
  sponsorLink.href = getSponsorUrl(lang);
  sponsorLink.target = '_blank';
  sponsorLink.rel = 'noopener noreferrer';
  sponsorLink.setAttribute('aria-label', 'Sponsor');
  sponsorLink.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  // GitHub link
  const githubLink = document.createElement('a');
  githubLink.className = 'gv-changelog-icon-link gv-changelog-icon-github';
  githubLink.href = 'https://github.com/Nagi-ovo/gemini-voyager';
  githubLink.target = '_blank';
  githubLink.rel = 'noopener noreferrer';
  githubLink.setAttribute('aria-label', 'GitHub');
  githubLink.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>';

  // X (Twitter) link
  const xLink = document.createElement('a');
  xLink.className = 'gv-changelog-icon-link gv-changelog-icon-x';
  xLink.href = 'https://x.com/Nag1ovo';
  xLink.target = '_blank';
  xLink.rel = 'noopener noreferrer';
  xLink.setAttribute('aria-label', 'X (Twitter)');
  xLink.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.26 5.632 5.904-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';

  // Docs link with annotation
  const docsWrapper = document.createElement('div');
  docsWrapper.className = 'gv-changelog-docs-wrapper';

  const docsAnnotation = document.createElement('span');
  docsAnnotation.className = 'gv-changelog-docs-annotation';
  docsAnnotation.textContent = t('changelog_docs_hint', lang);

  const docsLink = document.createElement('a');
  docsLink.className = 'gv-changelog-icon-link gv-changelog-icon-docs';
  docsLink.href = getDocsUrl(lang);
  docsLink.target = '_blank';
  docsLink.rel = 'noopener noreferrer';
  docsLink.setAttribute('aria-label', t('changelog_docs_link', lang));
  // Open-book icon
  docsLink.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>';

  docsWrapper.appendChild(docsAnnotation);
  docsWrapper.appendChild(docsLink);

  iconGroup.appendChild(sponsorLink);
  iconGroup.appendChild(githubLink);
  iconGroup.appendChild(xLink);
  iconGroup.appendChild(docsWrapper);

  const gotItBtn = document.createElement('button');
  gotItBtn.className = 'gv-changelog-got-it';
  gotItBtn.textContent = t('changelog_close', lang);

  actionRow.appendChild(iconGroup);
  actionRow.appendChild(gotItBtn);

  // Notification mode toggle
  const notifyToggle = document.createElement('div');
  notifyToggle.className = 'gv-changelog-notify-toggle';

  const notifyLabel = document.createElement('label');
  notifyLabel.className = 'gv-changelog-notify-label';

  const notifyCheckbox = document.createElement('input');
  notifyCheckbox.type = 'checkbox';
  notifyCheckbox.className = 'gv-changelog-notify-checkbox';
  notifyCheckbox.checked = initialNotifyMode === 'badge';

  const notifyText = document.createElement('span');
  notifyText.textContent = t('changelog_badge_mode', lang);

  notifyLabel.appendChild(notifyCheckbox);
  notifyLabel.appendChild(notifyText);
  notifyToggle.appendChild(notifyLabel);

  notifyCheckbox.addEventListener('change', () => {
    const mode = notifyCheckbox.checked ? 'badge' : 'popup';
    try {
      const updates: Record<string, string> = {
        [StorageKeys.CHANGELOG_NOTIFY_MODE]: mode,
      };
      // When switching to badge mode, clear dismissed version so badge appears
      if (mode === 'badge') {
        updates[StorageKeys.CHANGELOG_DISMISSED_VERSION] = '';
      }
      chrome.storage.local.set(updates);
    } catch {
      // Ignore errors
    }
  });

  footer.appendChild(recommendation);
  footer.appendChild(socialRow);
  footer.appendChild(notifyToggle);

  // Chrome Web Store rating prompt (Chrome only)
  if (isChrome()) {
    const ratingBanner = document.createElement('div');
    ratingBanner.className = 'gv-changelog-chrome-rating';

    const ratingText = document.createElement('span');
    ratingText.className = 'gv-changelog-chrome-rating-text';
    ratingText.textContent = t('changelog_rate_chrome', lang);

    const ratingLink = document.createElement('a');
    ratingLink.className = 'gv-changelog-chrome-rating-link';
    ratingLink.href = CHROME_STORE_URL;
    ratingLink.target = '_blank';
    ratingLink.rel = 'noopener noreferrer';
    ratingLink.textContent = `⭐ ${t('changelog_rate_chrome_cta', lang)}`;

    ratingBanner.appendChild(ratingText);
    ratingBanner.appendChild(ratingLink);
    footer.appendChild(ratingBanner);
  }

  footer.appendChild(actionRow);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);

  const onClose = (): void => {
    overlay.remove();
  };

  closeBtn.addEventListener('click', onClose);
  gotItBtn.addEventListener('click', onClose);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      onClose();
    }
  });

  return { overlay, onClose };
}

/**
 * Load and render the changelog modal.
 * @param version - Which version's changelog to show (defaults to EXTENSION_VERSION)
 * @param skipDismissCheck - Skip the dismissed-version check
 */
async function showChangelogModal(
  version = EXTENSION_VERSION,
  skipDismissCheck = false,
): Promise<HTMLDivElement | null> {
  // 1. Check dismissed version
  if (!skipDismissCheck) {
    const result = await chrome.storage.local.get(StorageKeys.CHANGELOG_DISMISSED_VERSION);
    const dismissedVersion = result[StorageKeys.CHANGELOG_DISMISSED_VERSION] as string | undefined;
    if (dismissedVersion === EXTENSION_VERSION) return null;
  }

  // 2. Try to load the changelog for the target version
  const modulePath = `./notes/${version}.md`;
  const loader = changelogModules[modulePath];
  if (!loader) return null;

  const rawMarkdown = await loader();

  // 3. Get current language and extract localized content
  const lang = await getCurrentLanguage();
  const extracted = extractLocalizedContent(rawMarkdown, lang);
  if (!extracted) return null;
  const localizedContent = rewriteChangelogDocUrls(
    rewriteChangelogImageUrls(extracted, getRuntimeUrl, isFirefox()),
    lang,
  );

  // 4. Convert markdown to HTML
  const rawHtml = await marked.parse(localizedContent);
  const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'hr',
      'ul',
      'ol',
      'li',
      'strong',
      'em',
      'code',
      'pre',
      'a',
      'img',
      'blockquote',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class'],
  });

  // 5. Mark as dismissed BEFORE showing — ensures the modal never re-appears
  //    even if the user navigates away without clicking "Got it".
  //    If this write fails (e.g. extension context invalidated), skip showing
  //    the modal entirely; it will be shown on the next load with a valid context.
  try {
    await chrome.storage.local.set({
      [StorageKeys.CHANGELOG_DISMISSED_VERSION]: EXTENSION_VERSION,
    });
  } catch {
    return null;
  }

  // 6. Inject modal
  const notifyMode = await readNotifyMode();
  const { overlay } = createChangelogModal(sanitizedHtml, lang, notifyMode);
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Open the changelog modal for the current version (always shows, no dismiss check).
 */
export async function openChangelog(): Promise<void> {
  await showChangelogModal(EXTENSION_VERSION, true);
}

/**
 * Check if the current version has an unread changelog.
 */
export async function hasUnreadChangelog(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(StorageKeys.CHANGELOG_DISMISSED_VERSION);
    const dismissed = result[StorageKeys.CHANGELOG_DISMISSED_VERSION] as string | undefined;
    return dismissed !== EXTENSION_VERSION;
  } catch {
    return false;
  }
}

/**
 * Show the changelog modal directly (used by badge mode in prompt manager).
 * Returns a Promise that resolves when the modal is closed.
 */
export async function showChangelogModalDirect(): Promise<void> {
  const overlay = await showChangelogModal(EXTENSION_VERSION, true);
  if (!overlay) {
    // No notes found for this version — dismiss anyway so badge doesn't persist
    try {
      await chrome.storage.local.set({
        [StorageKeys.CHANGELOG_DISMISSED_VERSION]: EXTENSION_VERSION,
      });
    } catch {
      // Ignore
    }
    return;
  }

  // Return promise that resolves when overlay is removed
  return new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!overlay.isConnected) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true });
  });
}

/**
 * Start the changelog feature.
 * Shows a version-based changelog popup when the user upgrades to a new version.
 * Returns a cleanup function.
 */
export async function startChangelog(): Promise<() => void> {
  let overlayRef: HTMLDivElement | null = null;

  // Debug helper: switch DevTools console context to this extension's content script
  // (dropdown next to "top" in the console), then call:
  //   __gvChangelog()          — show current version
  //   __gvChangelog('1.2.8')   — show specific version
  (window as unknown as Record<string, unknown>).__gvChangelog = (version?: string) => {
    showChangelogModal(version ?? EXTENSION_VERSION, true);
  };

  try {
    // In badge mode, skip auto-showing the modal (prompt manager handles it)
    const notifyMode = await readNotifyMode();
    if (notifyMode === 'badge') {
      return () => {};
    }

    overlayRef = await showChangelogModal();
  } catch {
    // Silently fail — changelog is non-critical
  }

  return () => {
    if (overlayRef) {
      overlayRef.remove();
      overlayRef = null;
    }
  };
}
