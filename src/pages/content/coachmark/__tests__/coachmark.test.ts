import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasSeenCoachmark,
  markCoachmarkSeen,
  resetCoachmark,
  runCoachmarkSequence,
  showCoachmark,
} from '../index';

// In-memory sync storage so the seen-set logic is deterministic.
const store: Record<string, unknown> = {};
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: {
        get: vi.fn(async (defaults?: Record<string, unknown>) => {
          const out: Record<string, unknown> = { ...(defaults ?? {}) };
          for (const k of Object.keys(out)) if (k in store) out[k] = store[k];
          return out;
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
      },
    },
  },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  document.body.innerHTML = '';
});

describe('coachmark seen-state', () => {
  it('marks and reads seen ids in a shared array', async () => {
    expect(await hasSeenCoachmark('a')).toBe(false);
    await markCoachmarkSeen('a');
    await markCoachmarkSeen('a'); // idempotent
    expect(await hasSeenCoachmark('a')).toBe(true);
    expect(await hasSeenCoachmark('b')).toBe(false);
    expect(store['gvCoachmarksSeen']).toEqual(['a']);
  });

  it('resetCoachmark clears a single id', async () => {
    await markCoachmarkSeen('a');
    await markCoachmarkSeen('b');
    await resetCoachmark('a');
    expect(await hasSeenCoachmark('a')).toBe(false);
    expect(await hasSeenCoachmark('b')).toBe(true);
  });
});

describe('runCoachmarkSequence', () => {
  it('continues past skipped steps and stops after showing one coachmark', async () => {
    const calls: string[] = [];

    const result = await runCoachmarkSequence([
      async () => {
        await Promise.resolve();
        calls.push('usage');
        return 'skipped' as const;
      },
      () => {
        calls.push('folder-search');
        return 'dismissed' as const;
      },
      () => {
        calls.push('conversation-sort');
        return 'dismissed' as const;
      },
    ]);

    expect(calls).toEqual(['usage', 'folder-search']);
    expect(result).toBe('dismissed');
  });
});

describe('showCoachmark', () => {
  it('skips (no DOM) when already seen', async () => {
    await markCoachmarkSeen('seen-one');
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);

    const res = await showCoachmark({ id: 'seen-one', anchor: () => anchor, body: 'hi' });

    expect(res).toBe('skipped');
    expect(document.querySelector('.gv-coach')).toBeNull();
  });

  it('keeps the guide open while switching and confirms the selected state with Done', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    const onChange = vi.fn();

    const p = showCoachmark({
      id: 'enable-me',
      anchor: () => anchor,
      body: 'intro',
      toggle: { label: 'on', initial: false, onChange },
      dismissLabel: 'Done',
    });
    await flush();
    await flush();

    const sw = document.querySelector('.gv-coach-switch') as HTMLElement;
    expect(sw).toBeTruthy();
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.gv-coach')).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 1050));
    expect(document.querySelector('.gv-coach')).toBeTruthy();

    (document.querySelector('.gv-coach-dismiss') as HTMLElement).click();

    const res = await p;
    expect(res).toBe('enabled');
    expect(await hasSeenCoachmark('enable-me')).toBe(true);
    expect(document.querySelector('.gv-coach')).toBeNull(); // torn down
  });

  it('does not swallow a click on the page while the guide is visible', async () => {
    const anchor = document.createElement('div');
    const pageButton = document.createElement('button');
    const onPageClick = vi.fn();
    pageButton.addEventListener('click', onPageClick);
    document.body.append(anchor, pageButton);

    const p = showCoachmark({ id: 'page-stays-live', anchor: () => anchor, body: 'intro' });
    await flush();
    await flush();

    pageButton.click();

    expect(onPageClick).toHaveBeenCalledOnce();
    expect(await p).toBe('dismissed');
  });

  it('resolves "dismissed" when the close button is clicked, and marks seen', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);

    const p = showCoachmark({
      id: 'dismiss-me',
      anchor: () => anchor,
      body: 'intro',
      dismissLabel: 'Done',
    });
    await flush();

    (document.querySelector('.gv-coach-close') as HTMLElement).click();

    const res = await p;
    expect(res).toBe('dismissed');
    expect(await hasSeenCoachmark('dismiss-me')).toBe(true);
  });

  it('reveals a preview element and unmounts it on close', async () => {
    const p = showCoachmark({
      id: 'with-preview',
      anchor: () => null, // fall back to the revealed element as the anchor
      reveal: {
        mount: () => {
          const el = document.createElement('div');
          el.className = 'prev';
          document.body.appendChild(el);
          return el;
        },
        unmount: (el) => el?.remove(),
      },
      body: 'intro',
    });
    await flush();
    expect(document.querySelector('.prev')).toBeTruthy();
    expect(document.querySelector('.gv-coach')).toBeTruthy();

    (document.querySelector('.gv-coach-close') as HTMLElement).click();
    await p;
    expect(document.querySelector('.prev')).toBeNull();
  });

  it('rolls back partial reveal setup when mount throws', async () => {
    const cleanup = vi.fn((el: HTMLElement | null) => {
      expect(el).toBeNull();
      document.querySelector('.partial-preview')?.remove();
    });

    const result = await showCoachmark({
      id: 'partial-preview',
      anchor: () => null,
      reveal: {
        mount: () => {
          const partial = document.createElement('div');
          partial.className = 'partial-preview';
          document.body.appendChild(partial);
          throw new Error('preview failed after setup');
        },
        unmount: cleanup,
      },
      body: 'intro',
    });

    expect(result).toBe('skipped');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(document.querySelector('.partial-preview')).toBeNull();
  });

  it('labels the dialog, focuses its action, and restores focus after explicit close', async () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    anchor.focus();

    const pending = showCoachmark({
      id: 'accessible-guide',
      anchor: () => anchor,
      title: 'New feature',
      body: 'Feature explanation',
      dismissLabel: 'Done',
      closeLabel: 'Close guide',
    });
    await flush();
    await flush();

    const dialog = document.querySelector<HTMLElement>('.gv-coach');
    const title = document.querySelector<HTMLElement>('.gv-coach-title');
    const body = document.querySelector<HTMLElement>('.gv-coach-body');
    const done = document.querySelector<HTMLElement>('.gv-coach-dismiss');
    const close = document.querySelector<HTMLButtonElement>('.gv-coach-close');

    expect(dialog?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(dialog?.getAttribute('aria-describedby')).toBe(body?.id);
    expect(close?.getAttribute('aria-label')).toBe('Close guide');
    expect(document.activeElement).toBe(done);

    close?.click();
    await pending;
    expect(document.activeElement).toBe(anchor);
  });

  it('does not show twice when once is left default (second call skips)', async () => {
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);

    const p1 = showCoachmark({ id: 'once-only', anchor: () => anchor, body: 'intro' });
    await flush();
    (document.querySelector('.gv-coach-close') as HTMLElement).click();
    await p1;

    const res2 = await showCoachmark({ id: 'once-only', anchor: () => anchor, body: 'intro' });
    expect(res2).toBe('skipped');
  });
});
