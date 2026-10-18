import { GRANT_MARGIN_MS, type OpContext } from '../opContext';
import type { PageData } from '../pageData/store';

/** The observer answers its arm at once; this covers a page still starting up. */
const OBSERVER_GRACE_MS = 3_000;

/**
 * Fail at once, before any page event, in a browser that cannot run the page
 * data observer (Firefox before 128): the op would otherwise wait out its
 * whole timeout for an answer that cannot come.
 */
export async function requirePageObserver(ctx: OpContext, pageData: PageData): Promise<void> {
  const seen = await ctx.waitFor(() => pageData.observing(), {
    timeoutMs: Math.max(
      0,
      Math.min(OBSERVER_GRACE_MS, ctx.grant.deadline - GRANT_MARGIN_MS - ctx.now()),
    ),
  });
  if (seen) return;
  ctx.fail(
    'unsupported-op',
    "This browser cannot watch ChatGPT's answers in the page; this needs Chrome, Edge, or Firefox 128 or later.",
    { reason: 'page-observer-missing' },
  );
}
