import { AppError, ErrorCode } from '@/core/errors/AppError';
import {
  HighlightAnnotationError,
  HighlightAnnotationService,
  type HighlightScope,
  getHighlightAccountHash,
  highlightAnnotationService,
} from '@/core/services/HighlightAnnotationService';
import type { Result } from '@/core/types/common';
import type {
  HighlightExportPayloadV1,
  HighlightImportStats,
  HighlightRecordV1,
} from '@/core/types/highlight';
import { HIGHLIGHT_EXPORT_FORMAT, isHighlightExportPayloadV1 } from '@/core/types/highlight';
import { EXTENSION_VERSION } from '@/core/utils/version';

const MAX_IMPORT_BYTES = 110 * 1024 * 1024;

function errorResult<T>(error: unknown, fallbackMessage: string): Result<T> {
  if (error instanceof HighlightAnnotationError || error instanceof AppError) {
    return { success: false, error };
  }
  return {
    success: false,
    error: new AppError(
      ErrorCode.UNKNOWN_ERROR,
      fallbackMessage,
      undefined,
      error instanceof Error ? error : undefined,
    ),
  };
}

function timestampForFilename(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function safeConversationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function highlightDeepLink(record: HighlightRecordV1): string | null {
  const base = safeConversationUrl(record.conversationUrl);
  if (!base) return null;
  const url = new URL(base);
  url.hash = `gv-highlight-${record.id}`;
  return url.href;
}

function markdownQuote(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

function groupByConversation(records: readonly HighlightRecordV1[]): HighlightRecordV1[][] {
  const groups = new Map<string, HighlightRecordV1[]>();
  for (const record of records) {
    if (record.deletedAt !== undefined) continue;
    const key = `${record.platform}:${record.conversationId}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map((group) => group.sort((left, right) => left.createdAt - right.createdAt))
    .sort((left, right) => {
      const leftTitle = left[0]?.conversationTitle ?? left[0]?.conversationId ?? '';
      const rightTitle = right[0]?.conversationTitle ?? right[0]?.conversationId ?? '';
      return leftTitle.localeCompare(rightTitle);
    });
}

export class HighlightImportExportService {
  constructor(
    private readonly annotations: HighlightAnnotationService = highlightAnnotationService,
  ) {}

  static validatePayload(payload: unknown): Result<HighlightExportPayloadV1> {
    if (!payload || typeof payload !== 'object') {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Invalid highlight import: expected a JSON object',
        ),
      };
    }

    const candidate = payload as Record<string, unknown>;
    if (candidate.format !== HIGHLIGHT_EXPORT_FORMAT) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          `Unsupported highlight format: expected "${HIGHLIGHT_EXPORT_FORMAT}"`,
          { format: candidate.format },
        ),
      };
    }
    if (!isHighlightExportPayloadV1(payload)) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Highlight import contains invalid or oversized records',
        ),
      };
    }

    return { success: true, data: payload };
  }

  static generateExportFilename(date: Date = new Date()): string {
    return `gemini-voyager-highlights-${timestampForFilename(date)}.json`;
  }

  static generateMarkdownFilename(date: Date = new Date()): string {
    return `gemini-voyager-highlights-${timestampForFilename(date)}.md`;
  }

  async exportToPayload(scope: HighlightScope): Promise<Result<HighlightExportPayloadV1>> {
    try {
      const snapshot = await this.annotations.getAccountSnapshot(scope);
      return {
        success: true,
        data: {
          format: HIGHLIGHT_EXPORT_FORMAT,
          exportedAt: new Date().toISOString(),
          version: EXTENSION_VERSION,
          accountScope: snapshot.accountScope,
          ...(snapshot.clearMarker ? { clearMarker: snapshot.clearMarker } : {}),
          items: snapshot.records,
        },
      };
    } catch (error) {
      return errorResult(error, 'Failed to export highlights');
    }
  }

  async exportToJSON(scope: HighlightScope): Promise<Result<string>> {
    const payload = await this.exportToPayload(scope);
    if (!payload.success) return payload;
    return { success: true, data: JSON.stringify(payload.data, null, 2) };
  }

  async exportToMarkdown(scope: HighlightScope): Promise<Result<string>> {
    try {
      const records = await this.annotations.getAll(scope);
      const lines = [
        '# Gemini Voyager Highlights',
        '',
        `Exported: ${new Date().toISOString()}`,
        '',
      ];

      for (const group of groupByConversation(records)) {
        const first = group[0];
        if (!first) continue;
        lines.push(`## ${first.conversationTitle?.trim() || first.conversationId}`, '');
        const url = safeConversationUrl(first.conversationUrl);
        if (url) lines.push(`[Open conversation](<${url}>)`, '');

        for (const record of group) {
          lines.push(
            `### ${new Date(record.createdAt).toISOString()} · ${record.color}`,
            '',
            markdownQuote(record.anchor.quote.exact),
            '',
          );
          const deepLink = highlightDeepLink(record);
          if (deepLink) lines.push(`[Open highlight](<${deepLink}>)`, '');
          if (record.note) lines.push(record.note, '');
        }
      }

      return { success: true, data: `${lines.join('\n').trimEnd()}\n` };
    } catch (error) {
      return errorResult(error, 'Failed to export highlights as Markdown');
    }
  }

  async importFromPayload(
    scope: HighlightScope,
    payload: unknown,
  ): Promise<Result<HighlightImportStats>> {
    const validated = HighlightImportExportService.validatePayload(payload);
    if (!validated.success) return validated;

    const expectedAccountHash = getHighlightAccountHash(scope);
    if (
      validated.data.accountScope.accountHash !== expectedAccountHash ||
      validated.data.accountScope.platform !== scope.platform
    ) {
      return {
        success: false,
        error: new HighlightAnnotationError(
          'ACCOUNT_MISMATCH',
          'Highlight import belongs to a different account or platform',
          {
            expectedAccountHash,
            actualAccountHash: validated.data.accountScope.accountHash,
            expectedPlatform: scope.platform,
            actualPlatform: validated.data.accountScope.platform,
          },
        ),
      };
    }

    try {
      const stats = await this.annotations.importMerge(scope, validated.data.items, {
        clearMarker: validated.data.clearMarker,
      });
      return { success: true, data: stats };
    } catch (error) {
      return errorResult(error, 'Failed to import highlights');
    }
  }

  async importFromJSON(scope: HighlightScope, json: string): Promise<Result<HighlightImportStats>> {
    if (new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Highlight import exceeds the maximum supported file size',
          { maximumBytes: MAX_IMPORT_BYTES },
        ),
      };
    }
    try {
      return await this.importFromPayload(scope, JSON.parse(json) as unknown);
    } catch (error) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Highlight import is not valid JSON',
          undefined,
          error instanceof Error ? error : undefined,
        ),
      };
    }
  }

  static async readJSONFile(file: File): Promise<Result<unknown>> {
    if (file.size > MAX_IMPORT_BYTES) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Highlight import exceeds the maximum supported file size',
          { maximumBytes: MAX_IMPORT_BYTES, actualBytes: file.size },
        ),
      };
    }
    try {
      return { success: true, data: JSON.parse(await file.text()) as unknown };
    } catch (error) {
      return {
        success: false,
        error: new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Highlight import is not valid JSON',
          undefined,
          error instanceof Error ? error : undefined,
        ),
      };
    }
  }
}

export const highlightImportExportService = new HighlightImportExportService();
