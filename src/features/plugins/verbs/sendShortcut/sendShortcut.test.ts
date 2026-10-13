import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readComposer } from '@/core/services/composer';
import * as sendKeys from '@/core/services/composer/sendKeys/sendKeyCoordinator';

import { requireBundledSiteAdapter } from '../../catalog/sites';
import { PluginScope } from '../../runtime/pluginScope';
import type { SiteAdapter } from '../../types';
import { sendShortcutPrimitive, type SendShortcutParams } from './index';

const sites = [
  {
    name: 'ChatGPT',
    adapter: requireBundledSiteAdapter('chatgpt'),
    markup:
      '<form data-fixture-root><div data-composer-markdown class="ProseMirror" contenteditable="true"><p>draft</p></div>' +
      '<button type="submit">Send</button></form>',
  },
  {
    name: 'Claude',
    adapter: requireBundledSiteAdapter('claude'),
    markup:
      '<div data-composer-card-holder><div data-fixture-root>' +
      '<div data-testid="chat-input" class="ProseMirror" contenteditable="true"><p>draft</p></div>' +
      '<button data-testid="chat-input-send">Send</button></div></div>',
  },
  {
    name: 'DeepSeek',
    adapter: requireBundledSiteAdapter('deepseek'),
    markup:
      '<div data-fixture-root><div><textarea class="ds-scroll-area">draft</textarea></div>' +
      '<div class="ds-button--primary ds-button--circle" role="button">Send</div></div>',
  },
];
const scopes: PluginScope[] = [];

function fixture(site: (typeof sites)[number]) {
  document.body.innerHTML = '<main>' + site.markup + '</main>';
  const field = document.querySelector<HTMLElement>(site.adapter.selectors.composer!)!;
  const root = field.closest<HTMLElement>(site.adapter.selectors.composerRoot!)!;
  const button = root.querySelector<HTMLElement>(site.adapter.selectors.sendButton!)!;
  show(field);
  const clicks = vi.fn((event: Event) => event.preventDefault());
  button.addEventListener('click', clicks);
  return { field, root, button, clicks };
}

function show(field: HTMLElement): void {
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    bottom: 60,
    left: 0,
    right: 300,
    height: 60,
    width: 300,
    toJSON: () => ({}),
  });
}

function activate(
  adapter: SiteAdapter,
  params: SendShortcutParams = {},
  doc: Document = document,
): PluginScope {
  const scope = new PluginScope();
  scopes.push(scope);
  void sendShortcutPrimitive.activate(scope, params, {
    doc,
    adapter,
    pluginId: 'test.send-shortcut',
    settings: {},
    setTargetCounter: () => {},
  });
  return scope;
}

