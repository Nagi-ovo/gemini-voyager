/**
 * The "supported platforms" table a guide page opens with (`<SiteSupport>`): a
 * row per capability of one feature, a column per site. Every tick is read from
 * what the extension ships, so a new site is one more column and a capability
 * wired on one more site gains its tick without anyone editing a page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PLATFORM_LOGOS } from '../../src/core/icons/platformLogos';
import { BUILTIN_PLUGINS } from '../../src/features/plugins/builtin/index';
import { HIDE_FILED_SETTING } from '../../src/features/plugins/builtin/siteFolders/hideFiled';
import { sendInputsOf } from '../../src/features/plugins/sends/sendInputs';
import type { PluginManifest, SiteAdapter } from '../../src/features/plugins/types';
import {
  type NativePopupPlatform,
  isNativePopupSettingAvailable,
} from '../../src/pages/popup/utils/nativeSiteCapabilities';
import { platformMarkSvg } from './changelog';
import {
  CATALOG_DIR,
  FRESH_INSTALL_ON,
  type FeatureRow,
  PLUGINS_LOCALES,
  PLUGIN_SITES,
  type PluginSite,
  builtinPlugins,
  catalogPlugins,
  featureRows,
  onByDefault,
} from './pluginsPage';

/** `on`: works without the reader switching anything on. */
export type SupportCell = 'on' | 'yes' | '';

export interface SupportRow {
  /** The feature id for the feature's own row, else the capability's id. */
  id: string;
  /** In `PLUGIN_SITES` order. */
  cells: SupportCell[];
}

/** What one site offers of a feature, as the capability checks see it. */
export interface SiteFeature {
  site: PluginSite;
  /** The feature's plugins on this site; empty where it runs natively. */
  plugins: readonly PluginManifest[];
  /** Runs without a plugin, in Voyager's own Gemini and AI Studio code. */
  native: boolean;
  /** The site's bundled `catalog/sites/<site>/site.json`, if it has one. */
  adapter: SiteAdapter | null;
}

type Capability = (site: SiteFeature) => boolean;

const NATIVE_POPUP_SITES: readonly PluginSite[] = ['gemini', 'aistudio'];

function isNativePopupSite(site: PluginSite): site is NativePopupPlatform & PluginSite {
  return NATIVE_POPUP_SITES.includes(site);
}

/**
 * A native site's popup Folder Options row (`nativeSiteCapabilities.ts`); plugin
 * sites never get that card (`Popup.tsx` wraps it without `allowPluginSite`).
 */
function folderOption(settingId: string): Capability {
  return ({ site, native }) =>
    native && isNativePopupSite(site) && isNativePopupSettingAvailable(site, 'folder', settingId);
}

/**
 * Activity needs send times. Plugin sites record them where their site.json names
 * what tells sends apart (`sendInputsOf`); Gemini's own folder manager mounts the
 * Activity list itself (`pages/content/folder/FolderSidebarView.ts`), which AI
 * Studio's tree does not. This is the one native fact no data describes.
 */
const NATIVE_ACTIVITY: ReadonlySet<PluginSite> = new Set(['gemini']);

/** Rows after a feature's own, in the order a page lists them. */
const FEATURE_CAPABILITIES: Readonly<Record<string, Readonly<Record<string, Capability>>>> = {
  folders: {
    'hide-filed': (entry) =>
      entry.native
        ? folderOption('hideArchivedConversations')(entry)
        : entry.plugins.some(
            (manifest) => manifest.contributes.settings?.[HIDE_FILED_SETTING] !== undefined,
          ),
    activity: (entry) =>
      entry.native ? NATIVE_ACTIVITY.has(entry.site) : sendInputsOf(entry.adapter) !== null,
    // Cloud sync has no row: every folder site has a Drive file by construction
    // (`features/folder/platforms.ts`, which this build cannot import).
    'account-isolation': folderOption('enableAccountIsolation'),
    projects: folderOption('folderAsProject'),
    'ai-organize': folderOption('aiOrgCopy'),
  },
};

/** The feature's own row, then one per capability; empty for an unknown feature. */
export function supportRows(
  feature: string,
  rows: readonly FeatureRow[],
  adapters: Partial<Record<PluginSite, SiteAdapter>>,
  defaultEnabled: ReadonlySet<string>,
): SupportRow[] {
  const row = rows.find((candidate) => candidate.feature === feature);
  if (!row) return [];
  const entries = PLUGIN_SITES.map((site): SiteFeature | null => {
    const native = row.native.includes(site);
    const plugins = row.plugins[site] ?? [];
    if (!native && plugins.length === 0) return null;
    return { site, plugins, native, adapter: adapters[site] ?? null };
  });
  const own: SupportRow = {
    id: feature,
    cells: entries.map((entry) =>
      entry ? (onByDefault(row, entry.site, defaultEnabled) ? 'on' : 'yes') : '',
    ),
  };
  const capabilities = Object.entries(FEATURE_CAPABILITIES[feature] ?? {}).map(
    ([id, offered]): SupportRow => ({
      id,
      cells: entries.map((entry) => (entry && offered(entry) ? 'yes' : '')),
    }),
  );
  return [own, ...capabilities];
}

function bundledAdapters(): Partial<Record<PluginSite, SiteAdapter>> {
  const adapters: Partial<Record<PluginSite, SiteAdapter>> = {};
  for (const site of PLUGIN_SITES) {
    const file = join(CATALOG_DIR, 'sites', site, 'site.json');
    // Only its plain fields are read here (`sendInputsOf`), never `capabilities`.
    if (existsSync(file)) adapters[site] = JSON.parse(readFileSync(file, 'utf8')) as SiteAdapter;
  }
  return adapters;
}

export interface SiteSupportData {
  sites: { id: PluginSite; label: string; mark: string }[];
  /** Every feature the plugin table has, by feature id. */
  features: Record<string, SupportRow[]>;
  /** By VitePress locale key (`root` is Chinese): the first header and the legend. */
  locales: Record<string, { feature: string; defaultOn: string }>;
}

export function loadSiteSupport(): SiteSupportData {
  const rows = featureRows([...builtinPlugins(BUILTIN_PLUGINS), ...catalogPlugins()]);
  const adapters = bundledAdapters();
  return {
    sites: PLUGIN_SITES.map((id) => ({
      id,
      label: PLATFORM_LOGOS[id].label,
      mark: platformMarkSvg(PLATFORM_LOGOS[id]),
    })),
    features: Object.fromEntries(
      rows.map((row) => [row.feature, supportRows(row.feature, rows, adapters, FRESH_INSTALL_ON)]),
    ),
    locales: Object.fromEntries(
      PLUGINS_LOCALES.map((locale) => [
        locale.prefix || 'root',
        { feature: locale.feature, defaultOn: locale.defaultOn },
      ]),
    ),
  };
}
