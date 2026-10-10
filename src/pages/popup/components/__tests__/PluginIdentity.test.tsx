import { act } from 'react';

import { beforeEach, describe, expect, it } from 'vitest';

import enMessages from '@locales/en/messages.json';

import type { PluginManifest } from '@/features/plugins/types';

import {
  container,
  mockLanguage,
  mockMessages,
  widthPlugin,
  PLUGIN_ID,
  renderPluginIdentity as render,
  renderIdentity,
} from './pluginManagerHarness';

describe('PluginIdentity accessible plugin identity', () => {
  it('keeps the complete localized platform name on collapsed headers', async () => {
    mockLanguage.current = 'zh';
    const plugin: PluginManifest = {
      ...widthPlugin,
      name: 'Claude · Reading width',
      i18n: { zh: { name: 'Claude · 阅读宽度' } },
    };
    await render(plugin);
    const header = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
    expect(header?.getAttribute('aria-label')).toBe('Claude · 阅读宽度');
    expect(header?.getAttribute('aria-expanded')).toBe('true');
    act(() => header?.click());
    expect(header?.getAttribute('aria-expanded')).toBe('false');
    expect(header?.getAttribute('aria-label')).toBe('Claude · 阅读宽度');
  });
});
describe('PluginIdentity supported sites', () => {
  it('lists every supported site on hover instead of a line in each open card', async () => {
    await render({
      ...widthPlugin,
      matches: ['https://claude.ai/*', 'https://chatgpt.com/*', 'https://chat.openai.com/*'],
    });
    const header = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(header.title).toBe('claude.ai, chatgpt.com, chat.openai.com');
    expect(container.textContent).not.toContain('chat.openai.com');
  });
});
describe('PluginIdentity platform name display', () => {
  it('removes the DeepSeek prefix when the platform badge is shown', async () => {
    const plugin: PluginManifest = {
      ...widthPlugin,
      name: 'DeepSeek · Comfortable Reading Width',
      matches: ['https://chat.deepseek.com/*'],
    };
    await render(plugin);
    const header = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
    expect(header?.textContent).toContain('Comfortable Reading Width');
    expect(header?.textContent).not.toContain('DeepSeek ·');
  });
});

describe('PluginIdentity plugin provenance', () => {
  it.each([
    ['builtin', 'pluginSourceBuiltin'],
    ['bundled-catalog', 'pluginSourceBundled'],
    ['host-catalog', 'pluginSourceOnline'],
  ])('shows the version and the %s source label', async (sourceId, labelKey) => {
    await renderIdentity({ sourceIds: { [PLUGIN_ID]: sourceId } });

    expect(container.textContent).toContain(`v${widthPlugin.version} · ${labelKey}`);
  });

  it('shows the version alone when the plugin has no known source', async () => {
    await renderIdentity({ sourceIds: { [PLUGIN_ID]: 'some-future-source' } });

    expect(container.textContent).toContain(`v${widthPlugin.version}`);
    expect(container.textContent).not.toContain(`v${widthPlugin.version} ·`);
  });

  it('names the held-back version when an update needs a newer Voyager', async () => {
    mockMessages.current = {
      pluginUpdateNeedsNewerVoyager: enMessages.pluginUpdateNeedsNewerVoyager.message,
    };
    await renderIdentity({
      blockedUpdates: { [PLUGIN_ID]: { version: '2.4.0', engine: '>=9.0.0' } },
    });

    expect(container.textContent).toContain('2.4.0');
    expect(container.textContent).not.toContain('{version}');
  });

  it('says nothing about updates when none are held back', async () => {
    mockMessages.current = {
      pluginUpdateNeedsNewerVoyager: enMessages.pluginUpdateNeedsNewerVoyager.message,
    };
    await renderIdentity({ blockedUpdates: {} });

    expect(container.textContent).not.toContain('needs a newer Voyager');
  });
});

describe('PluginIdentity changelog line', () => {
  const changelogPlugin: PluginManifest = {
    ...widthPlugin,
    changelog: 'Wider maximum width.',
    i18n: {
      ...widthPlugin.i18n,
      zh: { ...widthPlugin.i18n?.zh, changelog: '最大宽度更大了。' },
    },
  };

  beforeEach(() => {
    mockMessages.current = { pluginChangelogLabel: enMessages.pluginChangelogLabel.message };
  });

  it('shows the changelog for the current language', async () => {
    mockLanguage.current = 'zh';
    await renderIdentity({ manifests: [changelogPlugin] });

    expect(container.textContent).toContain("What's new:");
    expect(container.textContent).toContain('最大宽度更大了。');
    expect(container.textContent).not.toContain('Wider maximum width.');
  });

  it('falls back to the manifest changelog for an untranslated language', async () => {
    mockLanguage.current = 'fr';
    await renderIdentity({ manifests: [changelogPlugin] });

    expect(container.textContent).toContain('Wider maximum width.');
  });

  it('falls back to the manifest changelog when the localized one is blank', async () => {
    mockLanguage.current = 'zh';
    await renderIdentity({
      manifests: [
        {
          ...changelogPlugin,
          i18n: { ...changelogPlugin.i18n, zh: { ...changelogPlugin.i18n?.zh, changelog: '   ' } },
        },
      ],
    });

    expect(container.textContent).toContain('Wider maximum width.');
  });

  it('says nothing when the plugin ships no changelog', async () => {
    await renderIdentity();

    expect(container.textContent).not.toContain("What's new:");
  });
});
