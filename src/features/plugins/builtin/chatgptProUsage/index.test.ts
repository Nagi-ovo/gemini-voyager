// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/c/conv-1" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { chatgptAdapter } from '../../sites/adapters/chatgpt';
import { PRO_USAGE_BADGE_ID, PRO_USAGE_CARD_ID, RING_CIRCUMFERENCE } from './badge';
import { activateChatGptProUsage } from './index';
import { CONTENT_SOURCE, OBSERVER_SOURCE } from './protocol';

const KEY = StorageKeys.GV_CHATGPT_PRO_USAGE;
let stored: Record<string, unknown> = {};
let toObserver: string[] = [];
let scope: PluginScope | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
}

/** jsdom's postMessage sets neither `source` nor `origin`; a browser sets both. */
function postLikeABrowser(): void {
  vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
    const message = data as { source?: string; type?: string };
    if (message?.source === CONTENT_SOURCE && message.type) toObserver.push(message.type);
    setTimeout(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data, source: window, origin: location.origin }),
      );
    }, 0);
  });
}

function fakeStorage(): void {
  vi.mocked(chrome.storage.local.get).mockImplementation((async (keys: unknown) => {
    const wanted = keys && typeof keys === 'object' ? Object.keys(keys) : [String(keys)];
    return Object.fromEntries(wanted.filter((k) => k in stored).map((k) => [k, stored[k]]));
  }) as unknown as typeof chrome.storage.local.get);
  vi.mocked(chrome.storage.local.set).mockImplementation((async (
    items: Record<string, unknown>,
  ) => {
    Object.assign(stored, items);
  }) as unknown as typeof chrome.storage.local.set);
}

/** The measured chat-mode picker: an aria-hidden caption, then the selected step. */
function mountComposer(step = 'Pro'): HTMLButtonElement {
  document.body.innerHTML = '';
  const form = document.createElement('form');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.setAttribute('aria-label', '选择 ChatGPT 模型');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.innerHTML = `<span aria-hidden="true"><span>思考强度</span></span><span><span>${step}</span></span>`;
  form.append(trigger);
  document.body.append(form);
  return trigger;
}

function setStep(trigger: HTMLElement, step: string): void {
  trigger.lastElementChild!.textContent = step;
}

function fromObserver(type: string, payload?: unknown, source = OBSERVER_SOURCE): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { source, type, payload },
      source: window,
      origin: location.origin,
    }),
  );
}

function ring(): HTMLElement | null {
  return document.getElementById(PRO_USAGE_BADGE_ID);
}

/** The card's two lines while the pointer is over the ring; null when there is no ring. */
function hoverCard(): { title: string; detail: string } | null {
  const element = ring();
  if (!element) return null;
  element.dispatchEvent(new MouseEvent('mouseenter'));
  const card = document.getElementById(PRO_USAGE_CARD_ID);
  const lines = {
    title: card?.children[0]?.textContent ?? '',
    detail: card?.children[1]?.textContent ?? '',
  };
  element.dispatchEvent(new MouseEvent('mouseleave'));
  return lines;
}

function badgeText(): string | null {
  return hoverCard()?.title ?? null;
}

/** How much of the ring the arc covers, 0–1. */
function arcShare(): number {
  const arc = ring()?.querySelector('circle[stroke-linecap="round"]');
  if (!arc || arc.getAttribute('visibility') === 'hidden') return 0;
  return Number(arc.getAttribute('stroke-dasharray')?.split(' ')[0]) / RING_CIRCUMFERENCE;
}

async function start(settings: Record<string, number> = {}): Promise<void> {
  scope = new PluginScope();
  activateChatGptProUsage(scope, settings, chatgptAdapter);
  await settle();
  fromObserver('ready');
  await settle();
}

function send(
  model = 'gpt-6-pro',
  key: string | null = 'k1',
  account: string | null = 'acct-a',
  mode: string | null = null,
): void {
  fromObserver('send', { account, model, mode, key, at: Date.now() });
}

