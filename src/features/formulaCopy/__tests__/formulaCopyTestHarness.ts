import { afterEach, beforeEach, vi } from 'vitest';

import { FormulaCopyService } from '../FormulaCopyService';

// Mock dependencies
const storageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: {
        get: storageMocks.get,
      },
      onChanged: {
        addListener: storageMocks.addListener,
        removeListener: storageMocks.removeListener,
      },
    },
    i18n: {
      getMessage: vi.fn((key) => key),
    },
  },
}));

vi.mock('temml', () => ({
  default: {
    renderToString: vi.fn(),
  },
}));
export { storageMocks };
const originalBlob = globalThis.Blob;

class TestBlob {
  private readonly parts: string[];

  constructor(parts: BlobPart[], _options?: BlobPropertyBag) {
    this.parts = parts.map((part) => (typeof part === 'string' ? part : String(part)));
  }

  public async text(): Promise<string> {
    return this.parts.join('');
  }
}

export class TestClipboardItem {
  public readonly dataByType: Record<string, Blob>;

  constructor(dataByType: Record<string, Blob>) {
    this.dataByType = dataByType;
  }
}

export function resetSingleton(): void {
  (FormulaCopyService as unknown as { instance: FormulaCopyService | null }).instance = null;
}

export function setupFormulaCopyTestSuite() {
  let service: FormulaCopyService;
  const writeMock = vi.fn();
  const writeTextMock = vi.fn();

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    writeMock.mockReset().mockResolvedValue(undefined);
    writeTextMock.mockReset().mockResolvedValue(undefined);
    storageMocks.get.mockResolvedValue({});

    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        write: writeMock,
        writeText: writeTextMock,
      },
    });

    // Mock ClipboardItem
    (globalThis as unknown as { ClipboardItem: typeof TestClipboardItem }).ClipboardItem =
      TestClipboardItem;
    (globalThis as unknown as { Blob: typeof TestBlob }).Blob = TestBlob;

    resetSingleton();
    service = FormulaCopyService.getInstance({ observeGeminiArrows: true });
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
    document.body.innerHTML = '';
    (globalThis as unknown as { Blob: typeof originalBlob }).Blob = originalBlob;
    vi.clearAllMocks();
  });
  return {
    get service() {
      return service;
    },
    set service(value: FormulaCopyService) {
      service = value;
    },
    writeMock,
    writeTextMock,
  };
}
