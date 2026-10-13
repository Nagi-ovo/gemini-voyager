import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireBundledSiteAdapter } from '@/features/plugins/catalog/sites';
import manifest from '@/features/plugins/catalog/sites/gemini/plugins/mermaid/plugin.json';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { mermaidPrimitive } from '@/features/plugins/verbs/mermaid';

const library = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock('mermaid', () => ({ default: library }));

const FLOWCHART = 'flowchart TD\n  Start --> Middle\n  Middle --> Finish\n  Finish --> Done';

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

describe('Gemini mermaid rendering', () => {
  it('the packaged plugin reads Gemini labels and leaves explicitly different languages as code', async () => {
    library.render.mockResolvedValue({ svg: '<svg><text>Diagram</text></svg>' });
    const labelled = geminiBlock(FLOWCHART, 'Mermaid');
    const unlabelled = geminiBlock(FLOWCHART, null);
    const python = geminiBlock(FLOWCHART, 'Python');

    const params = mermaidPrimitive.validateParams(manifest.contributes.domOps[0].params);
    if (!params.success) throw new Error('invalid packaged diagram params');
    void mermaidPrimitive.activate(scope, params.data, {
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
    expect(panelOf(python)).toBeNull();
    expect(python.querySelector('code')?.textContent).toBe(FLOWCHART);
    await scope.dispose();
    for (const host of [labelled, unlabelled, python]) {
      expect(panelOf(host)).toBeNull();
      expect(host.querySelector('code')?.textContent).toBe(FLOWCHART);
      expect(getComputedStyle(host).display).not.toBe('none');
    }
  });
});
