/** DOM and storage fixtures shared by the research-pack content tests. */
import { vi } from 'vitest';

import { addItem, createEmptyPack } from '@/features/researchPack/services/packModel';
import {
  type ResearchPackStorageArea,
  createResearchPackOwner,
} from '@/features/researchPack/services/packStore';
import type { ResearchPack } from '@/features/researchPack/services/types';

import { ADD_BUTTON_CLASS } from '../turnButtons';

/** jsdom runs on localhost; the pack only knows Gemini pages, so map the jsdom path onto one. */
export const geminiPageUrl = () => `https://gemini.google.com${window.location.pathname}`;

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function packOf(text: string): ResearchPack {
  return addItem(
    createEmptyPack(),
    {
      text,
      excerpt: false,
      prompt: '',
      sourceTitle: text,
      sourceUrl: 'https://gemini.google.com/app/x',
      platform: 'gemini',
      citations: [],
    },
    1,
  ).pack;
}

/** One storage area behind a real background owner, as every tab sees it. */
export function sharedStorage(
  initial: Record<string, ResearchPack> = {},
  options: { now?: () => number } = {},
) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const area: ResearchPackStorageArea = {
    get: async (key) => (data.has(key) ? { [key]: structuredClone(data.get(key)) } : {}),
    set: async (items) => {
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    },
  };
  const store = createResearchPackOwner({ area, now: options.now });
  const at = (key: string) => (data.get(key) as ResearchPack | undefined)?.items ?? [];
  const instruction = (key: string) => (data.get(key) as ResearchPack | undefined)?.instruction;
  const stored = (key: string) => data.get(key) as ResearchPack | undefined;
  /** Delete a pack from outside the owner, as clearing extension data would. */
  const remove = (key: string) => data.delete(key);
  return { store, at, instruction, stored, remove };
}

export const shownItems = () =>
  Array.from(document.querySelectorAll('.gv-rp-item .gv-rp-item-snippet')).map(
    (node) => node.textContent,
  );

/** Deliver a change to the research pack's storage listener, like chrome.storage.onChanged. */
export function emitStorageChange(changes: Record<string, unknown>, areaName: string): void {
  const calls = vi.mocked(chrome.storage.onChanged.addListener).mock.calls;
  const listener = calls[calls.length - 1][0] as (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => void;
  listener(changes as Record<string, chrome.storage.StorageChange>, areaName);
}

export function turn(answerHtml: string, prompt = 'Why is the sky blue?'): HTMLElement {
  const container = document.createElement('div');
  container.className = 'conversation-container';
  container.innerHTML = `
    <user-query><div class="query-text">${prompt}</div></user-query>
    <model-response>
      <div class="response-container">
        <model-thoughts><a href="https://thoughts.example/hidden">thinking</a></model-thoughts>
        <message-content><div class="markdown">${answerHtml}</div></message-content>
        <message-actions>
          <div class="actions-container-v2">
            <div class="buttons-container-v2">
              <button class="copy">Copy</button>
              <a href="https://g.co/share/x">Share</a>
            </div>
          </div>
        </message-actions>
      </div>
    </model-response>`;
  document.body.appendChild(container);
  return container.querySelector('model-response') as HTMLElement;
}

export function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function clickAdd(host: HTMLElement): void {
  const button = host.querySelector<HTMLButtonElement>(`.${ADD_BUTTON_CLASS}`)!;
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  button.click();
}
