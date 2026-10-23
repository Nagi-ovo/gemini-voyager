import { useEffect, useState } from 'react';

import { type FormFactor, readPlatformFormFactor } from '@/core/utils/formFactor';

/**
 * The device class the popup runs on, read from the system; null until known.
 * On Firefox for Android the popup is a tab of its own, so it works this out
 * itself instead of waiting for the page's plugin statuses.
 */
export function usePopupFormFactor(): FormFactor | null {
  const [formFactor, setFormFactor] = useState<FormFactor | null>(null);
  useEffect(() => {
    let active = true;
    void readPlatformFormFactor().then((read) => {
      if (active) setFormFactor(read);
    });
    return () => {
      active = false;
    };
  }, []);
  return formFactor;
}
