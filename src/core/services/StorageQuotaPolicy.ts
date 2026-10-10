import {
  getSafariMajorVersion,
  getVoyagerBuildTarget,
  hasLegacySafariStorageLimit,
} from '@/core/utils/browser';

import { StorageQuotaApi } from './StorageQuotaApi';
import type {
  EffectiveLocalQuota,
  StorageQuotaBrowserOptions,
  UnlimitedStoragePermissionReason,
  UnlimitedStoragePermissionRequestReason,
  UnlimitedStoragePermissionRequestResult,
  UnlimitedStoragePermissionStatus,
} from './StorageQuotaTypes';

const MEBIBYTE = 1024 * 1024;
const KIBIBYTE = 1024;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Owns browser permission prompts and conservative platform quota limits. */
export class StorageQuotaPolicy {
  private readonly api: StorageQuotaApi;

  constructor(private readonly options: StorageQuotaBrowserOptions) {
    this.api = new StorageQuotaApi(options);
  }

  private permissionDeclaration(): { required: boolean; declared: boolean } {
    const manifest = this.api.chromeApi.runtime?.getManifest?.() ?? {};
    const required = (manifest.permissions ?? []).includes('unlimitedStorage');
    return {
      required,
      declared: required || (manifest.optional_permissions ?? []).includes('unlimitedStorage'),
    };
  }

  private detectBrowser(): UnlimitedStoragePermissionStatus['browser'] {
    const target = this.options.buildTarget?.() ?? getVoyagerBuildTarget();
    const ua = this.options.userAgent?.() ?? globalThis.navigator?.userAgent ?? '';
    if (target === 'firefox' || /firefox/i.test(ua)) return 'firefox';
    if (target === 'safari') return 'safari';
    if (target === 'chrome' || target === 'edge' || /(?:chrome|chromium|edg)/i.test(ua)) {
      return 'chromium';
    }
    return 'unknown';
  }

  async getStatus(): Promise<UnlimitedStoragePermissionStatus> {
    const browser = this.detectBrowser();
    const permissionsApi = this.api.chromeApi.permissions;
    const { required, declared } = this.permissionDeclaration();

    if (required) {
      return {
        supported: true,
        declared: true,
        granted: true,
        requestable: false,
        browser,
        reason: 'already-granted',
      };
    }
    if (browser === 'firefox') {
      return {
        supported: true,
        declared,
        granted: false,
        requestable: false,
        browser,
        reason: 'not-declared',
      };
    }
    if (!permissionsApi?.contains || !permissionsApi.request) {
      return {
        supported: false,
        declared,
        granted: false,
        requestable: false,
        browser,
        reason: 'unsupported-api',
      };
    }

    let granted = false;
    try {
      granted =
        (await this.api.call<boolean>(permissionsApi, permissionsApi.contains, [
          { permissions: ['unlimitedStorage'] },
        ])) === true;
    } catch {
      // A missing/older permissions implementation behaves as unsupported.
      return {
        supported: false,
        declared,
        granted: false,
        requestable: false,
        browser,
        reason: 'unsupported-api',
      };
    }

    return {
      supported: true,
      declared,
      granted,
      requestable: declared && !granted,
      browser,
      reason: granted ? 'already-granted' : declared ? 'available' : 'not-declared',
    };
  }

  async request(): Promise<UnlimitedStoragePermissionRequestResult> {
    // Keep all gating synchronous. Browser permission prompts require a live
    // user gesture, which would be lost by awaiting contains() first.
    const browser = this.detectBrowser();
    const permissionsApi = this.api.chromeApi.permissions;
    const { required, declared } = this.permissionDeclaration();
    if (required || browser === 'firefox') {
      const status = await this.getStatus();
      return {
        requested: false,
        granted: status.granted,
        reason: status.granted ? 'already-granted' : 'not-declared',
        status,
      };
    }

    const unsupportedReason: UnlimitedStoragePermissionReason = !declared
      ? 'not-declared'
      : 'unsupported-api';
    if (!declared || !permissionsApi?.request) {
      const status: UnlimitedStoragePermissionStatus = {
        supported: !!permissionsApi?.contains && !!permissionsApi?.request,
        declared,
        granted: false,
        requestable: false,
        browser,
        reason: unsupportedReason,
      };
      const reason: UnlimitedStoragePermissionRequestReason =
        unsupportedReason === 'not-declared' ? 'not-declared' : 'unsupported-api';
      return { requested: false, granted: false, reason, status };
    }

    try {
      // This must remain the first await in the supported path.
      const granted =
        (await this.api.call<boolean>(permissionsApi, permissionsApi.request, [
          { permissions: ['unlimitedStorage'] },
        ])) === true;
      const status = await this.getStatus();
      return {
        requested: true,
        granted,
        reason: granted ? 'granted' : 'denied',
        status,
      };
    } catch (error) {
      const status = await this.getStatus();
      return {
        requested: true,
        granted: false,
        reason: 'error',
        status,
        error: errorMessage(error),
      };
    }
  }

  localQuota(unlimitedGranted: boolean): EffectiveLocalQuota {
    const declared = this.api.chromeApi.storage?.local?.QUOTA_BYTES;
    const browser = this.detectBrowser();
    if (browser === 'safari') {
      if (!unlimitedGranted) return { quotaBytes: 5 * MEBIBYTE, estimated: false };

      const majorVersion = this.options.safariMajorVersion?.() ?? getSafariMajorVersion();
      const hasLegacyLimit =
        this.options.legacySafariStorageLimit?.() ?? hasLegacySafariStorageLimit();
      if (hasLegacyLimit || (majorVersion !== null && majorVersion < 16)) {
        return { quotaBytes: 10 * MEBIBYTE, estimated: false };
      }
      if (majorVersion !== null && majorVersion >= 16) {
        return { quotaBytes: null, estimated: false };
      }
      // An unknown Safari version keeps the conservative 10 MiB writer limit.
      return {
        quotaBytes:
          typeof declared === 'number' && declared > 0
            ? Math.min(declared, 10 * MEBIBYTE)
            : 10 * MEBIBYTE,
        estimated: true,
      };
    }

    if (unlimitedGranted) return { quotaBytes: null, estimated: false };
    if (typeof declared === 'number' && declared > 0) {
      return { quotaBytes: declared, estimated: false };
    }
    return { quotaBytes: (browser === 'firefox' ? 5 : 10) * MEBIBYTE, estimated: true };
  }

  syncQuota(declaredQuota: number | undefined): { quotaBytes: number; quotaEstimated: boolean } {
    return typeof declaredQuota === 'number' && declaredQuota > 0
      ? { quotaBytes: declaredQuota, quotaEstimated: false }
      : { quotaBytes: 100 * KIBIBYTE, quotaEstimated: true };
  }
}
