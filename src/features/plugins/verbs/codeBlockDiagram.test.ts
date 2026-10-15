import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginScope } from '../runtime/pluginScope';
import { type CodeBlockDiagram, activateCodeBlockDiagram } from './codeBlockDiagram';
import { readDiagramExport } from './diagramExportRegistry';
import type { PrimitiveContext } from './types';

const context: PrimitiveContext = {
  doc: document,
  adapter: null,
  pluginId: 'test.diagram',
  settings: {},
  setTargetCounter: () => {},
};

/** A diagram whose library loads when `prepared` resolves. */
function fakeDiagram(prepared: Promise<boolean>): CodeBlockDiagram {
  return {
    name: 'fake',
    kind: 'mermaid',
    matches: (language) => language === 'fake',
    prepare: () => prepared,
    async render(target, source) {
      target.textContent = `drawn:${source}`;
    },
  };
}

function activate(scope: PluginScope, prepared: Promise<boolean>): void {
  activateCodeBlockDiagram(scope, { turn: '.reply' }, context, fakeDiagram(prepared));
}

const panels = () => document.querySelectorAll<HTMLElement>('.gv-diagram-panel');
const drawn = () => panels()[0]?.shadowRoot?.querySelector('.diagram')?.textContent ?? null;

const scopes: PluginScope[] = [];
const newScope = (): PluginScope => {
  const scope = new PluginScope();
  scopes.push(scope);
  return scope;
};

beforeEach(() => {
  document.body.innerHTML =
    '<div class="reply"><pre><code class="language-fake">a --> b</code></pre></div>';
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(scopes.splice(0).map((scope) => scope.dispose()));
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('code block diagram engine', () => {
  it('a plugin takes over a block released before its first draw', async () => {
    const first = newScope();
    activate(first, new Promise<boolean>(() => {}));
    expect(document.querySelector('pre')!.hasAttribute('data-gv-diagram-owner')).toBe(true);
    activate(newScope(), Promise.resolve(true));

    await first.dispose();

    await expect.poll(drawn, { timeout: 3000 }).toBe('drawn:a --> b');
    expect(panels()).toHaveLength(1);
  });

  it('draws the source a reply streamed on to while the previous source was still drawing', async () => {
    vi.useFakeTimers();
    const finishes: Array<() => void> = [];
    const diagram: CodeBlockDiagram = {
      ...fakeDiagram(Promise.resolve(true)),
      // Each draw shows its source only once the test lets it finish.
      render: (target, source) =>
        new Promise<void>((resolve) =>
          finishes.push(() => {
            target.textContent = `drawn:${source}`;
            resolve();
          }),
        ),
      exportHtml: (target) => `<div class="export">${target.textContent}</div>`,
    };
    activateCodeBlockDiagram(newScope(), { turn: '.reply', exportImage: true }, context, diagram);
    await vi.waitFor(() => expect(finishes).toHaveLength(1));

    // The reply streams on mid-draw; the scan that edit asks for finds the block still drawing.
    document.querySelector('code')!.textContent = 'a --> c';
    await vi.advanceTimersByTimeAsync(1_500);
    expect(finishes).toHaveLength(1);

    finishes[0]();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(finishes).toHaveLength(2);
    finishes[1]();
    await vi.advanceTimersByTimeAsync(0);

    expect(drawn()).toBe('drawn:a --> c');
    expect(readDiagramExport(document.querySelector('pre')!)?.html).toContain('drawn:a --> c');
  });

  it('a diagram whose panel was replaced mid-render still renders once the render finishes', async () => {
    vi.useFakeTimers();
    const finishes: Array<() => void> = [];
    const diagram: CodeBlockDiagram = {
      ...fakeDiagram(Promise.resolve(true)),
      render: (target, source) =>
        new Promise<void>((resolve) =>
          finishes.push(() => {
            target.textContent = `drawn:${source}`;
            resolve();
          }),
        ),
    };
    activateCodeBlockDiagram(newScope(), { turn: '.reply' }, context, diagram);
    await vi.waitFor(() => expect(finishes).toHaveLength(1));

    // The host re-renders around the block and drops the panel; every scan until the
    // render finishes finds the block still drawing.
    panels()[0].remove();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(finishes).toHaveLength(1);
    expect(document.querySelector('pre')!.isConnected).toBe(true);

    finishes[0]();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(finishes).toHaveLength(2);
    finishes[1]();
    await vi.advanceTimersByTimeAsync(0);

    expect(panels()).toHaveLength(1);
    expect(drawn()).toBe('drawn:a --> b');
  });

  it('draws in the new scheme when the page scheme flips while the library still loads', async () => {
    document.documentElement.setAttribute('data-gv-scheme', 'light');
    let loadLight!: (loaded: boolean) => void;
    let scheme = 'none';
    const diagram: CodeBlockDiagram = {
      ...fakeDiagram(Promise.resolve(true)),
      prepare: (next) => {
        scheme = next;
        return next === 'light'
          ? new Promise<boolean>((resolve) => (loadLight = resolve))
          : Promise.resolve(true);
      },
      async render(target) {
        target.textContent = `drawn:${scheme}`;
      },
    };
    activateCodeBlockDiagram(newScope(), { turn: '.reply' }, context, diagram);

    document.documentElement.setAttribute('data-gv-scheme', 'dark');
    await Promise.resolve();
    loadLight(true);

    await expect.poll(drawn, { timeout: 3000 }).toBe('drawn:dark');
    document.documentElement.removeAttribute('data-gv-scheme');
  });
});
