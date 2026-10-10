export type UnlimitedStoragePermissionReason =
  | 'available'
  | 'already-granted'
  | 'not-declared'
  | 'unsupported-firefox'
  | 'unsupported-api';

export interface UnlimitedStoragePermissionStatus {
  supported: boolean;
  declared: boolean;
  granted: boolean;
  requestable: boolean;
  browser: 'chromium' | 'firefox' | 'safari' | 'unknown';
  reason: UnlimitedStoragePermissionReason;
}

export type UnlimitedStoragePermissionRequestReason =
  | 'granted'
  | 'already-granted'
  | 'denied'
  | 'not-declared'
  | 'unsupported-firefox'
  | 'unsupported-api'
  | 'error';

export interface UnlimitedStoragePermissionRequestResult {
  requested: boolean;
  granted: boolean;
  reason: UnlimitedStoragePermissionRequestReason;
  status: UnlimitedStoragePermissionStatus;
  error?: string;
}

/** The one local quota every writer measures against (addendum P3P4 §0). */
export interface EffectiveLocalQuota {
  quotaBytes: number | null;
  estimated: boolean;
}

export interface StorageAreaLike {
  get?: (...args: unknown[]) => unknown;
  set?: (...args: unknown[]) => unknown;
  remove?: (...args: unknown[]) => unknown;
  getBytesInUse?: (...args: unknown[]) => unknown;
  QUOTA_BYTES?: number;
}

interface PermissionsLike {
  contains?: (...args: unknown[]) => unknown;
  request?: (...args: unknown[]) => unknown;
}

interface RuntimeLike {
  getManifest?: () => {
    permissions?: string[];
    optional_permissions?: string[];
  };
  lastError?: { message?: string } | null;
}

export interface ChromeLike {
  storage?: {
    local?: StorageAreaLike;
    sync?: StorageAreaLike;
  };
  permissions?: PermissionsLike;
  runtime?: RuntimeLike;
}

export interface StorageQuotaBrowserOptions {
  chromeApi?: ChromeLike;
  userAgent?: () => string;
  buildTarget?: () => 'chrome' | 'edge' | 'firefox' | 'safari';
  safariMajorVersion?: () => number | null;
  legacySafariStorageLimit?: () => boolean;
}
