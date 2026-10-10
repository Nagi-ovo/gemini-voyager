import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConversationIdFromUrl } from '@/core/utils/conversationIdentity';
import { hashString } from '@/core/utils/hash';
import { chatgptAdapter } from '@/features/plugins/sites/adapters/chatgpt';
import { createStarStore } from '@/features/savedLibrary/starStore';
import { turnSummary } from '@/features/timeline/adapters/catalog/turnHash';
import { createStarredMessagesHandler } from '@/pages/background/starredMessages';
import { toastDriver } from '@/tests/toastDriver';

import { mountThreadFixture } from '../adapter/__tests__/chatgptThreadFixture';
import { buildChatGptAdapter } from '../adapter/platform/chatgpt';
import type { ExportDictionaries } from '../exportLocale';
import { createChatGptExportSite } from '../sites/chatgpt';

const mocks = vi.hoisted(() => ({
  isSafari: vi.fn(() => false),
  renderResponseImageBlob: vi.fn(),
  copyImageBlobToClipboard: vi.fn(),
  copyImageBlobViaSafariNativePasteboard: vi.fn(),
  downloadImageBlob: vi.fn(),
}));

vi.mock('@/core/utils/browser', () => ({ isSafari: mocks.isSafari }));
vi.mock('../responseImageCopy', () => ({
  renderResponseImageBlob: mocks.renderResponseImageBlob,
  copyImageBlobToClipboard: mocks.copyImageBlobToClipboard,
  copyImageBlobViaSafariNativePasteboard: mocks.copyImageBlobViaSafariNativePasteboard,
  downloadImageBlob: mocks.downloadImageBlob,
}));

const { resolveExportSite } = await import('../sites/resolveExportSite');
const { startResponseCopyImageActions } = await import('../responseCopyImageAction');

const emptyDict = {
  en: {},
  zh: {},
  zh_TW: {},
  ja: {},
  fr: {},
  es: {},
  pt: {},
  ar: {},
  ru: {},
  ko: {},
} as ExportDictionaries;

function actionButton(testId: string, iconName: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'mdc-icon-button mat-mdc-icon-button';
  button.type = 'button';
  button.setAttribute('data-test-id', testId);
  button.setAttribute('aria-label', ariaLabel);
  const icon = document.createElement('mat-icon');
  icon.setAttribute('fonticon', iconName);
  icon.textContent = iconName;
  button.appendChild(icon);
  return button;
}

function renderResponse(): void {
  document.body.innerHTML = `
    <main>
      <div class="user-query-container">prompt</div>
      <model-response>
        <div class="response-container">
          <message-content>answer</message-content>
          <message-actions><div class="actions-container-v2"><div class="buttons-container-v2"></div></div></message-actions>
        </div>
      </model-response>
    </main>
  `;
  const bar = document.querySelector('.buttons-container-v2')!;
  bar.append(
    actionButton('copy-button', 'content_copy', 'Copy response'),
    actionButton('more-menu-button', 'more_vert', 'Show more options'),
  );
}

async function copyFirstResponseAsImage(): Promise<void> {
  const site = resolveExportSite();
  if (site.entryPoints.kind !== 'gemini') throw new Error('expected the Gemini export site');
  startResponseCopyImageActions({
    dict: emptyDict,
    language: () => 'en',
    site,
    assistantMessageIdFor: site.entryPoints.assistantMessageIdFor,
  });
  const button = document.querySelector<HTMLElement>('[data-test-id="gv-copy-image-button"]');
  expect(button).not.toBeNull();
  button!.click();
  document.querySelector<HTMLElement>('.gv-response-image-menu-item')!.click();
  await vi.waitFor(() => expect(toastDriver.all()).toHaveLength(1));
}

