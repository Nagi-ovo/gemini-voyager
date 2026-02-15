import { afterEach, describe, expect, it } from 'vitest';

import {
  consumePendingSidebarExportIntent,
  persistPendingSidebarExportIntent,
} from '../sidebarExportResume';

describe('sidebarExportResume', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('persists pending sidebar export intent', () => {
    persistPendingSidebarExportIntent('conv-123', 1000);

    const raw = sessionStorage.getItem('gv_sidebar_export_pending');
    expect(raw).toBeTruthy();
    expect(raw).toContain('"conversationId":"conv-123"');
  });

  it('consumes pending intent when current conversation matches', () => {
    persistPendingSidebarExportIntent('conv-123', 1000);

    const shouldResume = consumePendingSidebarExportIntent('conv-123', 1000 + 20_000);
    expect(shouldResume).toBe(true);
    expect(sessionStorage.getItem('gv_sidebar_export_pending')).toBeNull();
  });

  it('clears pending intent when current conversation does not match', () => {
    persistPendingSidebarExportIntent('conv-123', 1000);

    const shouldResume = consumePendingSidebarExportIntent('conv-999', 1000 + 20_000);
    expect(shouldResume).toBe(false);
    expect(sessionStorage.getItem('gv_sidebar_export_pending')).toBeNull();
  });

  it('clears expired pending intent', () => {
    persistPendingSidebarExportIntent('conv-123', 1000);

    const shouldResume = consumePendingSidebarExportIntent('conv-123', 1000 + 90_000);
    expect(shouldResume).toBe(false);
    expect(sessionStorage.getItem('gv_sidebar_export_pending')).toBeNull();
  });

  it('clears malformed pending intent payload', () => {
    sessionStorage.setItem('gv_sidebar_export_pending', '{"conversationId":1}');

    const shouldResume = consumePendingSidebarExportIntent('conv-123', 1000);
    expect(shouldResume).toBe(false);
    expect(sessionStorage.getItem('gv_sidebar_export_pending')).toBeNull();
  });
});
