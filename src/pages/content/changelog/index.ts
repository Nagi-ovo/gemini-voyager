import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { StorageKeys } from '@/core/types/common';
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
 * Render the changelog modal DOM.
 */
function createChangelogModal(
  htmlContent: string,
  lang: AppLanguage,
): {
  overlay: HTMLDivElement;
  onClose: () => Promise<void>;
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

  // Footer
  const footer = document.createElement('div');
  footer.className = 'gv-changelog-footer';

  // Recommendation message
  const recommendation = document.createElement('p');
  recommendation.className = 'gv-changelog-recommendation';
  recommendation.textContent = t('changelog_recommendation', lang);

  // Action row: icons on the left, "Got it" button on the right
  const actionRow = document.createElement('div');
  actionRow.className = 'gv-changelog-action-row';

  const iconGroup = document.createElement('div');
  iconGroup.className = 'gv-changelog-icon-group';

  // Sponsor (heart) link
  const sponsorLink = document.createElement('a');
  sponsorLink.className = 'gv-changelog-icon-link gv-changelog-icon-sponsor';
  sponsorLink.href = 'https://github.com/sponsors/Nagi-ovo';
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
  iconGroup.appendChild(docsWrapper);

  const gotItBtn = document.createElement('button');
  gotItBtn.className = 'gv-changelog-got-it';
  gotItBtn.textContent = t('changelog_close', lang);

  actionRow.appendChild(iconGroup);
  actionRow.appendChild(gotItBtn);

  footer.appendChild(recommendation);
  footer.appendChild(actionRow);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);

  const onClose = async (): Promise<void> => {
    try {
      await chrome.storage.local.set({
        [StorageKeys.CHANGELOG_DISMISSED_VERSION]: EXTENSION_VERSION,
      });
    } catch {
      // Extension context may be invalidated
    }
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
  const localizedContent = extractLocalizedContent(rawMarkdown, lang);
  if (!localizedContent) return null;

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

  // 5. Inject modal
  const { overlay } = createChangelogModal(sanitizedHtml, lang);
  document.body.appendChild(overlay);
  return overlay;
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
