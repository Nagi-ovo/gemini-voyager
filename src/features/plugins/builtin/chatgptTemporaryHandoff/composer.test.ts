import { afterEach, describe, expect, it, vi } from 'vitest';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { readCurrentComposerDraft } from './composerDelivery';
import { handoffTemporaryChat, markHandoffPageActive } from './handoff';
import { CHATGPT_HANDOFF_GET_TAB_ID_MESSAGE } from './storage';

const storageState = vi.hoisted(() => new Map<string, unknown>());

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (keys?: null | string | string[]) => {
          if (keys == null) return Object.fromEntries(storageState);
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(requested.map((key) => [key, storageState.get(key)]));
        }),
        remove: vi.fn(async (key: string | string[]) => {
          for (const item of Array.isArray(key) ? key : [key]) storageState.delete(item);
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) storageState.set(key, value);
        }),
      },
    },
    runtime: {
      sendMessage: vi.fn(async (message: { type?: string }) =>
        message.type === CHATGPT_HANDOFF_GET_TAB_ID_MESSAGE
          ? { ok: true, tabId: 42 }
          : { ok: true },
      ),
    },
  },
}));

const scopes: PluginScope[] = [];

/**
 * The composer as measured live (October 2026): a ProseMirror textbox in
 * `form[data-chatgpt-composer]`, no `#prompt-textarea`, and a submit button
 * labelled only by a localized aria-label.
 */
function addCurrentComposer(draft = '', page?: HTMLElement): HTMLElement {
  const main =
    page?.querySelector('main') ??
    document.querySelector('main') ??
    document.body.appendChild(document.createElement('main'));
  const form = document.createElement('form');
  form.setAttribute('data-chatgpt-composer', '');
  const textbox = document.createElement('div');
  textbox.setAttribute('contenteditable', 'true');
  textbox.setAttribute('role', 'textbox');
  textbox.className = 'ProseMirror';
  textbox.setAttribute('aria-label', 'Ask ChatGPT');
  textbox.setAttribute('data-composer-markdown', '');
  textbox.textContent = draft;
  const send = document.createElement('button');
  send.type = 'submit';
  send.setAttribute('aria-label', 'Send');
  send.disabled = true;
  form.append(textbox, send);
  main.appendChild(form);
  return textbox;
}

afterEach(async () => {
  await Promise.all(scopes.splice(0).map((scope) => scope.dispose()));
  document.body.replaceChildren();
  history.replaceState({}, '', '/');
  markHandoffPageActive();
  sessionStorage.clear();
  storageState.clear();
  vi.clearAllMocks();
});

describe('temporary chat handoff on the current ChatGPT composer', () => {
  it('reads the draft and hands off through a composer whose send button has no test id', async () => {
    const scope = new PluginScope();
    scopes.push(scope);
    history.replaceState({}, '', '/?temporary-chat=true');
    addCurrentComposer('Unsent follow-up');
    const normal: { composer: HTMLElement | null } = { composer: null };
    const toggle = document.createElement('button');
    toggle.setAttribute('aria-label', 'Turn off temporary chat');
    toggle.addEventListener('click', () => {
      history.replaceState({}, '', '/');
      toggle.remove();
      document.querySelector('main')?.replaceChildren();
      normal.composer = addCurrentComposer();
    });
    document.body.appendChild(toggle);

    expect(readCurrentComposerDraft()).toBe('Unsent follow-up');
    await expect(
      handoffTemporaryChat(scope, { mode: 'inline', text: 'Continue this transcript' }),
    ).resolves.toBe('ready');

    expect(normal.composer?.textContent).toContain('Continue this transcript');
  });

  it("waits for the new chat's composer instead of writing into the hidden temporary one", async () => {
    const scope = new PluginScope();
    scopes.push(scope);
    history.replaceState({}, '', '/?temporary-chat=true');
    const temporaryPage = document.body.appendChild(document.createElement('div'));
    temporaryPage.appendChild(document.createElement('main'));
    const temporary = addCurrentComposer('Unsent follow-up', temporaryPage);
    const normal: { composer: HTMLElement | null } = { composer: null };
    const toggle = document.createElement('button');
    toggle.setAttribute('aria-label', 'Turn off temporary chat');
    toggle.addEventListener('click', () => {
      history.replaceState({}, '', '/');
      toggle.remove();
      // ChatGPT keeps the page it leaves under a display: none ancestor and
      // mounts the new chat's composer a moment later.
      temporaryPage.style.display = 'none';
      setTimeout(() => {
        const page = document.body.appendChild(document.createElement('div'));
        page.appendChild(document.createElement('main'));
        normal.composer = addCurrentComposer('', page);
      }, 600);
    });
    document.body.appendChild(toggle);

    await expect(
      handoffTemporaryChat(scope, { mode: 'inline', text: 'Continue this transcript' }),
    ).resolves.toBe('ready');

    expect(temporary.textContent).toBe('Unsent follow-up');
    expect(normal.composer?.textContent).toContain('Continue this transcript');
  });
});
