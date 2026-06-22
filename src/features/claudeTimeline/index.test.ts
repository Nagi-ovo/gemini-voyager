import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildClaudeConversationId,
  buildClaudeTurnId,
  startClaudeTimeline,
  stopClaudeTimeline,
} from '.';

const { addStarredMessage, getStarredMessagesForConversation, removeStarredMessage } = vi.hoisted(
  () => ({
    addStarredMessage: vi.fn().mockResolvedValue(undefined),
    getStarredMessagesForConversation: vi.fn().mockResolvedValue([]),
    removeStarredMessage: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock('@/utils/i18n', () => ({
  initI18n: vi.fn().mockResolvedValue(undefined),
  getTranslationSync: (key: string) => key,
}));

vi.mock('@/pages/content/timeline/StarredMessagesService', () => ({
  StarredMessagesService: {
    addStarredMessage,
    getStarredMessagesForConversation,
    removeStarredMessage,
  },
}));

function addTurn(text: string): HTMLElement {
  const turn = document.createElement('div');
  turn.setAttribute('data-testid', 'user-message');
  turn.textContent = text;
  document.body.appendChild(turn);
  return turn;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Claude timeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    history.replaceState({}, '', '/chat/claude-123');
    getStarredMessagesForConversation.mockResolvedValue([]);
    addStarredMessage.mockClear();
    removeStarredMessage.mockClear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.scrollTo = vi.fn();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  afterEach(() => {
    stopClaudeTimeline();
    vi.useRealTimers();
  });

  it('builds Claude-scoped conversation and turn ids', () => {
    expect(buildClaudeConversationId('https://claude.ai/chat/abc')).toBe('claude:conv:abc');
    expect(buildClaudeConversationId('https://claude.ai/new')).toMatch(/^claude:/);
    expect(buildClaudeTurnId(2, 'hello')).toMatch(/^c-2-/);
  });

  it('renders one dot per Claude user message, scrolls on click, and highlights active dot', async () => {
    addTurn('first prompt');
    addTurn('second prompt');

    startClaudeTimeline();
    await flush();

    const dots = document.querySelectorAll<HTMLButtonElement>('.timeline-dot');
    expect(dots).toHaveLength(2);

    dots[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(dots[0].classList.contains('active')).toBe(true);
    expect(dots[0].getAttribute('aria-current')).toBe('true');
  });

  it('updates active dot from the current viewport', async () => {
    const first = addTurn('first prompt');
    const second = addTurn('second prompt');
    const firstRect = vi.fn(() => ({ top: 0, bottom: 40, height: 40 }) as DOMRect);
    const secondRect = vi.fn(() => ({ top: 700, bottom: 740, height: 40 }) as DOMRect);
    first.getBoundingClientRect = firstRect;
    second.getBoundingClientRect = secondRect;
    startClaudeTimeline();
    await flush();

    const dots = document.querySelectorAll<HTMLButtonElement>('.timeline-dot');
    expect(dots[0].classList.contains('active')).toBe(true);
    firstRect.mockClear();
    secondRect.mockClear();

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
    window.dispatchEvent(new Event('scroll'));

    expect(dots[1].classList.contains('active')).toBe(true);
    expect(firstRect).not.toHaveBeenCalled();
    expect(secondRect).not.toHaveBeenCalled();
  });

  it('keeps clicked dot active while smooth scroll is settling', async () => {
    const first = addTurn('first prompt');
    const second = addTurn('second prompt');
    first.getBoundingClientRect = vi.fn(() => ({ top: 0, bottom: 40, height: 40 }) as DOMRect);
    second.getBoundingClientRect = vi.fn(() => ({ top: 700, bottom: 740, height: 40 }) as DOMRect);

    startClaudeTimeline();
    await flush();

    const dots = document.querySelectorAll<HTMLButtonElement>('.timeline-dot');
    dots[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 });
    window.dispatchEvent(new Event('scroll'));

    expect(dots[0].classList.contains('active')).toBe(true);
    expect(dots[1].classList.contains('active')).toBe(false);
  });

  it('scrolls clicked markers to the active anchor', async () => {
    addTurn('first prompt');
    const second = addTurn('second prompt');
    second.getBoundingClientRect = vi.fn(
      () => ({ top: 700, bottom: 740, height: 40 }) as DOMRect,
    );

    startClaudeTimeline();
    await flush();

    document.querySelectorAll<HTMLButtonElement>('.timeline-dot')[1].click();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 450, behavior: 'smooth' });
  });

  it('long-presses a dot to star it', async () => {
    addTurn('remember this');
    startClaudeTimeline();
    await flush();

    const dot = document.querySelector<HTMLButtonElement>('.timeline-dot')!;
    dot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    vi.advanceTimersByTime(550);
    await flush();

    expect(addStarredMessage).toHaveBeenCalledTimes(1);
    expect(dot.classList.contains('starred')).toBe(true);
    expect(dot.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows message content when hovering a dot', async () => {
    addTurn('hover preview text');
    startClaudeTimeline();
    await flush();

    const dot = document.querySelector<HTMLButtonElement>('.timeline-dot')!;
    dot.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(150);

    const tooltip = document.querySelector<HTMLElement>('#claude-timeline-tooltip')!;
    expect(tooltip.textContent).toBe('hover preview text');
    expect(tooltip.querySelector('.claude-timeline-tooltip-text')?.textContent).toBe(
      'hover preview text',
    );
    expect(tooltip.classList.contains('visible')).toBe(true);

    dot.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    expect(tooltip.classList.contains('visible')).toBe(false);
  });

  it('refreshes dots after Claude DOM changes', async () => {
    const first = addTurn('first prompt');
    startClaudeTimeline();
    await flush();
    expect(document.querySelectorAll('.timeline-dot')).toHaveLength(1);

    addTurn('second prompt');
    await flush();
    vi.advanceTimersByTime(120);
    await flush();
    expect(document.querySelectorAll('.timeline-dot')).toHaveLength(2);

    first.remove();
    await flush();
    vi.advanceTimersByTime(120);
    await flush();
    expect(document.querySelectorAll('.timeline-dot')).toHaveLength(1);
  });

  it('keeps existing dots on unrelated DOM changes', async () => {
    addTurn('first prompt');
    startClaudeTimeline();
    await flush();
    const dot = document.querySelector<HTMLButtonElement>('.timeline-dot')!;
    const queryAll = vi.spyOn(document, 'querySelectorAll');

    document.body.appendChild(document.createElement('main'));
    await flush();
    vi.advanceTimersByTime(120);
    await flush();

    expect(queryAll).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLButtonElement>('.timeline-dot')).toBe(dot);
    queryAll.mockRestore();
  });

  it('removes UI on stop', async () => {
    addTurn('first prompt');
    startClaudeTimeline();
    await flush();
    expect(document.querySelector('.gemini-timeline-bar')).toBeTruthy();

    stopClaudeTimeline();
    expect(document.querySelector('.gemini-timeline-bar')).toBeNull();
    expect(document.querySelector('.timeline-preview-toggle')).toBeNull();
    expect(document.querySelector('#claude-timeline-tooltip')).toBeNull();
  });
});
