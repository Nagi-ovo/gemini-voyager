/**
 * The guide's plugin page: one table of what Voyager adds to ChatGPT, Claude and
 * DeepSeek, a row per feature and a tick per site. Built from the plugins the
 * extension ships (the native builtins and the bundled catalog), so a new plugin
 * shows up here without anyone editing the page.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATFORM_LOGOS } from '../../src/core/icons/platformLogos';
import { BUILTIN_PLUGINS } from '../../src/features/plugins/builtin/index';
import { DEFAULT_ENABLED_PLUGIN_IDS } from '../../src/features/plugins/storage/pluginDefaults';
import type { PluginManifest } from '../../src/features/plugins/types';
import { platformMarkSvg } from './changelog';

export const CATALOG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/features/plugins/catalog',
);

export const PLUGIN_SITES = ['chatgpt', 'claude', 'deepseek'] as const;
type PluginSite = (typeof PLUGIN_SITES)[number];

const SITE_HOSTS: Readonly<Record<PluginSite, readonly string[]>> = {
  chatgpt: ['chatgpt.com', 'chat.openai.com'],
  claude: ['claude.ai'],
  deepseek: ['chat.deepseek.com'],
};

/** Rows in reading order: the features people come for first. Unlisted ones follow. */
const FEATURE_ORDER = [
  'folders',
  'timeline',
  'export',
  'response-notification',
  'quote-reply',
  'formula-copy',
  'ctrl-enter-send',
  'draft-save',
  'composer-counter',
  'reading-width',
  'reading-typography',
  'input-vim',
  'collapse-long-messages',
  'user-latex',
  'diagram-rendering',
  'temporary-handoff',
  'table-copy',
  'code-collapse',
  'wrap-code',
  'copy-thinking',
  'cjk-render-fix',
];
/** One feature shipped under different names on different sites. */
const FEATURE_ALIASES: Readonly<Record<string, string>> = { 'vim-input': 'input-vim' };

interface PluginsLocale {
  /** The manifests' `i18n` key; English is the manifest's own text. */
  manifest: string;
  prefix: string;
  title: string;
  intro: string;
  feature: string;
  defaultOn: string;
  disclaimer: string;
}

