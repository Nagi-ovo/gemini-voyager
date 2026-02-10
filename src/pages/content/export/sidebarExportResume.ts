const SESSION_KEY_PENDING_SIDEBAR_EXPORT = 'gv_sidebar_export_pending';
const MAX_PENDING_AGE_MS = 60_000;

interface PendingSidebarExportIntent {
  conversationId: string;
  timestamp: number;
}

function clearPendingSidebarExportIntent(): void {
  sessionStorage.removeItem(SESSION_KEY_PENDING_SIDEBAR_EXPORT);
}

export function persistPendingSidebarExportIntent(
  conversationId: string,
  now: number = Date.now(),
): void {
  if (!conversationId) return;
  const payload: PendingSidebarExportIntent = {
    conversationId,
    timestamp: now,
  };
  sessionStorage.setItem(SESSION_KEY_PENDING_SIDEBAR_EXPORT, JSON.stringify(payload));
}

export function consumePendingSidebarExportIntent(
  currentConversationId: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const raw = sessionStorage.getItem(SESSION_KEY_PENDING_SIDEBAR_EXPORT);
  if (!raw) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearPendingSidebarExportIntent();
    return false;
  }

  if (!parsed || typeof parsed !== 'object') {
    clearPendingSidebarExportIntent();
    return false;
  }

  const record = parsed as Partial<PendingSidebarExportIntent>;
  if (typeof record.conversationId !== 'string' || typeof record.timestamp !== 'number') {
    clearPendingSidebarExportIntent();
    return false;
  }

  if (!currentConversationId || currentConversationId !== record.conversationId) {
    clearPendingSidebarExportIntent();
    return false;
  }

  if (now - record.timestamp > MAX_PENDING_AGE_MS) {
    clearPendingSidebarExportIntent();
    return false;
  }

  clearPendingSidebarExportIntent();
  return true;
}