describe('startResponseCopyImageActions', () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  let library: ReturnType<typeof createStarStore>;

  beforeEach(() => {
    const stored: Record<string, unknown> = {};
    library = createStarStore({
      get: async () => structuredClone(stored),
      set: async (items) => {
        Object.assign(stored, structuredClone(items));
      },
    });
    const handle = createStarredMessagesHandler(library);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      request: unknown,
      reply?: (response: unknown) => void,
    ) => {
      const pending = handle(request) ?? Promise.resolve(undefined);
      if (reply) {
        void pending.then(reply, (error: Error) => reply({ ok: false, error: error.message }));
      }
      return pending;
    }) as typeof chrome.runtime.sendMessage);
    renderResponse();
    mocks.renderResponseImageBlob.mockResolvedValue(blob);
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
    vi.clearAllMocks();
    mocks.isSafari.mockReturnValue(false);
    document.body.innerHTML = '';
  });

  it('renders only the clicked response and copies it', async () => {
    mocks.copyImageBlobToClipboard.mockResolvedValue(undefined);

    await copyFirstResponseAsImage();

    const [turns] = mocks.renderResponseImageBlob.mock.calls[0];
    expect(turns).toHaveLength(1);
    expect(turns[0].assistant).toBe('answer');
    expect(turns[0].user).toBe('');
    expect(mocks.copyImageBlobToClipboard).toHaveBeenCalledWith(blob);
    expect(toastDriver.all()).toMatchObject([
      { message: 'Response image copied', tone: 'success' },
    ]);
  });

  it('copies a Library-starred response as a starred image without the timeline or a page mirror', async () => {
    const main = document.querySelector('main')!;
    const turn = document.createElement('div');
    turn.className = 'conversation-container';
    turn.id = 'r_1111111111111111';
    while (main.firstChild) turn.appendChild(main.firstChild);
    main.appendChild(turn);
    await library.add({
      conversationId: buildConversationIdFromUrl(location.href),
      conversationUrl: location.href,
      turnId: 's-1111111111111111',
      content: 'prompt',
      starredAt: 1,
    });
    mocks.copyImageBlobToClipboard.mockResolvedValue(undefined);

    await copyFirstResponseAsImage();

    const [turns] = mocks.renderResponseImageBlob.mock.calls[0];
    expect(turns).toMatchObject([{ user: '', assistant: 'answer', starred: true }]);
    expect(toastDriver.messages()).toEqual(['Response image copied']);
  });

  it.each(['retained', 'thread'] as const)(
    'copies a ChatGPT %s assistant-only response with its unselected prompt Library star',
    async (kind) => {
      const previousUrl = location.href;
      history.replaceState({}, '', '/c/image-stars');
      document.body.innerHTML = `<main>
      <div data-turn-id-container="prompt"><section data-turn="user"><div data-message-author-role="user"><div data-user-message-bubble>Image prompt</div></div></section></div>
      <div data-turn-id-container="reply"><section data-turn="assistant"><div data-message-author-role="assistant">
        <p>Image answer</p><message-actions><div class="buttons-container-v2"></div></message-actions>
      </div></section></div>
    </main>`;
      if (kind === 'thread') {
        document.body.replaceChildren();
        const fixture = mountThreadFixture({
          turns: [{ key: 'image', height: 200, user: 'Image prompt', assistant: 'Image answer' }],
        });
        const reply = fixture.main.querySelector('[data-chatgpt-selection-message-id]')!;
        reply.setAttribute('data-message-author-role', 'assistant');
        reply.insertAdjacentHTML(
          'beforeend',
          '<message-actions><div class="buttons-container-v2"></div></message-actions>',
        );
      }
      const bar = document.querySelector('.buttons-container-v2')!;
      bar.append(
        actionButton('copy-button', 'content_copy', 'Copy response'),
        actionButton('more-menu-button', 'more_vert', 'Show more options'),
      );
      await library.add({
        conversationId: 'chatgpt:conv:image-stars',
        conversationUrl: location.href,
        turnId: `c-${hashString(turnSummary(document.querySelector('[data-user-message-bubble]')!))}`,
        content: 'Image prompt',
        starredAt: 1,
      });
      mocks.copyImageBlobToClipboard.mockResolvedValue(undefined);
      try {
        startResponseCopyImageActions({
          dict: emptyDict,
          language: () => 'en',
          site: createChatGptExportSite(buildChatGptAdapter(chatgptAdapter)),
          assistantMessageIdFor: (trigger) =>
            kind === 'thread'
              ? `${trigger.closest('[data-turn-key]')?.getAttribute('data-turn-key')}:a`
              : (trigger
                  .closest('[data-turn-id-container]')
                  ?.getAttribute('data-turn-id-container') ?? null),
        });
        document.querySelector<HTMLElement>('[data-test-id="gv-copy-image-button"]')!.click();
        document.querySelector<HTMLElement>('.gv-response-image-menu-item')!.click();
        await vi.waitFor(() => expect(mocks.renderResponseImageBlob).toHaveBeenCalled(), {
          timeout: 4000,
        });
        expect(mocks.renderResponseImageBlob.mock.calls[0][0]).toMatchObject([
          { user: '', assistant: 'Image answer', starred: true },
        ]);
        await vi.waitFor(() => expect(toastDriver.messages()).toEqual(['Response image copied']));
      } finally {
        history.replaceState({}, '', previousUrl);
      }
    },
  );

  it('downloads the image on Safari when neither clipboard path works', async () => {
    mocks.isSafari.mockReturnValue(true);
    mocks.copyImageBlobToClipboard.mockRejectedValue(new Error('NotAllowedError'));
    mocks.copyImageBlobViaSafariNativePasteboard.mockResolvedValue(false);

    await copyFirstResponseAsImage();

    expect(mocks.downloadImageBlob).toHaveBeenCalledWith(
      blob,
      expect.stringMatching(/^gemini-response-.*\.png$/),
    );
    expect(toastDriver.all()).toMatchObject([
      { message: 'Downloaded response image (Safari clipboard limitation)', tone: 'info' },
    ]);
  });

  it('keeps the download notice up longer than a plain copy notice', async () => {
    vi.useFakeTimers();
    mocks.isSafari.mockReturnValue(true);
    mocks.copyImageBlobToClipboard.mockRejectedValue(new Error('NotAllowedError'));
    mocks.copyImageBlobViaSafariNativePasteboard.mockResolvedValue(false);

    try {
      await copyFirstResponseAsImage();
      await vi.advanceTimersByTimeAsync(2500);
      expect(toastDriver.all()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(800);
      expect(toastDriver.all()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the Safari native pasteboard before falling back to a download', async () => {
    mocks.isSafari.mockReturnValue(true);
    mocks.copyImageBlobToClipboard.mockRejectedValue(new Error('NotAllowedError'));
    mocks.copyImageBlobViaSafariNativePasteboard.mockResolvedValue(true);

    await copyFirstResponseAsImage();

    expect(mocks.downloadImageBlob).not.toHaveBeenCalled();
    expect(toastDriver.messages()).toEqual(['Response image copied']);
  });

  it('reports an unsupported clipboard outside Safari', async () => {
    mocks.copyImageBlobToClipboard.mockRejectedValue(
      new DOMException('Write blocked', 'NotAllowedError'),
    );

    await copyFirstResponseAsImage();

    expect(mocks.downloadImageBlob).not.toHaveBeenCalled();
    expect(toastDriver.all()).toMatchObject([
      { message: 'Clipboard image copy is not supported in this browser', tone: 'warning' },
    ]);
  });
});