export const PLUGINS_LOCALES: readonly PluginsLocale[] = [
  {
    manifest: 'zh',
    prefix: '',
    title: '插件一览',
    intro:
      '在 Claude、ChatGPT 或 DeepSeek 页面点开 Voyager 弹窗，开启插件并允许访问该网站即可使用，更新自动送达。',
    feature: '功能',
    defaultOn: '默认开启',
    disclaimer:
      'Claude、ChatGPT、DeepSeek 等名称与标志为其各自所有者的商标。Voyager 与 Anthropic、OpenAI、DeepSeek 无关联，亦未获其背书。',
  },
  {
    manifest: 'zh_TW',
    prefix: 'zh_TW',
    title: '外掛一覽',
    intro:
      '在 Claude、ChatGPT 或 DeepSeek 頁面點開 Voyager 彈窗，開啟外掛並允許存取該網站即可使用，更新自動送達。',
    feature: '功能',
    defaultOn: '預設開啟',
    disclaimer:
      'Claude、ChatGPT、DeepSeek 等名稱與標誌為其各自所有者的商標。Voyager 與 Anthropic、OpenAI、DeepSeek 無關聯，亦未獲其背書。',
  },
  {
    manifest: 'en',
    prefix: 'en',
    title: 'All plugins',
    intro:
      'Open the Voyager popup on a Claude, ChatGPT or DeepSeek page, turn a plugin on and allow access to the site. Updates arrive automatically.',
    feature: 'Feature',
    defaultOn: 'on by default',
    disclaimer:
      'Claude, ChatGPT, DeepSeek and other names and logos are trademarks of their respective owners. Voyager is not affiliated with, or endorsed by, Anthropic, OpenAI or DeepSeek.',
  },
  {
    manifest: 'ja',
    prefix: 'ja',
    title: 'プラグイン一覧',
    intro:
      'Claude、ChatGPT、DeepSeek のページで Voyager のポップアップを開き、プラグインをオンにしてサイトへのアクセスを許可するだけ。更新は自動で届きます。',
    feature: '機能',
    defaultOn: '既定でオン',
    disclaimer:
      'Claude、ChatGPT、DeepSeek などの名称およびロゴは各所有者の商標です。Voyager は Anthropic・OpenAI・DeepSeek とは関係なく、承認も受けていません。',
  },
  {
    manifest: 'ko',
    prefix: 'ko',
    title: '플러그인 목록',
    intro:
      'Claude, ChatGPT 또는 DeepSeek 페이지에서 Voyager 팝업을 열고 플러그인을 켠 다음 사이트 접근을 허용하면 됩니다. 업데이트는 자동으로 제공됩니다.',
    feature: '기능',
    defaultOn: '기본 켜짐',
    disclaimer:
      'Claude, ChatGPT, DeepSeek 등의 이름과 로고는 각 소유자의 상표입니다. Voyager는 Anthropic, OpenAI 또는 DeepSeek와 제휴하거나 보증받지 않았습니다.',
  },
  {
    manifest: 'fr',
    prefix: 'fr',
    title: 'Tous les plugins',
    intro:
      'Ouvrez la fenêtre de Voyager sur une page Claude, ChatGPT ou DeepSeek, activez un plugin et autorisez l’accès au site. Les mises à jour arrivent automatiquement.',
    feature: 'Fonction',
    defaultOn: 'activé par défaut',
    disclaimer:
      'Claude, ChatGPT, DeepSeek et les autres noms et logos sont des marques de leurs propriétaires respectifs. Voyager n’est ni affilié à Anthropic, OpenAI ou DeepSeek, ni approuvé par eux.',
  },
  {
    manifest: 'es',
    prefix: 'es',
    title: 'Todos los plugins',
    intro:
      'Abre la ventana de Voyager en una página de Claude, ChatGPT o DeepSeek, activa un plugin y permite el acceso al sitio. Las actualizaciones llegan automáticamente.',
    feature: 'Función',
    defaultOn: 'activado por defecto',
    disclaimer:
      'Claude, ChatGPT, DeepSeek y otros nombres y logotipos son marcas de sus respectivos propietarios. Voyager no está afiliado ni respaldado por Anthropic, OpenAI o DeepSeek.',
  },
  {
    manifest: 'pt',
    prefix: 'pt',
    title: 'Todos os plugins',
    intro:
      'Abra a janela do Voyager numa página do Claude, ChatGPT ou DeepSeek, ative um plugin e permita o acesso ao site. As atualizações chegam automaticamente.',
    feature: 'Funcionalidade',
    defaultOn: 'ativado por predefinição',
    disclaimer:
      'Claude, ChatGPT, DeepSeek e outros nomes e logótipos são marcas dos respetivos proprietários. O Voyager não tem qualquer afiliação ou aprovação da Anthropic, da OpenAI ou da DeepSeek.',
  },
  {
    manifest: 'ar',
    prefix: 'ar',
    title: 'كل الإضافات',
    intro:
      'افتح نافذة Voyager على صفحة Claude أو ChatGPT أو DeepSeek، ثم فعّل الإضافة واسمح بالوصول إلى الموقع. تصل التحديثات تلقائيًا.',
    feature: 'الميزة',
    defaultOn: 'مفعّلة افتراضيًا',
    disclaimer:
      'أسماء وشعارات Claude وChatGPT وDeepSeek وغيرها علامات تجارية لأصحابها. Voyager غير مرتبط بـ Anthropic أو OpenAI أو DeepSeek ولا يحظى بموافقتها.',
  },
  {
    manifest: 'ru',
    prefix: 'ru',
    title: 'Все плагины',
    intro:
      'Откройте всплывающее окно Voyager на странице Claude, ChatGPT или DeepSeek, включите плагин и разрешите доступ к сайту. Обновления приходят автоматически.',
    feature: 'Функция',
    defaultOn: 'включено по умолчанию',
    disclaimer:
      'Claude, ChatGPT, DeepSeek и другие названия и логотипы являются товарными знаками их владельцев. Voyager не связан с Anthropic, OpenAI или DeepSeek и не одобрен ими.',
  },
];

export interface SitePlugin {
  site: PluginSite;
  /** The same feature on another site shares this key. */
  feature: string;
  manifest: PluginManifest;
}

export interface FeatureRow {
  feature: string;
  /** Per site, in `PLUGIN_SITES` order; the first one present names the row. */
  plugins: Partial<Record<PluginSite, PluginManifest>>;
}

