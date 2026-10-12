import { StorageKeys } from '@/core/types/common';

import type { NativeFeatureToggle } from '../featureLifecycle';

export { claimPreventAutoScroll, startPreventAutoScrollBridge } from './bridge';

/** The claim follows this switch; the bridge runs whatever it says. */
export const PREVENT_AUTO_SCROLL_TOGGLE: NativeFeatureToggle = {
  key: StorageKeys.PREVENT_AUTO_SCROLL_ENABLED,
  isEnabled: (value) => value === true,
  areas: ['sync'],
};
