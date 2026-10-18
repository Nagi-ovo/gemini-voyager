// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_CONTENT_SOURCE,
  ACCOUNT_OBSERVER_SOURCE,
  readAccountObserverMessage,
} from './protocol';

const observerScript = readFileSync(
  resolve(process.cwd(), 'public/chatgpt-account-observer.js'),
  'utf-8',
);

type ObserverWindow = Window & typeof globalThis & { __gvChatGptAccountObserver?: boolean };

const CHECK = '/backend-api/accounts/check/v4-2023-04-27';
const ID_A = '0f6f7a52-1111-4a8e-9a51-3f4a5b6c7d8e';
const ID_B = '9b2c3d4e-2222-4b1f-8c2d-1a2b3c4d5e6f';

/** A check response with what ChatGPT also sends: ids, e-mail, names, a token-like field. */
function checkResponse(): Record<string, unknown> {
  const entry = (id: string, planType: string, extra: Record<string, unknown> = {}) => ({
    account: {
      account_id: id,
      account_user_id: `user-xyz__${id}`,
      plan_type: planType,
      plan_display_name: planType === 'pro' ? 'Pro' : 'Team',
      structure: planType === 'pro' ? 'personal' : 'workspace',
      workspace_type: null,
      name: 'Jesse Zhang',
      email: 'jesse@example.com',
      ...extra,
    },
    entitlement: {
      subscription_id: 'sub_123456',
      subscription_plan: `chatgpt${planType}`,
      has_active_subscription: true,
      billing_period: 'monthly',
      billing_currency: 'GBP',
      renews_at: '2026-11-09T10:00:00+00:00',
      expires_at: '2026-11-09T10:00:00+00:00',
      cancels_at: null,
      scheduled_plan_change: { plan_type: 'plus', customer_email: 'jesse@example.com' },
    },
    features: ['gpt5_pro', 'o3_pro'],
    access_token: 'eyJhbGciOiJSUzI1NiJ9.secret',
  });
  return {
    accounts: {
      default: entry(ID_A, 'pro'),
      [ID_A]: entry(ID_A, 'pro'),
      [ID_B]: entry(ID_B, 'team'),
    },
    account_ordering: [ID_A, ID_B],
  };
}

let posted: Array<{ type: string; payload?: unknown }> = [];
let raw: string[] = [];
let pageFetch: Mock;
const realFetch = window.fetch;

function onMessage(event: MessageEvent): void {
  const data = event.data as { source?: string; type: string; payload?: unknown };
  if (data?.source !== ACCOUNT_OBSERVER_SOURCE) return;
  raw.push(JSON.stringify(data));
  posted.push({ type: data.type, payload: data.payload });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
}

/** jsdom's postMessage sets neither `source` nor `origin`; a browser sets both. */
function postLikeABrowser(): void {
  vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
    setTimeout(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data, source: window, origin: location.origin }),
      );
    }, 0);
  });
}

// Each test installs a fresh observer; the listeners of earlier ones go with their test.
let installedListeners: EventListenerOrEventListenerObject[] = [];

function install(): void {
  const add = vi.spyOn(window, 'addEventListener');
  // oxlint-disable-next-line no-eval -- evaluating the page script under test is what this suite exercises
  (0, eval)(observerScript);
  installedListeners = add.mock.calls.map((call) => call[1]);
  add.mockRestore();
}

async function arm(): Promise<void> {
  window.postMessage({ source: ACCOUNT_CONTENT_SOURCE, type: 'arm' }, location.origin);
  await settle();
}

