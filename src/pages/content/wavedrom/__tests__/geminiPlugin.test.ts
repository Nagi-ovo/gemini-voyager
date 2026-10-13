import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireBundledSiteAdapter } from '@/features/plugins/catalog/sites';
import manifest from '@/features/plugins/catalog/sites/gemini/plugins/wavedrom/plugin.json';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { wavedromPrimitive } from '@/features/plugins/verbs/wavedrom';

const WAVEJSON = '{ signal: [{ name: "clk", wave: "p...." }, { name: "data", wave: "x.34.x" }] }';

/** Gemini's code block: a `code-block` host with a language label in its decoration. */
function geminiBlock(source: string, label: string | null): HTMLElement {
  const host = document.createElement('code-block');
  host.innerHTML =
    '<div class="code-block">' +
    (label === null ? '' : `<div class="code-block-decoration"><span>${label}</span></div>`) +
    '<pre><code data-test-id="code-content"></code></pre></div>';
  host.querySelector('code')!.textContent = source;
  document.querySelector('model-response')!.append(host);
  return host;
}

let scope: PluginScope;
beforeEach(() => {
  document.body.innerHTML = '<model-response></model-response>';
  scope = new PluginScope();
});
afterEach(async () => {
  await scope.dispose();
  document.body.replaceChildren();
});

describe('Gemini wavedrom rendering', () => {
  it('the packaged plugin reads Gemini labels and leaves explicitly different languages as code', async () => {
    const labelled = geminiBlock(WAVEJSON, 'WaveDrom');
    const unlabelled = geminiBlock(WAVEJSON, null);
    const json = geminiBlock(WAVEJSON, 'JSON');

    const params = wavedromPrimitive.validateParams(manifest.contributes.domOps[0].params);
    if (!params.success) throw new Error('invalid packaged diagram params');
    void wavedromPrimitive.activate(scope, params.data, {
      doc: document,
      adapter: requireBundledSiteAdapter('gemini'),
      pluginId: manifest.id,
      settings: {},
      setTargetCounter: () => {},
    });

    const panelOf = (host: Element) =>
      host.previousElementSibling?.matches('.gv-diagram-panel')
        ? (host.previousElementSibling as HTMLElement)
        : null;
    await vi.waitFor(() => {
      for (const host of [labelled, unlabelled]) {
        expect(panelOf(host)?.shadowRoot?.querySelector('svg')).toBeTruthy();
        expect(getComputedStyle(host).display).toBe('none');
      }
    });
    expect(panelOf(json)).toBeNull();
    expect(json.querySelector('code')?.textContent).toBe(WAVEJSON);
    await scope.dispose();
    for (const host of [labelled, unlabelled, json]) {
      expect(panelOf(host)).toBeNull();
      expect(host.querySelector('code')?.textContent).toBe(WAVEJSON);
      expect(getComputedStyle(host).display).not.toBe('none');
    }
  });
});
