import { describe, expect, it } from 'vitest';

import {
  extractDmgDownloadUrl,
  extractLatestReleaseVersion,
  getCachedLatestVersion,
  getManifestUpdateUrl,
} from '../utils/latestVersion';

describe('Popup latest version helpers', () => {
  describe('getManifestUpdateUrl', () => {
    it('returns null for non-objects', () => {
      expect(getManifestUpdateUrl(undefined)).toBeNull();
      expect(getManifestUpdateUrl(null)).toBeNull();
      expect(getManifestUpdateUrl('x')).toBeNull();
      expect(getManifestUpdateUrl(123)).toBeNull();
    });

    it('returns null when update_url is missing/blank', () => {
      expect(getManifestUpdateUrl({})).toBeNull();
      expect(getManifestUpdateUrl({ update_url: '' })).toBeNull();
      expect(getManifestUpdateUrl({ update_url: '   ' })).toBeNull();
      expect(getManifestUpdateUrl({ update_url: 123 })).toBeNull();
    });

    it('returns update_url when present', () => {
      expect(getManifestUpdateUrl({ update_url: 'https://example.com/update.xml' })).toBe(
        'https://example.com/update.xml',
      );
    });
  });

  describe('extractLatestReleaseVersion', () => {
    it('does not throw on unexpected JSON shapes', () => {
      expect(extractLatestReleaseVersion(null)).toBeNull();
      expect(extractLatestReleaseVersion('x')).toBeNull();
      expect(extractLatestReleaseVersion([])).toBeNull();
    });

    it('prefers tag_name over name', () => {
      expect(extractLatestReleaseVersion({ tag_name: 'v1.2.3', name: 'v9.9.9' })).toBe('v1.2.3');
    });

    it('falls back to name when tag_name is missing', () => {
      expect(extractLatestReleaseVersion({ name: 'v1.2.3' })).toBe('v1.2.3');
    });

    it('returns null when neither tag_name nor name is usable', () => {
      expect(extractLatestReleaseVersion({ tag_name: '', name: '' })).toBeNull();
      expect(extractLatestReleaseVersion({ tag_name: 123, name: false })).toBeNull();
    });
  });

  describe('extractDmgDownloadUrl', () => {
    it('returns null for non-objects', () => {
      expect(extractDmgDownloadUrl(null)).toBeNull();
      expect(extractDmgDownloadUrl('x')).toBeNull();
      expect(extractDmgDownloadUrl(123)).toBeNull();
    });

    it('returns null when assets is missing or not an array', () => {
      expect(extractDmgDownloadUrl({})).toBeNull();
      expect(extractDmgDownloadUrl({ assets: 'nope' })).toBeNull();
      expect(extractDmgDownloadUrl({ assets: null })).toBeNull();
    });

    it('returns null when no .dmg asset exists', () => {
      expect(
        extractDmgDownloadUrl({
          assets: [
            { name: 'gemini-voyager-chrome-v1.3.3.zip', browser_download_url: 'https://x/a.zip' },
            { name: 'gemini-voyager-firefox-v1.3.3.xpi', browser_download_url: 'https://x/a.xpi' },
          ],
        }),
      ).toBeNull();
    });

    it('returns null when assets array is empty', () => {
      expect(extractDmgDownloadUrl({ assets: [] })).toBeNull();
    });

    it('returns the DMG download URL when present', () => {
      const url =
        'https://github.com/Nagi-ovo/gemini-voyager/releases/download/v1.3.3/gemini-voyager-v1.3.3.dmg';
      expect(
        extractDmgDownloadUrl({
          assets: [
            { name: 'gemini-voyager-chrome-v1.3.3.zip', browser_download_url: 'https://x/a.zip' },
            { name: 'gemini-voyager-v1.3.3.dmg', browser_download_url: url },
          ],
        }),
      ).toBe(url);
    });

    it('skips assets with missing or blank download URL', () => {
      expect(
        extractDmgDownloadUrl({
          assets: [{ name: 'foo.dmg', browser_download_url: '' }],
        }),
      ).toBeNull();
      expect(
        extractDmgDownloadUrl({
          assets: [{ name: 'foo.dmg', browser_download_url: 123 }],
        }),
      ).toBeNull();
    });

    it('skips non-object assets', () => {
      expect(extractDmgDownloadUrl({ assets: ['string', null, 123] })).toBeNull();
    });
  });

  describe('getCachedLatestVersion', () => {
    it('returns cached version when fresh', () => {
      const now = 1_000_000;
      const maxAgeMs = 10_000;
      expect(getCachedLatestVersion({ version: 'v1.2.3', fetchedAt: now - 1 }, now, maxAgeMs)).toBe(
        'v1.2.3',
      );
    });

    it('returns null when stale or invalid', () => {
      const now = 1_000_000;
      const maxAgeMs = 10_000;

      expect(
        getCachedLatestVersion({ version: 'v1.2.3', fetchedAt: now - maxAgeMs }, now, maxAgeMs),
      ).toBeNull();
      expect(getCachedLatestVersion({ version: '', fetchedAt: now - 1 }, now, maxAgeMs)).toBeNull();
      expect(
        getCachedLatestVersion({ version: 'v1.2.3', fetchedAt: 'x' }, now, maxAgeMs),
      ).toBeNull();
      expect(getCachedLatestVersion('x', now, maxAgeMs)).toBeNull();
    });
  });
});
