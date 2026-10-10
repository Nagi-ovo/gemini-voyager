/**
 * JSON as the authoring material shows it: short objects and arrays on one
 * line, longer ones expanded, the way a person formats a manifest. The output
 * is always valid JSON and parses back to the same value.
 */

const MAX_INLINE_WIDTH = 80;

/** `{"a":[1]}` as `{ "a": [1] }`. */
export function inlineJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const body = entries.map(([key, item]) => `${JSON.stringify(key)}: ${inlineJson(item)}`);
    return `{ ${body.join(', ')} }`;
  }
  return JSON.stringify(value);
}

/** Indented JSON that keeps any value fitting in the line width on one line. */
export function formatJson(value: unknown, indent = ''): string {
  const inline = inlineJson(value);
  if (indent.length + inline.length <= MAX_INLINE_WIDTH || typeof value !== 'object') {
    return inline;
  }
  if (value === null) return 'null';
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => `${inner}${formatJson(item, inner)}`).join(',\n')}\n${indent}]`;
  }
  const lines = Object.entries(value).map(
    ([key, item]) => `${inner}${JSON.stringify(key)}: ${formatJson(item, inner)}`,
  );
  return `{\n${lines.join(',\n')}\n${indent}}`;
}
