import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Picker, startPicker } from './picker';
import { PICKING_CLASS } from './styles';

const pickers: Picker[] = [];

function start(onPick = vi.fn(), onCancel = vi.fn()) {
  const picker = startPicker({
    doc: document,
    labels: { hint: 'Click an element', cancel: 'Cancel' },
    onPick,
    onCancel,
  });
  pickers.push(picker);
  return { picker, onPick, onCancel };
}

const layer = () => document.querySelector<HTMLElement>('.gv-site-check-picker');
const outline = () => layer()?.shadowRoot?.querySelector<HTMLElement>('.gv-sc-outline');

function fire(target: Element, type: string): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  for (const picker of pickers.splice(0)) picker.stop();
  document.body.innerHTML = '';
});

describe('site check element picker', () => {
  it('outlines the hovered element and picks it on click without the page seeing the press', () => {
    document.body.innerHTML = '<main><a id="link" href="#elsewhere">x</a></main>';
    const link = document.getElementById('link')!;
    const pageClick = vi.fn();
    const pageDown = vi.fn();
    link.addEventListener('click', pageClick);
    link.addEventListener('pointerdown', pageDown);
    const { onPick, onCancel } = start();
    expect(document.documentElement.classList.contains(PICKING_CLASS)).toBe(true);

    fire(link, 'pointermove');
    expect(outline()?.hidden).toBe(false);
    const down = fire(link, 'pointerdown');
    const click = fire(link, 'click');

    expect(onPick).toHaveBeenCalledWith(link);
    expect(onCancel).not.toHaveBeenCalled();
    expect(pageDown).not.toHaveBeenCalled();
    expect(pageClick).not.toHaveBeenCalled();
    expect(down.defaultPrevented && click.defaultPrevented).toBe(true);
  });

  it('leaves on Escape or Cancel, and reports a cancel', () => {
    document.body.innerHTML = '<main></main>';
    const escape = start();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(escape.onCancel).toHaveBeenCalledTimes(1);
    expect(layer()).toBeNull();

    const cancel = start();
    const button = layer()!.shadowRoot!.querySelector('button')!;
    button.click();
    expect(cancel.onCancel).toHaveBeenCalledTimes(1);
    expect(cancel.onPick).not.toHaveBeenCalled();
    expect(layer()).toBeNull();
  });

  it('removes its overlay, page class and listeners on stop, so the page gets its clicks back', () => {
    document.body.innerHTML = '<main><button id="host">x</button></main>';
    const host = document.getElementById('host')!;
    const pageClick = vi.fn();
    host.addEventListener('click', pageClick);
    const { picker, onPick, onCancel } = start();
    picker.stop();
    picker.stop();

    expect(layer()).toBeNull();
    expect(document.documentElement.classList.contains(PICKING_CLASS)).toBe(false);
    expect(document.querySelector('style[data-gv-plugin-scope="siteCheck"]')).toBeNull();
    fire(host, 'click');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pageClick).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not pick Voyager’s own layers', () => {
    document.body.innerHTML = '<div data-gv-layer="toast"><span id="toast">x</span></div>';
    const { onPick } = start();
    fire(document.getElementById('toast')!, 'click');
    expect(onPick).not.toHaveBeenCalled();
  });
});
