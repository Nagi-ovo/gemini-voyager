import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { AIStudioFolderManager, mutationAddsPromptLinks, parseDragDataPayload } from '../aistudio';

type DragDataTransferMock = {
  effectAllowed: string;
  setData: ReturnType<typeof vi.fn>;
  setDragImage: ReturnType<typeof vi.fn>;
};

function createPromptRow(
  promptId: string,
  title: string,
): {
  root: HTMLElement;
  row: HTMLElement;
  host: HTMLElement;
  anchor: HTMLAnchorElement;
} {
  const root = document.createElement('ms-prompt-history-v3');
  const row = document.createElement('div');
  row.setAttribute('data-test-id', `history-item-${promptId}`);
  const li = document.createElement('li');
  const anchor = document.createElement('a');
  anchor.className = 'prompt-link';
  anchor.setAttribute('href', `/prompts/${promptId}`);
  anchor.textContent = title;
  li.appendChild(anchor);
  row.appendChild(li);
  root.appendChild(row);
  document.body.appendChild(root);
  return { root, row, host: li, anchor };
}

describe('AIStudio prompt binding performance guards', () => {
  it('detects prompt-link additions in mutations', () => {
    const wrapper = document.createElement('div');
    const promptAnchor = document.createElement('a');
    promptAnchor.className = 'prompt-link';
    promptAnchor.setAttribute('href', '/prompts/abc');
    wrapper.appendChild(promptAnchor);

    const hitMutation = {
      addedNodes: [wrapper],
    } as unknown as MutationRecord;
    const missMutation = {
      addedNodes: [document.createElement('span')],
    } as unknown as MutationRecord;

    expect(mutationAddsPromptLinks([hitMutation])).toBe(true);
    expect(mutationAddsPromptLinks([missMutation])).toBe(false);
  });

  it('parses fallback URL payloads used by Firefox native drag data', () => {
    const fromUriList = parseDragDataPayload('https://aistudio.google.com/prompts/xyz987');
    expect(fromUriList?.conversationId).toBe('xyz987');

    const fromMozUrl = parseDragDataPayload(
      'https://aistudio.google.com/prompts/abc555\nPrompt title from firefox',
    );
    expect(fromMozUrl?.conversationId).toBe('abc555');
  });

  it('binds drag handler once per host and marks anchors as bound', () => {
    const { root, row, host, anchor } = createPromptRow('abc123', 'Prompt Title');
    const manager = new AIStudioFolderManager();
    const bindDraggablesInPromptList = (
      manager as unknown as {
        bindDraggablesInPromptList: (scope?: ParentNode | null) => void;
      }
    ).bindDraggablesInPromptList.bind(manager);

    bindDraggablesInPromptList(root);
    bindDraggablesInPromptList(root);

    expect(anchor.dataset.gvDragBound).toBe('1');
    expect(row.draggable).toBe(true);
    expect(host.draggable).toBe(false);

    const transfer: DragDataTransferMock = {
      effectAllowed: '',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };
    const dragstart = new Event('dragstart') as DragEvent;
    Object.defineProperty(dragstart, 'dataTransfer', {
      value: transfer,
      configurable: true,
    });

    row.dispatchEvent(dragstart);

    const calls = transfer.setData.mock.calls as Array<[string, string]>;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls).toEqual(
      expect.arrayContaining([
        ['application/json', expect.stringContaining('"conversationId":"abc123"')],
        ['text/plain', expect.stringContaining('"conversationId":"abc123"')],
      ]),
    );
  });
});

describe('AIStudio theme compatibility', () => {
  it('uses body light/dark theme selectors for folder palette variables', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');

    expect(css).toContain('.theme-host.dark-theme,\nbody.dark-theme');
    expect(css).toContain('.theme-host.light-theme,\nbody.light-theme');
    expect(css).toContain('body.dark-theme .gv-folder-action-btn:hover');
  });

  it('renders cloud action icons with currentColor in AI Studio', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/folder/aistudio.ts'),
      'utf8',
    );

    expect(code).toContain('fill="currentColor"');
    expect(code).not.toContain('fill="#e3e3e3"');
  });
});
