/**
 * Service for importing and exporting prompt configurations
 * Follows enterprise best practices with proper validation and error handling
 * Extracted from prompt manager to follow DRY principle
 */
import { AppError, ErrorCode } from '@/core/errors/AppError';
import type { Result } from '@/core/types/common';
import { EXTENSION_VERSION } from '@/core/utils/version';

import type { PromptExportPayload, PromptItem } from '../types/backup';

const EXPORT_FORMAT = 'gemini-voyager.prompts.v1' as const;
const STORAGE_KEY = 'gvPromptItems';

/**
 * Service for handling prompt import/export operations
 */
export class PromptImportExportService {
  /**
   * Export prompt data to a JSON payload
   * Uses centralized version management to ensure consistency
   */
  static exportToPayload(items: PromptItem[]): PromptExportPayload {
    return {
      format: EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      version: EXTENSION_VERSION,
      items,
    };
  }

  /**
   * Validate import payload format and structure
   */
  static validatePayload(payload: unknown): Result<PromptExportPayload> {
    // Check if payload is an object
    if (!payload || typeof payload !== 'object') {
      return {
        success: false,
        error: new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid payload: expected an object', {
          payload,
        }),
      };
    }

    const p = payload as Record<string, unknown>;

    // Check format version
    if (p.format !== EXPORT_FORMAT) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Unsupported format: expected "${EXPORT_FORMAT}", got "${p.format}"`,
          { format: p.format },
        ),
      };
    }

    // Check items array
    if (!Array.isArray(p.items)) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Invalid "items" field: expected an array',
          { items: p.items },
        ),
      };
    }

    // Basic structure validation for items
    for (const item of p.items) {
      if (!item || typeof item !== 'object') {
        return {
          success: false,
          error: new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid prompt item object', { item }),
        };
      }

      const i = item as Record<string, unknown>;
      if (!i.text || typeof i.text !== 'string') {
        return {
          success: false,
          error: new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Prompt item missing valid "text" field',
            { item },
          ),
        };
      }

      if (!Array.isArray(i.tags)) {
        return {
          success: false,
          error: new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Prompt item missing valid "tags" field',
            { item },
          ),
        };
      }
    }

    return {
      success: true,
      data: payload as PromptExportPayload,
    };
  }

  /**
   * Load prompts from localStorage
   */
  static async loadPrompts(): Promise<Result<PromptItem[]>> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return {
          success: true,
          data: [],
        };
      }

      const items = JSON.parse(raw) as PromptItem[];
      return {
        success: true,
        data: Array.isArray(items) ? items : [],
      };
    } catch (error) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.STORAGE_READ_FAILED,
          'Failed to load prompts from localStorage',
          { key: STORAGE_KEY },
          error instanceof Error ? error : undefined,
        ),
      };
    }
  }

  /**
   * Save prompts to localStorage
   */
  static async savePrompts(items: PromptItem[]): Promise<Result<void>> {
    try {
      const raw = JSON.stringify(items);
      localStorage.setItem(STORAGE_KEY, raw);
      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.STORAGE_WRITE_FAILED,
          'Failed to save prompts to localStorage',
          { key: STORAGE_KEY, itemCount: items.length },
          error instanceof Error ? error : undefined,
        ),
      };
    }
  }

  /**
   * Generate filename for export with timestamp
   */
  static generateExportFilename(): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `gemini-voyager-prompts-${y}${m}${day}-${hh}${mm}${ss}.json`;
  }

  /**
   * Export prompts to JSON string
   */
  static async exportToJSON(): Promise<Result<string>> {
    const result = await this.loadPrompts();
    if (!result.success) {
      return result;
    }

    const payload = this.exportToPayload(result.data);
    return {
      success: true,
      data: JSON.stringify(payload, null, 2),
    };
  }

  /**
   * Import prompts from payload
   * Merges with existing prompts (deduplicates by text)
   * @param payload - The import payload
   * @returns Result with import statistics
   */
  static async importFromPayload(payload: PromptExportPayload): Promise<
    Result<{
      imported: number;
      duplicates: number;
      total: number;
    }>
  > {
    try {
      // Load existing prompts
      const loadResult = await this.loadPrompts();
      if (!loadResult.success) {
        return loadResult;
      }

      const existingItems = loadResult.data;
      const importItems = payload.items;

      // Deduplicate and merge
      const existingMap = new Map<string, PromptItem>();
      for (const item of existingItems) {
        existingMap.set(item.text.toLowerCase(), item);
      }

      let imported = 0;
      let duplicates = 0;

      for (const item of importItems) {
        const key = item.text.toLowerCase();
        if (existingMap.has(key)) {
          // Merge tags if duplicate
          const existing = existingMap.get(key)!;
          const mergedTags = Array.from(new Set([...(existing.tags || []), ...(item.tags || [])]));
          existing.tags = mergedTags;
          existing.updatedAt = Date.now();
          duplicates++;
        } else {
          existingMap.set(key, {
            ...item,
            createdAt: Date.now(),
          });
          imported++;
        }
      }

      // Save merged results
      const mergedItems = Array.from(existingMap.values()).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
      );

      const saveResult = await this.savePrompts(mergedItems);
      if (!saveResult.success) {
        return saveResult;
      }

      return {
        success: true,
        data: {
          imported,
          duplicates,
          total: mergedItems.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.UNKNOWN_ERROR,
          'Failed to import prompts',
          { payload },
          error instanceof Error ? error : undefined,
        ),
      };
    }
  }

  /**
   * Download JSON file to user's computer
   */
  static downloadJSON(payload: PromptExportPayload, filename?: string): void {
    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || this.generateExportFilename();
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    }, 0);
  }

  /**
   * Read and parse JSON file from user upload
   */
  static async readJSONFile(file: File): Promise<Result<unknown>> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      return {
        success: true,
        data: parsed,
      };
    } catch (error) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Failed to parse JSON file',
          { fileName: file.name },
          error instanceof Error ? error : undefined,
        ),
      };
    }
  }
}
