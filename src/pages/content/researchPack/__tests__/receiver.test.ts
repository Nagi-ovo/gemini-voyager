import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HANDOFF_MESSAGES, type HandoffMessage } from '@/features/researchPack/services/handoff';
import { toastDriver } from '@/tests/toastDriver';

import { insertTextIntoChatInput } from '../../chatInput';
import {
  RECEIVER_COMPOSER_TIMEOUT_MS,
  RECEIVER_POLL_MS,
  RECEIVER_STABLE_POLLS,
  startResearchPackReceiver,
} from '../receiver';

const PACK = '# Research pack\n\n## 1. Why is the sky blue?\n\nRayleigh scattering.';
const SETTLE_MS = RECEIVER_POLL_MS * (RECEIVER_STABLE_POLLS + 1);

function chatgptComposer(): {
  composer: HTMLElement;
  submitted: ReturnType<typeof vi.fn>;
  sendClicked: ReturnType<typeof vi.fn>;
  enterPressed: ReturnType<typeof vi.fn>;
} {
  document.body.innerHTML = `
    <main>
      <form>
        <div id="prompt-textarea" contenteditable="true"></div>
        <button type="submit" data-testid="send-button">Send</button>
      </form>
    </main>`;
  const form = document.querySelector('form')!;
  const composer = document.querySelector<HTMLElement>('#prompt-textarea')!;
  const submitted = vi.fn((event: Event) => event.preventDefault());
  const sendClicked = vi.fn();
  const enterPressed = vi.fn();
  form.addEventListener('submit', submitted);
  document.querySelector('[data-testid="send-button"]')!.addEventListener('click', sendClicked);
  composer.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') enterPressed();
  });
  return { composer, submitted, sendClicked, enterPressed };
}

