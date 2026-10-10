import { type ObservedTurn, TurnOwnership } from './turnOwnership';

interface OwnershipSources {
  readonly routeId: () => string;
  readonly starId: () => string | null;
  readonly turnConversation?: (element: Element) => string | null | undefined;
}

/** Route-scoped DOM evidence survives engine replacement; it contains no timeline state. */
export class CatalogTurnOwnership {
  private observedRoute: string | null = null;
  private readonly owners: TurnOwnership;

  constructor(private readonly sources: OwnershipSources) {
    this.owners = new TurnOwnership(sources.starId);
  }

  /** Turns on the page now belong to the URL now; call before `recordInsertions`. */
  begin(): void {
    this.owners.begin();
  }

  /** Stamp what a mutation batch inserted with the conversation the URL names now. */
  recordInsertions(records: readonly MutationRecord[]): void {
    this.owners.recordInsertions(records.flatMap((record) => Array.from(record.addedNodes)));
  }

  observe(turns: readonly ObservedTurn[]): boolean {
    const routeId = this.sources.routeId();
    const changed = this.observedRoute !== null && routeId !== this.observedRoute;
    if (routeId !== this.observedRoute) this.owners.enterRoute(this.sources.starId());
    this.observedRoute = routeId;
    this.owners.observe(turns);
    return changed;
  }

  /**
   * Whether a star written now on this turn is backed by what is on screen:
   * the host's own conversation id for the turn where the site names one (the
   * only thing that grants then), else the conversation the turn entered the
   * page under.
   */
  canStar(element: Element): boolean {
    const conversationId = this.sources.starId();
    if (conversationId === null || this.sources.routeId() !== this.observedRoute) return false;
    const stated = this.sources.turnConversation?.(element);
    return stated !== undefined
      ? stated === conversationId
      : this.owners.allows(element, conversationId);
  }
}
