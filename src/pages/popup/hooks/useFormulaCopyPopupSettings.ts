import { useCallback, useRef, useState } from 'react';

import type { FormulaCopyFormat } from '@/features/formulaCopy/FormulaCopyService';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { LEGACY_ENABLE_BINDINGS } from '@/features/plugins/storage/legacySettingBindings';

// One switch for Gemini and AI Studio; both official ids share this binding.
const FORMULA_COPY_SWITCH = LEGACY_ENABLE_BINDINGS[OFFICIAL_PLUGIN_IDS.geminiFormulaCopy];

export interface FormulaCopyPopupSettings {
  enabled: boolean;
  format: FormulaCopyFormat;
  setEnabledFromUser: (enabled: boolean) => void;
  setFormatFromUser: (format: FormulaCopyFormat) => void;
  hydrateFromStorage: (storedEnabled: unknown, storedFormat: unknown) => void;
}

function isFormulaCopyFormat(value: unknown): value is FormulaCopyFormat {
  return (
    value === 'latex' || value === 'unicodemath' || value === 'no-dollar' || value === 'notion'
  );
}

export function useFormulaCopyPopupSettings(): FormulaCopyPopupSettings {
  const [enabled, setEnabled] = useState(true);
  const [format, setFormat] = useState<FormulaCopyFormat>('latex');
  const enabledTouchedRef = useRef(false);
  const formatTouchedRef = useRef(false);

  const setEnabledFromUser = useCallback((nextEnabled: boolean): void => {
    enabledTouchedRef.current = true;
    setEnabled(nextEnabled);
  }, []);

  const setFormatFromUser = useCallback((nextFormat: FormulaCopyFormat): void => {
    formatTouchedRef.current = true;
    setFormat(nextFormat);
  }, []);

  const hydrateFromStorage = useCallback((storedEnabled: unknown, storedFormat: unknown): void => {
    if (!enabledTouchedRef.current) setEnabled(FORMULA_COPY_SWITCH.read(storedEnabled));
    if (!formatTouchedRef.current && isFormulaCopyFormat(storedFormat)) {
      setFormat(storedFormat);
    }
  }, []);

  return { enabled, format, setEnabledFromUser, setFormatFromUser, hydrateFromStorage };
}
