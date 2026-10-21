import { logger } from '@/core/services/LoggerService';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

/**
 * The host's single operation chain. Reconcile and catalog reloads are async
 * (entitlement/storage awaits); running two passes concurrently lets a stale
 * pass mount what a newer pass just unmounted.
 */
export class OpChain {
  private tail: Promise<void> = Promise.resolve();

  /**
   * Append work. Returns the RAW operation promise so awaiting callers (start)
   * observe the pass's own failure; the chain itself continues through a
   * caught tail, so one failed pass never poisons ordering and fire-and-forget
   * callers never leak an unhandled rejection (the tail's catch is attached to
   * the same promise they discard).
   */
  enqueue(work: () => Promise<void>): Promise<void> {
    const op = this.tail.then(work);
    this.tail = op.catch((error) => {
      if (isExtensionContextInvalidatedError(error)) return;
      logger.error('PluginHost operation failed', { error: String(error) });
    });
    return op;
  }
}