function documentAt(url: string): Document {
  return new Proxy(document, {
    get(target, key) {
      if (key === 'location') return new URL(url);
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function enter(target: HTMLElement, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

afterEach(async () => {
  for (const scope of scopes.splice(0)) await scope.dispose();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('sendShortcut', () => {
  it.each([undefined, {}])('accepts empty configuration %j', (params) => {
    expect(sendShortcutPrimitive.validateParams(params)).toEqual({ success: true, data: {} });
  });

  it.each([null, [], 'invalid', { mode: 'send' }])('rejects invalid configuration %j', (params) => {
    expect(sendShortcutPrimitive.validateParams(params).success).toBe(false);
  });

  it.each(sites)('supports the optional Enter-sends mode on $name', (site) => {
    const { field, clicks } = fixture(site);
    activate(site.adapter, { mode: 'enterSends' });
    expect(enter(field).defaultPrevented).toBe(true);
    expect(clicks).toHaveBeenCalledOnce();
    enter(field, { ctrlKey: true });
    expect(clicks).toHaveBeenCalledOnce();
  });

  it('refuses enterSends for a local sendShortcut on Gemini', () => {
    const doc = documentAt('https://gemini.google.com/app');
    const coordinator = sendKeys.createSendKeyCoordinator('gemini');
    vi.spyOn(sendKeys, 'getSendKeyCoordinator').mockReturnValue(coordinator);
    expect(() =>
      activate(requireBundledSiteAdapter('gemini'), { mode: 'enterSends' }, doc),
    ).toThrow('has no enterSends');
    coordinator.stop();
  });

  it.each(['host', 'url', 'dom'])(
    'attaches nothing for a local sendShortcut on Gemini Enterprise by %s hint',
    (hint) => {
      const url =
        hint === 'host'
          ? 'https://business.gemini.google/app'
          : hint === 'url'
            ? 'https://gemini.google.com/app?enterprise=1'
            : 'https://gemini.google.com/app';
      const doc = documentAt(url);
      if (hint === 'dom') document.body.dataset.workspace = 'business';
      expect(() => activate(requireBundledSiteAdapter('gemini'), {}, doc)).toThrow(
        'Gemini Enterprise',
      );
      delete document.body.dataset.workspace;
    },
  );

  it('inserts a textarea newline through the React native setter and keeps the caret after it', () => {
    const site = sites[2];
    const { field, clicks } = fixture(site);
    if (!(field instanceof HTMLTextAreaElement)) throw new Error('Expected textarea fixture');
    const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (!native?.get || !native.set) throw new Error('Fixture requires native value accessors');
    let tracked = 'abCDxy';
    let hostDraft = tracked;
    native.set.call(field, tracked);
    Object.defineProperty(field, 'value', {
      configurable: true,
      get: () => native.get!.call(field),
      set: (next: string) => {
        tracked = next;
        native.set!.call(field, next);
      },
    });
    field.addEventListener('input', () => {
      if (field.value === tracked) return;
      hostDraft = field.value;
      tracked = field.value;
    });
    field.setSelectionRange(2, 4);
    const hostEnter = vi.fn();
    field.addEventListener('keydown', hostEnter);
    activate(site.adapter);

    const event = enter(field);

    expect(event.defaultPrevented).toBe(true);
    expect(field.value).toBe('ab\nxy');
    expect(hostDraft).toBe('ab\nxy');
    expect(field.selectionStart).toBe(3);
    expect(field.selectionEnd).toBe(3);
    expect(hostEnter).not.toHaveBeenCalled();
    expect(clicks).not.toHaveBeenCalled();
  });

  describe.each(sites.slice(0, 2))('$name editor transaction', (site) => {
    it.each([
      [2, 2, 'dr', 'aft'],
      [1, 4, 'd', 't'],
    ] as const)('inserts a host newline at selection %i–%i', (start, end, prefix, suffix) => {
      const { field, clicks } = fixture(site);
      const paragraph = field.querySelector<HTMLElement>('p')!;
      const text = paragraph.firstChild!;
      const selection = document.getSelection()!;
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, end);
      selection.removeAllRanges();
      selection.addRange(range);
      const plainHostEnter = vi.fn();
      field.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (!event.shiftKey) {
          plainHostEnter();
          return;
        }
        if (event.code !== 'Enter' || event.keyCode !== 13 || event.which !== 13) return;
        const current = selection.getRangeAt(0);
        if (current.startContainer !== text || current.endContainer !== text) return;
        const draft = text.textContent!;
        const { startOffset, endOffset } = current;
        paragraph.textContent = draft.slice(0, startOffset);
        const nextParagraph = document.createElement('p');
        nextParagraph.textContent = draft.slice(endOffset);
        paragraph.after(nextParagraph);
        const caret = document.createRange();
        caret.setStart(nextParagraph.firstChild!, 0);
        caret.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caret);
        event.preventDefault();
      });
      activate(site.adapter);

      const original = enter(paragraph);

      expect(original.defaultPrevented).toBe(true);
      expect(field.querySelectorAll('p')).toHaveLength(2);
      expect(paragraph.textContent).toBe(prefix);
      expect(paragraph.nextElementSibling!.textContent).toBe(suffix);
      expect(readComposer(field)).toBe(`${prefix}\n${suffix}`);
      expect(selection.anchorNode).toBe(paragraph.nextElementSibling!.firstChild);
      expect(selection.anchorOffset).toBe(0);
      expect(selection.isCollapsed).toBe(true);
      expect(plainHostEnter).not.toHaveBeenCalled();
      expect(clicks).not.toHaveBeenCalled();
    });
  });

  describe.each(sites)('$name adapter', (site) => {
    it.each([{ ctrlKey: true }, { metaKey: true }])(
      'sends only by clicking its enabled button for %j',
      (modifiers) => {
        const { field, clicks } = fixture(site);
        const hostEnter = vi.fn();
        field.addEventListener('keydown', hostEnter);
        activate(site.adapter);
        const before = readComposer(field);

        expect(enter(field, modifiers).defaultPrevented).toBe(true);

        expect(clicks).toHaveBeenCalledOnce();
        expect(hostEnter).not.toHaveBeenCalled();
        expect(readComposer(field)).toBe(before);
      },
    );

    it.each(['aria-disabled', 'ds-button--disabled', 'progress', 'progressbar', 'missing'])(
      'consumes the send shortcut without a click or fallback Enter when %s',
      (guard) => {
        const { field, root, button, clicks } = fixture(site);
        if (guard === 'aria-disabled') button.setAttribute('aria-disabled', 'true');
        if (guard === 'ds-button--disabled') button.classList.add('ds-button--disabled');
        if (guard === 'missing') button.remove();
        if (guard === 'progress') root.append(document.createElement('progress'));
        if (guard === 'progressbar') {
          const pending = document.createElement('div');
          pending.setAttribute('role', 'progressbar');
          root.append(pending);
        }
        const hostEnter = vi.fn();
        field.addEventListener('keydown', hostEnter);
        activate(site.adapter);
        const before = readComposer(field);

        expect(enter(field, { ctrlKey: true }).defaultPrevented).toBe(true);
        expect(enter(field, { metaKey: true }).defaultPrevented).toBe(true);

        expect(clicks).not.toHaveBeenCalled();
        expect(hostEnter).not.toHaveBeenCalled();
        expect(readComposer(field)).toBe(before);
      },
    );

    it('does not borrow a send button or upload state from another composer root', () => {
      const { field, root, button, clicks } = fixture(site);
      const otherContainer = document.createElement('section');
      otherContainer.innerHTML = site.markup;
      document.body.append(otherContainer);
      const otherButton = otherContainer.querySelector<HTMLElement>(
        site.adapter.selectors.sendButton!,
      )!;
      const otherClicks = vi.fn((event: Event) => event.preventDefault());
      otherButton.addEventListener('click', otherClicks);
      otherContainer
        .querySelector('[data-fixture-root]')!
        .append(document.createElement('progress'));
      activate(site.adapter);

      enter(field, { ctrlKey: true });
      expect(clicks).toHaveBeenCalledOnce();
      button.remove();
      expect(root.contains(field)).toBe(true);
      expect(enter(field, { ctrlKey: true }).defaultPrevented).toBe(true);
      expect(otherClicks).not.toHaveBeenCalled();
    });

    it('sends again as soon as the pending upload finishes', () => {
      const { field, root, clicks } = fixture(site);
      const pending = document.createElement('progress');
      root.append(pending);
      activate(site.adapter);

      expect(enter(field, { ctrlKey: true }).defaultPrevented).toBe(true);
      expect(clicks).not.toHaveBeenCalled();
      pending.remove();
      expect(enter(field, { metaKey: true }).defaultPrevented).toBe(true);
      expect(clicks).toHaveBeenCalledOnce();
    });

    it.each([
      { isComposing: true },
      { keyCode: 229 },
      { isComposing: true, ctrlKey: true },
      { keyCode: 229, metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { shiftKey: true, ctrlKey: true },
      { altKey: true, metaKey: true },
    ])('leaves IME and modified host Enter untouched for %j', (modifiers) => {
      const { field, clicks } = fixture(site);
      const hostEnter = vi.fn();
      field.addEventListener('keydown', hostEnter);
      activate(site.adapter);
      const before = readComposer(field);

      expect(enter(field, modifiers).defaultPrevented).toBe(false);

      expect(hostEnter).toHaveBeenCalledOnce();
      expect(readComposer(field)).toBe(before);
      expect(clicks).not.toHaveBeenCalled();
    });

    it.each(['hidden', 'readonly', 'detached'])('ignores an unavailable %s composer', (state) => {
      const { field, root, clicks } = fixture(site);
      activate(site.adapter);
      if (state === 'hidden') root.hidden = true;
      if (state === 'readonly') {
        if (field instanceof HTMLTextAreaElement) field.readOnly = true;
        else field.setAttribute('contenteditable', 'false');
      }
      if (state === 'detached') root.remove();
      const before = readComposer(field);

      expect(enter(field).defaultPrevented).toBe(false);
      expect(enter(field, { ctrlKey: true }).defaultPrevented).toBe(false);

      expect(readComposer(field)).toBe(before);
      expect(clicks).not.toHaveBeenCalled();
    });

    it('ignores unrelated editables and non-Enter keys', () => {
      const { field, clicks } = fixture(site);
      const unrelated = document.createElement('div');
      unrelated.contentEditable = 'true';
      unrelated.textContent = 'unrelated';
      document.body.append(unrelated);
      show(unrelated);
      activate(site.adapter);

      expect(enter(unrelated).defaultPrevented).toBe(false);
      expect(enter(unrelated, { ctrlKey: true }).defaultPrevented).toBe(false);
      const letter = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      field.dispatchEvent(letter);
      expect(letter.defaultPrevented).toBe(false);
      expect(unrelated.textContent).toBe('unrelated');
      expect(clicks).not.toHaveBeenCalled();
    });

    it('handles immediate SPA composer remounts and synchronously stops intercepting on teardown', () => {
      const { field } = fixture(site);
      const scope = activate(site.adapter);
      field.closest('[data-fixture-root]')!.remove();
      const replacement = fixture(site);

      expect(enter(replacement.field, { metaKey: true }).defaultPrevented).toBe(true);
      expect(replacement.clicks).toHaveBeenCalledOnce();

      void scope.dispose();
      const before = readComposer(replacement.field);
      expect(enter(replacement.field).defaultPrevented).toBe(false);
      expect(enter(replacement.field, { metaKey: true }).defaultPrevented).toBe(false);
      expect(replacement.clicks).toHaveBeenCalledOnce();
      expect(readComposer(replacement.field)).toBe(before);
    });
  });

  it.each(sites.slice(0, 2))('does not click a natively disabled $name button', (site) => {
    const { field, button, clicks } = fixture(site);
    if (!(button instanceof HTMLButtonElement)) throw new Error('Expected native button fixture');
    button.disabled = true;
    activate(site.adapter);

    expect(enter(field, { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(clicks).not.toHaveBeenCalled();
  });
});
