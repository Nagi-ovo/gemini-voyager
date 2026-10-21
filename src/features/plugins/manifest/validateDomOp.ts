/**
 * Normalization of one `contributes.domOps` entry (UNTRUSTED input): its
 * selector target, the op-specific fields, and the bounded `native` params.
 * `validate.ts` runs every entry through `normalizeOp`, then checks its
 * templated values with `renderedOpIsSafe`.
 */
import { isValidSelectorSyntax } from '../sites/siteAdapterData';
import type { DomOperation, SelectorRef } from '../types';
import { PRIMITIVE_NAME_PATTERN } from '../verbs/contracts';
import { isRecord, isString, nonEmptyString } from './jsonGuards';
import { attributeIssue, attributeNameIssue, styleValueIssue } from './sinkGuards';
import type { ManifestIssue } from './validate';

/** Every `domOps[].op` the validator accepts; the authoring prompt lists these. */
export const OP_KINDS = ['addClass', 'setAttribute', 'setStyle', 'hide', 'native'] as const;
/** Bounds on `native` op params (UNTRUSTED configuration, never instructions). */
const MAX_PARAMS_DEPTH = 4;
const MAX_PARAMS_KEYS = 50;
const MAX_PARAM_STRING_LENGTH = 2_000;

/**
 * A raw CSS target that does not parse would make the engine skip the op on
 * every pass without a word, so it never gets past import.
 */
function parsedCss(selector: string, path: string, issues: ManifestIssue[]): SelectorRef | null {
  if (isValidSelectorSyntax(selector)) return { kind: 'css', selector };
  issues.push({ path, message: 'selector does not parse as CSS' });
  return null;
}

function normalizeSelector(
  raw: unknown,
  path: string,
  issues: ManifestIssue[],
): SelectorRef | null {
  if (isString(raw)) {
    if (raw.trim() === '') {
      issues.push({ path, message: 'selector string is empty' });
      return null;
    }
    return parsedCss(raw, path, issues);
  }
  if (isRecord(raw) && (raw.kind === 'css' || raw.kind === 'semantic')) {
    if (raw.kind === 'css') {
      if (!nonEmptyString(raw.selector)) {
        issues.push({ path: `${path}.selector`, message: 'required non-empty string' });
        return null;
      }
      return parsedCss(raw.selector, `${path}.selector`, issues);
    }
    if (!nonEmptyString(raw.key)) {
      issues.push({ path: `${path}.key`, message: 'required non-empty string' });
      return null;
    }
    return { kind: 'semantic', key: raw.key };
  }
  issues.push({ path, message: 'expected a selector string or {kind:"css"|"semantic"}' });
  return null;
}

/**
 * `native` op params are plain JSON configuration: primitives, arrays and
 * objects of those, bounded in depth, count and string length. Anything else
 * (functions cannot arrive through JSON, but prototype keys and oversized
 * blobs can) is rejected.
 */
function isPlainParamValue(value: unknown, depth: number): boolean {
  if (depth > MAX_PARAMS_DEPTH) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (typeof value === 'string') return value.length <= MAX_PARAM_STRING_LENGTH;
  if (Array.isArray(value)) {
    return (
      value.length <= MAX_PARAMS_KEYS && value.every((item) => isPlainParamValue(item, depth + 1))
    );
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    return (
      entries.length <= MAX_PARAMS_KEYS &&
      entries.every(
        ([key, item]) =>
          key !== '__proto__' &&
          key !== 'constructor' &&
          key !== 'prototype' &&
          isPlainParamValue(item, depth + 1),
      )
    );
  }
  return false;
}

function normalizeNativeOp(
  raw: Record<string, unknown>,
  path: string,
  issues: ManifestIssue[],
): DomOperation | null {
  if (!isString(raw.handler) || !PRIMITIVE_NAME_PATTERN.test(raw.handler)) {
    issues.push({ path: `${path}.handler`, message: 'must be a primitive name (camelCase)' });
    return null;
  }
  const params = raw.params === undefined ? {} : raw.params;
  if (!isRecord(params) || !isPlainParamValue(params, 0)) {
    issues.push({ path: `${path}.params`, message: 'must be a plain JSON object of bounded size' });
    return null;
  }
  return { op: 'native', handler: raw.handler, params };
}

export function normalizeOp(
  raw: unknown,
  path: string,
  issues: ManifestIssue[],
): DomOperation | null {
  if (!isRecord(raw) || !isString(raw.op) || !(OP_KINDS as readonly string[]).includes(raw.op)) {
    issues.push({ path: `${path}.op`, message: `must be one of ${OP_KINDS.join(', ')}` });
    return null;
  }
  if (raw.op === 'native') return normalizeNativeOp(raw, path, issues);
  const target = normalizeSelector(raw.target, `${path}.target`, issues);
  if (!target) return null;

  switch (raw.op) {
    case 'addClass':
      if (!nonEmptyString(raw.className)) {
        issues.push({ path: `${path}.className`, message: 'required non-empty string' });
        return null;
      }
      return { op: 'addClass', target, className: raw.className };
    case 'hide':
      return { op: 'hide', target };
    case 'setAttribute':
      if (!nonEmptyString(raw.name) || !isString(raw.value)) {
        issues.push({
          path,
          message: 'setAttribute requires a non-empty `name` and string `value`',
        });
        return null;
      }
      {
        const nameIssue = attributeNameIssue(raw.name);
        if (nameIssue) {
          issues.push({ path: `${path}.name`, message: nameIssue });
          return null;
        }
        const valueIssue = attributeIssue(raw.name, raw.value);
        if (valueIssue) {
          issues.push({ path: `${path}.value`, message: valueIssue });
          return null;
        }
      }
      return { op: 'setAttribute', target, name: raw.name, value: raw.value };
    case 'setStyle': {
      if (!isRecord(raw.styles)) {
        issues.push({ path: `${path}.styles`, message: 'required object of CSS prop -> value' });
        return null;
      }
      const styles: Record<string, string> = {};
      for (const [prop, value] of Object.entries(raw.styles)) {
        if (!isString(value)) {
          issues.push({ path: `${path}.styles.${prop}`, message: 'value must be a string' });
          return null;
        }
        const valueIssue = styleValueIssue(value);
        if (valueIssue) {
          issues.push({ path: `${path}.styles.${prop}`, message: valueIssue });
          return null;
        }
        styles[prop] = value;
      }
      return { op: 'setStyle', target, styles };
    }
    default:
      return null;
  }
}

/** Check an op's templated values rendered with the setting defaults. */
export function renderedOpIsSafe(
  op: DomOperation,
  render: (value: string) => string,
  path: string,
  issues: ManifestIssue[],
): boolean {
  if (op.op === 'setAttribute') {
    const issue = attributeIssue(op.name, render(op.value));
    if (issue) issues.push({ path: `${path}.value`, message: issue });
    return issue === null;
  }
  if (op.op === 'setStyle') {
    let safe = true;
    for (const [prop, value] of Object.entries(op.styles)) {
      const issue = styleValueIssue(render(value));
      if (issue) {
        issues.push({ path: `${path}.styles.${prop}`, message: issue });
        safe = false;
      }
    }
    return safe;
  }
  return true;
}
