import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WidthSlider from '../WidthSlider';

describe('WidthSlider', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps drag updates local until the user commits', () => {
    const onChange = vi.fn();
    const onChangeComplete = vi.fn();

    act(() => {
      root.render(
        <WidthSlider
          label="Width"
          value={50}
          min={20}
          max={100}
          step={1}
          narrowLabel="Narrow"
          wideLabel="Wide"
          onChange={onChange}
          onChangeComplete={onChangeComplete}
        />,
      );
    });

    const input = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    act(() => {
      input.value = '72';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('72%');
    expect(onChange).not.toHaveBeenCalled();

    act(() => input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(72);
    expect(onChangeComplete).toHaveBeenCalledWith(72);
  });

  it('commits keyboard adjustments when the range key is released', () => {
    const onChange = vi.fn();
    const onChangeComplete = vi.fn();

    act(() => {
      root.render(
        <WidthSlider
          label="Width"
          value={50}
          min={20}
          max={100}
          step={1}
          narrowLabel="Narrow"
          wideLabel="Wide"
          onChange={onChange}
          onChangeComplete={onChangeComplete}
        />,
      );
    });

    const input = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    act(() => {
      input.value = '51';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    });

    expect(onChange).toHaveBeenCalledWith(51);
    expect(onChangeComplete).toHaveBeenCalledWith(51);
  });
});
