import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DOMContentExtractor } from '@/features/export/services/DOMContentExtractor';
import { ExportFormat } from '@/features/export/types/export';
import type { ExportDialogOptions } from '@/features/export/ui/ExportDialog';

import {
  collectClaudeTurnWindow,
  mergeClaudeTurnWindows,
  scanClaudeConversation,
  startClaudeExport,
  stopClaudeExport,
} from '.';

const { dialogHide, dialogShow, exportConversation, getSavedImageExportWidth, showExportToast } =
  vi.hoisted(() => ({
    dialogHide: vi.fn(),
    dialogShow: vi.fn(),
    exportConversation: vi.fn().mockResolvedValue({ success: true, format: 'markdown' }),
    getSavedImageExportWidth: vi.fn().mockResolvedValue(620),
    showExportToast: vi.fn(),
  }));

vi.mock('@/features/export/ui/ExportDialog', () => ({
  ExportDialog: class {
    show = dialogShow;
    hide = dialogHide;
  },
}));

vi.mock('@/features/export/services/ConversationExportService', () => ({
  ConversationExportService: { export: exportConversation },
}));

vi.mock('@/features/export/services/ImageExportPreferenceService', () => ({
  getSavedImageExportWidth,
  saveImageExportWidth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/features/export/ui/ExportToast', () => ({ showExportToast }));

vi.mock('@/utils/i18n', () => ({ getCurrentLanguage: vi.fn().mockResolvedValue('en') }));

function addTurn(user: string, assistant?: string): void {
  const userElement = document.createElement('div');
  userElement.dataset.testid = 'user-message';
  userElement.textContent = user;
  document.body.appendChild(userElement);

  if (assistant !== undefined) {
    const assistantElement = document.createElement('div');
    assistantElement.className = 'font-claude-message';
    assistantElement.textContent = assistant;
    document.body.appendChild(assistantElement);
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Claude export plugin', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    history.replaceState({}, '', '/chat/claude-export-test');
    document.title = 'Export test | Claude';
    dialogHide.mockClear();
    dialogShow.mockClear();
    exportConversation.mockClear();
    getSavedImageExportWidth.mockClear();
    showExportToast.mockClear();
  });

  afterEach(() => {
    stopClaudeExport();
  });

  it('pairs mounted turns in document order and keeps incomplete final prompts', () => {
    addTurn('First question', 'First answer');
    addTurn('Second question', 'Second answer');
    addTurn('Pending question');

    expect(collectClaudeTurnWindow().map(({ user, assistant }) => ({ user, assistant }))).toEqual([
      { user: 'First question', assistant: 'First answer' },
      { user: 'Second question', assistant: 'Second answer' },
      { user: 'Pending question', assistant: '' },
    ]);
  });

  it('clones rich content before Claude virtualizes the original nodes out', () => {
    const user = document.createElement('div');
    user.dataset.testid = 'user-message';
    user.innerHTML = '<span>Explain this</span>';
    const assistantWrapper = document.createElement('div');
    assistantWrapper.dataset.testid = 'assistant-message';
    assistantWrapper.innerHTML =
      '<div class="font-claude-message"><p>Formula <span class="katex"><math><semantics><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span></p><img src="formula.png" alt="Formula plot"><pre><code>answer()</code></pre></div>';
    document.body.append(user, assistantWrapper);

    const [snapshot] = collectClaudeTurnWindow();
    document.body.innerHTML = '';

    expect(snapshot.userElement?.textContent).toContain('Explain this');
    expect(snapshot.assistantElement?.querySelector('.katex')?.getAttribute('data-math')).toBe(
      'x^2',
    );
    expect(snapshot.assistantElement?.querySelector('img')?.getAttribute('src')).toBe(
      'formula.png',
    );
    expect(snapshot.assistantElement?.querySelector('code')?.textContent).toBe('answer()');
    expect(snapshot.assistantElement?.isConnected).toBe(false);

    const extracted = DOMContentExtractor.extractAssistantContent(snapshot.assistantElement!);
    expect(extracted.text).toContain('$x^2$');
    expect(extracted.text).toContain('![Formula plot]');
    expect(extracted.text).toContain('```');
    expect(extracted.html).toContain('data-math="x^2"');
  });

  it('stitches overlapping virtualized windows without duplicates', () => {
    addTurn('One', 'A');
    addTurn('Two', 'B');
    addTurn('Three', 'C');
    const firstWindow = collectClaudeTurnWindow();

    document.body.innerHTML = '';
    addTurn('Two', 'B');
    addTurn('Three', 'C');
    addTurn('Four', 'D');
    const secondWindow = collectClaudeTurnWindow();

    const merged = mergeClaudeTurnWindows(firstWindow, secondWindow);
    expect(merged.map((turn) => turn.user)).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(new Set(merged.map((turn) => turn.hash)).size).toBe(4);
  });

  it('preserves legitimate repeated turns when only the final duplicate overlaps', () => {
    addTurn('Repeat', 'Same answer');
    addTurn('Repeat', 'Same answer');
    const firstWindow = collectClaudeTurnWindow();

    document.body.innerHTML = '';
    addTurn('Repeat', 'Same answer');
    addTurn('Next', 'New answer');
    const secondWindow = collectClaudeTurnWindow();

    const merged = mergeClaudeTurnWindows(firstWindow, secondWindow);
    expect(merged.map((turn) => turn.user)).toEqual(['Repeat', 'Repeat', 'Next']);
  });

  it('scans virtualized windows from top to bottom and restores the scroll position', async () => {
    const container = document.createElement('div');
    container.style.overflowY = 'auto';
    document.body.appendChild(container);
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 1800 });
    let scrollTop = 600;
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });

    const renderWindow = (top: number) => {
      container.innerHTML = '';
      if (top < 600) {
        const userOne = document.createElement('div');
        userOne.dataset.testid = 'user-message';
        userOne.textContent = 'One';
        const answerOne = document.createElement('div');
        answerOne.className = 'font-claude-message';
        answerOne.textContent = 'A';
        const userTwo = document.createElement('div');
        userTwo.dataset.testid = 'user-message';
        userTwo.textContent = 'Two';
        const answerTwo = document.createElement('div');
        answerTwo.className = 'font-claude-message';
        answerTwo.textContent = 'B';
        container.append(userOne, answerOne, userTwo, answerTwo);
      } else if (top < 1200) {
        const userTwo = document.createElement('div');
        userTwo.dataset.testid = 'user-message';
        userTwo.textContent = 'Two';
        const answerTwo = document.createElement('div');
        answerTwo.className = 'font-claude-message';
        answerTwo.textContent = 'B';
        const userThree = document.createElement('div');
        userThree.dataset.testid = 'user-message';
        userThree.textContent = 'Three';
        const answerThree = document.createElement('div');
        answerThree.className = 'font-claude-message';
        answerThree.textContent = 'C';
        container.append(userTwo, answerTwo, userThree, answerThree);
      } else {
        const userThree = document.createElement('div');
        userThree.dataset.testid = 'user-message';
        userThree.textContent = 'Three';
        const answerThree = document.createElement('div');
        answerThree.className = 'font-claude-message';
        answerThree.textContent = 'C';
        const userFour = document.createElement('div');
        userFour.dataset.testid = 'user-message';
        userFour.textContent = 'Four';
        const answerFour = document.createElement('div');
        answerFour.className = 'font-claude-message';
        answerFour.textContent = 'D';
        container.append(userThree, answerThree, userFour, answerFour);
      }
    };
    container.scrollTo = vi.fn((optionsOrX?: ScrollToOptions | number) => {
      scrollTop = typeof optionsOrX === 'number' ? optionsOrX : Number(optionsOrX?.top || 0);
      renderWindow(scrollTop);
    }) as typeof container.scrollTo;
    renderWindow(scrollTop);

    const turns = await scanClaudeConversation({ settle: async () => {} });

    expect(turns.map((turn) => turn.user)).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(scrollTop).toBe(600);
  });

  it('creates one localized action and removes all injected UI on stop', async () => {
    startClaudeExport();
    startClaudeExport();
    await flush();

    const buttons = document.querySelectorAll('#gv-claude-export-button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Export chat');
    expect(document.getElementById('gv-claude-export-style')).toBeTruthy();

    stopClaudeExport();

    expect(document.getElementById('gv-claude-export-button')).toBeNull();
    expect(document.getElementById('gv-claude-export-style')).toBeNull();
  });

  it('does not inject the action outside Claude conversation routes', async () => {
    history.replaceState({}, '', '/new');
    startClaudeExport();
    await flush();

    expect(document.getElementById('gv-claude-export-button')).toBeNull();
  });

  it('reports an empty conversation instead of invoking the export service', async () => {
    startClaudeExport();
    await flush();
    document.querySelector<HTMLButtonElement>('#gv-claude-export-button')?.click();
    await flush();

    const options = dialogShow.mock.calls[0]?.[0] as ExportDialogOptions;
    options.onExport(ExportFormat.MARKDOWN);
    await flush();

    expect(exportConversation).not.toHaveBeenCalled();
    expect(showExportToast).toHaveBeenCalledWith('No Claude conversation was found to export.');
  });
});
