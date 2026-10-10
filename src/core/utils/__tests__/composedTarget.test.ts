import { afterEach, describe, expect, it } from 'vitest';

import { composedEventTarget, composedTargetElement, deepActiveElement } from '../composedTarget';

afterEach(() => {
  document.body.innerHTML = '';
});

function shadowInput(): { host: HTMLElement; input: HTMLInputElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const input = document.createElement('input');
  host.attachShadow({ mode: 'open' }).appendChild(input);
  return { host, input };
}

describe('composed targets', () => {
  it('reads the origin of an event from inside an open shadow root', () => {
    const { host, input } = shadowInput();
    const seen: unknown[] = [];
    document.addEventListener(
      'keydown',
      (e) => seen.push(e.target, composedEventTarget(e), composedTargetElement(e)),
      { once: true },
    );
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true }));
    expect(seen).toEqual([host, input, input]);
  });

  it('falls back to the event target once dispatch has finished', () => {
    const event = new Event('custom');
    document.body.dispatchEvent(event);
    expect(composedEventTarget(event)).toBe(document.body);
  });

  it('descends into shadow roots for the focused element', () => {
    const { host, input } = shadowInput();
    input.focus();
    expect(document.activeElement).toBe(host);
    expect(deepActiveElement()).toBe(input);
  });

  it('uses the deep focused element when the event origin is not an element', () => {
    const { input } = shadowInput();
    input.focus();
    let resolved: HTMLElement | null = null;
    window.addEventListener('keydown', (e) => (resolved = composedTargetElement(e)), {
      once: true,
    });
    window.dispatchEvent(new KeyboardEvent('keydown'));
    expect(resolved).toBe(input);
  });
});
