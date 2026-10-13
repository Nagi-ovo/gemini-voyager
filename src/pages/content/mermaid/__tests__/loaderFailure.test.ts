import { describe, expect, it, vi } from 'vitest';

import { MermaidRenderer } from '../renderer';

vi.mock('mermaid', () => {
  throw new Error('Chunk unavailable');
});

describe('Mermaid loading failure', () => {
  it('caches the failure, so later attempts neither retry the import nor render', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderer = new MermaidRenderer();
    await expect(renderer.initialize()).resolves.toBe(false);
    await expect(renderer.render('flowchart TD\nA --> B\nB --> C')).resolves.toBeNull();
    await expect(renderer.initialize()).resolves.toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
