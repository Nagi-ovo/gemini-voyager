/**
 * Turns plugin inline-style writes into the longhand declarations the browser
 * would store, so the engine's style ledger owns each longhand exactly once.
 */

/** `[property, value, priority]`, priority being `'important'` or `''`. */
export type StyleDeclaration = [string, string, string];

const IMPORTANT_SUFFIX = /\s*!\s*important\s*$/i;

export class InlineStyleParser {
  private readonly scratch: CSSStyleDeclaration;
  private readonly longhands = new Map<string, boolean>();
  private readonly affected = new Map<string, readonly string[]>();

  constructor(doc: Document) {
    this.scratch = doc.createElement('span').style;
  }

  /** Declarations of a whole `style` attribute value. */
  parse(text: string): StyleDeclaration[] {
    this.scratch.cssText = text;
    return this.readLonghands();
  }

  /** Declarations one `setStyle` entry writes; a trailing `!important` is its priority. */
  property(prop: string, raw: string): StyleDeclaration[] {
    const priority = IMPORTANT_SUFFIX.test(raw) ? 'important' : '';
    const value = raw.replace(IMPORTANT_SUFFIX, '');
    this.scratch.cssText = '';
    this.scratch.setProperty(prop, value, priority);
    const declarations = this.readLonghands();
    // A var() shorthand leaves its longhands pending ('' until computed): keep it whole.
    if (declarations.length > 1 && declarations.some(([, longhand]) => longhand === '')) {
      return [[prop, value, priority]];
    }
    return declarations;
  }

  /** A shorthand's footprint is independent of its value, including unresolved var(). */
  properties(prop: string): readonly string[] {
    const cached = this.affected.get(prop);
    if (cached) return cached;
    this.scratch.cssText = '';
    this.scratch.setProperty(prop, 'initial');
    const expanded = Array.from({ length: this.scratch.length }, (_, i) => this.scratch.item(i));
    // jsdom also enumerates shorthands; only retain the leaf properties they write.
    const properties = expanded.filter((name) => {
      this.scratch.cssText = '';
      this.scratch.setProperty(name, 'initial');
      return this.scratch.length <= 1;
    });
    this.affected.set(prop, properties);
    return properties;
  }

  private readLonghands(): StyleDeclaration[] {
    const style = this.scratch;
    const declared: StyleDeclaration[] = [];
    for (let i = 0; i < style.length; i += 1) {
      const prop = style.item(i);
      declared.push([prop, style.getPropertyValue(prop), style.getPropertyPriority(prop)]);
    }
    return declared.filter(([prop, value]) => this.isLonghand(prop, value));
  }

  /** Browsers list only longhands; jsdom also lists the shorthands it expanded. */
  private isLonghand(prop: string, value: string): boolean {
    let longhand = this.longhands.get(prop);
    if (longhand === undefined) {
      // Safe to reuse the scratch: readLonghands has already copied its declarations.
      this.scratch.cssText = '';
      this.scratch.setProperty(prop, value);
      longhand = this.scratch.length <= 1;
      this.longhands.set(prop, longhand);
    }
    return longhand;
  }
}
