import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataBackupService } from '../DataBackupService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestData {
  items: string[];
}

const NAMESPACE = 'test';
const PRIMARY_KEY = `gvBackup_${NAMESPACE}_primary`;
const EMERGENCY_KEY = `gvBackup_${NAMESPACE}_emergency`;
const BEFORE_UNLOAD_KEY = `gvBackup_${NAMESPACE}_beforeUnload`;

function makeService(validateData?: (data: TestData) => boolean) {
  return new DataBackupService<TestData>(NAMESPACE, validateData);
}

function makeValidBackup(data: TestData, timestampOverride?: string) {
  return JSON.stringify({
    data,
    metadata: {
      timestamp: timestampOverride ?? new Date().toISOString(),
      version: '1.0',
      dataSize: JSON.stringify(data).length,
      itemCount: data.items.length,
    },
  });
}

// ---------------------------------------------------------------------------
// createPrimaryBackup
// ---------------------------------------------------------------------------
describe('createPrimaryBackup', () => {
  let service: DataBackupService<TestData>;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    service = makeService();
  });

  afterEach(() => {
    service.destroy();
    vi.restoreAllMocks();
  });

  it('returns true and writes to localStorage', () => {
    const data: TestData = { items: ['a', 'b'] };

    const result = service.createPrimaryBackup(data);

    expect(result).toBe(true);
    const stored = localStorage.getItem(PRIMARY_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.data).toEqual(data);
  });

  it('stores a valid ISO timestamp in the metadata', () => {
    service.createPrimaryBackup({ items: ['x'] });

    const stored = JSON.parse(localStorage.getItem(PRIMARY_KEY)!);
    const ts = new Date(stored.metadata.timestamp).getTime();
    expect(isNaN(ts)).toBe(false);
  });

  it('returns false and does not throw when localStorage is unavailable', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage quota exceeded');
    });

    expect(() => service.createPrimaryBackup({ items: [] })).not.toThrow();
    const result = service.createPrimaryBackup({ items: [] });
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createEmergencyBackup
// ---------------------------------------------------------------------------
describe('createEmergencyBackup', () => {
  let service: DataBackupService<TestData>;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    service = makeService();
  });

  afterEach(() => {
    service.destroy();
    vi.restoreAllMocks();
  });

  it('returns true and writes to the emergency key', () => {
    const data: TestData = { items: ['emergency'] };

    const result = service.createEmergencyBackup(data);

    expect(result).toBe(true);
    const stored = localStorage.getItem(EMERGENCY_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).data).toEqual(data);
  });

  it('returns false when localStorage throws', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });

    expect(service.createEmergencyBackup({ items: [] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Backup timestamp validation (via recoverFromBackup)
// ---------------------------------------------------------------------------
describe('backup timestamp validation', () => {
  let service: DataBackupService<TestData>;

  beforeEach(() => {
    localStorage.clear();
    service = makeService();
  });

  afterEach(() => {
    service.destroy();
  });

  it('accepts a valid recent backup', () => {
    localStorage.setItem(PRIMARY_KEY, makeValidBackup({ items: ['ok'] }));

    expect(service.recoverFromBackup()).toEqual({ items: ['ok'] });
  });

  it('rejects a backup older than 7 days', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(PRIMARY_KEY, makeValidBackup({ items: ['old'] }, eightDaysAgo));

    expect(service.recoverFromBackup()).toBeNull();
  });

  it('rejects a backup with a future timestamp', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(PRIMARY_KEY, makeValidBackup({ items: ['future'] }, tomorrow));

    expect(service.recoverFromBackup()).toBeNull();
  });

  it('rejects a backup with a NaN timestamp from corrupt data', () => {
    // This test documents the bug and will PASS once the fix is applied.
    // Without the fix: new Date('not-a-date').getTime() === NaN
    // NaN < 0  === false  (future check passes incorrectly)
    // NaN > 7d === false  (age check passes incorrectly)
    // → isBackupValid returns true for corrupt data
    localStorage.setItem(PRIMARY_KEY, makeValidBackup({ items: ['corrupt'] }, 'not-a-date'));

    expect(service.recoverFromBackup()).toBeNull();
  });

  it('rejects a backup with an empty string timestamp', () => {
    localStorage.setItem(PRIMARY_KEY, makeValidBackup({ items: ['empty-ts'] }, ''));

    expect(service.recoverFromBackup()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// recoverFromBackup — priority order
// ---------------------------------------------------------------------------
describe('recoverFromBackup priority', () => {
  let service: DataBackupService<TestData>;

  beforeEach(() => {
    localStorage.clear();
    service = makeService();
  });

  afterEach(() => {
    service.destroy();
  });

  it('returns null when no backups exist', () => {
    expect(service.recoverFromBackup()).toBeNull();
  });

  it('uses the primary backup when all three are present', () => {
    localStorage.setItem(PRIMARY_KEY, makeValidBackup({ items: ['primary'] }));
    localStorage.setItem(EMERGENCY_KEY, makeValidBackup({ items: ['emergency'] }));
    localStorage.setItem(BEFORE_UNLOAD_KEY, makeValidBackup({ items: ['beforeunload'] }));

    expect(service.recoverFromBackup()).toEqual({ items: ['primary'] });
  });

  it('falls back to emergency when primary is absent', () => {
    localStorage.setItem(EMERGENCY_KEY, makeValidBackup({ items: ['emergency'] }));
    localStorage.setItem(BEFORE_UNLOAD_KEY, makeValidBackup({ items: ['beforeunload'] }));

    expect(service.recoverFromBackup()).toEqual({ items: ['emergency'] });
  });

  it('falls back to beforeUnload when primary and emergency are absent', () => {
    localStorage.setItem(BEFORE_UNLOAD_KEY, makeValidBackup({ items: ['beforeunload'] }));

    expect(service.recoverFromBackup()).toEqual({ items: ['beforeunload'] });
  });

  it('skips an invalid primary and falls back to emergency', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(PRIMARY_KEY, makeValidBackup({ items: ['stale'] }, eightDaysAgo));
    localStorage.setItem(EMERGENCY_KEY, makeValidBackup({ items: ['emergency'] }));

    expect(service.recoverFromBackup()).toEqual({ items: ['emergency'] });
  });

  it('skips a backup that fails the custom validateData check', () => {
    // validateData rejects items arrays shorter than 2
    const strictService = makeService((d) => d.items.length >= 2);
    localStorage.setItem(PRIMARY_KEY, makeValidBackup({ items: ['only-one'] }));
    localStorage.setItem(EMERGENCY_KEY, makeValidBackup({ items: ['a', 'b'] }));

    expect(strictService.recoverFromBackup()).toEqual({ items: ['a', 'b'] });
    strictService.destroy();
  });

  it('returns null when all backups contain malformed JSON', () => {
    localStorage.setItem(PRIMARY_KEY, 'not-json');
    localStorage.setItem(EMERGENCY_KEY, '{broken');
    localStorage.setItem(BEFORE_UNLOAD_KEY, 'undefined');

    expect(service.recoverFromBackup()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setupBeforeUnloadBackup / destroy lifecycle
// ---------------------------------------------------------------------------
describe('setupBeforeUnloadBackup and destroy', () => {
  let service: DataBackupService<TestData>;

  beforeEach(() => {
    localStorage.clear();
    service = makeService();
  });

  afterEach(() => {
    service.destroy();
  });

  it('writes a beforeUnload backup when the beforeunload event fires', () => {
    const data: TestData = { items: ['page-exit'] };
    service.setupBeforeUnloadBackup(() => data);

    window.dispatchEvent(new Event('beforeunload'));

    const stored = localStorage.getItem(BEFORE_UNLOAD_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).data).toEqual(data);
  });

  it('uses the latest data returned by the getter at the time of the event', () => {
    let current: TestData = { items: ['initial'] };
    service.setupBeforeUnloadBackup(() => current);

    current = { items: ['updated'] };
    window.dispatchEvent(new Event('beforeunload'));

    const stored = JSON.parse(localStorage.getItem(BEFORE_UNLOAD_KEY)!);
    expect(stored.data).toEqual({ items: ['updated'] });
  });

  it('replaces a previously registered handler when called a second time', () => {
    const firstFn = vi.fn().mockReturnValue({ items: ['first'] });
    const secondFn = vi.fn().mockReturnValue({ items: ['second'] });

    service.setupBeforeUnloadBackup(firstFn);
    service.setupBeforeUnloadBackup(secondFn); // replaces first

    window.dispatchEvent(new Event('beforeunload'));

    expect(firstFn).not.toHaveBeenCalled();
    expect(secondFn).toHaveBeenCalledTimes(1);
  });

  it('does not fire the handler after destroy() is called', () => {
    const getter = vi.fn().mockReturnValue({ items: [] });
    service.setupBeforeUnloadBackup(getter);

    service.destroy();
    window.dispatchEvent(new Event('beforeunload'));

    expect(getter).not.toHaveBeenCalled();
  });

  it('calling destroy() twice does not throw', () => {
    service.setupBeforeUnloadBackup(() => ({ items: [] }));
    expect(() => {
      service.destroy();
      service.destroy();
    }).not.toThrow();
  });
});
