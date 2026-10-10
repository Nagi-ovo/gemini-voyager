/**
 * The Templates section of the research pack panel: pick a saved template
 * into the instruction, save the instruction as one, and share one as a file.
 *
 * Templates are Prompt Manager prompts (see `templates.ts`), so everything
 * here reads and adds to the prompt library and nothing else. A file being
 * imported is shown in full and saved only on an explicit Save; every string
 * from storage or a file is written with `textContent` / `value`.
 */
import {
  RESEARCH_PACK_TEMPLATE_LIMITS,
  type ResearchPackTemplate,
  type TemplateDraft,
  type TemplateLibrary,
  type TemplateSaveStatus,
  buildTemplateFile,
  buildTemplateFilename,
  checkTemplateDraft,
  listTemplates,
  parseTemplateFile,
  planTemplateSave,
} from '@/features/researchPack/services/templates';
import type { TranslationKey } from '@/utils/translations';

type Translate = (key: TranslationKey) => string;

export interface TemplatesSectionDeps {
  t: Translate;
  library: TemplateLibrary;
  /** The instruction as currently typed. */
  instruction: () => string;
  /** Put a template's text into the instruction and save it to the pack. */
  applyInstruction: (text: string) => void;
  /** Ask before a destructive step; resolves true only when the user confirms. */
  confirm: (request: {
    anchor: HTMLElement;
    message: string;
    confirmLabel: string;
  }) => Promise<boolean>;
  notify: (message: string, tone?: 'ok' | 'error') => void;
  download: (filename: string, content: string) => void;
  now?: () => number;
}

export interface TemplatesSection {
  readonly root: HTMLElement;
  /** Read the template list again from the prompt library. */
  refresh: () => void;
  /** While the pack has no snapshot, nothing here may act. */
  setLocked: (locked: boolean) => void;
  relabel: () => void;
  destroy: () => void;
}

const STATUS_LABELS = {
  new: 'researchPackTemplateStatusNew',
  duplicate_text: 'researchPackTemplateStatusDuplicate',
  name_taken: 'researchPackTemplateStatusNameTaken',
} as const satisfies Record<TemplateSaveStatus, TranslationKey>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(className: string): HTMLButtonElement {
  const element = el('button', className);
  element.type = 'button';
  return element;
}

