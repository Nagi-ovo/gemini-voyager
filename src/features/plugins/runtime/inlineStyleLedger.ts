import type { StyleDeclaration } from './inlineStyleDeclarations';

interface StyleWrite {
  readonly id: string;
  readonly declaration: StyleDeclaration;
  readonly properties: readonly string[];
}

/** One element's original longhands and ordered plugin declarations. */
export class InlineStyleLedger {
  private readonly originals = new Map<string, StyleDeclaration>();
  private readonly noHostAttribute: boolean;
  private writes: StyleWrite[] = [];

  constructor(private readonly el: HTMLElement) {
    this.noHostAttribute = !el.hasAttribute('style');
  }

  set(id: string, declaration: StyleDeclaration, properties: readonly string[]): void {
    // Capture every side before a var() shorthand hides its values from CSSOM.
    for (const prop of properties) {
      if (!this.originals.has(prop)) {
        this.originals.set(prop, [
          prop,
          this.el.style.getPropertyValue(prop),
          this.el.style.getPropertyPriority(prop),
        ]);
      }
    }
    this.writes = this.writes.filter(
      (write) => write.id !== id || write.declaration[0] !== declaration[0],
    );
    this.writes.push({ id, declaration, properties });
    this.el.style.setProperty(...declaration);
  }

  /** Returns true when no plugin owns styles on this element anymore. */
  release(id: string): boolean {
    const remaining = this.writes.filter((write) => write.id !== id);
    if (remaining.length === this.writes.length) return false;

    this.restore();
    this.writes = remaining;
    // A surviving var() shorthand may overlap any longhand: replay in write order.
    for (const write of remaining) this.el.style.setProperty(...write.declaration);

    const owned = new Set(remaining.flatMap((write) => write.properties));
    for (const prop of this.originals.keys()) {
      if (!owned.has(prop)) this.originals.delete(prop);
    }
    return remaining.length === 0;
  }

  /** Also used before forgetting detached elements, which a host may reattach. */
  restore(): void {
    for (const write of this.writes) {
      if (write.properties.length > 1) this.el.style.removeProperty(write.declaration[0]);
    }
    for (const declaration of this.originals.values()) {
      if (declaration[1]) this.el.style.setProperty(...declaration);
      else this.el.style.removeProperty(declaration[0]);
    }
    if (this.noHostAttribute && this.el.getAttribute('style') === '') {
      this.el.removeAttribute('style');
    }
  }
}
