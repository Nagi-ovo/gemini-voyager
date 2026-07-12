import type {
  HighlightAccountScope,
  HighlightCreateInput,
  HighlightMessage,
  HighlightRecordV1,
  HighlightUpdatePatch,
} from '@/core/types/highlight';

interface HighlightResponseBase {
  ok: boolean;
  error?: string;
}

interface HighlightListResponse extends HighlightResponseBase {
  records?: HighlightRecordV1[];
}

interface HighlightMutationResponse extends HighlightResponseBase {
  record?: HighlightRecordV1;
  removed?: boolean;
}

function sendMessage<T extends HighlightResponseBase>(message: HighlightMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response: T | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || 'Highlight operation failed'));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export class HighlightClient {
  async list(scope: HighlightAccountScope, conversationId: string): Promise<HighlightRecordV1[]> {
    const response = await sendMessage<HighlightListResponse>({
      type: 'gv.highlight.list',
      payload: { scope, conversationId },
    });
    return response.records ?? [];
  }

  async create(
    scope: HighlightAccountScope,
    input: HighlightCreateInput,
  ): Promise<HighlightRecordV1> {
    const response = await sendMessage<HighlightMutationResponse>({
      type: 'gv.highlight.create',
      payload: { scope, input },
    });
    if (!response.record) throw new Error('Highlight create response did not include a record');
    return response.record;
  }

  async update(
    scope: HighlightAccountScope,
    conversationId: string,
    id: string,
    patch: HighlightUpdatePatch,
  ): Promise<HighlightRecordV1> {
    const response = await sendMessage<HighlightMutationResponse>({
      type: 'gv.highlight.update',
      payload: { scope, conversationId, id, patch },
    });
    if (!response.record) throw new Error('Highlight update response did not include a record');
    return response.record;
  }

  async delete(scope: HighlightAccountScope, conversationId: string, id: string): Promise<void> {
    await sendMessage<HighlightMutationResponse>({
      type: 'gv.highlight.delete',
      payload: { scope, conversationId, id, tombstone: true },
    });
  }
}

export const highlightClient = new HighlightClient();
