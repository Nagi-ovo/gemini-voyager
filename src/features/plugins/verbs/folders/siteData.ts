/**
 * A site's folders put together from data: where things are comes from the
 * `folders` section of its `site.json`, and everything that decides what is
 * written (bucket, keys, policy, file format, guide id, texts) from its row in
 * the core folder table (`features/folder/sites/folderSiteTable.ts`). A site
 * with no row, or one not keyed by its route alone, gets no folders here.
 */
import type { ConversationReference } from '@/core/types/folder';
import type { FolderPlatform } from '@/features/folder/platforms';
import { folderSiteOf } from '@/features/folder/sites/folderSiteTable';
import { routeFolderSiteOf } from '@/features/folder/sites/routeFolderSites';
import {
  openSiteConversation,
  pageTitle,
  readSiteConversation,
} from '@/features/folder/sites/sitePage';
import { PluginSiteFolderStore, createPluginSiteCommands } from '@/features/folder/sites/siteStore';
import type { FoldersSection } from '@/features/plugins/sites/sections/foldersData';
import type { SiteAdapter } from '@/features/plugins/types';

import { siteSectionCss } from './sectionCss';
import { createSectionDom } from './sectionDom';
import deepseekSkin from './skins/deepseek.css?raw';
import type { HideFiledDom, SiteFoldersAdapter } from './types';

/**
 * Each site's colour and metric tokens for the section's shadow root, which a
 * plugin stylesheet (page CSS) cannot reach; a site without one gets the
 * shared defaults.
 */
const SECTION_SKINS: Partial<Readonly<Record<FolderPlatform, string>>> = {
  deepseek: deepseekSkin,
};

/** Ids a hidden row may carry; anything else is never trusted. */
const ROW_ID = /^[A-Za-z0-9_-]+$/;

function hideFiledDom(section: FoldersSection, site: string): HideFiledDom {
  const attribute = `data-gv-${site}-filed`;
  const rows = section.hideFiled?.rows ?? section.rows.row;
  // A row holding focus (the site's own rename field) and the rows the site keeps shown stay.
  const kept = (section.hideFiled?.keepShown ?? []).map((selector) => `:not(${selector})`).join('');
  return {
    rowSelector: rows,
    filedAttribute: attribute,
    styleAttribute: `data-gv-${site}-hide-filed`,
    // `:is()` keeps a selector list's every branch under the conditions, not only its last.
    css: `:is(${rows})[${attribute}]${kept}:not(:focus-within) { display: none !important; }`,
    idPattern: ROW_ID,
  };
}

/** The site's folders from its `site.json` and the core table, or `null` where it has none. */
export function siteFoldersFromData(adapter: SiteAdapter | null): SiteFoldersAdapter | null {
  const section = adapter?.folders;
  const row = adapter ? folderSiteOf(adapter.id) : null;
  const route = row ? routeFolderSiteOf(row.site) : null;
  const panel = row?.prefs.keys.panel;
  const sectionPrefs = row?.prefs.keys.section;
  if (!section || !row?.messages || !row.guideId || !route || !panel || !sectionPrefs) return null;
  const { identity, transfer } = route;
  const { site, policy, config, messages } = row;
  const dom = createSectionDom(section, identity);
  const placeholders = new Set(section.page.placeholderTitles.any ?? []);
  const suffix = section.page.titleSuffix ? new RegExp(section.page.titleSuffix) : null;
  const isPlaceholderTitle = (title: string): boolean => placeholders.has(title);
  /** The open conversation's title from the tab, which without the site's suffix is the site's own page. */
  const tabTitle = (): string | null => {
    if (!suffix) return pageTitle(document, /$^/, isPlaceholderTitle);
    return suffix.test(document.title) ? pageTitle(document, suffix, isPlaceholderTitle) : null;
  };
  const hideFiled = hideFiledDom(section, site);
  const className = `gv-${site}-folder-section`;
  const conversationHref = (conversation: ConversationReference): string =>
    identity.read(conversation.url)?.url ?? '';
  /** The title the site shows for open conversation `id`: its sidebar row, else the tab title. */
  const shownTitle = (id: string): string | null => {
    const link = dom.link(id);
    const shown = link ? dom.title({ id, path: '', link }) : '';
    if (shown && !isPlaceholderTitle(shown)) return shown;
    return tabTitle();
  };

  return {
    key: `${site}-folders`,
    platform: site,
    policy,
    rootBucketId: config.rootBucketId,
    createFolders: (notify) => {
      const store = new PluginSiteFolderStore(config, identity.bareId, undefined, notify);
      const commands = createPluginSiteCommands({
        store,
        policy,
        importInto: transfer.importInto,
        readConversation: identity.read,
      });
      return { store, commands };
    },
    prefsKeys: { panel, section: sectionPrefs },
    identity: {
      storedId: (id) => `${identity.prefix}${id}`,
      bareId: identity.bareId,
      conversationIdOf: (href) => identity.read(href)?.conversationId ?? null,
      href: conversationHref,
    },
    page: {
      current: (untitled) => readSiteConversation(identity, shownTitle, untitled),
      open: (conversation) =>
        void openSiteConversation(identity, (id) => dom.link(id), conversation),
      isPlaceholderTitle,
    },
    sidebar: {
      find: dom.find,
      list: dom.list,
      title: dom.title,
      // Rows and their text are watched anyway; the section names any attribute that matters too.
      observedAttributes: ['href', hideFiled.filedAttribute, ...(section.rows.observe ?? [])],
    },
    section: {
      className,
      css: siteSectionCss(className, SECTION_SKINS[site]),
      anchor: dom.anchor,
      conversationHref,
      policy,
    },
    hideFiled,
    guide: {
      id: row.guideId,
      debugEvent: `gv:debug:${site}FoldersCoachmark`,
      titleKey: messages.guideTitle,
      bodyKey: messages.guideBody,
    },
    messages,
    transfer: { export: transfer.export, filename: () => transfer.filename() },
    native: { rowAt: (target) => dom.rowAt(target) },
  };
}
