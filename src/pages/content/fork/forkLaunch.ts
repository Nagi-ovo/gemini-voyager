import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { generateUniqueId } from '@/core/utils/hash';

import { ForkNodesService } from './ForkNodesService';
import { resolveForkPlan } from './branching';
import { collectForkChatPairs } from './chatPairs';
import { composeForkInputWithContext } from './forkContext';
import type { ForkNode } from './forkTypes';
import { type ForkExtractedTurn, buildForkMarkdown } from './markdown';
import { getLegacyTurnIndex } from './turnId';

export const PENDING_FORK_KEY = 'gvPendingFork';
export type PendingForkMode = 'paste' | 'fileUpload';

export interface PendingForkData {
  sourceConversationId: string;
  sourceTurnId: string;
  sourceUrl: string;
  sourceTitle: string;
  forkGroupId: string;
  sourceForkIndex: number;
  nextForkIndex: number;
  markdown: string;
  mode: PendingForkMode;
  filename?: string;
  createdAt?: number;
}

function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    // oxlint-disable-next-line no-control-regex -- control characters are illegal in filenames and must be matched to be stripped
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .replace(/^\.+$/, '');
  return cleaned || 'fork';
}

function buildForkMarkdownFilename(title: string): string {
  return `gemini-voyager-fork-${sanitizeFilenamePart(title)}-${Date.now()}.md`;
}

function downloadMarkdownFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

async function getPreferredLanguage(): Promise<string | undefined> {
  try {
    const syncResult = await browser.storage.sync.get(StorageKeys.LANGUAGE);
    const syncLanguage = syncResult?.[StorageKeys.LANGUAGE];
    if (typeof syncLanguage === 'string' && syncLanguage.trim()) return syncLanguage;
  } catch {
    // Ignore sync storage failures.
  }

  try {
    const localResult = await browser.storage.local.get(StorageKeys.LANGUAGE);
    const localLanguage = localResult?.[StorageKeys.LANGUAGE];
    if (typeof localLanguage === 'string' && localLanguage.trim()) return localLanguage;
  } catch {
    // Ignore local storage failures.
  }

  return undefined;
}

export function createForkLauncher({
  getConversationId,
  getConversationTitle,
  getNewConversationUrl,
  ensureTurnId,
  resolveTurnId,
}: {
  getConversationId: () => string | null;
  getConversationTitle: () => string;
  getNewConversationUrl: () => string;
  ensureTurnId: (element: HTMLElement, index: number) => string;
  resolveTurnId: (turnId: string) => string | null;
}) {
  function isSameCurrentConversationTurn(left: string, right: string): boolean {
    const resolvedLeft = resolveTurnId(left);
    return resolvedLeft !== null && resolvedLeft === resolveTurnId(right);
  }

  /**
   * Extract conversation content up to and including the given user turn index.
   *
   * Step 1: Extract turns 0..N with both user and assistant content when available.
   * Step 2: Remove the last assistant response to let users continue from the last user turn.
   */
  function extractConversationUpToTurn(userTurnIndex: number, sourceTurnId: string): string {
    const pairs = collectForkChatPairs();
    if (pairs.length === 0) return '';

    const sourceIndex = pairs.findIndex((pair) =>
      isSameCurrentConversationTurn(pair.turnId, sourceTurnId),
    );
    const targetIndex = sourceIndex >= 0 ? sourceIndex : userTurnIndex;
    const turns: ForkExtractedTurn[] = [];
    for (let i = 0; i <= targetIndex && i < pairs.length; i++) {
      turns.push({
        user: pairs[i].user || '',
        assistant: pairs[i].assistant || '',
      });
    }

    return buildForkMarkdown(getConversationTitle(), turns, true);
  }

  async function executeFork(
    userEl: HTMLElement,
    turnIndex: number,
    mode: PendingForkMode,
  ): Promise<void> {
    const conversationId = getConversationId();
    if (!conversationId) {
      console.warn('[Fork] No conversation ID found');
      return;
    }

    const turnId = ensureTurnId(userEl, turnIndex);
    if (getLegacyTurnIndex(turnId) !== null) {
      console.warn('[Fork] Stable turn identity is not available yet');
      return;
    }
    const markdown = extractConversationUpToTurn(turnIndex, turnId);
    if (!markdown.trim()) {
      console.warn('[Fork] No content extracted');
      return;
    }

    // Open new window IMMEDIATELY to preserve user gesture context.
    // Firefox and Safari block window.open() that follows async operations.
    const newWindow = window.open(getNewConversationUrl(), '_blank');
    if (!newWindow) {
      console.warn('[Fork] Failed to open new window (popup blocked?)');
      return;
    }

    // Async work: resolve language and fork group (safe now, window already opened)
    const preferredLanguage = await getPreferredLanguage();
    const markdownWithContext = composeForkInputWithContext(markdown, preferredLanguage);
    const markdownFilename =
      mode === 'fileUpload' ? buildForkMarkdownFilename(getConversationTitle()) : undefined;

    let forkGroupId = generateUniqueId('fork');
    let sourceForkIndex = 0;
    let nextForkIndex = 1;

    try {
      const conversationNodes = await ForkNodesService.getForConversation(conversationId);
      const candidateGroupIds = Array.from(
        new Set(
          conversationNodes
            .filter((node) => isSameCurrentConversationTurn(node.turnId, turnId))
            .map((node) => node.forkGroupId),
        ),
      );

      const groups: Record<string, ForkNode[]> = {};
      for (const groupId of candidateGroupIds) {
        groups[groupId] = await ForkNodesService.getGroup(groupId);
      }

      const plan = resolveForkPlan(
        conversationId,
        turnId,
        conversationNodes,
        groups,
        () => generateUniqueId('fork'),
        resolveTurnId,
      );

      forkGroupId = plan.forkGroupId;
      sourceForkIndex = plan.sourceForkIndex;
      nextForkIndex = plan.nextForkIndex;
    } catch (error) {
      if (!isExtensionContextInvalidatedError(error)) {
        console.error('[Fork] Failed to resolve fork group, using default:', error);
      }
    }

    // Store pending fork data in extension storage (cross-tab accessible).
    // sessionStorage is per-tab and its copy semantics with window.open() vary by browser.
    const pendingFork: PendingForkData = {
      sourceConversationId: conversationId,
      sourceTurnId: turnId,
      sourceUrl: window.location.href,
      sourceTitle: getConversationTitle(),
      forkGroupId,
      sourceForkIndex,
      nextForkIndex,
      markdown: markdownWithContext,
      mode,
      filename: markdownFilename,
      createdAt: Date.now(),
    };

    try {
      await browser.storage.local.set({ [PENDING_FORK_KEY]: pendingFork });
      if (mode === 'fileUpload' && markdownFilename) {
        downloadMarkdownFile(markdownWithContext, markdownFilename);
      }
    } catch (e) {
      console.error('[Fork] Failed to save pending fork:', e);
    }
  }

  return executeFork;
}
