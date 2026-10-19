import { type ChangeEvent, useEffect, useState } from 'react';

import {
  compatibleSettingWrite,
  resolvePluginSettings,
  unavailableChoices,
} from '@/features/plugins/runtime/resolvePluginSettings';
import type { PluginManifest, PluginSettingValue } from '@/features/plugins/types';

import { Switch } from '../../../components/ui/switch';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ExperimentalBadge } from './ExperimentalBadge';
import { pickLocalized, pickLocalizedSetting } from './PluginIdentity';

interface NumberSettingProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}

/**
 * A range slider alone cannot set a small value on a wide range (the Pro weekly
 * allowance is 0–10,000 but useful values are 50/100/200), so the number input
 * is the precise path. A draft lets the person clear or overshoot while typing;
 * valid values update the slider immediately, invalid ones clamp on blur.
 */
function NumberSetting({ label, value, min, max, disabled, onChange }: NumberSettingProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const raw = event.target.value;
    setDraft(raw);
    if (raw.trim() === '') return;
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    const rounded = Math.round(next);
    if (rounded >= min && rounded <= max) onChange(rounded);
  };

  const handleBlur = (): void => {
    const next = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft}
      disabled={disabled}
      inputMode="numeric"
      aria-label={label}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="bg-background border-border focus:ring-primary/50 w-16 shrink-0 rounded-md border px-1.5 py-0.5 text-right text-[11px] tabular-nums transition-all focus:ring-2 disabled:cursor-not-allowed"
    />
  );
}

interface PluginSettingsProps {
  readonly plugin: PluginManifest;
  readonly values?: Record<string, PluginSettingValue>;
  /** Fields already offered by a visible dedicated settings card. */
  readonly hiddenKeys?: readonly string[];
  readonly handleSetting: (id: string, key: string, value: PluginSettingValue) => void;
  readonly handleImmediateSettings: (
    id: string,
    values: Readonly<Record<string, PluginSettingValue>>,
  ) => void;
}

export function PluginSettings({
  plugin,
  values,
  hiddenKeys,
  handleSetting,
  handleImmediateSettings,
}: PluginSettingsProps) {
  const { language, t } = useLanguage();
  const settingsSchema = plugin.contributes.settings;
  const localizedName = pickLocalized(plugin, 'name', language);
  const resolved = resolvePluginSettings(plugin, values);
  if (!settingsSchema) return null;
  const entries = Object.entries(settingsSchema).filter(([key]) => !hiddenKeys?.includes(key));
  if (entries.length === 0) return null;
  const writeNow = (key: string, value: PluginSettingValue) =>
    handleImmediateSettings(plugin.id, compatibleSettingWrite(plugin, { key, value }).stored);
  return (
    <div className="mt-2 space-y-2.5" role="group" aria-label={localizedName}>
      {entries.map(([key, field]) => {
        const rawValue = resolved[key];
        const localized = pickLocalizedSetting(plugin, key, field, language);
        const settingText = field.messageKeys
          ? { ...localized, label: t(field.messageKeys.label) }
          : localized;
        const hint = field.messageKeys?.hint ? t(field.messageKeys.hint) : undefined;
        // CSS-gated controls must stay inert until their controlling switch is on.
        const disabled = field.enabledBy !== undefined && resolved[field.enabledBy] !== true;

        if (field.type === 'boolean') {
          const checked = rawValue === true;
          return (
            <div
              key={key}
              className={`flex justify-between gap-3 ${hint ? 'items-start' : 'items-center'}`}
            >
              <span className={`min-w-0 ${disabled ? 'opacity-50' : ''}`}>
                <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                  {settingText.label}
                  {field.experimental && <ExperimentalBadge title={t('experimentalLabel')} />}
                </span>
                {hint && (
                  <span className="text-muted-foreground/80 mt-0.5 block text-[10px] leading-snug">
                    {hint}
                  </span>
                )}
              </span>
              <Switch
                checked={checked}
                disabled={disabled}
                aria-label={settingText.label}
                onChange={(event) => writeNow(key, event.target.checked)}
              />
            </div>
          );
        }

        if (field.type === 'select') {
          const unavailable = unavailableChoices(plugin, resolved, key);
          return (
            <label
              key={key}
              className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-50' : ''}`}
            >
              <span className="text-muted-foreground text-[11px]">{settingText.label}</span>
              <select
                value={String(rawValue)}
                disabled={disabled}
                onChange={(event) => writeNow(key, event.target.value)}
                className="bg-background border-border focus:ring-primary/50 min-w-0 rounded-md border px-2 py-1 text-[11px] transition-all focus:ring-2 disabled:cursor-not-allowed"
              >
                {settingText.options?.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={unavailable.has(option.value)}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (field.type !== 'number') return null;
        const value = Number(rawValue);
        const min = field.min ?? 0;
        const max = field.max ?? 100;
        return (
          <div
            key={key}
            title={`${settingText.label}: ${value}`}
            className={disabled ? 'opacity-50' : undefined}
          >
            <div className="text-muted-foreground mb-1 flex items-center justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate">{settingText.label}</span>
              <NumberSetting
                label={settingText.label}
                value={value}
                min={min}
                max={max}
                disabled={disabled}
                onChange={(next) => handleSetting(plugin.id, key, next)}
              />
            </div>
            <div className="flex items-center gap-2">
              {settingText.minLabel && (
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  {settingText.minLabel}
                </span>
              )}
              <input
                type="range"
                min={min}
                max={max}
                value={value}
                disabled={disabled}
                aria-label={settingText.label}
                onChange={(e) => handleSetting(plugin.id, key, Number(e.target.value))}
                className="accent-primary h-1.5 flex-1 cursor-pointer disabled:cursor-not-allowed"
              />
              {settingText.maxLabel && (
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  {settingText.maxLabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
