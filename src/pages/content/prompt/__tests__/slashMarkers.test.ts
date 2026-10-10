import { describe, expect, it } from 'vitest';

import type { PromptItem } from '@/core/types/sync';

import { createMarkerLayer } from '../slashMarkers';
import {
  createContentEditable,
  setRect,
  prompts,
  useSlashTestHarness,
} from './slashPromptTestHarness';

describe('slashMarkers', () => {
  const track = useSlashTestHarness();

  it('anchors the marker to a prompt range after preceding text and multiline reflow', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      'getBoundingClientRect',
    );
    let rangeRect = { left: 140, top: 220, right: 220, bottom: 246, width: 80, height: 26 };
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...rangeRect, x: rangeRect.left, y: rangeRect.top, toJSON: () => ({}) }),
    });

    try {
      const input = createContentEditable('Before Code Review\u00a0');
      const layer = track(
        createMarkerLayer({
          scheme: () => 'light',
          promptsFor: () => [{ id: prompts[1].id, name: prompts[1].name!, start: 7 }],
          bindPreview: () => {},
        }),
      );
      layer.add(prompts[1], input, false);

      const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
      expect(marker.style.left).toBe('140px');
      expect(marker.style.top).toBe('220px');

      rangeRect = { left: 156, top: 164, right: 236, bottom: 190, width: 80, height: 26 };
      input.textContent = 'Before Code Review\n\nMy note';
      layer.reflow();
      expect(marker.style.left).toBe('156px');
      expect(marker.style.top).toBe('164px');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('hides the marker when the prompt range is outside the editor viewport', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      'getBoundingClientRect',
    );
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 140,
        top: 220,
        right: 220,
        bottom: 246,
        width: 80,
        height: 26,
        x: 140,
        y: 220,
        toJSON: () => ({}),
      }),
    });

    try {
      const input = createContentEditable('Code Review\u00a0');
      setRect(input, { top: 300, bottom: 360 });
      const layer = track(
        createMarkerLayer({
          scheme: () => 'light',
          promptsFor: () => [{ id: prompts[1].id, name: prompts[1].name!, start: 0 }],
          bindPreview: () => {},
        }),
      );
      layer.add(prompts[1], input, false);

      const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
      expect(marker.hidden).toBe(true);

      setRect(input, { top: 180, bottom: 260 });
      layer.reflow();
      expect(marker.hidden).toBe(false);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('positions each rebuilt marker over its own prompt name', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Range.prototype,
      'getBoundingClientRect',
    );
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: Range) {
        const left = 100 + this.startOffset * 10;
        return {
          left,
          top: 180,
          right: left + 80,
          bottom: 206,
          width: 80,
          height: 26,
          x: left,
          y: 180,
          toJSON: () => ({}),
        };
      },
    });

    try {
      const input = createContentEditable('Translator\u00a0Code Review\u00a0');
      const layer = track(
        createMarkerLayer({
          scheme: () => 'light',
          promptsFor: () => [
            { id: prompts[0].id, name: prompts[0].name!, start: 0 },
            { id: prompts[1].id, name: prompts[1].name!, start: 11 },
          ],
          bindPreview: () => {},
        }),
      );
      layer.add(prompts[0], input, false);
      layer.add(prompts[1], input, false);
      layer.reflow();
      const markers = Array.from(
        document.querySelectorAll<HTMLElement>('.gv-pm-slash-textarea-token'),
      );

      expect(markers.map((marker) => marker.textContent)).toEqual(['Translator', 'Code Review']);
      expect(markers[0].style.left).toBe('100px');
      expect(markers[1].style.left).toBe('210px');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalDescriptor);
      } else {
        Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
      }
    }
  });

  it('copies typography from the rebuilt node that contains a mixed-script prompt name', () => {
    const metaPrompt: PromptItem = {
      id: 'meta',
      name: '元Prompt(杠杆)',
      text: 'Long meta prompt body.',
      tags: [],
      createdAt: 4,
    };
    const input = createContentEditable('元Prompt(杠杆)\u00a0');
    const layer = track(
      createMarkerLayer({
        scheme: () => 'light',
        promptsFor: () => [{ id: metaPrompt.id, name: metaPrompt.name!, start: 0 }],
        bindPreview: () => {},
      }),
    );
    layer.add(metaPrompt, input, false);

    const paragraph = document.createElement('p');
    paragraph.style.fontFamily = 'serif';
    paragraph.style.fontSize = '19px';
    paragraph.style.fontWeight = '500';
    paragraph.style.lineHeight = '27px';
    paragraph.style.letterSpacing = '0.4px';
    paragraph.textContent = '元Prompt(杠杆)\u00a0';
    input.replaceChildren(paragraph);
    layer.reflow();

    const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
    expect(marker.style.fontFamily).toBe('serif');
    expect(marker.style.fontSize).toBe('19px');
    expect(marker.style.fontWeight).toBe('500');
    expect(marker.style.lineHeight).toBe('27px');
    expect(marker.style.letterSpacing).toBe('0.4px');
  });

  it('repositions the marker when the editor grows without emitting an input event', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
    let resizeCallback: ResizeObserverCallback = () => {
      throw new Error('ResizeObserver callback was not registered');
    };
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    });

    try {
      const input = createContentEditable('Code Review\u00a0');
      const layer = track(
        createMarkerLayer({
          scheme: () => 'light',
          promptsFor: () => [{ id: prompts[1].id, name: prompts[1].name!, start: 0 }],
          bindPreview: () => {},
        }),
      );
      layer.add(prompts[1], input, false);

      setRect(input, { left: 52, top: 140 });
      resizeCallback([], {} as ResizeObserver);

      const marker = document.querySelector<HTMLElement>('.gv-pm-slash-textarea-token')!;
      expect(marker.style.left).toBe('52px');
      expect(marker.style.top).toBe('140px');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'ResizeObserver', originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'ResizeObserver');
      }
    }
  });
});
