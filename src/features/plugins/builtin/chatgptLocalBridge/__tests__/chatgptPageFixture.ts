/**
 * A jsdom model of the ChatGPT page as measured live on 2026-10-17 (zh-CN UI):
 * - the composer is a ProseMirror `#prompt-textarea` textbox in
 *   `form[data-chatgpt-composer]`; its send control is the form's only
 *   `button[type=submit]`, with no test id and a localized label, disabled
 *   while the composer is empty; the voice button draws a sprite icon;
 * - typing goes through `document.execCommand('insertText')`, which jsdom
 *   lacks, so the fixture plays the editor;
 * - `[data-turn-key]` items hold a prompt unit (`…:user`) and a reply unit
 *   (`…:assistant`) whose `h4[data-conversation-role]` heading reads
 *   "ChatGPT 说："; `[data-talvt-turn-state]` inside the item reads `complete`
 *   once the turn has finished, and the reply's action row follows it;
 * - sending a new chat moves the route `/` → `/c/local-chatgpt:<uuid>` →
 *   `/c/<id>`;
 * - the chat/work switch is two role-less buttons reading exactly 「聊天」 and
 *   「工作」, each with a `data-state`; the composer's label names the mode
 *   (「询问 ChatGPT」 / 「使用 ChatGPT Work」). `modeSwitch: 'live'` renders it
 *   as measured on 2026-10-18 instead: a `role=group` in the
 *   `[data-app-shell-header-obstacle]` header, holding the two buttons with
 *   `aria-pressed`. `language` renders ChatGPT's own texts of another UI
 *   language: `en`, or `de`, which the site data has no words for.
 *
 * Every page event the bridge causes is counted, so a test can prove that a
 * stopped op caused none.
 */
import { vi } from 'vitest';

export interface ReplyState {
  readonly text: string;
  /** `data-talvt-turn-state`; omitted renders no turn-state node. */
  readonly turnState?: string;
  readonly actions?: boolean;
  readonly replyId?: string;
}

export interface FixtureTurn {
  readonly key: string;
  readonly user: string;
  readonly reply?: ReplyState;
}

export interface SendBehavior {
  /** Delay before the provisional route; `null` keeps the route. */
  readonly provisionalAfterMs?: number | null;
  /** Delay before the server-named route; `null` never names it. */
  readonly settledAfterMs?: number | null;
  /** Delay before the prompt renders in the thread; `null` never renders it. */
  readonly turnAfterMs?: number | null;
  readonly conversationId?: string;
  readonly turnKey?: string;
  /** Routes for a send outside `/` (a project's page); default `/c/local-chatgpt:…`, `/c/<id>`. */
  readonly provisionalRoute?: string;
  readonly settledRoute?: string;
}

export interface PageEvents {
  readonly execCommand: number;
  readonly clicks: number;
  readonly focus: number;
}

export type FixtureMode = 'chat' | 'work';

export interface PageOptions {
  readonly route?: string;
  readonly turns?: readonly FixtureTurn[];
  readonly mode?: FixtureMode;
  /**
   * `measured` (default) as first seen, found by text; `live` as measured on
   * 2026-10-18, found by structure; `no-state` drops `data-state`; `none` renders no switch.
   */
  readonly modeSwitch?: 'measured' | 'live' | 'no-state' | 'none';
  /** Whether a click on a mode button changes the mode (default true). */
  readonly switchWorks?: boolean;
  /** The UI language (default `zh-CN`). */
  readonly language?: FixtureLanguage;
}

export type FixtureLanguage = 'zh-CN' | 'en' | 'de';

/** The composer's label per mode and the switch's button texts, from ChatGPT's own messages. */
const MODE_TEXTS: Readonly<
  Record<
    FixtureLanguage,
    { composer: Record<FixtureMode, string>; switch: Record<FixtureMode, string> }
  >
> = {
  'zh-CN': {
    composer: { chat: '询问 ChatGPT', work: '使用 ChatGPT Work' },
    switch: { chat: '聊天', work: '工作' },
  },
  en: {
    composer: { chat: 'Ask ChatGPT', work: 'Work with ChatGPT' },
    switch: { chat: 'Chat', work: 'Work' },
  },
  de: {
    composer: { chat: 'ChatGPT fragen', work: 'Mit ChatGPT arbeiten' },
    switch: { chat: 'Chat', work: 'Work' },
  },
};

