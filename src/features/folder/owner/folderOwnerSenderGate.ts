import { FOLDER_WRITE_AUTHORITY, type FolderAuthority } from './authority';
import { FOLDER_SITE_POLICIES, type FolderSite, siteOfFolderKey } from './folderOwnerPolicy';

/** The `chrome.runtime.MessageSender` fields the gate reads. */
export interface FolderOwnerSender {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { url?: string };
}

export interface FolderOwnerGateEnv {
  /** `chrome.runtime.id`. */
  extensionId: string;
  /** `chrome.runtime.getURL('')`. */
  extensionBaseUrl: string;
  authority?: Readonly<Record<FolderSite, FolderAuthority>>;
}

export type FolderOwnerGateDecision =
  | { ok: true; site: FolderSite }
  | { ok: false; reason: 'sender_not_allowed' | 'not_owner' };

const DENIED: FolderOwnerGateDecision = { ok: false, reason: 'sender_not_allowed' };

/** The extension's own popup or options page: no tab, our id, a URL under our base. */
function isExtensionPage(sender: FolderOwnerSender, env: FolderOwnerGateEnv): boolean {
  return (
    !sender.tab &&
    sender.id === env.extensionId &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(env.extensionBaseUrl)
  );
}

/** The top-frame HTTPS page a content script runs in, or `null` when that cannot be shown. */
function contentScriptHost(sender: FolderOwnerSender): string | null {
  if (sender.frameId !== undefined && sender.frameId !== 0) return null;
  // Safari can omit `frameId`; then the sender URL must be the tab's own URL.
  if (sender.frameId === undefined && sender.tab?.url && sender.url !== sender.tab.url) return null;
  const url = sender.url ?? sender.tab?.url;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Who may ask the folder owner to act on `key` (§6.8). A content script names
 * only its own site's key family; an extension page names any folder key.
 * This guards against mistakes and cross-site confusion, not a compromised
 * content script, which could write storage itself.
 */
export function checkFolderOwnerSender(
  sender: FolderOwnerSender,
  key: string,
  env: FolderOwnerGateEnv,
): FolderOwnerGateDecision {
  if (sender.id !== env.extensionId) return DENIED;
  const site = siteOfFolderKey(key);
  if (!site) return DENIED;
  if (!isExtensionPage(sender, env)) {
    const host = contentScriptHost(sender);
    if (!host || !FOLDER_SITE_POLICIES[site].hosts.includes(host)) return DENIED;
  }
  const authority = env.authority ?? FOLDER_WRITE_AUTHORITY;
  return authority[site] === 'owner' ? { ok: true, site } : { ok: false, reason: 'not_owner' };
}
