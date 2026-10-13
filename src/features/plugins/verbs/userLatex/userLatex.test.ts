import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { textWithLatexSource } from '@/core/utils/userLatexSource';
import { turnSummary } from '@/features/timeline/adapters/catalog/turnHash';
import { chatgptExtractUserText } from '@/pages/content/export/adapter/platform/chatgpt';
import {
  renderQuotedUserMessages,
  startRenderedQuoteStyling,
} from '@/pages/content/quoteReply/renderedQuotes';
import {
  _resetUserLatexKatexLoader,
  _setUserLatexKatexLoaderForTest,
} from '@/pages/content/userLatex';

import { requireBundledSiteAdapter } from '../../catalog/sites';
import geminiManifest from '../../catalog/sites/gemini/plugins/user-latex/plugin.json';
import { PluginScope } from '../../runtime/pluginScope';
import type { SiteAdapter } from '../../types';
import type { PrimitiveContext } from '../types';
import { type UserLatexParams, userLatexPrimitive } from './index';

const renderToString = vi.fn(
  (tex: string) => `<span class="katex"><span class="katex-html">${tex}</span></span>`,
);
vi.mock('katex', () => ({ default: { renderToString } }));

/** ChatGPT's prompt bubble as measured live (see chatgptThreadFixture). */
function chatgptMessage(text: string): HTMLElement {
  const item = document.createElement('div');
  item.setAttribute('data-turn-key', `k${document.querySelectorAll('[data-turn-key]').length}`);
  item.innerHTML =
    '<div data-user-message-bubble="true"><div data-search-result-target=""><div><div dir="auto"></div></div></div></div>';
  item.querySelector('[dir="auto"]')!.textContent = text;
  document.querySelector('main')!.append(item);
  return item.querySelector<HTMLElement>('[data-user-message-bubble]')!;
}

/** Claude's user message: one paragraph per line. */
function claudeMessage(text: string): HTMLElement {
  const message = document.createElement('div');
  message.setAttribute('data-testid', 'user-message');
  const paragraph = document.createElement('p');
  paragraph.className = 'whitespace-pre-wrap';
  paragraph.textContent = text;
  message.append(paragraph);
  document.querySelector('main')!.append(message);
  return message;
}

const sites = [
  { adapter: requireBundledSiteAdapter('chatgpt'), message: chatgptMessage },
  { adapter: requireBundledSiteAdapter('claude'), message: claudeMessage },
];

let scope: PluginScope;

function activate(adapter: SiteAdapter, params: UserLatexParams = {}, into: PluginScope = scope) {
  let counter: () => number = () => -1;
  const context: PrimitiveContext = {
    doc: document,
    adapter,
    pluginId: 'test.user-latex',
    settings: {},
    setTargetCounter: (count) => (counter = count),
  };
  void userLatexPrimitive.activate(into, params, context);
  return { count: () => counter() };
}

const rendered = (element: Element) => element.querySelectorAll('.katex');

/** Holds KaTeX loading until the returned function is called. */
function holdKatex(): () => void {
  let release!: () => void;
  const loaded = new Promise<typeof import('katex')>((resolve) => {
    release = () => resolve({ default: { renderToString } } as unknown as typeof import('katex'));
  });
  _setUserLatexKatexLoaderForTest(() => loaded);
  return () => release();
}

beforeEach(() => {
  _resetUserLatexKatexLoader();
  renderToString.mockClear();
  document.body.innerHTML =
    '<main></main><form><div data-composer-markdown contenteditable="true"></div></form>';
  scope = new PluginScope();
});

afterEach(async () => {
  await scope.dispose();
  document.body.replaceChildren();
  document.body.className = '';
});

