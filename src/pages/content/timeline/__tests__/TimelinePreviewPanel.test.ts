import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelinePreviewPanel } from '../TimelinePreviewPanel';
import type { PreviewMarkerData } from '../types';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

vi.mock('../../../../utils/i18n', () => ({
  getTranslationSync: (key: string) => {
    const map: Record<string, string> = {
      timelinePreviewSearch: 'Search...',
      timelinePreviewNoResults: 'No results',
      timelinePreviewNoMessages: 'No messages',
    };
    return map[key] ?? key;
  },
}));

function makeMarkers(count: number): PreviewMarkerData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `turn-${i}`,
    summary: `User message number ${i + 1}`,
    index: i,
    starred: i === 2,
  }));
}

describe('TimelinePreviewPanel', () => {
  let anchor: HTMLElement;
  let panel: TimelinePreviewPanel;
  let onNavigate: (turnId: string, index: number) => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    anchor = document.createElement('div');
    anchor.className = 'gemini-timeline-bar';
    document.body.appendChild(anchor);

    onNavigate = vi.fn();
    panel = new TimelinePreviewPanel(anchor);
    panel.init(onNavigate);
  });

  afterEach(() => {
    panel.destroy();
    document.body.innerHTML = '';
  });

  describe('DOM creation', () => {
    it('creates toggle button on the page', () => {
      const toggle = document.querySelector('.timeline-preview-toggle');
      expect(toggle).not.toBeNull();
      expect(toggle?.tagName).toBe('BUTTON');
    });

    it('creates panel with search and list', () => {
      const panelEl = document.querySelector('.timeline-preview-panel');
      expect(panelEl).not.toBeNull();
      expect(panelEl?.querySelector('.timeline-preview-search input')).not.toBeNull();
      expect(panelEl?.querySelector('.timeline-preview-list')).not.toBeNull();
    });
  });

  describe('toggle', () => {
    it('opens and closes panel', () => {
      const panelEl = document.querySelector('.timeline-preview-panel')!;
      expect(panelEl.classList.contains('visible')).toBe(false);
      expect(panel.isOpen).toBe(false);

      panel.toggle();
      expect(panelEl.classList.contains('visible')).toBe(true);
      expect(panel.isOpen).toBe(true);

      panel.toggle();
      expect(panelEl.classList.contains('visible')).toBe(false);
      expect(panel.isOpen).toBe(false);
    });

    it('toggle button click opens/closes panel', () => {
      const toggle = document.querySelector('.timeline-preview-toggle') as HTMLElement;
      toggle.click();
      expect(panel.isOpen).toBe(true);

      toggle.click();
      expect(panel.isOpen).toBe(false);
    });
  });

  describe('updateMarkers', () => {
    it('renders correct number of items when open', () => {
      const markers = makeMarkers(5);
      panel.updateMarkers(markers);
      panel.open();

      const items = document.querySelectorAll('.timeline-preview-item');
      expect(items.length).toBe(5);
    });

    it('shows index numbers', () => {
      panel.updateMarkers(makeMarkers(3));
      panel.open();

      const indices = document.querySelectorAll('.timeline-preview-index');
      expect(indices[0]?.textContent).toBe('1');
      expect(indices[2]?.textContent).toBe('3');
    });

    it('marks starred items', () => {
      panel.updateMarkers(makeMarkers(5));
      panel.open();

      const items = document.querySelectorAll('.timeline-preview-item');
      expect(items[2]?.classList.contains('starred')).toBe(true);
      expect(items[0]?.classList.contains('starred')).toBe(false);
    });

    it('shows empty message when no markers', () => {
      panel.updateMarkers([]);
      panel.open();

      const empty = document.querySelector('.timeline-preview-empty');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toBe('No messages');
    });
  });

  describe('updateActiveTurn', () => {
    it('highlights the active item', () => {
      panel.updateMarkers(makeMarkers(5));
      panel.open();

      panel.updateActiveTurn('turn-1');

      const items = document.querySelectorAll('.timeline-preview-item');
      expect(items[1]?.classList.contains('active')).toBe(true);
      expect(items[0]?.classList.contains('active')).toBe(false);
    });

    it('switches active highlight on update', () => {
      panel.updateMarkers(makeMarkers(5));
      panel.open();

      panel.updateActiveTurn('turn-0');
      let items = document.querySelectorAll('.timeline-preview-item');
      expect(items[0]?.classList.contains('active')).toBe(true);

      panel.updateActiveTurn('turn-3');
      items = document.querySelectorAll('.timeline-preview-item');
      expect(items[0]?.classList.contains('active')).toBe(false);
      expect(items[3]?.classList.contains('active')).toBe(true);
    });
  });

  describe('search filtering', () => {
    it('filters by substring (case-insensitive)', async () => {
      panel.updateMarkers(makeMarkers(10));
      panel.open();

      const input = document.querySelector('.timeline-preview-search input') as HTMLInputElement;
      input.value = 'number 3';
      input.dispatchEvent(new Event('input'));

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 250));

      const items = document.querySelectorAll('.timeline-preview-item');
      expect(items.length).toBe(1);
      expect(items[0]?.querySelector('.timeline-preview-text')?.textContent).toContain('3');
    });

    it('shows all items when search is cleared', async () => {
      panel.updateMarkers(makeMarkers(5));
      panel.open();

      const input = document.querySelector('.timeline-preview-search input') as HTMLInputElement;
      input.value = 'number 1';
      input.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(document.querySelectorAll('.timeline-preview-item').length).toBe(1);

      input.value = '';
      input.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(document.querySelectorAll('.timeline-preview-item').length).toBe(5);
    });

    it('shows "No results" when search has no match', async () => {
      panel.updateMarkers(makeMarkers(3));
      panel.open();

      const input = document.querySelector('.timeline-preview-search input') as HTMLInputElement;
      input.value = 'zzzznonexistent';
      input.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 250));

      const empty = document.querySelector('.timeline-preview-empty');
      expect(empty?.textContent).toBe('No results');
    });
  });

  describe('navigation', () => {
    it('calls onNavigate when item is clicked', () => {
      panel.updateMarkers(makeMarkers(5));
      panel.open();

      const items = document.querySelectorAll('.timeline-preview-item');
      (items[2] as HTMLElement).click();

      expect(onNavigate).toHaveBeenCalledWith('turn-2', 2);
    });
  });

  describe('close behavior', () => {
    it('closes on Escape key', () => {
      panel.open();
      expect(panel.isOpen).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(panel.isOpen).toBe(false);
    });

    it('closes on click outside', () => {
      panel.open();
      expect(panel.isOpen).toBe(true);

      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(panel.isOpen).toBe(false);
    });

    it('does not close on click inside panel', () => {
      panel.updateMarkers(makeMarkers(3));
      panel.open();

      const panelEl = document.querySelector('.timeline-preview-panel')!;
      panelEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(panel.isOpen).toBe(true);
    });
  });

  describe('scroll isolation', () => {
    it('stops wheel event propagation on list', () => {
      panel.updateMarkers(makeMarkers(20));
      panel.open();

      const list = document.querySelector('.timeline-preview-list') as HTMLElement;
      const wheelEvent = new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true });
      const stopSpy = vi.spyOn(wheelEvent, 'stopPropagation');
      list.dispatchEvent(wheelEvent);

      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('removes all DOM elements', () => {
      panel.destroy();

      expect(document.querySelector('.timeline-preview-toggle')).toBeNull();
      expect(document.querySelector('.timeline-preview-panel')).toBeNull();
    });

    it('can be called multiple times safely', () => {
      panel.destroy();
      expect(() => panel.destroy()).not.toThrow();
    });
  });
});