function bucket(account: string): { sends: unknown[]; limit?: number; resetsAt?: number } {
  return (stored[KEY] as { accounts: Record<string, { sends: unknown[] }> }).accounts[account];
}

describe('ChatGPT Pro usage', () => {
  beforeEach(() => {
    stored = {};
    toObserver = [];
    fakeStorage();
    postLikeABrowser();
  });

  afterEach(async () => {
    await scope?.dispose();
    scope = null;
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('arms the page observer and shows an empty ring just before a Pro picker', async () => {
    mountComposer('Pro');
    await start();

    expect(toObserver).toContain('arm');
    expect(ring()?.nextElementSibling?.getAttribute('aria-label')).toBe('选择 ChatGPT 模型');
    expect(arcShare()).toBe(0);
    expect(badgeText()).toBe('0 / 200 Pro messages used this week');
  });

  it('keeps the ring on the picker row when ChatGPT wraps the picker in a block', async () => {
    const trigger = mountComposer('Pro');
    const row = document.createElement('div');
    row.style.display = 'flex';
    const block = document.createElement('div');
    const contents = document.createElement('span');
    contents.style.display = 'contents';
    trigger.replaceWith(row);
    row.append(block);
    block.append(contents);
    contents.append(trigger);
    await start();

    expect(ring()?.parentElement).toBe(row);
    expect(ring()?.nextElementSibling).toBe(block);
  });

  it('counts a Pro send once, even when reported twice', async () => {
    mountComposer('Pro');
    await start();
    send('gpt-6-pro', 'k1');
    send('gpt-6-pro', 'k1');
    await settle();

    expect(badgeText()).toBe('1 / 200 Pro messages used this week');
    // One send of 200 still draws a visible arc.
    expect(arcShare()).toBeGreaterThan(0.04);
    expect(arcShare()).toBeLessThan(0.1);
    expect(bucket('acct-a').sends).toHaveLength(1);
  });

  it('does not count a non-Pro send', async () => {
    mountComposer('Pro');
    await start();
    send('gpt-6', 'k2');
    await settle();

    expect(badgeText()).toBe('0 / 200 Pro messages used this week');
    expect(stored[KEY]).toBeUndefined();
  });

  it('ignores messages that do not come from the page observer', async () => {
    mountComposer('Pro');
    await start();
    fromObserver(
      'send',
      { account: null, model: 'gpt-6-pro', mode: null, key: 'k3', at: Date.now() },
      'other',
    );
    fromObserver('send', { account: null, model: 42, mode: null, key: 'k4', at: Date.now() });
    await settle();

    expect(stored[KEY]).toBeUndefined();
  });

  it('fills the ring while ChatGPT says Pro is used up, whatever was counted here', async () => {
    const resetsAt = Date.now() + 2 * 86_400_000;
    mountComposer('Pro');
    await start();
    send('gpt-6-pro', 'k1');
    await settle();
    fromObserver('quota', {
      account: 'acct-a',
      model_limits: [{ model_slug: 'gpt-6-pro', resets_after: new Date(resetsAt).toISOString() }],
      blocked_features: [{ name: 'reason', limit: 15 }],
    });
    await settle();

    expect(arcShare()).toBeCloseTo(1);
    const card = hoverCard();
    expect(card?.title).toBe('Pro is used up');
    expect(card?.detail).toMatch(/^Counted in this browser only · resets /);
    expect(bucket('acct-a')).toMatchObject({ limit: 15, resetsAt });
  });

  it('counts a Pro send made in a project', async () => {
    mountComposer('Pro');
    await start();
    send('gpt-6-pro', 'k5', 'acct-a', 'gizmo_interaction');
    await settle();
    expect(badgeText()).toBe('1 / 200 Pro messages used this week');
  });

  it('shows only the count of the account the page is signed in to', async () => {
    mountComposer('Pro');
    await start();
    send('gpt-6-pro', 'k1', 'acct-a');
    send('gpt-6-pro', 'k2', 'acct-a');
    await settle();
    expect(badgeText()).toBe('2 / 200 Pro messages used this week');

    fromObserver('account', { account: 'acct-b' });
    await settle();
    expect(badgeText()).toBe('0 / 200 Pro messages used this week');
    send('gpt-6-pro', 'k3', 'acct-b');
    await settle();
    expect(badgeText()).toBe('1 / 200 Pro messages used this week');
    expect(bucket('acct-a').sends).toHaveLength(2);
  });

  it('keeps sends saved before accounts were tracked, under the first account seen', async () => {
    stored[KEY] = { version: 1, sends: [{ at: Date.now() - 1_000, key: 'old' }] };
    mountComposer('Pro');
    await start();
    expect(badgeText()).toBe('1 / 200 Pro messages used this week');

    fromObserver('account', { account: 'acct-a' });
    await settle();
    expect(badgeText()).toBe('1 / 200 Pro messages used this week');
    expect(bucket('acct-a').sends).toHaveLength(1);
  });

  it('finds the picker when the page had no body yet at start', async () => {
    document.body.remove();
    await start();
    const body = document.createElement('body');
    document.documentElement.append(body);
    mountComposer('Pro');
    await new Promise((r) => setTimeout(r, 150));
    expect(badgeText()).toBe('0 / 200 Pro messages used this week');
  });

  it('measures against the weekly allowance setting', async () => {
    mountComposer('Pro');
    await start({ weeklyLimit: 4 });
    send('gpt-6-pro', 'k1');
    send('gpt-6-pro', 'k2');
    await settle();

    expect(arcShare()).toBeCloseTo(0.5);
    expect(hoverCard()).toEqual({
      title: '2 / 4 Pro messages used this week',
      detail: 'Counted in this browser only',
    });
  });

  it('measures against the limit ChatGPT names over the setting', async () => {
    mountComposer('Pro');
    await start({ weeklyLimit: 4 });
    send('gpt-6-pro', 'k1');
    await settle();
    fromObserver('quota', {
      account: 'acct-a',
      model_limits: [{ model_slug: 'gpt-6-pro' }],
      blocked_features: [{ name: 'reason', limit: 10 }],
    });
    await settle();

    expect(badgeText()).toBe('1 / 10 Pro messages used this week');
    expect(arcShare()).toBeCloseTo(0.1);
  });

  it('shows the card on keyboard focus and hides it on blur', async () => {
    mountComposer('Pro');
    await start();
    const element = ring()!;
    expect(element.tabIndex).toBe(0);
    expect(element.getAttribute('aria-label')).toBe('0 / 200 Pro messages used this week');

    element.focus();
    expect(document.getElementById(PRO_USAGE_CARD_ID)?.textContent).toContain('0 / 200');
    element.blur();
    expect(document.getElementById(PRO_USAGE_CARD_ID)).toBeNull();
  });

  it('hides the ring when another effort is selected, and brings it back on Pro', async () => {
    const trigger = mountComposer('Pro');
    await start();
    setStep(trigger, '高');
    await settle();
    await new Promise((r) => setTimeout(r, 150));
    expect(badgeText()).toBeNull();

    setStep(trigger, 'Pro');
    await new Promise((r) => setTimeout(r, 150));
    expect(badgeText()).toBe('0 / 200 Pro messages used this week');
  });

  it('shows nothing until the page observer answers', async () => {
    mountComposer('Pro');
    scope = new PluginScope();
    activateChatGptProUsage(scope, {}, chatgptAdapter);
    await settle();
    // The browser-like postMessage echoes our own arm back, never a ready.
    expect(badgeText()).toBeNull();
  });

  it('removes the ring and its card, disarms the observer and stops counting once turned off', async () => {
    mountComposer('Pro');
    await start();
    ring()!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.getElementById(PRO_USAGE_CARD_ID)).not.toBeNull();

    await scope!.dispose();
    scope = null;
    expect(ring()).toBeNull();
    expect(document.getElementById(PRO_USAGE_CARD_ID)).toBeNull();
    expect(toObserver.at(-1)).toBe('disarm');

    send('gpt-6-pro', 'late');
    await settle();
    expect(stored[KEY]).toBeUndefined();
  });
});