describe('userLatex primitive', () => {
  it('accepts an optional turn selector and rejects anything else', () => {
    expect(userLatexPrimitive.validateParams(undefined)).toEqual({ success: true, data: {} });
    expect(userLatexPrimitive.validateParams({ turn: '.mine' })).toEqual({
      success: true,
      data: { turn: '.mine' },
    });
    expect(userLatexPrimitive.validateParams({ turn: ' ' }).success).toBe(false);
    expect(userLatexPrimitive.validateParams({ selector: '.mine' }).success).toBe(false);
    expect(userLatexPrimitive.validateParams([]).success).toBe(false);
  });

  it('accepts a leaf or turn unit and rejects any other', () => {
    for (const unit of ['leaf', 'turn']) {
      expect(userLatexPrimitive.validateParams({ unit })).toEqual({
        success: true,
        data: { unit },
      });
    }
    for (const unit of ['line', '', 1, null]) {
      expect(userLatexPrimitive.validateParams({ unit })).toEqual({
        success: false,
        error: [{ path: 'params.unit', message: 'must be "leaf" or "turn"' }],
      });
    }
  });

  it('restores only its own rendered lines when one of two user LaTeX plugins turns off', async () => {
    const first = claudeMessage('first $a$');
    first.classList.add('one');
    const second = claudeMessage('second $b$');
    second.classList.add('two');
    const both = claudeMessage('both $c$');
    both.classList.add('one', 'two');
    const other = new PluginScope();
    activate(sites[1].adapter, { turn: '.one' });
    await vi.waitFor(() => expect(rendered(first)).toHaveLength(1));
    await vi.waitFor(() => expect(rendered(both)).toHaveLength(1));
    activate(sites[1].adapter, { turn: '.two' }, other);
    await vi.waitFor(() => expect(rendered(second)).toHaveLength(1));
    // A line both match stays with the plugin that took it first.
    const holder = (message: Element) =>
      message.querySelector('p')!.getAttribute('data-user-latex-owner');
    expect(holder(both)).toBe(holder(first));
    expect(holder(second)).not.toBe(holder(first));

    await other.dispose();

    expect(second.textContent).toBe('second $b$');
    expect(rendered(first)).toHaveLength(1);
    expect(rendered(both)).toHaveLength(1);
    await scope.dispose();
    expect(first.textContent).toBe('first $a$');
    expect(both.textContent).toBe('both $c$');
  });

  it('a ChatGPT user message shows $I_3$ as rendered math', async () => {
    const bubble = chatgptMessage('这个 $I_3$ 是单位矩阵吗?');
    const { count } = activate(sites[0].adapter);

    await vi.waitFor(() => expect(rendered(bubble)).toHaveLength(1));
    expect(renderToString).toHaveBeenCalledWith(
      'I_3',
      expect.objectContaining({ displayMode: false }),
    );
    expect(bubble.textContent).toBe('这个 I_3 是单位矩阵吗?');
    expect(count()).toBe(1);
  });

  it("a message still renders under Voyager's own page classes", async () => {
    document.body.className = 'gv-rtl gv-plugin-chatgpt-reading-width';
    const bubble = chatgptMessage('$x$');
    activate(sites[0].adapter);

    await vi.waitFor(() => expect(rendered(bubble)).toHaveLength(1));
  });

  it('renders math in a ChatGPT message that collapse already folded', async () => {
    const bubble = chatgptMessage('$x^2$');
    bubble.classList.add('gv-collapse-1', 'gv-collapse-1-collapsed');
    activate(sites[0].adapter);

    await vi.waitFor(() => expect(rendered(bubble)).toHaveLength(1));
  });

  it.each(sites)('renders a user message that arrives later on $adapter.label', async (site) => {
    activate(site.adapter);
    const message = site.message('Display: $$\\sum_i x_i$$');

    await vi.waitFor(() => expect(rendered(message)).toHaveLength(1));
    expect(renderToString).toHaveBeenCalledWith(
      '\\sum_i x_i',
      expect.objectContaining({ displayMode: true }),
    );
  });

  it('the ChatGPT composer is never rendered', async () => {
    const composer = document.querySelector<HTMLElement>('[data-composer-markdown]')!;
    composer.innerHTML = '<p>draft $x^2$</p>';
    // Even a composer that sits inside a user turn, as an inline edit does.
    const bubble = chatgptMessage('');
    bubble.querySelector('[dir="auto"]')!.innerHTML =
      '<textarea>edit $y$</textarea><div contenteditable="true">edit $z$</div>';
    const sent = chatgptMessage('sent $w$');
    activate(sites[0].adapter);

    await vi.waitFor(() => expect(rendered(sent)).toHaveLength(1));
    expect(composer.innerHTML).toBe('<p>draft $x^2$</p>');
    expect(bubble.querySelector('textarea')!.textContent).toBe('edit $y$');
    expect(bubble.querySelector('[contenteditable]')!.textContent).toBe('edit $z$');
    expect(renderToString).toHaveBeenCalledTimes(1);
  });

  it('a dollar amount like $5 and $10 is left as text', async () => {
    const prices = chatgptMessage('It costs $5 and $10 later');
    const math = chatgptMessage('and $x$');
    activate(sites[0].adapter);

    await vi.waitFor(() => expect(rendered(math)).toHaveLength(1));
    expect(rendered(prices)).toHaveLength(0);
    expect(prices.textContent).toBe('It costs $5 and $10 later');
  });

  it('turning the plugin off restores the original text', async () => {
    const bubble = chatgptMessage('Is $I_3$ the identity?');
    const textNode = bubble.querySelector('[dir="auto"]')!.firstChild;
    activate(sites[0].adapter);
    await vi.waitFor(() => expect(rendered(bubble)).toHaveLength(1));

    await scope.dispose();

    const holder = bubble.querySelector<HTMLElement>('[dir="auto"]')!;
    expect(holder.textContent).toBe('Is $I_3$ the identity?');
    // The host's own text node goes back, so its framework still owns what it renders.
    expect(holder.firstChild).toBe(textNode);
    expect(holder.attributes).toHaveLength(1);
  });

  it('a rendered ChatGPT message keeps its timeline id, export text and send text', async () => {
    const bubble = chatgptMessage('Is $I_3$ the identity?');
    const before = turnSummary(bubble);
    activate(sites[0].adapter);
    await vi.waitFor(() => expect(rendered(bubble)).toHaveLength(1));

    expect(turnSummary(bubble)).toBe(before);
    expect(textWithLatexSource(bubble)).toBe('Is $I_3$ the identity?');
    const exported: string[] = [];
    chatgptExtractUserText(document.querySelectorAll('.none'), exported, bubble);
    expect(exported).toEqual(['Is $I_3$ the identity?']);
  });
  it('an edited ChatGPT message is read with its new text', async () => {
    const bubble = chatgptMessage('original $x$');
    const holder = bubble.querySelector<HTMLElement>('[dir="auto"]')!;
    activate(sites[0].adapter);
    await vi.waitFor(() => expect(rendered(bubble)).toHaveLength(1));

    // React writes the edited text over the same element, replacing our rendering.
    holder.textContent = 'edited $y$';

    expect(turnSummary(bubble)).toBe('edited $y$');
    const exported: string[] = [];
    chatgptExtractUserText(document.querySelectorAll('.none'), exported, bubble);
    expect(exported).toEqual(['edited $y$']);
    // The edit renders on the next pass and keeps reading as its own source.
    await vi.waitFor(() => expect(rendered(bubble)).toHaveLength(1));
    expect(renderToString).toHaveBeenLastCalledWith('y', expect.anything());
    expect(textWithLatexSource(bubble)).toBe('edited $y$');
  });

  it('a message that turns into an editor while KaTeX loads is left alone', async () => {
    const release = holdKatex();
    const bubble = chatgptMessage('edit $x$');
    const holder = bubble.querySelector<HTMLElement>('[dir="auto"]')!;
    activate(sites[0].adapter);

    // Same textContent, but now an editor the user is typing in.
    holder.innerHTML = '<textarea>edit $x$</textarea>';
    const editor = holder.querySelector('textarea')!;
    release();

    // Settled either way: rendered over the editor, or given up for a later pass.
    await vi.waitFor(() =>
      expect(
        holder.dataset.userLatexOriginal !== undefined ||
          holder.dataset.userLatexProcessed === undefined,
      ).toBe(true),
    );
    expect(holder.firstChild).toBe(editor);
    expect(editor.isConnected).toBe(true);
    expect(rendered(bubble)).toHaveLength(0);
  });

  it('a turn inside an editable field is never rendered', async () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.innerHTML = '<div class="mine"><span>draft $x$</span></div>';
    document.querySelector('main')!.append(editor);
    const sent = claudeMessage('sent $w$');
    sent.classList.add('mine');
    // Claude's composer selector names only its chat-input editor, not this field.
    activate(sites[1].adapter, { turn: '.mine' });

    await vi.waitFor(() => expect(rendered(sent)).toHaveLength(1));
    expect(editor.innerHTML).toBe('<div class="mine"><span>draft $x$</span></div>');
    expect(renderToString).toHaveBeenCalledTimes(1);
  });
});

