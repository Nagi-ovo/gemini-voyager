/**
 * Version management utilities
 * Provides centralized version handling and semantic version comparison
 */
// Import version from manifest to ensure single source of truth
import manifestChrome from '../../../manifest.json';

/**
 * Current extension version from manifest.json
 * This is the single source of truth for version information
 */
export const EXTENSION_VERSION = manifestChrome.version;

/**
 * Supported format versions for import/export
 * Maps format version to minimum compatible extension version
 */
export const FORMAT_VERSIONS = {
  'gemini-voyager.folders.v1': '0.7.0', // Minimum version that supports v1 format
} as const;

export type FormatVersion = keyof typeof FORMAT_VERSIONS;

/**
 * Parse semantic version string into comparable parts
 */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * Parse a semantic version string
 * @param version - Version string (e.g., "1.2.3" or "1.2.3-beta.1")
 * @returns Parsed semantic version or null if invalid
 */
export function parseVersion(version: string): SemanticVersion | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Compare two semantic versions
 * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);

  if (!parsed1 || !parsed2) {
    throw new Error(`Invalid version format: ${!parsed1 ? v1 : v2}`);
  }

  // Compare major.minor.patch
  if (parsed1.major !== parsed2.major) {
    return parsed1.major - parsed2.major;
  }
  if (parsed1.minor !== parsed2.minor) {
    return parsed1.minor - parsed2.minor;
  }
  if (parsed1.patch !== parsed2.patch) {
    return parsed1.patch - parsed2.patch;
  }

  // Handle prerelease versions
  if (parsed1.prerelease && !parsed2.prerelease) {
    return -1; // 1.0.0-beta < 1.0.0
  }
  if (!parsed1.prerelease && parsed2.prerelease) {
    return 1; // 1.0.0 > 1.0.0-beta
  }
  if (parsed1.prerelease && parsed2.prerelease) {
    return parsed1.prerelease.localeCompare(parsed2.prerelease);
  }

  return 0;
}

/**
 * Check if a version is compatible with current extension version
 * @param importVersion - Version from imported data
 * @param formatVersion - Format version of the data
 * @returns true if compatible, false otherwise
 */
export function isVersionCompatible(importVersion: string, formatVersion: FormatVersion): boolean {
  try {
    const minVersion = FORMAT_VERSIONS[formatVersion];
    if (!minVersion) {
      return false; // Unknown format version
    }

    // Validate version format first
    if (!parseVersion(importVersion)) {
      return false; // Invalid version format
    }

    // Check if import version meets minimum requirement
    const comparison = compareVersions(importVersion, minVersion);
    return comparison >= 0;
  } catch {
    return false;
  }
}

/**
 * Check if format version is supported
 */
export function isSupportedFormat(format: string): format is FormatVersion {
  return format in FORMAT_VERSIONS;
}

/**
 * Get compatibility information for an import
 */
export interface CompatibilityInfo {
  compatible: boolean;
  currentVersion: string;
  importVersion: string;
  formatVersion: string;
  minRequiredVersion?: string;
  reason?: string;
}

/**
 * Get detailed compatibility information
 */
export function getCompatibilityInfo(
  importVersion: string,
  formatVersion: string,
): CompatibilityInfo {
  const info: CompatibilityInfo = {
    compatible: false,
    currentVersion: EXTENSION_VERSION,
    importVersion,
    formatVersion,
  };

  // Check if format is supported
  if (!isSupportedFormat(formatVersion)) {
    info.reason = `Unsupported format version: ${formatVersion}`;
    return info;
  }

  const minVersion = FORMAT_VERSIONS[formatVersion];
  info.minRequiredVersion = minVersion;

  // Validate version format first
  if (!parseVersion(importVersion)) {
    info.reason = `Invalid version format: ${importVersion}`;
    return info;
  }

  // Check version compatibility
  try {
    const compatible = isVersionCompatible(importVersion, formatVersion);
    info.compatible = compatible;

    if (!compatible) {
      info.reason = `Import version ${importVersion} is below minimum required version ${minVersion}`;
    }
  } catch {
    info.reason = `Invalid version format: ${importVersion}`;
  }

  return info;
}

/**
 * Version migration registry
 * Maps version ranges to migration functions
 */
export interface VersionMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (data: unknown) => unknown;
  description: string;
}

/**
 * Registry of data migrations for version upgrades
 * Add new migrations here when data structure changes
 */
export const VERSION_MIGRATIONS: VersionMigration[] = [
  // Example migration (add real migrations as needed):
  // {
  //   fromVersion: '0.7.0',
  //   toVersion: '0.8.0',
  //   migrate: (data) => {
  //     // Transform data structure
  //     return data;
  //   },
  //   description: 'Add new field to folder structure'
  // }
];

/**
 * Apply necessary migrations to bring data up to current version
 */
export function applyMigrations(
  data: unknown,
  fromVersion: string,
): { data: unknown; migrationsApplied: string[] } {
  let currentData = data;
  const migrationsApplied: string[] = [];

  for (const migration of VERSION_MIGRATIONS) {
    // Check if this migration should be applied
    if (
      compareVersions(fromVersion, migration.fromVersion) >= 0 &&
      compareVersions(fromVersion, migration.toVersion) < 0
    ) {
      try {
        currentData = migration.migrate(currentData);
        migrationsApplied.push(
          `${migration.fromVersion} → ${migration.toVersion}: ${migration.description}`,
        );
      } catch (error) {
        throw new Error(
          `Migration failed (${migration.fromVersion} → ${migration.toVersion}): ${error}`,
        );
      }
    }
  }

  return { data: currentData, migrationsApplied };
}
