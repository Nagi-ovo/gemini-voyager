import type { Result } from '@/core/types/common';

import type { PluginSettings, SettingsSchema } from '../types';

/** Fixed introduction floor: later releases must not advance this feature's requirement. */
export const NATIVE_PARAM_SETTINGS_SINCE_ENGINE = '1.8.0';

const SETTING_TOKEN = /\{\{([^{}]+)\}\}/g;

export interface NativeParamSettingReference {
  readonly key: string;
  readonly path: string;
  readonly wholeValue: boolean;
}

export interface NativeParamSettingIssue {
  readonly path: string;
  readonly message: string;
}

/** Inspect JSON value leaves only; object keys are configuration, never templates. */
export function collectNativeParamSettingReferences(
  params: Readonly<Record<string, unknown>>,
  path = 'params',
): NativeParamSettingReference[] {
  const references: NativeParamSettingReference[] = [];
  const visit = (value: unknown, valuePath: string): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(SETTING_TOKEN)) {
        references.push({
          key: match[1],
          path: valuePath,
          wholeValue: match[0] === value,
        });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${valuePath}[${index}]`));
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, item] of Object.entries(value)) visit(item, `${valuePath}.${key}`);
    }
  };
  visit(params, path);
  return references;
}

export function hasNativeParamTemplates(params: Readonly<Record<string, unknown>>): boolean {
  return collectNativeParamSettingReferences(params).length > 0;
}

export function nativeParamSettingIssues(
  params: Readonly<Record<string, unknown>>,
  schema: SettingsSchema | undefined,
  path = 'params',
): NativeParamSettingIssue[] {
  return collectNativeParamSettingReferences(params, path)
    .filter(({ key }) => !schema || !Object.hasOwn(schema, key))
    .map(({ key, path: referencePath }) => ({
      path: referencePath,
      message: `unknown setting "${key}"; must refer to a setting in the same plugin`,
    }));
}

/**
 * Resolve string leaves once: an exact token keeps the setting's type, while
 * embedded tokens stringify it. The primitive must validate the rendered params.
 */
export function renderNativeParams(
  params: Readonly<Record<string, unknown>>,
  schema: SettingsSchema | undefined,
  settings: PluginSettings,
  path = 'params',
): Result<Readonly<Record<string, unknown>>, NativeParamSettingIssue[]> {
  const issues = nativeParamSettingIssues(params, schema, path);
  if (issues.length > 0) return { success: false, error: issues };

  const settingValue = (key: string): string | number | boolean => {
    // References were checked above; inherited storage values never override a declared default.
    const fallback = schema![key].default;
    return Object.hasOwn(settings, key) ? (settings[key] ?? fallback) : fallback;
  };
  const render = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const matches = Array.from(value.matchAll(SETTING_TOKEN));
      if (matches.length === 1 && matches[0][0] === value) return settingValue(matches[0][1]);
      // A single replace pass prevents a setting value from expanding a second token.
      return value.replace(SETTING_TOKEN, (_token, key: string) => String(settingValue(key)));
    }
    if (Array.isArray(value)) return value.map(render);
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, render(item)]));
    }
    return value;
  };
  return {
    success: true,
    data: Object.fromEntries(Object.entries(params).map(([key, value]) => [key, render(value)])),
  };
}
