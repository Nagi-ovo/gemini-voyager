import { describe, expect, it, vi } from 'vitest';

import { createWaveDromFixture } from './fixture';

const fixture = createWaveDromFixture();

describe('code block language labels', () => {
  const WAVEJSON = '{"signal": [{"name":"clk","wave":"p..."}]}';

  const makeCodeBlock = (language: string | null, code: string): HTMLElement => {
    const codeBlock = document.createElement('code-block');
    const decoration = document.createElement('div');
    decoration.className = 'code-block-decoration';
    if (language) {
      const span = document.createElement('span');
      span.textContent = language;
      decoration.appendChild(span);
    }
    const codeEl = document.createElement('code');
    codeEl.setAttribute('data-test-id', 'code-content');
    codeEl.textContent = code;
    codeBlock.append(decoration, codeEl);
    document.querySelector('model-response')!.appendChild(codeBlock);
    return codeEl;
  };

  it('renders WaveJSON under an explicit wavedrom label', async () => {
    makeCodeBlock('wavedrom', WAVEJSON);
    fixture.activate();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.gv-diagram-panel')?.shadowRoot?.querySelector('svg'),
      ).toBeTruthy();
    });
  });

  it('renders WaveJSON under an explicit wavejson label', async () => {
    makeCodeBlock('wavejson', WAVEJSON);
    fixture.activate();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.gv-diagram-panel')?.shadowRoot?.querySelector('svg'),
      ).toBeTruthy();
    });
  });

  it('does not render WaveJSON inside a json-labelled block', async () => {
    makeCodeBlock('json', WAVEJSON);
    fixture.activate();
    // The json label returns synchronously before any render is scheduled.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.gv-diagram-panel')).toBeNull();
  });

  it('renders WaveJSON under a generic localized label', async () => {
    makeCodeBlock('代码段', WAVEJSON);
    fixture.activate();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.gv-diagram-panel')?.shadowRoot?.querySelector('svg'),
      ).toBeTruthy();
    });
  });

  it('renders WaveJSON without any language label', async () => {
    makeCodeBlock(null, WAVEJSON);
    fixture.activate();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.gv-diagram-panel')?.shadowRoot?.querySelector('svg'),
      ).toBeTruthy();
    });
  });

  it('skips WaveJSON inside a specific-language block', async () => {
    makeCodeBlock('typescript', WAVEJSON);
    fixture.activate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.gv-diagram-panel')).toBeNull();
  });

  it('restores the source block when explicit WaveDrom becomes invalid', async () => {
    const codeEl = makeCodeBlock('wavedrom', WAVEJSON);
    const codeBlockHost = codeEl.closest<HTMLElement>('code-block')!;
    fixture.activate();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.gv-diagram-panel')?.shadowRoot?.querySelector('svg'),
      ).toBeTruthy();
    });

    codeEl.textContent = '{ invalid WaveJSON';

    await vi.waitFor(
      () => {
        expect(document.querySelector('.gv-diagram-panel')).toBeNull();
      },
      { timeout: 3000 },
    );
    expect(getComputedStyle(codeBlockHost).display).not.toBe('none');
    expect(codeBlockHost.hasAttribute('data-gv-diagram-hidden')).toBe(false);
  });

  it('restores the source block when a rendered generic block gets a specific label', async () => {
    const codeEl = makeCodeBlock('代码段', WAVEJSON);
    const codeBlockHost = codeEl.closest<HTMLElement>('code-block')!;
    fixture.activate();
    await vi.waitFor(() => {
      expect(
        document.querySelector('.gv-diagram-panel')?.shadowRoot?.querySelector('svg'),
      ).toBeTruthy();
    });

    codeBlockHost.querySelector('.code-block-decoration > span')!.textContent = 'json';

    await vi.waitFor(() => expect(document.querySelector('.gv-diagram-panel')).toBeNull(), {
      timeout: 3000,
    });
    expect(getComputedStyle(codeBlockHost).display).not.toBe('none');
    expect(codeBlockHost.hasAttribute('data-gv-diagram-hidden')).toBe(false);
  });
});