export interface ChatGptPageFixture {
  readonly composer: HTMLElement;
  readonly form: HTMLFormElement;
  readonly sendButton: HTMLButtonElement;
  readonly list: HTMLElement;
  events(): PageEvents;
  setDraft(text: string): void;
  addTurn(turn: FixtureTurn): HTMLElement;
  setReply(key: string, reply: ReplyState): void;
  showStopControl(shown: boolean): void;
  mode(): FixtureMode;
  sendBehavior: SendBehavior;
}

function renderReply(item: HTMLElement, reply: ReplyState): void {
  item.querySelector('[data-gv-fixture-reply]')?.remove();
  const id = reply.replyId ?? `${item.getAttribute('data-turn-key')}-r`;
  const wrap = document.createElement('div');
  wrap.setAttribute('data-gv-fixture-reply', '');
  wrap.innerHTML = `
    <div data-chatgpt-search-unit-key="${id}:assistant" data-content-search-unit-key="${id}:assistant" data-chatgpt-search-message-ids="${id}">
      <h4 data-conversation-role="assistant">ChatGPT 说：</h4>
      <div data-chatgpt-selection-conversation-id="conv" data-chatgpt-selection-message-id="${id}">
        <div data-markdown-text-style="assistant-message" dir="auto"><p></p></div>
      </div>
    </div>`;
  wrap.querySelector('p')!.textContent = reply.text;
  if (reply.turnState !== undefined) {
    const state = document.createElement('div');
    state.setAttribute('data-talvt-turn-state', reply.turnState);
    wrap.appendChild(state);
  }
  if (reply.actions) {
    const row = document.createElement('div');
    row.innerHTML =
      '<button aria-label="复制"></button><button aria-label="重新生成回复"></button>';
    wrap.appendChild(row);
  }
  item.appendChild(wrap);
}

function renderTurn(turn: FixtureTurn): HTMLElement {
  const item = document.createElement('div');
  item.setAttribute('data-turn-key', turn.key);
  item.innerHTML = `
    <h4 class="sr-only">你说：</h4>
    <div data-chatgpt-search-unit-key="${turn.key}:user" data-chatgpt-search-message-ids="${turn.key}">
      <div data-user-message-bubble="true"><div dir="auto"></div></div>
      <div><button aria-label="复制消息"></button></div>
    </div>`;
  item.querySelector('[dir="auto"]')!.textContent = turn.user;
  if (turn.reply) renderReply(item, turn.reply);
  return item;
}

