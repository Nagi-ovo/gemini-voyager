import React from 'react';

import type { TranslationKey } from '@/utils/translations';

import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import { ExperimentalBadge } from './ExperimentalBadge';

export interface SettingToggleRowProps {
  /** Input id; the label points at it. */
  id: string;
  /** Settings-search id handed to `isVisible`. */
  settingId: string;
  label: TranslationKey;
  hint?: TranslationKey;
  experimental?: boolean;
  /** Extra content under the hint, such as a permission call-to-action. */
  extra?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  isVisible: (settingId: string) => boolean;
  /** Leave the DOM instead of carrying `hidden`, for sections that always did. */
  unmountWhenHidden?: boolean;
  t: (key: TranslationKey) => string;
}

/** One labelled switch row of a popup settings card, hidden by site capability or search. */
export function SettingToggleRow({
  id,
  settingId,
  label,
  hint,
  experimental,
  extra,
  checked,
  disabled,
  onChange,
  isVisible,
  unmountWhenHidden,
  t,
}: SettingToggleRowProps) {
  const visible = isVisible(settingId);
  if (!visible && unmountWhenHidden) return null;
  const labelNode = (
    <Label
      htmlFor={id}
      className={`text-sm leading-5 font-medium${
        disabled ? ' text-muted-foreground cursor-not-allowed' : ' cursor-pointer'
      }${experimental ? ' flex items-center gap-1' : ''}`}
    >
      {t(label)}
      {experimental && <ExperimentalBadge title={t('experimentalLabel')} />}
    </Label>
  );
  return (
    <div hidden={!visible} className="group flex items-center justify-between gap-3">
      {/* min-w-0 lets a long label wrap instead of pushing into the switch. */}
      <div className="min-w-0 flex-1">
        {labelNode}
        {hint && <p className="text-muted-foreground mt-1 text-xs">{t(hint)}</p>}
        {extra}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}
