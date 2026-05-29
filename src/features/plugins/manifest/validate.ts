/**
 * Manifest validation + normalization.
 *
 * Plugins from a remote marketplace are UNTRUSTED input. This validator turns an
 * arbitrary `unknown` into a typed `PluginManifest` (or a list of issues),
 * normalizing authoring sugar along the way (a bare selector string becomes a
 * `{kind:'css'}` ref). Custom type guards are used instead of a schema library
 * to avoid adding a runtime dependency (the codebase has no zod).
 */
import type { Result } from '@/core/types/common';

import { MAX_DOM_OPS, MAX_STYLE_LENGTH } from '../constants';
import type {
  DomOperation,
  PluginContributions,
  PluginManifest,
  PluginTheme,
  PluginTier,
  SelectorRef,
  SettingField,
  SettingsSchema,
  StyleContribution,
} from '../types';

const SETTING_TYPES = ['boolean', 'number', 'string', 'color', 'select'] as const;

export interface ManifestIssue {
  readonly path: string;
  readonly message: string;
}

const TIERS = ['declarative', 'scripted'] as const;
const OP_KINDS = ['addClass', 'setAttribute', 'setStyle', 'hide'] as const;
const REQUIRED_STRINGS = [
  'id',
  'name',
  'version',
  'description',
  'author',
  'category',
  'license',
  'engine',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Accept ONLY hex colours for a plugin-declared brand. The value is injected
 * into a CSS custom property and string-concatenated into a `color-mix(...)`
 * expression at runtime, so anything other than a strict hex literal (3/4/6/8
 * digits) could break out of the value context — reject it.
 */
function isHexColor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
  );
}

/**
 * Reject CSS that can fetch remote resources — `@import` and external `url()`
 * (http(s):// or protocol-relative //). A declarative plugin is meant to be
 * self-contained data; remote fetches enable tracking/exfiltration and defeat
 * the "no remotely-hosted code/resources" posture. `data:` URIs stay allowed.
 */