describe('research pack receiver on ChatGPT and Claude', () => {
  let stop: (() => void) | null = null;
  let pending: boolean;
  let claimReply: unknown;
  let send: ReturnType<typeof vi.fn<(message: HandoffMessage) => Promise<unknown>>>;
  let url: string;
  let insert: ReturnType<typeof vi.fn<(text: string, input: HTMLElement) => boolean>>;
  /** A stand-in for `window.navigation` that counts its listeners. */
  let navigation: EventTarget;
  let navigationListeners: number;
  /** An SPA navigation as the Navigation API reports it: navigate, commit, entry change. */
  const navigate = (next: string) => {
    navigation.dispatchEvent(Object.assign(new Event('navigate'), { destination: { url: next } }));
    url = next;
    navigation.dispatchEvent(new Event('currententrychange'));
  };

  const sent = () => send.mock.calls.map(([message]) => message.type);
  const toast = () => toastDriver.all()[0];

  function start(pageUrl = 'https://chatgpt.com/', isTopFrame = true): void {
    url = pageUrl;
    stop = startResearchPackReceiver({
      send,
      insert,
      navigation,
      pageUrl: () => url,
      isTopFrame: () => isTopFrame,
    });
  }

  /** Hold the claim reply until `release` runs, to act while it is in flight. */
  function holdClaim(): () => void {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const answer = send.getMockImplementation()!;
    send.mockImplementation(async (message) => {
      if (message.type === HANDOFF_MESSAGES.claim) await held;
      return answer(message);
    });
    return () => release();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    pending = true;
    insert = vi.fn((text: string, input: HTMLElement) => insertTextIntoChatInput(text, input));
    navigation = new EventTarget();
    navigationListeners = 0;
    const add = navigation.addEventListener.bind(navigation);
    const remove = navigation.removeEventListener.bind(navigation);
    navigation.addEventListener = (...args: Parameters<EventTarget['addEventListener']>) => {
      navigationListeners += 1;
      add(...args);
    };
    navigation.removeEventListener = (...args: Parameters<EventTarget['removeEventListener']>) => {
      navigationListeners -= 1;
      remove(...args);
    };
    claimReply = { ok: true, markdown: PACK };
    send = vi.fn(async (message: HandoffMessage) => {
      if (message.type === HANDOFF_MESSAGES.peek) return { ok: true, pending };
      if (message.type === HANDOFF_MESSAGES.claim) return claimReply;
      return undefined;
    });
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('fills the ChatGPT composer once and sends nothing', async () => {
    const { composer, submitted, sendClicked, enterPressed } = chatgptComposer();
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek, HANDOFF_MESSAGES.claim]);
    expect(composer.textContent).toContain('Rayleigh scattering.');
    expect(composer.textContent).toContain('# Research pack');
    expect(submitted).not.toHaveBeenCalled();
    expect(sendClicked).not.toHaveBeenCalled();
    expect(enterPressed).not.toHaveBeenCalled();
    expect(toast()?.message).toBe(
      'Research pack added from Gemini. Review it, then send it yourself.',
    );
    expect(toast()?.tone).toBe('success');

    await vi.advanceTimersByTimeAsync(RECEIVER_COMPOSER_TIMEOUT_MS);
    expect(sent()).toEqual([HANDOFF_MESSAGES.peek, HANDOFF_MESSAGES.claim]);
    expect(toast()).toBeUndefined();
  });

  it('fills the main Claude composer', async () => {
    document.body.innerHTML =
      '<fieldset><div contenteditable="true" data-testid="chat-input" class="ProseMirror"><p></p></div></fieldset>';
    start('https://claude.ai/new');
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(document.querySelector('.ProseMirror')!.textContent).toContain('Rayleigh scattering.');
    expect(sent()).toEqual([HANDOFF_MESSAGES.peek, HANDOFF_MESSAGES.claim]);
  });

  it('waits for a composer that mounts late, and claims only once it holds still', async () => {
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS * 3);
    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);

    const { composer } = chatgptComposer();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(sent()).toEqual([HANDOFF_MESSAGES.peek, HANDOFF_MESSAGES.claim]);
    expect(composer.textContent).toContain('Rayleigh scattering.');
  });

  it('does nothing on an ordinary page load: no observer, no timer, no claim', async () => {
    pending = false;
    chatgptComposer();
    start();
    await vi.advanceTimersByTimeAsync(0);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(vi.getTimerCount()).toBe(0);
    expect(toast()).toBeUndefined();
  });

  it('leaves the pack unclaimed and says so when no composer ever appears', async () => {
    start();
    await vi.advanceTimersByTimeAsync(RECEIVER_COMPOSER_TIMEOUT_MS + SETTLE_MS);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(toast()?.tone).toBe('error');
    expect(toast()?.message).toBe(
      "Couldn't add the research pack here. Go back to Gemini and copy it.",
    );
  });

  it('inserts nothing when another claim already took the pack', async () => {
    claimReply = { ok: false };
    const { composer } = chatgptComposer();
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(composer.textContent).toBe('');
    expect(toast()).toBeUndefined();
  });

  it('stops waiting on teardown and never claims afterwards', async () => {
    start();
    await vi.advanceTimersByTimeAsync(RECEIVER_POLL_MS);
    stop!();
    stop = null;

    chatgptComposer();
    await vi.advanceTimersByTimeAsync(RECEIVER_COMPOSER_TIMEOUT_MS + SETTLE_MS);
    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(vi.getTimerCount()).toBe(0);
    expect(toast()).toBeUndefined();
  });

  it('removes its toast on teardown', async () => {
    chatgptComposer();
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(toast()).toBeDefined();

    stop!();
    stop = null;
    expect(document.querySelector('.gv-rp-root')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stays out of Gemini pages and embedded frames', async () => {
    chatgptComposer();
    start('https://gemini.google.com/app');
    stop!();
    start('https://chatgpt.com/', false);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(send).not.toHaveBeenCalled();
  });

  it('does not even peek on a page other than the new chat', async () => {
    chatgptComposer();
    start('https://chatgpt.com/c/abc');
    stop!();
    start('https://claude.ai/chat/abc');
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(send).not.toHaveBeenCalled();
  });

  it('gives up without claiming when the tab navigates while it waits', async () => {
    start();
    await vi.advanceTimersByTimeAsync(RECEIVER_POLL_MS);
    url = 'https://chatgpt.com/c/abc';
    chatgptComposer();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts nothing when the tab navigates while the claim is in flight', async () => {
    const { composer } = chatgptComposer();
    const release = holdClaim();
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    url = 'https://chatgpt.com/c/abc';
    release();
    await vi.advanceTimersByTimeAsync(0);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek, HANDOFF_MESSAGES.claim]);
    expect(insert).not.toHaveBeenCalled();
    expect(composer.textContent).toBe('');
    expect(toast()?.tone).toBe('error');
  });

  it('ignores a canvas or edit box and fills only the main ChatGPT composer', async () => {
    const { composer } = chatgptComposer();
    const canvas = document.createElement('div');
    canvas.contentEditable = 'true';
    canvas.setAttribute('contenteditable', 'true');
    canvas.textContent = 'Canvas document';
    document.body.append(canvas);
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(composer.textContent).toContain('Rayleigh scattering.');
    expect(canvas.textContent).toBe('Canvas document');
  });

  it('claims nothing when only a generic editor is on the page', async () => {
    document.body.innerHTML = '<div contenteditable="true"></div>';
    start();
    await vi.advanceTimersByTimeAsync(RECEIVER_COMPOSER_TIMEOUT_MS + SETTLE_MS);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(document.querySelector('[contenteditable]')!.textContent).toBe('');
  });

  it('leaves a draft alone and claims nothing when the composer is not empty', async () => {
    const { composer } = chatgptComposer();
    composer.textContent = 'My own draft';
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(insert).not.toHaveBeenCalled();
    expect(composer.textContent).toBe('My own draft');
    expect(toast()?.message).toBe(
      "Couldn't add the research pack here. Go back to Gemini and copy it.",
    );
  });

  it('does not replace text the user typed and selected while the claim was in flight', async () => {
    const { composer } = chatgptComposer();
    const release = holdClaim();
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    composer.textContent = 'Typed meanwhile';
    const range = document.createRange();
    range.selectNodeContents(composer);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    release();
    await vi.advanceTimersByTimeAsync(0);

    expect(insert).not.toHaveBeenCalled();
    expect(composer.textContent).toBe('Typed meanwhile');
    expect(toast()?.tone).toBe('error');
  });

  it('inserts at a collapsed caret inside the composer, whatever was selected on the page', async () => {
    const { composer } = chatgptComposer();
    const note = document.createElement('p');
    note.textContent = 'Selected page text';
    document.body.append(note);
    const range = document.createRange();
    range.selectNodeContents(note);
    window.getSelection()!.addRange(range);
    let caret: { collapsed: boolean; inside: boolean } | null = null;
    insert.mockImplementation((text, input) => {
      const selection = window.getSelection()!;
      caret = {
        collapsed: selection.isCollapsed,
        inside: input.contains(selection.getRangeAt(0).commonAncestorContainer),
      };
      return insertTextIntoChatInput(text, input);
    });
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(caret).toEqual({ collapsed: true, inside: true });
    expect(note.textContent).toBe('Selected page text');
    expect(composer.textContent).toContain('Rayleigh scattering.');
  });

  it('inserts nothing after a round trip / -> /c/A -> / while the claim is in flight', async () => {
    const { composer } = chatgptComposer();
    const release = holdClaim();
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    navigate('https://chatgpt.com/c/A');
    navigate('https://chatgpt.com/');
    release();
    await vi.advanceTimersByTimeAsync(0);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek, HANDOFF_MESSAGES.claim]);
    expect(insert).not.toHaveBeenCalled();
    expect(composer.textContent).toBe('');
    expect(toast()?.tone).toBe('error');
  });

  it('stops polling for the composer the moment the tab leaves', async () => {
    start();
    await vi.advanceTimersByTimeAsync(RECEIVER_POLL_MS);
    const lookups = vi.spyOn(document, 'querySelectorAll');
    try {
      navigate('https://chatgpt.com/c/A');

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(RECEIVER_COMPOSER_TIMEOUT_MS);
      expect(lookups).not.toHaveBeenCalled();
    } finally {
      lookups.mockRestore();
    }
  });

  it('never polls for the composer when the tab leaves during the peek', async () => {
    let releasePeek!: () => void;
    const heldPeek = new Promise<void>((resolve) => (releasePeek = resolve));
    const answer = send.getMockImplementation()!;
    send.mockImplementation(async (message) => {
      if (message.type === HANDOFF_MESSAGES.peek) await heldPeek;
      return answer(message);
    });
    start();
    const lookups = vi.spyOn(document, 'querySelectorAll');
    try {
      navigate('https://chatgpt.com/c/A');
      releasePeek();
      await vi.advanceTimersByTimeAsync(0);

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(RECEIVER_COMPOSER_TIMEOUT_MS);
      expect(lookups).not.toHaveBeenCalled();
      expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    } finally {
      lookups.mockRestore();
    }
  });

  it('stops polling for the composer on teardown', async () => {
    start();
    await vi.advanceTimersByTimeAsync(RECEIVER_POLL_MS);
    const lookups = vi.spyOn(document, 'querySelectorAll');
    try {
      stop!();
      stop = null;

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(RECEIVER_COMPOSER_TIMEOUT_MS);
      expect(lookups).not.toHaveBeenCalled();
    } finally {
      lookups.mockRestore();
    }
  });

  it('never claims after a round trip while it waits for the composer', async () => {
    start();
    await vi.advanceTimersByTimeAsync(RECEIVER_POLL_MS);
    navigate('https://chatgpt.com/c/A');
    navigate('https://chatgpt.com/');
    chatgptComposer();
    await vi.advanceTimersByTimeAsync(RECEIVER_COMPOSER_TIMEOUT_MS + SETTLE_MS);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("hears the page's own pushState through the Navigation API by default", async () => {
    const navigation = new EventTarget();
    Object.defineProperty(window, 'navigation', { value: navigation, configurable: true });
    try {
      const { composer } = chatgptComposer();
      const release = holdClaim();
      url = 'https://chatgpt.com/';
      stop = startResearchPackReceiver({ send, insert, pageUrl: () => url });
      await vi.advanceTimersByTimeAsync(SETTLE_MS);
      const away = Object.assign(new Event('navigate'), {
        destination: { url: 'https://chatgpt.com/c/A' },
      });
      navigation.dispatchEvent(away);
      release();
      await vi.advanceTimersByTimeAsync(0);

      expect(insert).not.toHaveBeenCalled();
      expect(composer.textContent).toBe('');
    } finally {
      Reflect.deleteProperty(window, 'navigation');
    }
  });

  it('watches the route only while a pack may arrive', async () => {
    pending = false;
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(navigationListeners).toBe(0);

    pending = true;
    stop!();
    chatgptComposer();
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(insert).toHaveBeenCalledOnce();
    expect(navigationListeners).toBe(0);
  });

  it('treats an image in the composer as content', async () => {
    const { composer } = chatgptComposer();
    composer.innerHTML = '<p><img src="blob:https://chatgpt.com/1"></p>';
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(insert).not.toHaveBeenCalled();
    expect(composer.querySelector('img')).not.toBeNull();
  });

  it('treats a text-less chip in the composer as content', async () => {
    const { composer } = chatgptComposer();
    composer.innerHTML =
      '<p><span data-type="mention" contenteditable="false" class="chip"></span></p>';
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(insert).not.toHaveBeenCalled();
  });

  it('treats an image that arrives during the claim as content', async () => {
    const { composer } = chatgptComposer();
    const release = holdClaim();
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    composer.innerHTML = '<p><img src="blob:https://chatgpt.com/1"></p>';
    release();
    await vi.advanceTimersByTimeAsync(0);

    expect(insert).not.toHaveBeenCalled();
    expect(toast()?.tone).toBe('error');
  });

  it.each([
    ['a photo', '<img class="ProseMirror-separator" src="blob:https://chatgpt.com/p" alt="photo">'],
    ['a source', '<img class="ProseMirror-separator" src="data:image/png;base64,AAAA" alt="">'],
    ['alt text', '<img class="ProseMirror-separator" alt="photo">'],
    [
      'a srcset',
      '<img class="ProseMirror-separator" srcset="blob:https://chatgpt.com/p 1x" alt="">',
    ],
  ])('treats an image dressed as the separator but carrying %s as content', async (_, img) => {
    const { composer } = chatgptComposer();
    composer.innerHTML = `<p>${img}</p>`;
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(sent()).toEqual([HANDOFF_MESSAGES.peek]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("counts ProseMirror's cursor-wrapper separator as empty", async () => {
    const { composer } = chatgptComposer();
    composer.innerHTML =
      '<p><img class="ProseMirror-separator" mark-placeholder="true" alt=""><br class="ProseMirror-trailingBreak"></p>';
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(insert).toHaveBeenCalledOnce();
  });

  it('counts the editor placeholder skeleton as empty', async () => {
    const { composer } = chatgptComposer();
    composer.innerHTML =
      '<p data-placeholder="Ask anything" class="placeholder">' +
      '<img class="ProseMirror-separator" alt=""><br class="ProseMirror-trailingBreak"></p>';
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(insert).toHaveBeenCalledOnce();
    expect(composer.textContent).toContain('Rayleigh scattering.');
  });

  it('refuses without the Navigation API: no peek, no claim', async () => {
    chatgptComposer();
    stop = startResearchPackReceiver({
      send,
      insert,
      navigation: null,
      pageUrl: () => 'https://chatgpt.com/',
    });
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    stop();
    // jsdom has no window.navigation, so the default refuses too.
    stop = startResearchPackReceiver({ send, insert, pageUrl: () => 'https://chatgpt.com/' });
    await vi.advanceTimersByTimeAsync(SETTLE_MS);

    expect(send).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('cancels on a navigate event alone, before the URL commits', async () => {
    chatgptComposer();
    const release = holdClaim();
    start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    navigation.dispatchEvent(
      Object.assign(new Event('navigate'), { destination: { url: 'https://chatgpt.com/c/A' } }),
    );
    release();
    await vi.advanceTimersByTimeAsync(0);

    expect(insert).not.toHaveBeenCalled();
  });
});
