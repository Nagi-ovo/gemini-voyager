import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/core/services/LoggerService';

import type { PluginManifest } from '../types';
import type { Primitive } from '../verbs/types';
import { DeclarativeEngine } from './declarativeEngine';

vi.mock('../verbs/registry', () => ({ getPrimitive: () => fixture }));

const updateSettings = vi.fn();
const activate = vi.fn<Primitive['activate']>((scope, params, context) => {
  const output = context.doc.createElement('output');
  output.textContent = JSON.stringify(params);
  scope.mount(output, context.doc.body);
  return { updateSettings };
});
const fixture: Primitive = {
  contract: {
    name: 'fixture',
    sinceEngine: '1.8.0',
    semantic: [],
    params: {},
    description: 'Native parameter fixture',
  },
  validateParams: (raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { success: false, error: [{ path: 'params', message: 'must be an object' }] };
    }
    const params = raw as Readonly<Record<string, unknown>>;
    if (typeof params.threshold !== 'number' || params.threshold < 1 || params.threshold > 10) {
      return {
        success: false,
        error: [{ path: 'params.threshold', message: 'must be a number from 1 to 10' }],
      };
    }
    if (typeof params.flag !== 'boolean' || typeof params.title !== 'string') {
      return { success: false, error: [{ path: 'params', message: 'invalid flag or title' }] };
    }
    return { success: true, data: params };
  },
  activate,
};

function manifest(params: Readonly<Record<string, unknown>> = templatedParams): PluginManifest {
  return {
    id: 'x.native-settings',
    name: 'Native settings fixture',
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'other',
    license: 'MIT',
    engine: '>=1.8.0',
    tier: 'declarative',
    matches: ['https://chat.deepseek.com/*'],
    contributes: {
      settings: {
        threshold: { type: 'number', label: 'Threshold', default: 3 },
        flag: { type: 'boolean', label: 'Flag', default: false },
        mode: {
          type: 'select',
          label: 'Mode',
          default: 'words',
          options: [
            { value: 'words', label: 'Words' },
            { value: 'characters', label: 'Characters' },
          ],
        },
      },
      domOps: [
        { op: 'native', handler: 'fixture', params },
        { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-fixture' },
      ],
    },
  };
}

const templatedParams = {
  threshold: '{{threshold}}',
  flag: '{{flag}}',
  mode: '{{mode}}',
  title: 'count:{{threshold}}/{{flag}}/{{mode}}',
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  return { promise: new Promise<void>((settle) => (resolve = settle)), resolve };
}

const engines: DeclarativeEngine[] = [];
function engine(): DeclarativeEngine {
  const instance = new DeclarativeEngine({ doc: document });
  engines.push(instance);
  return instance;
}

beforeEach(() => {
  activate.mockClear();
  updateSettings.mockClear();
});

afterEach(() => {
  for (const instance of engines.splice(0)) instance.unmountAll();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  vi.restoreAllMocks();
});

describe('DeclarativeEngine native setting params', () => {
  it('passes typed whole-value defaults and embedded strings to activation, then stored values', async () => {
    const instance = engine();
    const plugin = manifest();
    instance.mount(plugin);
    expect(activate.mock.calls[0][1]).toEqual({
      threshold: 3,
      flag: false,
      mode: 'words',
      title: 'count:3/false/words',
    });
    expect(plugin.contributes.domOps?.[0]).toMatchObject({ params: templatedParams });

    instance.updateSettings(plugin.id, { threshold: 8, flag: true, mode: 'characters' });
    await vi.waitFor(() => expect(activate).toHaveBeenCalledTimes(2));
    expect(activate.mock.calls[1][1]).toEqual({
      threshold: 8,
      flag: true,
      mode: 'characters',
      title: 'count:8/true/characters',
    });
    expect(document.querySelectorAll('output')).toHaveLength(1);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('warns and skips invalid rendered params through the same path as invalid static params', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const instance = engine();
    const plugin = manifest();
    instance.mount(plugin, { threshold: 99 });
    expect(activate).not.toHaveBeenCalled();
    expect(instance.isActive(plugin.id)).toBe(true);
    expect(document.body.classList.contains('gv-fixture')).toBe(true);
    const renderedWarning = warn.mock.calls[0];
    expect(renderedWarning).toEqual([
      'Invalid primitive params',
      {
        id: plugin.id,
        handler: 'fixture',
        issues: [{ path: 'params.threshold', message: 'must be a number from 1 to 10' }],
      },
    ]);
    instance.unmount(plugin.id);
    instance.mount(manifest({ threshold: 99, flag: false, title: 'static' }));
    expect(warn.mock.calls[1]).toEqual(renderedWarning);
    expect(activate).not.toHaveBeenCalled();
    instance.unmount(plugin.id);

    instance.mount(plugin);
    instance.updateSettings(plugin.id, { threshold: 99 });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(3));
    expect(document.querySelector('output')).toBeNull();
    instance.updateSettings(plugin.id, { threshold: 4 });
    await vi.waitFor(() => expect(activate).toHaveBeenCalledTimes(2));
    expect(activate.mock.calls[1][1].threshold).toBe(4);
  });

  it('keeps static params mounted and passes settings to their in-place updater', () => {
    const instance = engine();
    const plugin = manifest({ threshold: 3, flag: false, title: 'static' });
    instance.mount(plugin);
    const output = document.querySelector('output');
    instance.updateSettings(plugin.id, { threshold: 8 });
    expect(updateSettings).toHaveBeenCalledWith({ threshold: 8 });
    expect(activate).toHaveBeenCalledTimes(1);
    expect(document.querySelector('output')).toBe(output);
  });

  it('awaits deferred disposal and uses the latest templated params after rapid settings changes', async () => {
    const disposal = deferred();
    const instance = engine();
    const plugin = manifest();
    instance.mount(plugin);
    const firstScope = activate.mock.calls[0][0];
    firstScope.effect(() => () => disposal.promise, 'deferred teardown');

    instance.updateSettings(plugin.id, { threshold: 5 });
    await vi.waitFor(() => expect(firstScope.isDisposed).toBe(true));
    instance.updateSettings(plugin.id, { threshold: 7 });
    expect(activate).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('output')).toHaveLength(1);
    expect(updateSettings).not.toHaveBeenCalled();

    disposal.resolve();
    await vi.waitFor(() => expect(activate).toHaveBeenCalledTimes(2));
    expect(activate.mock.calls[1][1].threshold).toBe(7);
    expect(document.querySelectorAll('output')).toHaveLength(1);
  });

  it('does not reactivate templated params after unmount during deferred disposal', async () => {
    const disposal = deferred();
    const instance = engine();
    const plugin = manifest();
    instance.mount(plugin);
    const firstScope = activate.mock.calls[0][0];
    firstScope.effect(() => () => disposal.promise, 'deferred teardown');
    instance.updateSettings(plugin.id, { threshold: 5 });
    instance.updateSettings(plugin.id, { threshold: 7 });
    await vi.waitFor(() => expect(firstScope.isDisposed).toBe(true));
    instance.unmount(plugin.id);
    disposal.resolve();
    await firstScope.dispose();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(activate).toHaveBeenCalledTimes(1);
    expect(document.querySelector('output')).toBeNull();
    expect(instance.isActive(plugin.id)).toBe(false);
  });
});
