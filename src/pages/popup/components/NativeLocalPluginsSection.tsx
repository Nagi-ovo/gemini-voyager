import { type ComponentProps, useState } from 'react';

import { ChevronDown } from 'lucide-react';

import { isLocalPluginId } from '@/features/plugins/local/localPluginId';
import type { TranslationKey } from '@/utils/translations';

import { Card } from '../../../components/ui/card';
import { LocalPluginsPanel } from './LocalPluginsPanel';
import { PluginManager } from './PluginManager';

/**
 * Local plugins on Voyager's native surfaces (Gemini, AI Studio). The native
 * popup has no plugin page, so this is one entry at the end of the settings.
 * It stays a single collapsed row until the user opens it or a local plugin
 * targets this page; then it shows that plugin's toggle and settings (the
 * usual `PluginManager`, without the online catalog, which never serves a
 * native surface) and the import card. Only local plugins can target a native
 * surface, so nothing official appears here.
 */
export function NativeLocalPluginsSection({
  plugins,
  t,
}: {
  plugins: Omit<ComponentProps<typeof PluginManager>, 'catalogHost' | 'onRefresh' | 'refreshing'>;
  t: (key: TranslationKey) => string;
}) {
  const localHere = plugins.manifests.filter((plugin) => isLocalPluginId(plugin.id));
  const [opened, setOpened] = useState(false);

  if (!opened && localHere.length === 0) {
    return (
      <Card style={{ order: 1000 }} className="p-0 transition-all hover:shadow-md">
        <button
          type="button"
          onClick={() => setOpened(true)}
          aria-expanded={false}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t('localPluginsTitle')}</span>
            <span className="text-muted-foreground mt-1 block text-xs">
              {t('localPluginsNativeHint')}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </Card>
    );
  }

  return (
    <div style={{ order: 1000 }} className="flex flex-col gap-4">
      {localHere.length > 0 && <PluginManager {...plugins} manifests={localHere} />}
      <LocalPluginsPanel t={t} activeUrl={plugins.activeUrl} />
    </div>
  );
}
