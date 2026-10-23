/**
 * A picked element's structure without its content: tag names, class names,
 * `role`, a few enumerated ARIA states, and `data-*` names with a value only
 * when it is a short token that cannot be text or an id. Text nodes are never
 * visited, and every attribute outside this allowlist (aria-label, title, alt,
 * placeholder, href, src, value, style, …) is dropped unread.
 */
import { LAYER_ATTR } from '@/core/ui/layer';

export const SKELETON_LIMITS = {
  /** Levels below the picked element. */
  depth: 4,
  /** Elements in the whole skeleton. */
  nodes: 60,
  /** Children shown per element; the rest are counted. */
  children: 8,
  /** Class names shown per element. */
  classes: 8,
  /** `data-*` attributes shown per element. */
  data: 6,
} as const;

/** Elements whose children are markup detail or code, never page structure worth reporting. */
const OPAQUE = new Set([
  'svg',
  'math',
  'script',
  'style',
  'template',
  'noscript',
  'iframe',
  'canvas',
]);
const ARIA_STATES = new Set([
  'aria-current',
  'aria-expanded',
  'aria-haspopup',
  'aria-hidden',
  'aria-pressed',
  'aria-selected',
  'aria-checked',
  'aria-disabled',
  'aria-busy',
  'aria-modal',
]);
const ENUM_VALUE = /^[a-z]{1,10}$/;
const CLASS_TOKEN = /^-?[A-Za-z_][\w\-:/.[\]%#()!@,=>]{0,47}$/;
const ROLE = /^[a-z]{1,20}$/;
/** A data value that names a state or kind ("assistant", "code-block", "true"). */
const DATA_TOKEN = /^[A-Za-z][A-Za-z-]{0,23}$/;
/** Data attribute names that name a kind or a state, whose token values are vocabulary. */
const ENUM_DATA_NAME = /(?:-role|-kind|-type|-state|-status|-variant|-mode|-side|test-?id)$/;
/** Data attribute names whose values are text or identity, whatever they look like. */
const TEXTUAL_DATA_NAME =
  /title|label|name|text|content|query|prompt|mail|user|account|author|tooltip|alt|desc|value|url|href|src|placeholder|message|chat|conv|session|token|key|id$/i;
const DATA_NAME = /^data-[a-z0-9_.:-]{1,40}$/;

/** One element of the skeleton, as `tag.class[attr]`; shared by the path and the tree. */
export function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const classes = Array.from(element.classList)
    .filter((token) => CLASS_TOKEN.test(token))
    .slice(0, SKELETON_LIMITS.classes);
  const parts = [tag, ...classes.map((token) => `.${token}`)];
  const role = element.getAttribute('role');
  if (role && ROLE.test(role)) parts.push(`[role=${role}]`);
  let data = 0;
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (ARIA_STATES.has(name)) {
      if (ENUM_VALUE.test(attribute.value)) parts.push(`[${name}=${attribute.value}]`);
      continue;
    }
    if (!DATA_NAME.test(name) || data >= SKELETON_LIMITS.data) continue;
    data += 1;
    const value = attribute.value;
    const vocabulary = ENUM_DATA_NAME.test(name) || !TEXTUAL_DATA_NAME.test(name);
    const safe = vocabulary && DATA_TOKEN.test(value);
    parts.push(safe ? `[${name}=${value}]` : `[${name}]`);
  }
  if (element.shadowRoot) parts.push('{shadow}');
  return parts.join('');
}

/** Voyager's own layers and plugin UI are not the host's structure. */
export function isVoyagerElement(element: Element): boolean {
  return (
    element.hasAttribute(LAYER_ATTR) ||
    Array.from(element.classList).some((token) => token.startsWith('gv-site-check'))
  );
}

export interface Skeleton {
  /** One line per element, indented two spaces per level. */
  readonly lines: readonly string[];
  /** A limit cut something off. */
  readonly truncated: boolean;
}

/** The sanitized subtree of `root`, within `SKELETON_LIMITS`. */
export function buildSkeleton(root: Element): Skeleton {
  const lines: string[] = [];
  let truncated = false;
  const visit = (element: Element, depth: number): void => {
    if (lines.length >= SKELETON_LIMITS.nodes) {
      truncated = true;
      return;
    }
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${describeElement(element)}`);
    if (OPAQUE.has(element.tagName.toLowerCase())) return;
    const children = Array.from(element.children).filter((child) => !isVoyagerElement(child));
    if (children.length === 0) return;
    if (depth >= SKELETON_LIMITS.depth) {
      lines.push(`${indent}  … ${children.length} more`);
      truncated = true;
      return;
    }
    const shown = children.slice(0, SKELETON_LIMITS.children);
    for (const child of shown) visit(child, depth + 1);
    const hidden = children.length - shown.length;
    if (hidden > 0) {
      lines.push(`${indent}  … ${hidden} more`);
      truncated = true;
    }
  };
  visit(root, 0);
  return { lines, truncated };
}

/** The picked element and its ancestors, outermost first, stopping below `body`. */
export function ancestorChain(element: Element, maxDepth = 6): Element[] {
  const chain: Element[] = [];
  let current: Element | null = element;
  while (current && chain.length <= maxDepth) {
    const tag = current.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') break;
    chain.unshift(current);
    // Cross an open shadow boundary to the host, as the page renders it.
    const parent: Element | null = current.parentElement;
    const root = current.getRootNode();
    current = parent ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return chain;
}
