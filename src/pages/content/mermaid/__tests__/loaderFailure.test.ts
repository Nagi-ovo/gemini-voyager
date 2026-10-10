import { describe, expect, it, vi } from 'vitest';

import { renderMermaid } from '../codeBlock';
import { MermaidRenderer } from '../renderer';

vi.mock('mermaid', () => {
  throw new Error('Chunk unavailable');
});

describe('Mermaid loading failure', () => {
  it('caches failure and keeps raw code available across subsequent attempts', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderer = new MermaidRenderer();
    document.body.innerHTML = '<code-block><code>source</code></code-block>';
    const code = document.querySelector('code')!;
    await expect(renderer.initialize()).resolves.toBe(false);
    await renderMermaid(code, 'flowchart TD\nA --> B\nB --> C', renderer);
    await expect(renderer.initialize()).resolves.toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.gv-mermaid-wrapper')).toBeNull();
    expect(code.parentElement?.style.display).toBe('');
    expect(code.dataset.mermaidProcessing).toBe('false');
    expect(code.dataset.mermaidCode).toBeUndefined();
    error.mockRestore();
  });
});
