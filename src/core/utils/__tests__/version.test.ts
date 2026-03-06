/**
 * Tests for version management utilities
 */
import { describe, expect, it } from 'vitest';

import {
  EXTENSION_VERSION,
  FORMAT_VERSIONS,
  type FormatVersion,
  applyMigrations,
  compareVersions,
  getCompatibilityInfo,
  isSupportedFormat,
  isVersionCompatible,
  parseVersion,
} from '../version';

describe('Version Management', () => {
  describe('parseVersion', () => {
    it('should parse standard semantic versions', () => {
      const result = parseVersion('1.2.3');
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
      });
    });

    it('should parse versions with prerelease', () => {
      const result = parseVersion('1.2.3-beta.1');
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: 'beta.1',
      });
    });

    it('should return null for invalid versions', () => {
      expect(parseVersion('invalid')).toBeNull();
      expect(parseVersion('1.2')).toBeNull();
      expect(parseVersion('1.2.3.4')).toBeNull();
      expect(parseVersion('')).toBeNull();
    });

    it('should handle zero versions', () => {
      const result = parseVersion('0.0.0');
      expect(result).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
      });
    });
  });

  describe('compareVersions', () => {
    it('should compare major versions', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should compare minor versions', () => {
      expect(compareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0);
      expect(compareVersions('1.1.0', '1.2.0')).toBeLessThan(0);
      expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
    });

    it('should compare patch versions', () => {
      expect(compareVersions('1.0.2', '1.0.1')).toBeGreaterThan(0);
      expect(compareVersions('1.0.1', '1.0.2')).toBeLessThan(0);
      expect(compareVersions('1.0.1', '1.0.1')).toBe(0);
    });

    it('should handle prerelease versions', () => {
      expect(compareVersions('1.0.0', '1.0.0-beta')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0);
      expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0);
    });

    it('should throw on invalid versions', () => {
      expect(() => compareVersions('invalid', '1.0.0')).toThrow();
      expect(() => compareVersions('1.0.0', 'invalid')).toThrow();
    });

    it('should handle real-world version comparisons', () => {
      expect(compareVersions('0.7.7', '0.7.2')).toBeGreaterThan(0);
      expect(compareVersions('0.7.0', '0.7.2')).toBeLessThan(0);
      expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    });
  });

  describe('isVersionCompatible', () => {
    it('should accept versions meeting minimum requirement', () => {
      expect(isVersionCompatible('0.7.0', 'gemini-voyager.folders.v1')).toBe(true);
      expect(isVersionCompatible('0.7.5', 'gemini-voyager.folders.v1')).toBe(true);
      expect(isVersionCompatible('1.0.0', 'gemini-voyager.folders.v1')).toBe(true);
    });

    it('should reject versions below minimum requirement', () => {
      expect(isVersionCompatible('0.6.9', 'gemini-voyager.folders.v1')).toBe(false);
      expect(isVersionCompatible('0.5.0', 'gemini-voyager.folders.v1')).toBe(false);
    });

    it('should reject unknown format versions', () => {
      expect(isVersionCompatible('1.0.0', 'unknown.format.v99' as FormatVersion)).toBe(false);
    });

    it('should handle invalid version strings gracefully', () => {
      expect(isVersionCompatible('invalid', 'gemini-voyager.folders.v1')).toBe(false);
    });
  });

  describe('isSupportedFormat', () => {
    it('should recognize supported formats', () => {
      expect(isSupportedFormat('gemini-voyager.folders.v1')).toBe(true);
    });

    it('should reject unsupported formats', () => {
      expect(isSupportedFormat('unknown.format')).toBe(false);
      expect(isSupportedFormat('gemini-voyager.folders.v2')).toBe(false);
      expect(isSupportedFormat('')).toBe(false);
    });
  });

  describe('getCompatibilityInfo', () => {
    it('should return compatible info for valid versions', () => {
      const info = getCompatibilityInfo('0.7.5', 'gemini-voyager.folders.v1');
      expect(info.compatible).toBe(true);
      expect(info.currentVersion).toBe(EXTENSION_VERSION);
      expect(info.importVersion).toBe('0.7.5');
      expect(info.formatVersion).toBe('gemini-voyager.folders.v1');
      expect(info.minRequiredVersion).toBe('0.7.0');
      expect(info.reason).toBeUndefined();
    });

    it('should return incompatible info for old versions', () => {
      const info = getCompatibilityInfo('0.6.0', 'gemini-voyager.folders.v1');
      expect(info.compatible).toBe(false);
      expect(info.reason).toContain('below minimum required version');
    });

    it('should return incompatible info for unsupported formats', () => {
      const info = getCompatibilityInfo('1.0.0', 'unknown.format');
      expect(info.compatible).toBe(false);
      expect(info.reason).toContain('Unsupported format version');
    });

    it('should handle invalid version strings', () => {
      const info = getCompatibilityInfo('invalid', 'gemini-voyager.folders.v1');
      expect(info.compatible).toBe(false);
      expect(info.reason).toContain('Invalid version format');
    });
  });

  describe('applyMigrations', () => {
    it('should return data unchanged when no migrations apply', () => {
      const data = { test: 'data' };
      const result = applyMigrations(data, '0.7.0');
      expect(result.data).toEqual(data);
      expect(result.migrationsApplied).toHaveLength(0);
    });

    it('should handle data without throwing', () => {
      const data = { folders: [], folderContents: {} };
      expect(() => applyMigrations(data, '0.7.0')).not.toThrow();
    });

    // Note: Add specific migration tests when migrations are implemented
  });

  describe('EXTENSION_VERSION', () => {
    it('should be a valid semantic version', () => {
      const parsed = parseVersion(EXTENSION_VERSION);
      expect(parsed).not.toBeNull();
      expect(parsed?.major).toBeGreaterThanOrEqual(0);
      expect(parsed?.minor).toBeGreaterThanOrEqual(0);
      expect(parsed?.patch).toBeGreaterThanOrEqual(0);
    });

    it('should match manifest.json version format', () => {
      expect(EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    });
  });

  describe('FORMAT_VERSIONS', () => {
    it('should have valid minimum versions', () => {
      Object.values(FORMAT_VERSIONS).forEach((minVersion) => {
        const parsed = parseVersion(minVersion);
        expect(parsed).not.toBeNull();
      });
    });

    it('should include v1 format', () => {
      expect(FORMAT_VERSIONS['gemini-voyager.folders.v1']).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle version comparison edge cases', () => {
      expect(compareVersions('0.0.1', '0.0.0')).toBeGreaterThan(0);
      expect(compareVersions('10.0.0', '9.9.9')).toBeGreaterThan(0);
      expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    });

    it('should handle prerelease comparison edge cases', () => {
      expect(compareVersions('1.0.0-alpha', '1.0.0-alpha')).toBe(0);
      expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle current extension version compatibility', () => {
      const info = getCompatibilityInfo(EXTENSION_VERSION, 'gemini-voyager.folders.v1');
      expect(info.compatible).toBe(true);
    });

    it('should prevent imports from future versions gracefully', () => {
      // This test ensures we don't break if someone tries to import from a newer version
      // The system should handle it gracefully (though we may want to add warnings)
      const futureVersion = '99.0.0';
      const info = getCompatibilityInfo(futureVersion, 'gemini-voyager.folders.v1');
      expect(info.compatible).toBe(true); // Future versions are compatible
    });

    it('should handle version ranges correctly', () => {
      const versions = ['0.6.9', '0.7.0', '0.7.1', '0.7.7', '0.8.0', '1.0.0'];
      const format = 'gemini-voyager.folders.v1';

      versions.forEach((version) => {
        const compatible = isVersionCompatible(version, format);
        const shouldBeCompatible = compareVersions(version, '0.7.0') >= 0;
        expect(compatible).toBe(shouldBeCompatible);
      });
    });
  });
});
