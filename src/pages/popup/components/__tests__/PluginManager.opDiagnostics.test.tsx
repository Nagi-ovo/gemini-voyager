import './pluginManagerHarness';
import { beforeEach, describe, expect, it } from 'vitest';

import enMessages from '@locales/en/messages.json';

import type { OpDiagnostic } from '@/features/plugins/runtime/opDiagnostics';
import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';

import {
  PLUGIN_ID,
  container,
  mockMessages,
  renderManager,
  widthPlugin,
} from './pluginManagerHarness';

const body: OpDiagnostic = {
  index: 0,
  op: 'setStyle',
  label: 'body',
  count: 1,
  state: 'page-root',
  expect: 'unknown',
};
const sidebar: OpDiagnostic = {
  index: 1,
  op: 'addClass',
  label: 'sidebar',
  count: 0,
  state: 'none',
  expect: 'page',
};
const composer: OpDiagnostic = { ...sidebar, index: 2, label: 'composer', count: 2, state: 'ok' };

function status(overrides: Partial<PluginStatus>): PluginStatus {
  return { id: PLUGIN_ID, version: widthPlugin.version, kind: 'mounted', ...overrides };
}

beforeEach(() => {
  mockMessages.current = {
    pluginNoEffectOnPage: enMessages.pluginNoEffectOnPage.message,
    pluginOpsFoundOnPage: enMessages.pluginOpsFoundOnPage.message,
    pluginOpsPartlyFound: enMessages.pluginOpsPartlyFound.message,
  };
});

describe('PluginManager per-change matches', () => {
  it('names the change that found nothing while a body change keeps the plugin running', async () => {
    await renderManager({
      statuses: [status({ ops: [body, sidebar, composer], zeroOps: [1] })],
    });

    expect(container.textContent).toContain(
      'Found nothing on this page for 1 of 3 changes: sidebar',
    );
    expect(container.textContent).toContain(
      'Found on this page: body · 1, sidebar · 0, composer · 2',
    );
    expect(container.textContent).not.toContain('{');
  });

  it('shows the counts for a plugin that is off, without a warning', async () => {
    await renderManager({ statuses: [status({ kind: 'ready', ops: [body, sidebar] })] });

    expect(container.textContent).toContain('Found on this page: body · 1, sidebar · 0');
    expect(container.textContent).not.toContain('Found nothing');
  });

  it('keeps the single no-effect note when nothing was found at all', async () => {
    await renderManager({
      statuses: [status({ kind: 'no-effect', ops: [sidebar], zeroOps: [1] })],
    });

    const text = container.textContent ?? '';
    expect(text.split('Found nothing to act on in this page')).toHaveLength(2);
    expect(text).not.toContain('of 1 changes');
  });
});
