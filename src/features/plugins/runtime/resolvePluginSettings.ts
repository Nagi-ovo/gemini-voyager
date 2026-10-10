import type { PluginManifest, PluginSettings, PluginSettingValue, SettingField } from '../types';

function declaresChoice(field: SettingField, value: unknown): value is string {
  return typeof value === 'string' && (field.options ?? []).some((o) => o.value === value);
}

/** The timeline style select that replaced the `compactView` switch, when `manifest` declares it. */
function legacyTimelineStyle(manifest: PluginManifest): SettingField | undefined {
  const schema = manifest.contributes.settings;
  const field = schema?.timelineStyle;
  if (field?.type !== 'select') return undefined;
  const isTimeline = manifest.contributes.domOps?.some(
    (op) => op.op === 'native' && op.handler === 'turnNavigator',
  );
  return isTimeline ? field : undefined;
}

/** Resolve the same settings for the popup and the running plugin. */
export function resolvePluginSettings(
  manifest: PluginManifest,
  stored: PluginSettings = {},
): PluginSettings {
  const schema = manifest.contributes.settings;
  if (!schema) return stored;
  const resolved: Record<string, PluginSettingValue> = {};
  for (const [key, field] of Object.entries(schema)) {
    const value = stored[key];
    // A choice the manifest no longer offers would run on the host while the
    // popup's select showed another one.
    if (field.type === 'select') {
      resolved[key] = declaresChoice(field, value) ? value : field.default;
    } else {
      resolved[key] = value ?? field.default;
    }
  }
  // The new default must not erase a compact preference saved by the old control.
  const style = legacyTimelineStyle(manifest);
  if (
    style &&
    declaresChoice(style, 'compact') &&
    stored.timelineStyle === undefined &&
    stored.compactView === true
  ) {
    resolved.timelineStyle = 'compact';
  }
  return resolved;
}

export interface PluginSettingWrite {
  readonly key: string;
  readonly value: PluginSettingValue;
}

/**
 * The setting `manifest` checks for `write` (`checked`) and the values one
 * storage write records for it (`stored`).
 */
export function compatibleSettingWrite(
  manifest: PluginManifest,
  write: PluginSettingWrite,
): { readonly checked: PluginSettingWrite; readonly stored: Record<string, PluginSettingValue> } {
  const required = manifest.contributes.settings?.[write.key]?.requiresChoice;
  if (required && write.value === true) {
    const choice = compatibleSettingWrite(manifest, {
      key: required.setting,
      value: required.value,
    });
    return { checked: write, stored: { ...choice.stored, [write.key]: true } };
  }
  const style = legacyTimelineStyle(manifest);
  if (!style || manifest.contributes.settings?.compactView) {
    return { checked: write, stored: { [write.key]: write.value } };
  }
  // A page running the previous manifest stays pinned until reload: its guide
  // still sends `compactView`, and its host reads `compactView` again after a
  // disable/re-enable, so the switch is translated in and mirrored out.
  let checked = write;
  if (write.key === 'compactView' && typeof write.value === 'boolean') {
    if (!write.value) checked = { key: 'timelineStyle', value: style.default };
    else if (declaresChoice(style, 'compact')) checked = { key: 'timelineStyle', value: 'compact' };
  }
  if (checked.key !== 'timelineStyle' || typeof checked.value !== 'string') {
    return { checked, stored: { [checked.key]: checked.value } };
  }
  return {
    checked,
    stored: { timelineStyle: checked.value, compactView: checked.value === 'compact' },
  };
}

/** Choices of the select `key` ruled out while a `requiresChoice` boolean is on. */
export function unavailableChoices(
  manifest: PluginManifest,
  resolved: PluginSettings,
  key: string,
): ReadonlySet<string> {
  const schema = manifest.contributes.settings ?? {};
  const unavailable = new Set<string>();
  for (const [name, field] of Object.entries(schema)) {
    const rule = field.requiresChoice;
    if (rule?.setting !== key || resolved[name] !== true) continue;
    for (const option of schema[key]?.options ?? []) {
      if (option.value !== rule.value) unavailable.add(option.value);
    }
  }
  return unavailable;
}
