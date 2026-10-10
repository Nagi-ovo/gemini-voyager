/**
 * Shadow-surface key guard — an isolated-world content script at document_start.
 *
 * Its window capture listener must be registered before the page's own, so the
 * emitted file has to install it synchronously when Chrome evaluates it. The
 * bundler emits a content entry as one inline classic script only when the
 * chunk has no imports or exports; otherwise it adds a loader that waits on a
 * dynamic import, and the page gets to register first. So this entry and the
 * guard module import nothing else, nothing else imports the guard, and the
 * `selfContainedContentScripts` build plugin fails the build if that changes.
 * Like the other content entries, it lives as long as the page.
 */
import { installShadowKeyGuard } from './shadowKeyGuard';

installShadowKeyGuard();