function cssHasRemoteResource(css: string): boolean {
  if (/@import\b/i.test(css)) return true;
  if (/url\(\s*['"]?\s*(?:https?:)?\/\//i.test(css)) return true;
  return false;
}

/** Event-handler attributes (`onclick`, `onload`, …) inject executable code. */
function isEventHandlerAttribute(name: string): boolean {
  return /^on/i.test(name);
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
    return { kind: 'css', selector: raw };
  }
  if (isRecord(raw) && (raw.kind === 'css' || raw.kind === 'semantic')) {
    if (raw.kind === 'css') {
      if (!nonEmptyString(raw.selector)) {
        issues.push({ path: `${path}.selector`, message: 'required non-empty string' });
        return null;
      }
      return { kind: 'css', selector: raw.selector };
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

function normalizeOp(raw: unknown, path: string, issues: ManifestIssue[]): DomOperation | null {
  if (!isRecord(raw) || !isString(raw.op) || !(OP_KINDS as readonly string[]).includes(raw.op)) {
    issues.push({ path: `${path}.op`, message: `must be one of ${OP_KINDS.join(', ')}` });
    return null;
  }
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
      if (isEventHandlerAttribute(raw.name)) {
        issues.push({
          path: `${path}.name`,
          message: 'event-handler attributes (on*) are not allowed',
        });
        return null;
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
        styles[prop] = value;
      }
      return { op: 'setStyle', target, styles };
    }
    default:
      return null;
  }
}

function normalizeContributions(raw: unknown, issues: ManifestIssue[]): PluginContributions {
  if (!isRecord(raw)) {
    issues.push({ path: 'contributes', message: 'required object' });
    return {};
  }
  const result: {
    styles?: StyleContribution[];
    domOps?: DomOperation[];
    settings?: SettingsSchema;
  } = {};

  if (raw.styles !== undefined) {
    if (!Array.isArray(raw.styles)) {
      issues.push({ path: 'contributes.styles', message: 'must be an array' });
    } else {
      const styles: StyleContribution[] = [];
      raw.styles.forEach((entry, index) => {
        if (!isRecord(entry) || !isString(entry.css)) {
          issues.push({ path: `contributes.styles[${index}].css`, message: 'required string' });
          return;
        }
        if (entry.css.length > MAX_STYLE_LENGTH) {
          issues.push({
            path: `contributes.styles[${index}].css`,
            message: `exceeds ${MAX_STYLE_LENGTH} chars`,
          });
          return;
        }
        if (cssHasRemoteResource(entry.css)) {
          issues.push({
            path: `contributes.styles[${index}].css`,
            message: 'must not use @import or external url() (remote-resource fetch)',
          });
          return;
        }
        styles.push({ css: entry.css });
      });
      result.styles = styles;
    }
  }

  if (raw.domOps !== undefined) {
    if (!Array.isArray(raw.domOps)) {
      issues.push({ path: 'contributes.domOps', message: 'must be an array' });
    } else {
      if (raw.domOps.length > MAX_DOM_OPS) {
        issues.push({ path: 'contributes.domOps', message: `exceeds max of ${MAX_DOM_OPS}` });
      }
      const ops: DomOperation[] = [];
      raw.domOps.slice(0, MAX_DOM_OPS).forEach((rawOp, index) => {
        const op = normalizeOp(rawOp, `contributes.domOps[${index}]`, issues);
        if (op) ops.push(op);
      });
      result.domOps = ops;
    }
  }

  if (raw.settings !== undefined) {
    if (!isRecord(raw.settings)) {
      issues.push({ path: 'contributes.settings', message: 'must be an object' });
    } else {
      const settings: Record<string, SettingField> = {};
      for (const [key, rawField] of Object.entries(raw.settings)) {
        const path = `contributes.settings.${key}`;
        if (
          !isRecord(rawField) ||
          !isString(rawField.type) ||
          !(SETTING_TYPES as readonly string[]).includes(rawField.type)
        ) {
          issues.push({
            path: `${path}.type`,
            message: `must be one of ${SETTING_TYPES.join(', ')}`,
          });
          continue;
        }
        if (!nonEmptyString(rawField.label)) {
          issues.push({ path: `${path}.label`, message: 'required non-empty string' });
          continue;
        }
        const fallback = rawField.default;
        if (
          typeof fallback !== 'boolean' &&
          typeof fallback !== 'number' &&
          typeof fallback !== 'string'
        ) {
          issues.push({ path: `${path}.default`, message: 'required boolean | number | string' });
          continue;
        }
        settings[key] = {
          type: rawField.type as SettingField['type'],
          label: rawField.label,
          default: fallback,
          ...(typeof rawField.min === 'number' ? { min: rawField.min } : {}),
          ...(typeof rawField.max === 'number' ? { max: rawField.max } : {}),
          ...(Array.isArray(rawField.options)
            ? {
                options: rawField.options.filter(
                  (option): option is { value: string; label: string } =>
                    isRecord(option) && isString(option.value) && isString(option.label),
                ),
              }
            : {}),
        };
      }
      result.settings = settings;
    }
  }

  return result;
}

export function validateManifest(input: unknown): Result<PluginManifest, ManifestIssue[]> {
  if (!isRecord(input)) {
    return { success: false, error: [{ path: '', message: 'manifest must be an object' }] };
  }
  const issues: ManifestIssue[] = [];

  for (const key of REQUIRED_STRINGS) {
    if (!nonEmptyString(input[key]))
      issues.push({ path: key, message: 'required non-empty string' });
  }
  if (!isString(input.tier) || !(TIERS as readonly string[]).includes(input.tier)) {
    issues.push({ path: 'tier', message: `must be one of ${TIERS.join(', ')}` });
  }
  if (
    !Array.isArray(input.matches) ||
    input.matches.length === 0 ||
    !input.matches.every(nonEmptyString)
  ) {
    issues.push({ path: 'matches', message: 'must be a non-empty array of non-empty strings' });
  }

  const contributes = normalizeContributions(input.contributes, issues);

  let theme: PluginTheme | undefined;
  if (input.theme !== undefined) {
    if (!isRecord(input.theme) || !isHexColor(input.theme.brand)) {
      issues.push({ path: 'theme.brand', message: 'must be a hex colour string (e.g. #d97757)' });
    } else {
      theme = { brand: input.theme.brand };
    }
  }

  if (issues.length > 0) return { success: false, error: issues };

  const manifest: PluginManifest = {
    id: input.id as string,
    name: input.name as string,
    version: input.version as string,
    description: input.description as string,
    author: input.author as string,
    category: input.category as string,
    license: input.license as string,
    homepage: isString(input.homepage) ? input.homepage : undefined,
    engine: input.engine as string,
    tier: input.tier as PluginTier,
    matches: (input.matches as string[]).slice(),
    contributes,
    ...(theme ? { theme } : {}),
  };
  return { success: true, data: manifest };
}
