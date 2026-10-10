import { describe, expect, it, vi } from 'vitest';

import { moveNativeCopyButton } from '../view';
import { createWaveDromFixture } from './fixture';

const fixture = createWaveDromFixture();

describe('moveNativeCopyButton', () => {
  const makeCodeBlock = (): {
    codeBlockHost: HTMLElement;
    parent: HTMLElement;
    toolbar: HTMLElement;
  } => {
    const codeBlockHost = document.createElement('code-block');
    const parent = document.createElement('div');
    parent.appendChild(codeBlockHost);
    const toolbar = document.createElement('div');
    return { codeBlockHost, parent, toolbar };
  };

  it('moves a .copy-button into the toolbar and resets its positioning', () => {
    const { codeBlockHost, toolbar } = makeCodeBlock();
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-button';
    copyBtn.style.position = 'absolute';
    copyBtn.style.top = '8px';
    codeBlockHost.appendChild(copyBtn);

    const moved = moveNativeCopyButton(codeBlockHost, toolbar);
    expect(moved).toBe(copyBtn);
    expect(toolbar.contains(copyBtn)).toBe(true);
    expect(copyBtn.style.position).toBe('static');
    expect(copyBtn.style.top).toBe('auto');
    expect(copyBtn.style.right).toBe('auto');
    // jsdom normalises the px unit on zero margins.
    expect(copyBtn.style.marginTop).toBe('0px');
  });

  it('prefers the .buttons container when present', () => {
    const { codeBlockHost, toolbar } = makeCodeBlock();
    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    codeBlockHost.appendChild(buttons);
    codeBlockHost.appendChild(
      Object.assign(document.createElement('button'), { className: 'copy-button' }),
    );

    expect(moveNativeCopyButton(codeBlockHost, toolbar)).toBe(buttons);
    expect(toolbar.contains(buttons)).toBe(true);
  });

  it('returns null when no native copy button exists', () => {
    const { codeBlockHost, toolbar } = makeCodeBlock();
    expect(moveNativeCopyButton(codeBlockHost, toolbar)).toBeNull();
  });

  it('does not steal controls from a sibling WaveDrom block', () => {
    const first = makeCodeBlock();
    const second = makeCodeBlock();
    const firstButtons = document.createElement('div');
    firstButtons.className = 'buttons';
    const secondButtons = document.createElement('div');
    secondButtons.className = 'buttons';
    first.codeBlockHost.appendChild(firstButtons);
    second.codeBlockHost.appendChild(secondButtons);

    expect(moveNativeCopyButton(second.codeBlockHost, second.toolbar)).toBe(secondButtons);
    expect(first.codeBlockHost.contains(firstButtons)).toBe(true);
    expect(second.toolbar.contains(firstButtons)).toBe(false);
  });
});

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
    document.body.appendChild(codeBlock);
    return codeEl;
  };

  it('renders WaveJSON under an explicit wavedrom label', async () => {
    makeCodeBlock('wavedrom', WAVEJSON);
    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-wavedrom-wrapper')).not.toBeNull();
    });
  });

  it('renders WaveJSON under an explicit wavejson label', async () => {
    makeCodeBlock('wavejson', WAVEJSON);
    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-wavedrom-wrapper')).not.toBeNull();
    });
  });

  it('does not render WaveJSON inside a json-labelled block', async () => {
    makeCodeBlock('json', WAVEJSON);
    fixture.blocks.process();
    // The json label returns synchronously before any render is scheduled.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.gv-wavedrom-wrapper')).toBeNull();
  });

  it('renders WaveJSON under a generic localized label', async () => {
    makeCodeBlock('代码段', WAVEJSON);
    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-wavedrom-wrapper')).not.toBeNull();
    });
  });

  it('renders WaveJSON without any language label', async () => {
    makeCodeBlock(null, WAVEJSON);
    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-wavedrom-wrapper')).not.toBeNull();
    });
  });

  it('skips WaveJSON inside a specific-language block', async () => {
    makeCodeBlock('typescript', WAVEJSON);
    fixture.blocks.process();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.gv-wavedrom-wrapper')).toBeNull();
  });

  it('restores the source block when explicit WaveDrom becomes invalid', async () => {
    const codeEl = makeCodeBlock('wavedrom', WAVEJSON);
    const codeBlockHost = codeEl.closest<HTMLElement>('code-block')!;
    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-wavedrom-wrapper')).not.toBeNull();
    });

    codeEl.textContent = '{ invalid WaveJSON';
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-wavedrom-wrapper')).toBeNull();
    });
    expect(codeBlockHost.style.display).toBe('');
    expect(codeEl.dataset.wavedromCode).toBeUndefined();
  });

  it('restores the source block when a rendered generic block gets a specific label', async () => {
    const codeEl = makeCodeBlock('代码段', WAVEJSON);
    const codeBlockHost = codeEl.closest<HTMLElement>('code-block')!;
    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-wavedrom-wrapper')).not.toBeNull();
    });

    codeBlockHost.querySelector('.code-block-decoration > span')!.textContent = 'json';
    fixture.blocks.process();

    expect(document.querySelector('.gv-wavedrom-wrapper')).toBeNull();
    expect(codeBlockHost.style.display).toBe('');
    expect(codeEl.dataset.wavedromCode).toBeUndefined();
  });
});
