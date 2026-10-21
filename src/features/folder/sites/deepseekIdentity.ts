/**
 * Which DeepSeek conversation a URL names: `/a/chat/s/<id>` on
 * chat.deepseek.com, keyed `deepseek:conv:<id>` as the timeline's stars are.
 */
import { deepseekAdapter } from '@/features/plugins/sites/adapters/deepseek';

import { createSiteIdentity } from './siteIdentity';
import { createSiteTransfer } from './siteTransfer';

export const DEEPSEEK_ORIGIN = 'https://chat.deepseek.com';

export const DEEPSEEK_IDENTITY = createSiteIdentity(deepseekAdapter, DEEPSEEK_ORIGIN);

/** DeepSeek's folder file: the shared format marked `deepseek`, with DeepSeek conversations only. */
export const DEEPSEEK_TRANSFER = createSiteTransfer({
  platform: 'deepseek',
  origin: DEEPSEEK_ORIGIN,
  read: DEEPSEEK_IDENTITY.read,
});
