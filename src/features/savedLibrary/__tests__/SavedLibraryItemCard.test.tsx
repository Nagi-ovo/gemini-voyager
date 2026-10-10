import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TRANSLATIONS } from '@/utils/translations';

import { SavedLibraryItemCard } from '../SavedLibraryItemCard';
import { type SavedLibraryItem, savedLibraryItemKey } from '../model';

let container: HTMLElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const item: SavedLibraryItem = {
  kind: 'highlight',
  id: 'highlight',
  platform: 'gemini',
  accountHash: 'opaque-key',
  conversationId: 'conversation',
  conversationUrl: 'https://gemini.google.com/app/conversation',
  turnId: 'turn',
  content: 'Stored selection\nNext line',
  note: 'Remember the proof',
  color: 'blue',
  savedAt: 100,
};

it('opens and deletes a saved item through independent native controls', () => {
  const open = vi.fn();
  const remove = vi.fn();
  act(() =>
    root.render(
      <SavedLibraryItemCard
        item={item}
        onOpen={open}
        onDelete={remove}
        t={(key) => TRANSLATIONS.en[key]}
        language="en"
        expanded
      />,
    ),
  );
  const buttons = container.querySelectorAll('button');
  expect(buttons).toHaveLength(2);
  expect(buttons[0].querySelector('button')).toBeNull();
  expect(buttons[1].getAttribute('aria-label')).toBe(TRANSLATIONS.en.pm_delete);
  expect(buttons[0].textContent).toContain(item.content);
  expect(buttons[0].textContent).toContain(item.note);
  expect(buttons[0].textContent).toContain(TRANSLATIONS.en.pm_starred_untitled);
  expect(container.textContent).not.toContain('opaque-key');
  expect(container.querySelector('time')?.dateTime).toBe(new Date(100).toISOString());
  expect(
    container.querySelector('[data-library-item-id]')?.getAttribute('data-library-item-id'),
  ).toBe(savedLibraryItemKey(item));
  act(() => buttons[1].click());
  expect(remove).toHaveBeenCalledWith(item);
  expect(open).not.toHaveBeenCalled();
  act(() => buttons[0].click());
  expect(open).toHaveBeenCalledWith(item);
});

it('a saved star names its remove action and preserves the stored text', () => {
  const starred = { ...item, kind: 'starred' as const, content: 'A saved response' };
  act(() =>
    root.render(
      <SavedLibraryItemCard
        item={starred}
        onOpen={() => {}}
        onDelete={() => {}}
        t={(key) => TRANSLATIONS.ar[key]}
        language="ar"
      />,
    ),
  );
  expect(container.querySelector('button[aria-label]')?.getAttribute('aria-label')).toBe(
    TRANSLATIONS.ar.removeFromStarred,
  );
  expect(container.textContent).toContain(starred.content);
});
