/**
 * The open conversation and in-app navigation on a plugin site with one
 * origin, as `plugins/builtin/chatgptFolders/chatgptPage.ts` does for ChatGPT.
 */
import type { ConversationReference } from '@/core/types/folder';
import type { SiteIdentity } from '@/features/folder/sites/siteIdentity';

/** `doc.title` without the site's ` - <Brand>` suffix, or `null` when it is a placeholder. */
export function pageTitle(
  doc: Document,
  suffix: RegExp,
  isPlaceholder: (title: string) => boolean,
): string | null {
  const title = doc.title.replace(suffix, '').trim();
  return title && !isPlaceholder(title) ? title : null;
}

/**
 * The open conversation as a folder entry, or `null` on any page that is not a
 * saved conversation. `title` reads the title the page shows for bare id `id`.
 */
export function readSiteConversation(
  identity: SiteIdentity,
  title: (id: string) => string | null,
  untitled: string,
  href: string = location.href,
  now: number = Date.now(),
): ConversationReference | null {
  const conversation = identity.read(href);
  if (!conversation) return null;
  return {
    conversationId: conversation.conversationId,
    title: title(conversation.id) ?? untitled,
    url: conversation.url,
    addedAt: now,
  };
}

/**
 * Opens a filed conversation inside the running app, never with a full load:
 * click the site's own sidebar link for it when one is rendered (its router
 * handles the click), else push the path and announce it with `popstate`,
 * which client routers read as a navigation. `false` for another site's entry.
 */
export function openSiteConversation(
  identity: SiteIdentity,
  sidebarLink: (id: string) => HTMLAnchorElement | null,
  conversation: ConversationReference,
  win: Window = window,
): boolean {
  const target = identity.read(conversation.url);
  if (!target) return false;
  if (identity.read(win.location.href)?.id === target.id) return true;
  const link = sidebarLink(target.id);
  if (link) {
    link.click();
    return true;
  }
  // A fresh entry carries no state: copying the router's state would give two
  // entries the same router key.
  win.history.pushState(null, '', target.path);
  win.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  return true;
}
