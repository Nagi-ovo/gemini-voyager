import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings, SiteAdapter } from '@/features/plugins/types';

import { createChatGptResponseNotificationRun } from './run';

export {
  CHATGPT_RESPONSE_NOTIFICATION_MANIFEST,
  CHATGPT_RESPONSE_NOTIFICATION_PLUGIN_ID,
} from './manifest';

/** The run lives while the plugin is mounted; the background delivers the notification. */
export function activateChatGptResponseNotification(
  scope: PluginScope,
  _settings: PluginSettings = {},
  adapter: SiteAdapter | null = null,
): void {
  scope.effect(
    () => createChatGptResponseNotificationRun({ signal: scope.signal, adapter }),
    'chatgpt-response-notification',
  );
}
