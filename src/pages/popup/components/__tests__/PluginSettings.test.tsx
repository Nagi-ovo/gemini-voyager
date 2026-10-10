import { act } from 'react';

import { describe, expect, it } from 'vitest';

import { BUILTIN_PLUGINS } from '@/features/plugins/builtin';
import deepseekTimeline from '@/features/plugins/catalog/sites/deepseek/plugins/timeline/plugin.json';
import { validateManifest } from '@/features/plugins/manifest/validate';
import { resolvePluginSettings } from '@/features/plugins/runtime/resolvePluginSettings';
import type { PluginManifest, PluginSettings } from '@/features/plugins/types';

import {
  container,
  mockLanguage,
  renderSettings as render,
  compactTimelinePlugin,
  setPluginSettings,
  PLUGIN_ID,
  widthPlugin,
  pluginState,
} from './pluginManagerHarness';

const deepseek = validateManifest({
  ...deepseekTimeline,
  contributes: { ...deepseekTimeline.contributes, styles: [] },
});
if (!deepseek.success) throw new Error('invalid DeepSeek timeline');
const timelines = [
  ...BUILTIN_PLUGINS.filter((plugin) => plugin.id.endsWith('-timeline')),
  deepseek.data,
];

describe.each(timelines)('$name style setting', (plugin) => {
  it('lets a user choose the ruler timeline style', async () => {
    mockLanguage.current = 'zh';
    await render(plugin);
    const select = container.querySelector('select')!;
    expect(select.closest('label')?.textContent).toContain('时间线样式');
    expect(Array.from(select.options, (option) => option.textContent)).toEqual([
      '节点',
      '紧凑索引',
      '刻度',
    ]);
    expect(select.value).toBe('dots');
    act(() => {
      select.value = 'ruler';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(select.value).toBe('ruler');
    expect(setPluginSettings).toHaveBeenCalledWith(plugin.id, {
      timelineStyle: 'ruler',
      compactView: false,
    });
  });

  it('keeps an existing compact setting until the user chooses a style', async () => {
    pluginState.current = {
      [plugin.id]: { enabled: true, installedAt: 0, settings: { compactView: true } },
    };
    await render(plugin);
    const select = container.querySelector('select')!;
    expect(select.value).toBe('compact');
    expect(setPluginSettings).not.toHaveBeenCalled();
    act(() => {
      select.value = 'dots';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(select.value).toBe('dots');
    expect(setPluginSettings).toHaveBeenCalledWith(plugin.id, {
      timelineStyle: 'dots',
      compactView: false,
    });
  });
});

describe.each(timelines)('$name style no longer offered', (plugin) => {
  const withoutChoice = (removed: string): PluginManifest => {
    const style = plugin.contributes.settings!.timelineStyle;
    return {
      ...plugin,
      contributes: {
        ...plugin.contributes,
        settings: {
          ...plugin.contributes.settings,
          timelineStyle: {
            ...style,
            options: style.options!.filter((option) => option.value !== removed),
          },
        },
      },
    };
  };
  const stored = (settings: PluginSettings) => {
    pluginState.current = { [plugin.id]: { enabled: true, installedAt: 0, settings } };
  };

  it("a style removed from a plugin's choices shows and runs its default", async () => {
    const updated = withoutChoice('ruler');
    stored({ timelineStyle: 'ruler' });
    await render(updated);
    expect(container.querySelector('select')!.value).toBe('dots');
    expect(resolvePluginSettings(updated, { timelineStyle: 'ruler' }).timelineStyle).toBe('dots');
  });

  it('an old compact preference shows and runs the default when compact is not offered', async () => {
    const updated = withoutChoice('compact');
    stored({ compactView: true });
    await render(updated);
    expect(container.querySelector('select')!.value).toBe('dots');
    expect(resolvePluginSettings(updated, { compactView: true }).timelineStyle).toBe('dots');
  });
});

describe.each(BUILTIN_PLUGINS.filter((plugin) => plugin.id.endsWith('-timeline')))(
  '$name node levels',
  (plugin) => {
    it('offers node levels as an experimental switch that starts off, in Gemini wording', async () => {
      await render(plugin);
      // Translations resolve to their key here: the switch reuses Gemini's own messages.
      const input = container.querySelector(
        'input[aria-label="enableMarkerLevel"]',
      ) as HTMLInputElement;
      expect(input.checked).toBe(false);
      const row = input.closest('div')!;
      expect(row.querySelector('[title="experimentalLabel"]')).not.toBeNull();
      expect(row.textContent).toContain('enableMarkerLevelHint');

      act(() => input.click());
      expect(setPluginSettings).toHaveBeenCalledWith(plugin.id, {
        markerLevel: true,
        timelineStyle: 'dots',
        compactView: false,
      });
    });

    it('with node levels on, only the nodes style can be chosen', async () => {
      pluginState.current = {
        [plugin.id]: { enabled: true, installedAt: 0, settings: { markerLevel: true } },
      };
      await render(plugin);
      const select = container.querySelector('select')!;
      const disabled = Array.from(select.options, (option) => [option.value, option.disabled]);
      expect(Object.fromEntries(disabled)).toEqual({ dots: false, compact: true, ruler: true });
    });

    it.each(['compact', 'ruler'])(
      'turning node levels on from %s switches to nodes in the same write',
      async (timelineStyle) => {
        pluginState.current = {
          [plugin.id]: { enabled: true, installedAt: 0, settings: { timelineStyle } },
        };
        await render(plugin);
        const input = container.querySelector<HTMLInputElement>(
          'input[aria-label="enableMarkerLevel"]',
        )!;
        act(() => input.click());
        expect(setPluginSettings).toHaveBeenCalledExactlyOnceWith(plugin.id, {
          markerLevel: true,
          timelineStyle: 'dots',
          compactView: false,
        });
        expect(container.querySelector('select')!.value).toBe('dots');
      },
    );
  },
);

describe('PluginSettings select setting', () => {
  it('keeps English option labels when a translation is missing', async () => {
    mockLanguage.current = 'zh';
    await render({
      ...widthPlugin,
      i18n: { zh: { settings: { placement: { options: { right: '右侧' } } } } },
      contributes: {
        settings: {
          placement: {
            type: 'select',
            label: 'Placement',
            default: 'right',
            options: [
              { value: 'constructor', label: 'Left' },
              { value: 'right', label: 'Right' },
            ],
          },
        },
      },
    });
    const select = container.querySelector('select')!;
    expect(Array.from(select.options, (option) => option.textContent)).toEqual(['Left', '右侧']);
  });

  it('lets a user choose a declared option and persists it immediately', async () => {
    await render({
      ...widthPlugin,
      contributes: {
        settings: {
          placement: {
            type: 'select',
            label: 'Placement',
            default: 'right',
            options: [
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ],
          },
        },
      },
    });
    const select = container.querySelector('select')!;
    expect(select.closest('label')?.textContent).toContain('Placement');
    expect(Array.from(select.options, (option) => option.textContent)).toEqual(['Left', 'Right']);
    expect(select.value).toBe('right');

    act(() => {
      select.value = 'left';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(select.value).toBe('left');
    expect(setPluginSettings).toHaveBeenCalledOnce();
    expect(setPluginSettings).toHaveBeenCalledWith(PLUGIN_ID, { placement: 'left' });
  });
});

describe('PluginSettings setting slider', () => {
  it('renders localized range labels from the plugin i18n map', async () => {
    mockLanguage.current = 'zh';
    await render();

    expect(container.textContent).toContain('阅读宽度（px）');
    expect(container.textContent).toContain('768');
    expect(container.textContent).toContain('更窄');
    expect(container.textContent).toContain('更宽');
    expect(container.textContent).not.toContain('Reading width (px)');
  });
});
describe('PluginSettings boolean setting', () => {
  it('renders a localized switch and persists changes immediately', async () => {
    mockLanguage.current = 'zh';
    await render(compactTimelinePlugin);

    const input = container.querySelector('input[aria-label="使用紧凑索引"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.checked).toBe(false);

    act(() => input.click());

    expect(input.checked).toBe(true);
    expect(setPluginSettings).toHaveBeenCalledOnce();
    expect(setPluginSettings).toHaveBeenCalledWith(PLUGIN_ID, { compactView: true });
  });
});
