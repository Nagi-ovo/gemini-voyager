import type { EntitlementProvider, EntitlementState } from '../types';

/**
 * Default entitlement provider: everything the user has installed is usable.
 *
 * This is the seam for monetization. When the paid store ships, swap this for an
 * account-backed provider (Google sign-in + Stripe) that returns `entitled` /
 * `locked` per plugin. Keeping it behind this interface means the host/engine
 * never need to change.
 */
export class LocalEntitlementProvider implements EntitlementProvider {
  async getState(): Promise<EntitlementState> {
    return 'free';
  }
}