/** Gemini's sent message, one `p.query-text-line` per line (see `pages/content/userLatex`). */
function geminiMessage(...lines: string[]): HTMLElement {
  const query = document.createElement('user-query');
  query.innerHTML =
    '<span class="user-query-bubble-with-background"><span class="horizontal-container">' +
    '<div class="query-text gds-body-l"><span class="cdk-visually-hidden">You said</span></div>' +
    '</span></span>';
  const text = query.querySelector('.query-text')!;
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'query-text-line';
    p.textContent = line;
    text.append(p);
  }
  document.querySelector('main')!.append(query);
  return query;
}

describe('userLatex on Gemini', () => {
  const gemini = requireBundledSiteAdapter('gemini');
  const params = geminiManifest.contributes.domOps[0].params as UserLatexParams;
  const linesOf = (message: Element) =>
    Array.from(message.querySelectorAll<HTMLElement>('p.query-text-line'));
  const markers = (element: Element) => element.querySelectorAll('.gv-rendered-quote-marker');

  it('renders each line whole and keeps its source for export and the timeline', async () => {
    const message = geminiMessage('Euler: $e^{i\\pi}+1=0$', 'plain line', 'costs $5');
    const [math, plain, price] = linesOf(message);
    activate(gemini, params);

    await vi.waitFor(() => expect(rendered(math)).toHaveLength(1));
    // Export reads each line's own source attribute, the timeline the turn's text.
    expect(math.dataset.userLatexOriginal).toBe('Euler: $e^{i\\pi}+1=0$');
    expect(textWithLatexSource(message)).toBe('You saidEuler: $e^{i\\pi}+1=0$plain linecosts $5');
    expect(rendered(plain)).toHaveLength(0);
    expect(price.textContent).toBe('costs $5');

    await scope.dispose();
    expect(math.textContent).toBe('Euler: $e^{i\\pi}+1=0$');
    expect(linesOf(message).every((line) => line.attributes.length === 1)).toBe(true);
  });

  it('renders nothing into a line Gemini detached while KaTeX loaded once the plugin turned off', async () => {
    const [line] = linesOf(geminiMessage('detached $x$'));
    const release = holdKatex();
    activate(gemini, params);
    expect(line.hasAttribute('data-user-latex-owner')).toBe(true);

    line.remove();
    await scope.dispose();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rendered(line)).toHaveLength(0);
    expect(line.textContent).toBe('detached $x$');
    expect(line.attributes).toHaveLength(1);
  });

  it('lets the next activation render a line Gemini detached and re-inserted around a turn-off', async () => {
    const message = geminiMessage('moved $y$');
    const [line] = linesOf(message);
    const text = line.parentElement!;
    activate(gemini, params);
    await vi.waitFor(() => expect(rendered(line)).toHaveLength(1));
    const first = line.getAttribute('data-user-latex-owner');

    line.remove();
    await scope.dispose();
    expect(line.textContent).toBe('moved $y$');
    expect(line.attributes).toHaveLength(1);
    text.append(line);

    scope = new PluginScope();
    activate(gemini, params);
    await vi.waitFor(() => expect(rendered(line)).toHaveLength(1));
    expect(line.getAttribute('data-user-latex-owner')).not.toBe(first);
  });

  it('renders the edited text after Gemini repaints a line', async () => {
    const [line] = linesOf(geminiMessage('original $x$'));
    activate(gemini, params);
    await vi.waitFor(() => expect(rendered(line)).toHaveLength(1));

    line.textContent = 'edited $y$';

    await vi.waitFor(() => expect(line.dataset.userLatexOriginal).toBe('edited $y$'));
    expect(rendered(line)).toHaveLength(1);
    expect(renderToString).toHaveBeenLastCalledWith('y', expect.anything());
  });

  it('renders a quoted user line and keeps its quote marker', async () => {
    const message = geminiMessage('> quoted $x$', 'reply $y$');
    renderQuotedUserMessages();
    const [quoted, reply] = linesOf(message);
    expect(quoted.classList.contains('gv-rendered-quote-line')).toBe(true);
    expect(markers(quoted)).toHaveLength(1);
    activate(gemini, params);

    await vi.waitFor(() => expect(rendered(quoted)).toHaveLength(1));
    await vi.waitFor(() => expect(rendered(reply)).toHaveLength(1));
    expect(quoted.dataset.userLatexOriginal).toBe('> quoted $x$');
    // Quote styling puts its marker back over the rendered line.
    renderQuotedUserMessages();
    expect(markers(quoted)).toHaveLength(1);
    expect(rendered(quoted)).toHaveLength(1);
    expect(textWithLatexSource(quoted)).toBe('> quoted $x$');
  });

  it.each([
    ['user LaTeX', 'quote styling'],
    ['quote styling', 'user LaTeX'],
  ])('puts a quoted line back whole when %s turns off before %s', async (firstOff) => {
    const message = geminiMessage('> quoted $x$');
    const stopQuotes = startRenderedQuoteStyling();
    const [quoted] = linesOf(message);
    activate(gemini, params);
    await vi.waitFor(() => expect(rendered(quoted)).toHaveLength(1));
    renderQuotedUserMessages();
    expect(markers(quoted)).toHaveLength(1);

    if (firstOff === 'user LaTeX') {
      await scope.dispose();
      stopQuotes();
    } else {
      stopQuotes();
      await scope.dispose();
    }

    expect(quoted.textContent).toBe('> quoted $x$');
    expect(quoted.children).toHaveLength(0);
    expect(quoted.className).toBe('query-text-line');
    expect(quoted.attributes).toHaveLength(1);
    expect(message.querySelector('[class^="gv-"], [class*=" gv-"]')).toBeNull();
  });

  describe('with a leaf plugin and a whole-line plugin on one line', () => {
    type Unit = 'leaf' | 'turn';
    const SOURCE = 'bare $y$ $x$';
    // A local plugin renders leaves (its default unit); the official one renders whole lines.
    const paramsFor: Record<Unit, UserLatexParams> = { leaf: {}, turn: params };
    /** Formulas a unit draws on the line: the leaf only reaches the one in the link. */
    const drawnBy: Record<Unit, number> = { leaf: 1, turn: 2 };
    const OWNER = 'data-user-latex-owner';
    const others: PluginScope[] = [];

    afterEach(async () => {
      await Promise.all(others.splice(0).map((other) => other.dispose()));
    });

    /** Gemini's line with a formula inside a link, so only its link is a leaf. */
    function mixedLine(): { line: HTMLElement; link: HTMLElement } {
      const [line] = linesOf(geminiMessage(''));
      line.innerHTML = 'bare $y$ <a href="#x">$x$</a>';
      return { line, link: line.querySelector('a')! };
    }

    function start(unit: Unit): PluginScope {
      const into = new PluginScope();
      others.push(into);
      activate(gemini, paramsFor[unit], into);
      return into;
    }

    /** Past the observer's rescan, so a plugin that held back has had its second look. */
    const afterRescan = () => new Promise((resolve) => setTimeout(resolve, 400));

    it.each<[Unit, Unit, Unit]>([
      ['leaf', 'turn', 'leaf'],
      ['leaf', 'turn', 'turn'],
      ['turn', 'leaf', 'turn'],
      ['turn', 'leaf', 'leaf'],
    ])(
      'keeps the line source whole when the %s plugin starts before the %s one and the %s one stops first',
      async (first, second, stopsFirst) => {
        const { line, link } = mixedLine();
        const scopes = { [first]: start(first) } as Record<Unit, PluginScope>;
        await vi.waitFor(() => expect(rendered(line)).toHaveLength(drawnBy[first]));
        scopes[second] = start(second);
        await afterRescan();

        // The second plugin takes nothing over or under the first one's claim.
        expect(textWithLatexSource(line)).toBe(SOURCE);
        expect(rendered(line)).toHaveLength(drawnBy[first]);
        expect(
          new Set(
            Array.from(line.parentElement!.querySelectorAll(`[${OWNER}]`), (el) =>
              el.getAttribute(OWNER),
            ),
          ).size,
        ).toBe(1);

        const remaining: Unit = stopsFirst === first ? second : first;
        await scopes[stopsFirst].dispose();
        // Once the first lets go, the other renders the line its own way.
        await vi.waitFor(() => expect(rendered(line)).toHaveLength(drawnBy[remaining]));
        expect(textWithLatexSource(line)).toBe(SOURCE);
        if (remaining === 'turn') expect(line.dataset.userLatexOriginal).toBe(SOURCE);

        await scopes[remaining].dispose();
        expect(line.textContent).toBe(SOURCE);
        expect(line.querySelector('a')).toBe(link);
        expect(line.parentElement!.querySelector(`[${OWNER}]`)).toBeNull();
      },
    );

    it.each<[Unit, Unit]>([
      ['leaf', 'turn'],
      ['turn', 'leaf'],
    ])(
      'leaves the line alone while the %s plugin waits for KaTeX and the %s one starts',
      async (first, second) => {
        const release = holdKatex();
        const { line, link } = mixedLine();
        const [held, spared] = first === 'leaf' ? [link, line] : [line, link];
        const firstScope = start(first);
        expect(held.hasAttribute(OWNER)).toBe(true);

        const secondScope = start(second);
        // A claim still waiting for KaTeX counts: the other plugin keeps out.
        expect(spared.hasAttribute(OWNER)).toBe(false);
        release();
        await vi.waitFor(() => expect(rendered(line)).toHaveLength(drawnBy[first]));
        await afterRescan();
        expect(spared.hasAttribute(OWNER)).toBe(false);
        expect(textWithLatexSource(line)).toBe(SOURCE);

        await firstScope.dispose();
        await vi.waitFor(() => expect(rendered(line)).toHaveLength(drawnBy[second]));
        expect(textWithLatexSource(line)).toBe(SOURCE);
        if (second === 'turn') expect(line.dataset.userLatexOriginal).toBe(SOURCE);

        await secondScope.dispose();
        expect(line.textContent).toBe(SOURCE);
        expect(line.querySelector('a')).toBe(link);
      },
    );
  });
});