export function mountChatGptPage(options: PageOptions = {}): ChatGptPageFixture {
  history.replaceState(null, '', options.route ?? '/');
  document.title = 'ChatGPT';
  document.body.innerHTML = `
    <div data-app-shell-active-page="true">
      <header data-gv-fixture-header></header>
      <main>
        <div data-app-action-timeline-scroll role="presentation">
          <div data-chatgpt-conversation-selection-target><div data-gv-fixture-list></div></div>
        </div>
        <form data-chatgpt-composer>
          <div id="prompt-textarea" contenteditable="true" role="textbox"><p></p></div>
          <input type="file" multiple />
          <span data-gv-fixture-voice><button type="button" aria-label="听写"><svg><use href="#mic"></use></svg></button></span>
          <button type="submit" aria-label="发送" disabled><svg><use href="#send"></use></svg></button>
        </form>
      </main>
    </div>`;
  const composer = document.getElementById('prompt-textarea')!;
  // jsdom has no layout; the composer finder skips zero-height fields.
  composer.getBoundingClientRect = () => ({ height: 24, width: 600 }) as DOMRect;
  composer.contentEditable = 'true';
  const form = document.querySelector<HTMLFormElement>('form[data-chatgpt-composer]')!;
  const sendButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const list = document.querySelector<HTMLElement>('[data-gv-fixture-list]')!;
  const counts = { execCommand: 0, clicks: 0, focus: 0 };

  const language = options.language ?? 'zh-CN';
  document.documentElement.lang = language;
  const texts = MODE_TEXTS[language];
  let mode: FixtureMode = options.mode ?? 'chat';
  composer.setAttribute('aria-label', texts.composer[mode]);
  const switchKind = options.modeSwitch ?? 'measured';
  if (switchKind !== 'none') {
    const header = document.querySelector<HTMLElement>('[data-gv-fixture-header]')!;
    const live = switchKind === 'live';
    if (live) header.setAttribute('data-app-shell-header-obstacle', 'true');
    header.innerHTML = `<div${live ? ' role="group"' : ''}><span><button type="button">${texts.switch.chat}</button></span><span><button type="button">${texts.switch.work}</button></span></div>`;
    const buttons = Array.from(header.querySelectorAll<HTMLButtonElement>('button'));
    const paint = (): void => {
      if (live) {
        buttons[0].setAttribute('aria-pressed', String(mode === 'chat'));
        buttons[1].setAttribute('aria-pressed', String(mode === 'work'));
        buttons.forEach((button) => button.setAttribute('data-state', 'closed'));
        return;
      }
      if (switchKind !== 'measured') return;
      buttons[0].setAttribute('data-state', mode === 'chat' ? 'on' : 'off');
      buttons[1].setAttribute('data-state', mode === 'work' ? 'on' : 'off');
    };
    paint();
    buttons.forEach((button, index) =>
      button.addEventListener('click', () => {
        if (options.switchWorks === false) return;
        // ChatGPT re-labels the composer a moment after the click.
        const next: FixtureMode = index === 0 ? 'chat' : 'work';
        if (live) {
          // Measured: the pressed button flips at once, the placeholder a moment later.
          mode = next;
          paint();
          setTimeout(() => composer.setAttribute('aria-label', texts.composer[next]), 300);
          return;
        }
        setTimeout(() => {
          mode = next;
          composer.setAttribute('aria-label', texts.composer[mode]);
          paint();
        }, 300);
      }),
    );
  }

  const paragraph = (): HTMLParagraphElement => composer.querySelector('p')!;
  const syncButton = (): void => {
    sendButton.disabled = (composer.textContent ?? '').trim().length === 0;
  };

  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: vi.fn((command: string, _ui?: boolean, value?: string) => {
      counts.execCommand += 1;
      if (command !== 'insertText' || value === undefined) return false;
      paragraph().textContent = `${paragraph().textContent ?? ''}${value}`;
      syncButton();
      return true;
    }),
  });
  const focus = composer.focus.bind(composer);
  composer.focus = () => {
    counts.focus += 1;
    focus();
  };
  document.addEventListener('click', () => (counts.clicks += 1), true);

  const fixture: ChatGptPageFixture = {
    composer,
    form,
    sendButton,
    list,
    sendBehavior: {},
    events: () => ({ ...counts }),
    mode: () => mode,
    setDraft(text) {
      paragraph().textContent = text;
      syncButton();
    },
    addTurn(turn) {
      const item = renderTurn(turn);
      list.appendChild(item);
      return item;
    },
    setReply(key, reply) {
      const item = list.querySelector<HTMLElement>(`[data-turn-key="${key}"]`);
      if (item) renderReply(item, reply);
    },
    showStopControl(shown) {
      const slot = form.querySelector('[data-gv-fixture-voice]')!;
      slot.innerHTML = shown
        ? '<button type="button" aria-label="停止"><svg viewBox="0 0 10 10"><rect width="8" height="8"></rect></svg></button>'
        : '<button type="button" aria-label="听写"><svg><use href="#mic"></use></svg></button>';
    },
  };

  sendButton.addEventListener('click', () => {
    const prompt = (composer.textContent ?? '').trim();
    const behavior = fixture.sendBehavior;
    const id = behavior.conversationId ?? 'conv-123';
    const turnKey = behavior.turnKey ?? 'turn-new';
    const later = (ms: number | null | undefined, fallback: number, fn: () => void): void => {
      if (ms === null) return;
      setTimeout(fn, ms ?? fallback);
    };
    later(behavior.provisionalAfterMs, 100, () => {
      if (behavior.provisionalRoute) history.pushState(null, '', behavior.provisionalRoute);
      else if (location.pathname === '/') history.pushState(null, '', '/c/local-chatgpt:4a1b2c');
    });
    later(behavior.settledAfterMs, 1500, () =>
      history.pushState(null, '', behavior.settledRoute ?? `/c/${id}`),
    );
    later(behavior.turnAfterMs, 200, () => {
      paragraph().textContent = '';
      syncButton();
      fixture.addTurn({ key: turnKey, user: prompt });
    });
  });

  return fixture;
}