function siteOf(manifest: PluginManifest): PluginSite[] {
  return PLUGIN_SITES.filter((site) =>
    manifest.matches.some((match) => SITE_HOSTS[site].some((host) => match.includes(`//${host}/`))),
  );
}

/** Builtins named `voyager.<site>-<feature>` or `voyager.<feature>` for several sites. */
export function builtinPlugins(manifests: readonly PluginManifest[]): SitePlugin[] {
  return manifests.flatMap((manifest) =>
    siteOf(manifest).map((site) => ({
      site,
      feature: manifest.id.replace(/^voyager\./, '').replace(`${site}-`, ''),
      manifest,
    })),
  );
}

/** Catalog plugins live at `sites/<site>/plugins/<feature>/plugin.json`. */
function catalogPlugins(): SitePlugin[] {
  const market = JSON.parse(readFileSync(join(CATALOG_DIR, 'marketplace.json'), 'utf8')) as {
    plugins: { source: string }[];
  };
  return market.plugins.flatMap(({ source }) => {
    const [, site, , feature] = source.split('/');
    if (!(PLUGIN_SITES as readonly string[]).includes(site)) return [];
    const manifest = JSON.parse(readFileSync(join(CATALOG_DIR, source), 'utf8')) as PluginManifest;
    return [{ site: site as PluginSite, feature, manifest }];
  });
}

export function featureRows(plugins: readonly SitePlugin[]): FeatureRow[] {
  const rows = new Map<string, FeatureRow>();
  for (const { site, feature, manifest } of plugins) {
    const key = FEATURE_ALIASES[feature] ?? feature;
    const row = rows.get(key) ?? { feature: key, plugins: {} };
    row.plugins[site] ??= manifest;
    rows.set(key, row);
  }
  const rank = (feature: string) => {
    const index = FEATURE_ORDER.indexOf(feature);
    return index === -1 ? FEATURE_ORDER.length : index;
  };
  return [...rows.values()].sort((a, b) => rank(a.feature) - rank(b.feature));
}

/** "ChatGPT · Quote replies" → "Quote replies": the site is the column. */
function featureName(manifest: PluginManifest, locale: string): string {
  const name = manifest.i18n?.[locale]?.name ?? manifest.name;
  return name.replace(/^[^·]*·\s*/, '');
}

export function renderPluginsPage(
  locale: PluginsLocale,
  rows: readonly FeatureRow[],
  defaultEnabled: ReadonlySet<string>,
): string {
  const header = PLUGIN_SITES.map(
    (site) => `${platformMarkSvg(PLATFORM_LOGOS[site])}${PLATFORM_LOGOS[site].label}`,
  );
  const lines = rows.map((row) => {
    const present = PLUGIN_SITES.flatMap((site) => row.plugins[site] ?? []);
    const name = featureName(present[0], locale.manifest);
    const on = present.some((manifest) => defaultEnabled.has(manifest.id))
      ? ` <span class="gv-plugins-default">${locale.defaultOn}</span>`
      : '';
    const ticks = PLUGIN_SITES.map((site) =>
      row.plugins[site] ? '<span class="gv-plugins-tick">✓</span>' : '',
    );
    return `| **${name}**${on} | ${ticks.join(' | ')} |`;
  });
  return [
    `# ${locale.title}`,
    locale.intro,
    [
      `| ${locale.feature} | ${header.join(' | ')} |`,
      `| :-- | ${PLUGIN_SITES.map(() => ':-:').join(' | ')} |`,
      ...lines,
    ].join('\n'),
    `<p class="gv-plugins-disclaimer">${locale.disclaimer}</p>`,
  ].join('\n\n');
}

/** Dynamic-route entries for the locales whose pages live under `prefix`. */
export function pluginsRoutes(rooted: boolean) {
  const rows = featureRows([...builtinPlugins(BUILTIN_PLUGINS), ...catalogPlugins()]);
  return PLUGINS_LOCALES.filter((locale) => (locale.prefix === '') === rooted).map((locale) => ({
    params: rooted
      ? { page: 'plugins', description: locale.intro }
      : { lang: locale.prefix, description: locale.intro },
    content: renderPluginsPage(locale, rows, DEFAULT_ENABLED_PLUGIN_IDS),
  }));
}
