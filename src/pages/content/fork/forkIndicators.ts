import { askConfirm } from '@/core/ui/confirm';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { getTranslationSync } from '../../../utils/i18n';
import { ForkNodesService } from './ForkNodesService';
import { buildBranchDisplayNodes } from './branching';
import { collectForkChatPairs } from './chatPairs';
import type { ForkNode } from './forkTypes';
import { getLegacyTurnIndex } from './turnId';

const FORK_INDICATOR_CLASS = 'gv-fork-indicator';
const FORK_INDICATOR_GROUP_CLASS = 'gv-fork-indicator-group';
const FORK_INDICATOR_ITEM_CLASS = 'gv-fork-indicator-item';
const FORK_INDICATOR_DELETE_CLASS = 'gv-fork-indicator-delete';
const CONVERSATION_VERIFY_TIMEOUT_MS = 4000;
const CONVERSATION_EXISTENCE_CACHE_TTL_MS = 30000;

const conversationExistenceCache = new Map<string, { exists: boolean; checkedAt: number }>();

export function createForkIndicators({
  getConversationId,
  resolveTurnId,
  ensureTurnId,
  resolveUserMessageHost,
}: {
  getConversationId: () => string | null;
  resolveTurnId: (turnId: string) => string | null;
  ensureTurnId: (element: HTMLElement, index: number) => string;
  resolveUserMessageHost: (element: HTMLElement) => HTMLElement;
}) {
  let storageRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const lifetime = new AbortController();

  function extractConversationIdFromHref(href: string): string | null {
    try {
      const url = new URL(href, window.location.origin);
      const appMatch = url.pathname.match(/\/app\/([^/?#]+)/);
      if (appMatch?.[1]) return appMatch[1];
      const gemMatch = url.pathname.match(/\/gem\/[^/]+\/([^/?#]+)/);
      return gemMatch?.[1] || null;
    } catch {
      return null;
    }
  }

  function findSidebarConversationLinkById(conversationId: string): HTMLAnchorElement | null {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"], a[href*="/gem/"]'),
    );
    for (const link of links) {
      if (extractConversationIdFromHref(link.href) === conversationId) return link;
    }
    return null;
  }

  function triggerNativeClick(target: HTMLElement): void {
    const options = { bubbles: true, cancelable: true, view: window };
    target.dispatchEvent(new MouseEvent('pointerdown', options));
    target.dispatchEvent(new MouseEvent('mousedown', options));
    target.dispatchEvent(new MouseEvent('mouseup', options));
    target.dispatchEvent(new MouseEvent('click', options));
  }

  function navigateToForkConversation(node: ForkNode): void {
    if (!node.conversationId) return;
    const currentConversationId = getConversationId();
    if (currentConversationId === node.conversationId) return;

    const sidebarLink = findSidebarConversationLinkById(node.conversationId);
    if (sidebarLink) {
      triggerNativeClick(sidebarLink);
      return;
    }

    const fallbackUrl =
      node.conversationUrl ||
      `${window.location.origin}/app/${encodeURIComponent(node.conversationId)}`;
    window.location.assign(fallbackUrl);
  }

  function collectSidebarConversationIds(): Set<string> {
    const ids = new Set<string>();
    const links = document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/app/"], a[href*="/gem/"]',
    );
    links.forEach((link) => {
      const id = extractConversationIdFromHref(link.href);
      if (id) ids.add(id);
    });
    return ids;
  }

  async function checkConversationExists(
    node: ForkNode,
    sidebarConversationIds: Set<string>,
  ): Promise<boolean> {
    if (lifetime.signal.aborted) return true;
    const currentConversationId = getConversationId();
    if (currentConversationId && node.conversationId === currentConversationId) return true;
    if (sidebarConversationIds.has(node.conversationId)) {
      conversationExistenceCache.set(node.conversationId, { exists: true, checkedAt: Date.now() });
      return true;
    }

    const cached = conversationExistenceCache.get(node.conversationId);
    const now = Date.now();
    if (cached && now - cached.checkedAt <= CONVERSATION_EXISTENCE_CACHE_TTL_MS) {
      return cached.exists;
    }

    if (!node.conversationUrl) {
      conversationExistenceCache.set(node.conversationId, { exists: false, checkedAt: now });
      return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONVERSATION_VERIFY_TIMEOUT_MS);
    try {
      const response = await fetch(node.conversationUrl, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'include',
        signal: controller.signal,
      });
      if (lifetime.signal.aborted) return true;
      const responseConversationId = extractConversationIdFromHref(response.url);
      const exists =
        response.ok && !!responseConversationId && node.conversationId === responseConversationId;
      conversationExistenceCache.set(node.conversationId, { exists, checkedAt: now });
      return exists;
    } catch {
      // If verification fails for network/CSP reasons, keep node to avoid destructive false positives.
      return true;
    } finally {
      clearTimeout(timer);
    }
  }

  async function pruneDeletedNodesFromGroup(
    groupNodes: ForkNode[],
    sidebarConversationIds: Set<string>,
  ): Promise<ForkNode[]> {
    const cleaned: ForkNode[] = [];

    for (const node of groupNodes) {
      if (lifetime.signal.aborted) return [];
      const exists = await checkConversationExists(node, sidebarConversationIds);
      if (lifetime.signal.aborted) return [];
      if (exists) {
        cleaned.push(node);
        continue;
      }

      try {
        await ForkNodesService.removeForkNode(node.conversationId, node.turnId, node.forkGroupId);
        if (lifetime.signal.aborted) return [];
      } catch (error) {
        if (lifetime.signal.aborted) return [];
        if (!isExtensionContextInvalidatedError(error)) {
          console.error('[Fork] Failed to prune deleted fork node:', error);
        }
      }
    }

    return cleaned;
  }

  function clearInjectedForkIndicators(): void {
    document.querySelectorAll(`.${FORK_INDICATOR_GROUP_CLASS}`).forEach((el) => el.remove());
  }

  function hasOrDedupForkIndicatorGroup(hostEl: HTMLElement): boolean {
    const groups = Array.from(
      hostEl.querySelectorAll<HTMLElement>(`.${FORK_INDICATOR_GROUP_CLASS}`),
    );
    if (groups.length === 0) return false;
    if (groups.length > 1) {
      for (let i = 1; i < groups.length; i++) {
        groups[i].remove();
      }
    }
    return true;
  }

  function scheduleForkIndicatorRefresh(): void {
    if (lifetime.signal.aborted) return;
    if (storageRefreshTimer) clearTimeout(storageRefreshTimer);
    storageRefreshTimer = setTimeout(() => {
      clearInjectedForkIndicators();
      void injectForkIndicators();
      storageRefreshTimer = null;
    }, 500);
  }

  async function loadDisplayNodes(
    forkGroupIds: Set<string>,
    sidebarConversationIds: Set<string>,
  ): Promise<ForkNode[]> {
    const groupNodesList: ForkNode[][] = [];
    for (const forkGroupId of forkGroupIds) {
      if (lifetime.signal.aborted) return [];
      try {
        const groupNodes = await ForkNodesService.getGroup(forkGroupId);
        if (lifetime.signal.aborted) return [];
        if (groupNodes.length === 0) continue;
        const cleanedGroupNodes = await pruneDeletedNodesFromGroup(
          groupNodes,
          sidebarConversationIds,
        );
        if (lifetime.signal.aborted) return [];
        if (cleanedGroupNodes.length > 0) groupNodesList.push(cleanedGroupNodes);
      } catch {
        if (lifetime.signal.aborted) return [];
        // Ignore single group failure and continue rendering available groups.
      }
    }

    return buildBranchDisplayNodes(groupNodesList);
  }

  function createBranchItem(node: ForkNode, branchNumber: number, isCurrent: boolean): HTMLElement {
    const item = document.createElement('div');
    item.className = FORK_INDICATOR_ITEM_CLASS;

    const indicator = document.createElement('button');
    indicator.className = `${FORK_INDICATOR_CLASS}${isCurrent ? ' gv-current' : ''}`;
    indicator.type = 'button';
    indicator.textContent = String(branchNumber);
    indicator.title = `${getTranslationSync('forkBranch')} ${branchNumber}${
      isCurrent ? ` - ${getTranslationSync('forkCurrent')}` : ''
    }`;

    if (isCurrent) {
      indicator.setAttribute('aria-current', 'true');
      indicator.disabled = true;
    } else {
      indicator.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        navigateToForkConversation(node);
      });
    }
    item.appendChild(indicator);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = FORK_INDICATOR_DELETE_CLASS;
    deleteBtn.type = 'button';
    deleteBtn.textContent = '×';
    deleteBtn.title = getTranslationSync('forkDeleteData');
    deleteBtn.setAttribute('aria-label', getTranslationSync('forkDeleteData'));
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const conversationAtAsk = getConversationId();
      const confirmed = await askConfirm({
        message: getTranslationSync('forkDeleteDataConfirm'),
        anchor: deleteBtn,
        tone: 'danger',
        choices: [{ id: 'confirm', label: getTranslationSync('pm_delete') }],
        signal: lifetime.signal,
      });
      // The page may have moved to another conversation while the confirm was open.
      if (lifetime.signal.aborted || !confirmed || getConversationId() !== conversationAtAsk)
        return;

      deleteBtn.disabled = true;
      try {
        await ForkNodesService.removeForkNode(node.conversationId, node.turnId, node.forkGroupId);
        if (lifetime.signal.aborted) return;
      } catch (error) {
        if (lifetime.signal.aborted) return;
        if (!isExtensionContextInvalidatedError(error)) {
          console.error('[Fork] Failed to delete fork branch data:', error);
        }
      } finally {
        if (!lifetime.signal.aborted) {
          clearInjectedForkIndicators();
          void injectForkIndicators();
        }
      }
    });
    item.appendChild(deleteBtn);
    return item;
  }

  async function injectForkIndicators(): Promise<void> {
    if (lifetime.signal.aborted) return;
    const conversationId = getConversationId();
    if (!conversationId) return;

    let forkNodes: ForkNode[];
    try {
      forkNodes = await ForkNodesService.getForConversation(conversationId);
      if (lifetime.signal.aborted) return;
    } catch (error) {
      if (lifetime.signal.aborted) return;
      if (!isExtensionContextInvalidatedError(error)) {
        console.error('[Fork] Failed to get fork nodes:', error);
      }
      return;
    }

    if (forkNodes.length === 0) return;

    // Build a map of normalized turnId -> forkGroupIds
    const turnForkMap = new Map<string, Set<string>>();
    for (const node of forkNodes) {
      const normalizedTurnId = resolveTurnId(node.turnId);
      if (!normalizedTurnId) continue;
      if (!turnForkMap.has(normalizedTurnId)) {
        turnForkMap.set(normalizedTurnId, new Set<string>());
      }
      turnForkMap.get(normalizedTurnId)?.add(node.forkGroupId);
    }

    const pairs = collectForkChatPairs();
    const sidebarConversationIds = collectSidebarConversationIds();
    if (conversationId) sidebarConversationIds.add(conversationId);

    for (let index = 0; index < pairs.length; index++) {
      const userEl = pairs[index].userElement;
      const mountedTurnId = ensureTurnId(userEl, index);
      if (getLegacyTurnIndex(mountedTurnId) !== null) continue;
      const turnId = resolveTurnId(mountedTurnId);
      if (!turnId) continue;
      const hostEl = resolveUserMessageHost(userEl);
      const forkGroupIds = turnForkMap.get(turnId);
      if (!forkGroupIds || forkGroupIds.size === 0) continue;

      if (hasOrDedupForkIndicatorGroup(hostEl)) continue;

      const displayNodes = await loadDisplayNodes(forkGroupIds, sidebarConversationIds);
      if (lifetime.signal.aborted) return;
      if (displayNodes.length < 2) continue;

      // Re-check after async group loading to avoid duplicate render in concurrent injections.
      if (hasOrDedupForkIndicatorGroup(hostEl)) continue;

      const group = document.createElement('div');
      group.className = FORK_INDICATOR_GROUP_CLASS;
      displayNodes.forEach((node, displayIndex) => {
        group.appendChild(
          createBranchItem(node, displayIndex + 1, node.conversationId === conversationId),
        );
      });

      // A stopped load must never mount buttons wired to its already-aborted confirm signal.
      if (lifetime.signal.aborted) return;
      hostEl.style.position = hostEl.style.position || 'relative';
      hostEl.appendChild(group);
    }
  }

  function updateForkIndicatorTexts(): void {
    // Update indicator titles (sequence numbers stay the same, language labels change)
    const indicators = document.querySelectorAll<HTMLElement>(`.${FORK_INDICATOR_CLASS}`);
    indicators.forEach((ind) => {
      const branchNumber = ind.textContent?.trim();
      if (!branchNumber) return;
      const isCurrent = ind.classList.contains('gv-current');
      ind.title = `${getTranslationSync('forkBranch')} ${branchNumber}${
        isCurrent ? ` - ${getTranslationSync('forkCurrent')}` : ''
      }`;
    });

    const deleteButtons = document.querySelectorAll<HTMLElement>(`.${FORK_INDICATOR_DELETE_CLASS}`);
    deleteButtons.forEach((btn) => {
      btn.title = getTranslationSync('forkDeleteData');
      btn.setAttribute('aria-label', getTranslationSync('forkDeleteData'));
    });
  }

  return {
    inject: injectForkIndicators,
    refresh: scheduleForkIndicatorRefresh,
    updateLanguage: updateForkIndicatorTexts,
    stop() {
      lifetime.abort();
      if (storageRefreshTimer) {
        clearTimeout(storageRefreshTimer);
        storageRefreshTimer = null;
      }
      document.querySelectorAll(`.${FORK_INDICATOR_CLASS}`).forEach((element) => element.remove());
      clearInjectedForkIndicators();
    },
  };
}
