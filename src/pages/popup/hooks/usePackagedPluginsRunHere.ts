import { useEffect, useState } from 'react';

import { packagedPluginRunsOn } from '@/features/plugins/runtime/packagedFormFactor';

import { usePopupFormFactor } from './usePopupFormFactor';

/**
 * Whether any of these packaged plugins runs on the device the popup is on, by
 * each one's own `requires.formFactors`; null until known. A settings card
 * that switches a plugin outside the plugin list greys itself on this.
 */
export function usePackagedPluginsRunHere(pluginIds: readonly string[]): boolean | null {
  const formFactor = usePopupFormFactor();
  const [runs, setRuns] = useState<boolean | null>(null);
  const key = pluginIds.join('\n');
  useEffect(() => {
    if (!formFactor) return;
    let active = true;
    void Promise.all(key.split('\n').map((id) => packagedPluginRunsOn(id, formFactor))).then(
      (each) => {
        if (active) setRuns(each.some(Boolean));
      },
    );
    return () => {
      active = false;
    };
  }, [formFactor, key]);
  return runs;
}