describe('chatgpt-account-observer', () => {
  beforeEach(() => {
    delete (window as ObserverWindow).__gvChatGptAccountObserver;
    posted = [];
    raw = [];
    pageFetch = vi.fn(async () => new Response(JSON.stringify(checkResponse()), { status: 200 }));
    window.fetch = pageFetch as unknown as typeof fetch;
    postLikeABrowser();
    window.addEventListener('message', onMessage);
    install();
  });

  afterEach(() => {
    for (const listener of installedListeners) window.removeEventListener('message', listener);
    window.removeEventListener('message', onMessage);
    window.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('reports only the plan fields of each account, never an id, e-mail, name or token', async () => {
    await arm();
    await window.fetch(CHECK, { headers: { 'chatgpt-account-id': ID_A } });
    await settle();

    const plans = posted.filter((message) => message.type === 'plans');
    expect(plans).toHaveLength(1);
    const report = plans[0].payload as {
      accounts: { account: string; plan: Record<string, unknown> }[];
      current: string;
    };
    expect(report.accounts).toHaveLength(2); // "default" is the same account as ID_A
    expect(report.accounts[0].plan).toEqual({
      planType: 'pro',
      planDisplayName: 'Pro',
      structure: 'personal',
      workspaceType: null,
      subscriptionPlan: 'chatgptpro',
      hasActiveSubscription: true,
      billingPeriod: 'monthly',
      renewsAt: '2026-11-09T10:00:00+00:00',
      expiresAt: '2026-11-09T10:00:00+00:00',
      cancelsAt: null,
      scheduledPlanChange: 'plus',
    });
    expect(report.accounts[1].plan).toMatchObject({ planType: 'team', structure: 'workspace' });
    expect(report.current).toBe(report.accounts[0].account);
    for (const text of [
      ID_A,
      ID_B,
      'jesse@example.com',
      'Jesse Zhang',
      'eyJhbGciOiJSUzI1NiJ9',
      'sub_123456',
      'user-xyz',
      'GBP',
      'gpt5_pro',
    ]) {
      expect(raw.join('\n')).not.toContain(text);
    }
  });

  it('names the account a later request uses, so a workspace switch moves the current plan', async () => {
    await arm();
    await window.fetch(CHECK, { headers: { 'chatgpt-account-id': ID_A } });
    await window.fetch('/backend-api/me', { headers: { 'chatgpt-account-id': ID_B } });
    await settle();

    const [plans] = posted.filter((message) => message.type === 'plans');
    const accounts = (plans.payload as { accounts: { account: string }[] }).accounts;
    expect(posted.filter((message) => message.type === 'account').at(-1)?.payload).toEqual({
      account: accounts[1].account,
    });
  });

  it('keeps a plan seen before it was armed and reports it once armed', async () => {
    await window.fetch(CHECK);
    await settle();
    expect(posted.some((message) => message.type === 'plans')).toBe(false);

    await arm();
    expect(posted.filter((message) => message.type === 'plans')).toHaveLength(1);
  });

  it('hands the page its own response, unread, and leaves other requests alone', async () => {
    await arm();
    const response = await window.fetch(CHECK);
    expect(response.bodyUsed).toBe(false);
    expect(await response.json()).toEqual(checkResponse());
    await window.fetch('/backend-api/conversation', { method: 'POST', body: '{}' });
    await settle();
    expect(pageFetch).toHaveBeenCalledTimes(2);
    expect(posted.filter((message) => message.type === 'plans')).toHaveLength(1);
  });
});

describe('reading an account observer message', () => {
  const message = (data: unknown) =>
    new MessageEvent('message', { data, source: window, origin: location.origin });

  it('keeps only plan fields from a page script that posts more under the same tag', () => {
    const read = readAccountObserverMessage(
      message({
        source: ACCOUNT_OBSERVER_SOURCE,
        type: 'plans',
        payload: {
          accounts: [
            { account: 'aaaaaaaa', plan: { planType: 'pro', email: 'a@b.c', token: 'secret' } },
          ],
          current: 'aaaaaaaa',
        },
      }),
    );
    expect(read).toEqual({
      type: 'plans',
      plans: { aaaaaaaa: { planType: 'pro' } },
      current: 'aaaaaaaa',
    });
  });

  it('refuses an account that is not a hash, and messages from another frame', () => {
    expect(
      readAccountObserverMessage(
        message({
          source: ACCOUNT_OBSERVER_SOURCE,
          type: 'plans',
          payload: { accounts: [{ account: ID_A, plan: { planType: 'pro' } }], current: null },
        }),
      ),
    ).toBeNull();
    expect(
      readAccountObserverMessage(
        new MessageEvent('message', {
          data: { source: ACCOUNT_OBSERVER_SOURCE, type: 'ready' },
          origin: 'https://evil.example',
        }),
      ),
    ).toBeNull();
  });
});
