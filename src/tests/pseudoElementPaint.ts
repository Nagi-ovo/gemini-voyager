/**
 * Resolves whether an element's `::before` paints under the real stylesheets,
 * and what an element's own property cascades to. jsdom implements neither
 * `getComputedStyle(el, '::before')` nor selector specificity, so this applies
 * the cascade (importance, specificity, source order) to the matching rules.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Specificity = readonly [number, number, number];

interface Candidate {
  value: string;
  important: boolean;
  specificity: Specificity;
  order: number;
}

/** Top-level comma split; our selectors only nest commas inside `:not()`/`:is()`. */
function splitSelectorList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const char = list[i];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts;
}

function specificity(selector: string): Specificity {
  // `:not(x)` counts as its argument; attribute values may hold dots.
  const plain = selector.replace(/:(not|is)\(/g, '(').replace(/\[[^\]]*\]/g, '[]');
  const ids = plain.match(/#[\w-]+/g)?.length ?? 0;
  const classes =
    (plain.match(/\.[\w-]+/g)?.length ?? 0) +
    (plain.match(/\[\]/g)?.length ?? 0) +
    (plain.match(/(^|[^:]):[\w-]+/g)?.length ?? 0);
  const types = plain.match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g)?.length ?? 0;
  return [ids, classes, types];
}

function outranks(a: Candidate, b: Candidate): boolean {
  if (a.important !== b.important) return a.important;
  for (let i = 0; i < 3; i += 1) {
    if (a.specificity[i] !== b.specificity[i]) return a.specificity[i] > b.specificity[i];
  }
  return a.order > b.order;
}

/** Load stylesheets from the repo into the document; returns the cleanup. */
export function injectStylesheets(...paths: string[]): () => void {
  const style = document.createElement('style');
  style.textContent = paths
    .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
    .join('\n');
  document.head.appendChild(style);
  return () => style.remove();
}

/** Whether `selector` matches `element`; jsdom rejects some selectors (`:has()` in places). */
function matchesSafe(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

/** Cascaded value of `property` on `element`, or its `pseudo` part; `@media` blocks are ignored. */
function cascadedValue(element: Element, property: string, pseudo: '' | '::before'): string | null {
  let winner: Candidate | null = null;
  let order = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const value = rule.style.getPropertyValue(property);
      order += 1;
      if (!value) continue;
      for (const selector of splitSelectorList(rule.selectorText)) {
        if (pseudo ? !selector.endsWith(pseudo) : selector.includes('::')) continue;
        const host = pseudo ? selector.slice(0, -pseudo.length) : selector;
        if (!matchesSafe(element, host)) continue;
        const candidate: Candidate = {
          value: value.trim(),
          important: rule.style.getPropertyPriority(property) === 'important',
          specificity: specificity(host),
          order,
        };
        if (!winner || outranks(candidate, winner)) winner = candidate;
      }
    }
  }
  return winner?.value ?? null;
}

/** Cascaded value of `property` on `element::before`; `@media` blocks are ignored. */
export function beforeValue(element: Element, property: string): string | null {
  return cascadedValue(element, property, '::before');
}

/** Cascaded value of `property` on `element` itself; `@media` blocks are ignored. */
export function elementValue(element: Element, property: string): string | null {
  return cascadedValue(element, property, '');
}

/** A `::before` paints when a rule gives it content and nothing hides it. */
export function beforePaints(element: Element): boolean {
  const content = beforeValue(element, 'content');
  if (!content || content === 'none' || content === 'normal') return false;
  if (beforeValue(element, 'display') === 'none') return false;
  const opacity = beforeValue(element, 'opacity');
  return opacity === null || Number.parseFloat(opacity) > 0;
}