export function createTemplatesSection(deps: TemplatesSectionDeps): TemplatesSection {
  const { t } = deps;
  const now = deps.now ?? Date.now;

  const root = el('details', 'gv-rp-templates');
  const summary = el('summary', 'gv-rp-templates-summary');
  const hint = el('p', 'gv-rp-templates-hint');

  const pickRow = el('div', 'gv-rp-templates-row');
  const select = el('select', 'gv-rp-template-select');
  const useButton = button('gv-rp-btn gv-rp-template-use');
  const exportButton = button('gv-rp-btn gv-rp-template-export');
  pickRow.append(select, useButton, exportButton);

  const saveRow = el('div', 'gv-rp-templates-row');
  const nameInput = el('input', 'gv-rp-template-name');
  nameInput.type = 'text';
  nameInput.maxLength = RESEARCH_PACK_TEMPLATE_LIMITS.maxNameChars;
  const saveButton = button('gv-rp-btn gv-rp-template-save');
  saveRow.append(nameInput, saveButton);

  const importRow = el('div', 'gv-rp-templates-row');
  const importButton = button('gv-rp-btn gv-rp-template-import');
  const fileInput = el('input', 'gv-rp-template-file');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  importRow.append(importButton, fileInput);

  const preview = el('div', 'gv-rp-template-preview');
  preview.hidden = true;
  const previewTitle = el('p', 'gv-rp-template-preview-title');
  const previewList = el('ul', 'gv-rp-template-preview-list');
  const previewActions = el('div', 'gv-rp-templates-row');
  const previewSave = button('gv-rp-btn gv-rp-btn-primary gv-rp-template-preview-save');
  const previewCancel = button('gv-rp-btn gv-rp-template-preview-cancel');
  previewActions.append(previewSave, previewCancel);
  preview.append(previewTitle, previewList, previewActions);

  root.append(summary, hint, pickRow, saveRow, importRow, preview);

  let stopped = false;
  let locked = false;
  let busy = false;
  let templates: ResearchPackTemplate[] = [];
  let pending: TemplateDraft[] | null = null;
  // Each refresh and each import gets a number; an older one never paints over a newer one.
  let refreshSeq = 0;
  let importSeq = 0;
  /** The file being read for an import, kept so a cancel or teardown can abort it. */
  let reader: FileReader | null = null;

  const abortRead = (): void => {
    const current = reader;
    reader = null;
    current?.abort();
  };

  const readFileText = (file: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      abortRead();
      const current = new FileReader();
      reader = current;
      const settle = (): void => {
        if (reader === current) reader = null;
      };
      current.onload = () => {
        settle();
        resolve(String(current.result ?? ''));
      };
      current.onerror = () => {
        settle();
        reject(current.error ?? new Error('read failed'));
      };
      current.onabort = () => {
        settle();
        reject(new Error('read aborted'));
      };
      current.readAsText(file);
    });

  const selected = (): ResearchPackTemplate | null =>
    templates.find((template) => template.id === select.value) ?? null;

  /**
   * The template with this id as it is listed now, reduced to the checked
   * name and text that Use and Export hand on. Any prompt tagged in Prompt
   * Manager is a template, and Prompt Manager has no length limit, so one that
   * breaks a limit is refused here instead of being clipped into the
   * instruction or exported as a file the import would reject. The checked
   * text is what is used: stored padding could otherwise pass the trimmed
   * check and still crowd the body out of the clipped instruction.
   */
  const checkedTemplate = (id: string): TemplateDraft | null => {
    const template = templates.find((entry) => entry.id === id);
    if (!template || locked || stopped) return null;
    const draft = checkTemplateDraft(template.name, template.text);
    if (!draft) deps.notify(t('researchPackTemplateInvalid'), 'error');
    return draft;
  };

  const syncControls = (): void => {
    const off = locked || busy;
    select.disabled = off || templates.length === 0;
    useButton.disabled = off || !selected();
    exportButton.disabled = off || !selected();
    nameInput.disabled = off;
    saveButton.disabled = off;
    importButton.disabled = off;
    previewSave.disabled = off || !pending?.length;
  };

  const renderOptions = (): void => {
    const keep = select.value;
    const placeholder = el(
      'option',
      '',
      t(templates.length > 0 ? 'researchPackTemplatePick' : 'researchPackTemplateNone'),
    );
    placeholder.value = '';
    const options = templates.map((template) => {
      const option = el('option', '', template.name);
      option.value = template.id;
      return option;
    });
    select.replaceChildren(placeholder, ...options);
    select.value = templates.some((template) => template.id === keep) ? keep : '';
    syncControls();
  };

  const refresh = (): void => {
    const seq = ++refreshSeq;
    void deps.library.load().then(
      (library) => {
        if (stopped || seq !== refreshSeq) return;
        templates = listTemplates(library);
        renderOptions();
      },
      () => undefined,
    );
  };

  /** Run one library write at a time, with every control off while it runs. */
  const withBusy = async (work: () => Promise<void>): Promise<void> => {
    if (busy) return;
    busy = true;
    syncControls();
    try {
      await work();
    } catch {
      if (!stopped) deps.notify(t('researchPackTemplateFailed'), 'error');
    } finally {
      busy = false;
      if (!stopped) syncControls();
    }
  };

  const closePreview = (): void => {
    pending = null;
    importSeq += 1;
    abortRead();
    preview.hidden = true;
    previewList.replaceChildren();
    syncControls();
  };

  const showPreview = (planned: ReturnType<typeof planTemplateSave>): void => {
    pending = planned.filter((entry) => entry.status === 'new');
    previewList.replaceChildren(
      ...planned.map((entry) => {
        const row = el('li', 'gv-rp-template-preview-item');
        row.dataset.status = entry.status;
        const head = el('div', 'gv-rp-template-preview-head');
        head.append(
          el('span', 'gv-rp-template-preview-name', entry.name),
          el('span', 'gv-rp-badge', t(STATUS_LABELS[entry.status])),
        );
        row.append(head, el('pre', 'gv-rp-template-preview-text', entry.text));
        return row;
      }),
    );
    preview.hidden = false;
    syncControls();
  };

  const importFile = async (file: File): Promise<void> => {
    const seq = ++importSeq;
    const invalid = (): void => {
      if (!stopped && seq === importSeq)
        deps.notify(t('researchPackTemplateImportInvalid'), 'error');
    };
    // Checked before reading, so a huge file is never loaded.
    if (file.size > RESEARCH_PACK_TEMPLATE_LIMITS.maxFileBytes) {
      invalid();
      return;
    }
    let content;
    try {
      content = await readFileText(file);
    } catch {
      invalid();
      return;
    }
    if (stopped || seq !== importSeq) return;
    const parsed = parseTemplateFile(content);
    if (!parsed.ok) {
      invalid();
      return;
    }
    const library = await deps.library.load();
    if (stopped || seq !== importSeq) return;
    showPreview(planTemplateSave(library, parsed.templates));
  };

  const applyTemplate = async (): Promise<void> => {
    const id = select.value;
    const template = checkedTemplate(id);
    if (!template) return;
    const typed = deps.instruction().trim();
    if (!typed || typed === template.text) {
      deps.applyInstruction(template.text);
      return;
    }
    const confirmed = await deps.confirm({
      anchor: useButton,
      message: t('researchPackTemplateUseConfirm'),
      confirmLabel: t('researchPackTemplateReplace'),
    });
    if (!confirmed) return;
    // The template may have been edited or deleted while the confirm was open.
    const current = checkedTemplate(id);
    if (current) deps.applyInstruction(current.text);
  };

  const saveTemplate = (): Promise<void> =>
    withBusy(async () => {
      const name = nameInput.value;
      const text = deps.instruction();
      if (!name.trim()) {
        deps.notify(t('researchPackTemplateNeedName'), 'error');
        nameInput.focus();
        return;
      }
      if (!text.trim()) {
        deps.notify(t('researchPackTemplateNeedInstruction'), 'error');
        return;
      }
      const draft = checkTemplateDraft(name, text);
      if (!draft) {
        deps.notify(t('researchPackTemplateInvalid'), 'error');
        return;
      }
      const library = await deps.library.load();
      if (stopped) return;
      const [planned] = planTemplateSave(library, [draft]);
      if (planned.status !== 'new') {
        deps.notify(
          t(
            planned.status === 'duplicate_text'
              ? 'researchPackTemplateDuplicate'
              : 'researchPackTemplateNameTaken',
          ),
          'error',
        );
        return;
      }
      const added = await deps.library.save([draft]);
      if (stopped) return;
      if (added === 0) {
        deps.notify(t('researchPackTemplateDuplicate'), 'error');
        return;
      }
      nameInput.value = '';
      deps.notify(t('researchPackTemplateSaved'));
      refresh();
    });

  const saveImport = (): Promise<void> =>
    withBusy(async () => {
      const drafts = pending;
      if (stopped || !drafts?.length) return;
      const added = await deps.library.save(drafts);
      if (stopped) return;
      closePreview();
      deps.notify(
        added > 0
          ? t('researchPackTemplateImported').split('{count}').join(String(added))
          : t('researchPackTemplateImportNothing'),
        added > 0 ? 'ok' : 'error',
      );
      refresh();
    });

  select.addEventListener('change', syncControls);
  useButton.addEventListener('click', () => void applyTemplate());
  exportButton.addEventListener('click', () => {
    const template = checkedTemplate(select.value);
    if (!template) return;
    const at = now();
    deps.download(buildTemplateFilename(at), buildTemplateFile(template, at));
  });
  saveButton.addEventListener('click', () => void saveTemplate());
  importButton.addEventListener('click', () => {
    closePreview();
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    // Cleared so choosing the same file again still fires a change.
    fileInput.value = '';
    if (!file) return;
    void importFile(file).catch(() => {
      if (!stopped) deps.notify(t('researchPackTemplateFailed'), 'error');
    });
  });
  previewSave.addEventListener('click', () => void saveImport());
  previewCancel.addEventListener('click', closePreview);

  const relabel = (): void => {
    summary.textContent = t('researchPackTemplates');
    hint.textContent = t('researchPackTemplatesHint');
    select.setAttribute('aria-label', t('researchPackTemplatePick'));
    useButton.textContent = t('researchPackTemplateUse');
    exportButton.textContent = t('researchPackTemplateExport');
    nameInput.placeholder = t('researchPackTemplateName');
    nameInput.setAttribute('aria-label', t('researchPackTemplateName'));
    saveButton.textContent = t('researchPackTemplateSave');
    importButton.textContent = t('researchPackTemplateImport');
    previewTitle.textContent = t('researchPackTemplatePreviewTitle');
    previewSave.textContent = t('researchPackTemplateImportSave');
    previewCancel.textContent = t('pm_cancel');
    for (const row of previewList.querySelectorAll<HTMLElement>('.gv-rp-template-preview-item')) {
      const status = row.dataset.status as TemplateSaveStatus | undefined;
      const badge = row.querySelector('.gv-rp-badge');
      if (status && badge && status in STATUS_LABELS) badge.textContent = t(STATUS_LABELS[status]);
    }
    renderOptions();
  };

  relabel();
  refresh();

  return {
    root,
    refresh,
    setLocked: (next) => {
      locked = next;
      syncControls();
    },
    relabel,
    destroy: () => {
      stopped = true;
      refreshSeq += 1;
      importSeq += 1;
      abortRead();
      root.remove();
    },
  };
}
