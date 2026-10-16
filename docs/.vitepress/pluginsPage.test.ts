import { describe, expect, it } from 'vitest';

import type { PluginManifest } from '../../src/features/plugins/types';
import {
  PLUGINS_LOCALES,
  type SitePlugin,
  builtinPlugins,
  featureRows,
  renderPluginsPage,
} from './pluginsPage';

const manifest = (id: string, name: string, matches: string[], zh?: string): PluginManifest =>
  ({
    id,
    name,
    matches,
    ...(zh ? { i18n: { zh: { name: zh } } } : {}),
  }) as unknown as PluginManifest;

const locale = (code: string) => PLUGINS_LOCALES.find((entry) => entry.manifest === code)!;

describe('plugin table', () => {
  it('gives a feature one row with a tick on every site that has it', () => {
    const rows = featureRows([
      { site: 'claude', feature: 'quote-reply', manifest: manifest('a', 'Claude · Quote', []) },
      { site: 'deepseek', feature: 'quote-reply', manifest: manifest('b', 'DeepSeek · Quote', []) },
      { site: 'deepseek', feature: 'vim-input', manifest: manifest('c', 'DeepSeek · Vim', []) },
      { site: 'chatgpt', feature: 'input-vim', manifest: manifest('d', 'Vim', []) },
    ]);

    expect(rows.map((row) => [row.feature, Object.keys(row.plugins).sort()])).toEqual([
      ['quote-reply', ['claude', 'deepseek']],
      ['input-vim', ['chatgpt', 'deepseek']],
    ]);
  });

  it('files a builtin under every listed site it matches, and none for Gemini', () => {
    const plugins = builtinPlugins([
      manifest('voyager.formula-copy', 'Formula Copy', [
        'https://claude.ai/*',
        'https://chatgpt.com/*',
      ]),
      manifest('voyager.chatgpt-folders', 'ChatGPT · Folders', ['https://chatgpt.com/*']),
      manifest('voyager.gemini-timeline', 'Gemini · Timeline', ['https://gemini.google.com/*']),
    ]);

    expect(plugins.map(({ site, feature }) => `${site}:${feature}`)).toEqual([
      'chatgpt:formula-copy',
      'claude:formula-copy',
      'chatgpt:folders',
    ]);
  });

  it("names a row in the page's language without the site prefix and flags default-on plugins", () => {
    const plugins: SitePlugin[] = [
      {
        site: 'chatgpt',
        feature: 'folders',
        manifest: manifest('voyager.chatgpt-folders', 'ChatGPT · Folders', [], 'ChatGPT · 文件夹'),
      },
      {
        site: 'deepseek',
        feature: 'wrap-code',
        manifest: manifest('voyager.deepseek-wrap-code', 'DeepSeek · Wrap code', []),
      },
    ];

    const page = renderPluginsPage(
      locale('zh'),
      featureRows(plugins),
      new Set(['voyager.chatgpt-folders']),
    );

    expect(page).toMatch(
      /\| \*\*文件夹\*\* <span class="gv-plugins-default">默认开启<\/span> \| <span[^|]*✓<\/span> \|  \|  \|/,
    );
    expect(page).toMatch(/\| \*\*Wrap code\*\* \|  \|  \| <span[^|]*✓<\/span> \|/);
  });
});
