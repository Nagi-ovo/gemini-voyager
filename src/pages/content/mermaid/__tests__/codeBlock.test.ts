import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStyles, renderMermaid } from '../codeBlock';
import { MermaidRenderer } from '../renderer';

const library = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock('mermaid', () => ({ default: library }));

describe('Mermaid code block presentation', () => {
  let renderer: MermaidRenderer;
  let host: HTMLElement;
  let code: HTMLElement;
  const source = 'flowchart TD\nA --> B\nB --> C';

  beforeEach(() => {
    renderer = new MermaidRenderer();
    library.initialize.mockReset();
    library.render.mockReset();
    document.body.className = '';
    document.body.innerHTML =
      '<section><code-block><code></code></code-block><div class="buttons"><button>Copy</button></div></section>';
    host = document.querySelector('code-block')!;
    code = host.querySelector('code')!;
    library.render.mockResolvedValue({ svg: '<svg><text>Diagram</text></svg>' });
  });

  it('installs its shared styles once', () => {
    document.getElementById('gv-mermaid-styles')?.remove();
    createStyles();
    createStyles();
    expect(document.querySelectorAll('#gv-mermaid-styles')).toHaveLength(1);
  });

  it('reuses the wrapper, copy control and selected view when source changes', async () => {
    const copy = document.querySelector('.buttons')!;
    await renderMermaid(code, source, renderer);
    const wrapper = host.parentElement!;
    const diagram = wrapper.querySelector<HTMLElement>('.gv-mermaid-diagram')!;
    expect(wrapper.querySelector('.gv-mermaid-toggle .buttons')).toBe(copy);
    expect((copy as HTMLElement).style.position).toBe('static');
    expect(host.style.display).toBe('none');

    wrapper.querySelector<HTMLButtonElement>('[data-view="code"]')!.click();
    expect(host.style.display).toBe('');
    expect(diagram.style.display).toBe('none');

    library.render.mockResolvedValue({ svg: '<svg><text>Updated</text></svg>' });
    await renderMermaid(code, `${source}\nC --> D`, renderer);
    expect(host.parentElement).toBe(wrapper);
    expect(document.querySelectorAll('.gv-mermaid-wrapper')).toHaveLength(1);
    expect(wrapper.querySelectorAll('.gv-mermaid-toggle')).toHaveLength(1);
    expect(wrapper.querySelectorAll('[data-view]')).toHaveLength(2);
    expect(diagram.textContent).toBe('Updated');
    expect(diagram.style.display).toBe('none');

    wrapper.querySelector<HTMLButtonElement>('[data-view="diagram"]')!.click();
    expect(host.style.display).toBe('none');
    expect(diagram.style.display).toBe('block');
  });

  it('skips duplicate normalized source and concurrent renders', async () => {
    let finish!: (result: { svg: string }) => void;
    library.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = renderMermaid(code, source, renderer);
    await vi.waitFor(() => expect(library.render).toHaveBeenCalledTimes(1));
    await renderMermaid(code, `${source}\nC --> D`, renderer);
    expect(library.render).toHaveBeenCalledTimes(1);
    finish({ svg: '<svg><text>Complete</text></svg>' });
    await first;
    expect(code.dataset.mermaidProcessing).toBe('false');
    await renderMermaid(code, source.replace('TD', 'TD\u200B'), renderer);
    expect(library.render).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.gv-mermaid-diagram')?.textContent).toBe('Complete');
  });

  it('sanitizes and replaces the light export, then removes it after a syntax failure', async () => {
    document.body.className = 'dark-theme';
    await renderer.initialize();
    library.render
      .mockResolvedValueOnce({ svg: '<svg><text>Dark</text></svg>' })
      .mockResolvedValueOnce({
        svg: '<svg><image href="https://example.invalid/pixel"/><text>Light</text></svg>',
      });
    await renderMermaid(code, source, renderer);
    const template = document.querySelector<HTMLTemplateElement>(
      'template.gv-mermaid-light-export',
    )!;
    expect(template.content.querySelector('image')).toBeNull();
    expect(template.content.textContent).toBe('Light');

    library.render
      .mockResolvedValueOnce({ svg: '<svg><text>New dark</text></svg>' })
      .mockResolvedValueOnce({ svg: '<svg><text>New light</text></svg>' });
    await renderMermaid(code, `${source}\nC --> D`, renderer);
    expect(document.querySelector('template.gv-mermaid-light-export')).toBe(template);
    expect(template.content.textContent).toBe('New light');

    library.render.mockRejectedValueOnce(new Error('Broken syntax'));
    await renderMermaid(code, 'invalid source', renderer);
    expect(document.querySelector('template.gv-mermaid-light-export')).toBeNull();
    expect(document.querySelector('.gv-mermaid-diagram')?.textContent).toContain('Broken syntax');
    expect(code.dataset.mermaidCode).toBe('invalid source');
  });

  it('leaves unsupported hosts alone and restores source after an unexpected failure', async () => {
    const detached = document.createElement('code');
    await renderMermaid(detached, source, renderer);
    expect(library.render).not.toHaveBeenCalled();
    expect(detached.dataset.mermaidProcessing).toBe('false');

    await renderMermaid(code, source, renderer);
    vi.spyOn(renderer, 'render').mockRejectedValueOnce(new Error('Extension unavailable'));
    await renderMermaid(code, `${source}\nC --> D`, renderer);
    expect(host.style.display).toBe('');
    expect(code.dataset.mermaidProcessing).toBe('false');
    expect(code.dataset.mermaidCode).toBe(source);
  });

  it('removes generated error artifacts and caps the displayed error text', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="document-content">Keep me</div>');
    library.render.mockImplementationOnce(async (id: string) => {
      const errorSvg = document.createElement('div');
      errorSvg.id = id;
      const errorContainer = document.createElement('div');
      errorContainer.id = 'd-error-container';
      errorContainer.textContent = 'Syntax error';
      document.body.append(errorSvg, errorContainer);
      throw new Error('x'.repeat(120));
    });
    await renderMermaid(code, source, renderer);
    expect(document.querySelector('[id^="mermaid-"]')).toBeNull();
    expect(document.getElementById('d-error-container')).toBeNull();
    expect(document.getElementById('document-content')?.textContent).toBe('Keep me');
    const diagram = document.querySelector<HTMLElement>('.gv-mermaid-diagram')!;
    expect(diagram.textContent).toContain(`${'x'.repeat(100)}...`);
    expect(diagram.textContent).not.toContain('x'.repeat(101));
    diagram.click();
    expect(document.querySelector('.gv-mermaid-modal')).toBeNull();
  });

  it('opens a fullscreen copy of the sanitized visible diagram', async () => {
    vi.useFakeTimers();
    try {
      library.render.mockResolvedValue({
        svg: '<svg><text>Safe</text><image href="https://example.invalid/pixel"/></svg>',
      });
      await renderMermaid(code, source, renderer);
      document.querySelector<HTMLElement>('.gv-mermaid-diagram')!.click();
      expect(document.querySelector('.gv-mermaid-modal-content')?.textContent).toBe('Safe');
      expect(document.querySelector('.gv-mermaid-modal image')).toBeNull();
    } finally {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      vi.runAllTimers();
      vi.useRealTimers();
    }
  });
});
