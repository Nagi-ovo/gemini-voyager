/**
 * The optional `projects` section of a `site.json`: what the Local Bridge
 * `project.*` ops read to find ChatGPT's projects, their sources (files) and
 * their chat/Work switch. Like `modelPicker`, a broken section is reported and
 * dropped (only the project ops report `unsupported-data`), and `catalog:build`
 * refuses to publish one.
 *
 * Format 1 (measured on chatgpt.com, zh-CN, 2026-10-18):
 * - `projectPagePattern` / `projectRoutePattern`: route regexes whose group 1
 *   is the project id (`/g/<id>/project`; any `/g/<id>[-<slug>]/…` route);
 *   `projectPath` builds a project page path from `{projectId}`;
 *   `sourcesQuery` is the query the sources view adds (`tab=sources`);
 * - `createButtonLabels`: the sidebar button's `aria-label`; `createDialog`:
 *   selectors for the dialog, its name input and its submit button;
 * - `titleTemplates`: `document.title` of a project page, with `{name}`;
 * - `viewLabels` / `modeLabels`: the exact text of the chat/sources and
 *   chat/Work buttons; the mode buttons carry `modePressedAttribute`;
 * - `chatComposerLabels`: the composer placeholder in chat mode, with `{name}`;
 * - `sources`: the file input and row selectors, the row's actions button
 *   label (with `{name}`) and the menu item that removes a file.
 *
 * Label tables are keyed by UI locale, and every locale is merged when read.
 */
import type { ManifestIssue } from '../../manifest/validate';
import { isSafeRegexSource } from '../safeRegex';
import type { LocalizedLabels } from './modelPickerData';

export const PROJECTS_FORMATS = [1] as const;
export type ProjectsFormat = (typeof PROJECTS_FORMATS)[number];

export interface ProjectsCreateDialog {
  readonly dialog: string;
  readonly nameInput: string;
  readonly submit: string;
}

export interface ProjectsSources {
  readonly fileInput: string;
  readonly row: string;
  /** Per locale: the row's menu button `aria-label`, a template with `{name}`. */
  readonly rowActionsLabel: Readonly<Record<string, string>>;
  readonly removeLabels: LocalizedLabels;
}

/** A project's row in the sidebar: not a link, so its id and name are attributes. */
export interface ProjectsSidebar {
  readonly row: string;
  readonly idAttribute: string;
  /** The name; the text `aria-labelledby` points at stands in when it is missing. */
  readonly labelAttribute: string;
}

export interface ProjectsSection {
  readonly format: ProjectsFormat;
  readonly projectPagePattern: string;
  readonly projectRoutePattern: string;
  readonly projectPath: string;
  readonly sourcesQuery: string;
  readonly sidebar: ProjectsSidebar;
  readonly createButtonLabels: LocalizedLabels;
  readonly createDialog: ProjectsCreateDialog;
  readonly titleTemplates: readonly string[];
  readonly viewLabels: { readonly chat: LocalizedLabels; readonly sources: LocalizedLabels };
  readonly modeLabels: { readonly chat: LocalizedLabels; readonly work: LocalizedLabels };
  readonly modePressedAttribute: string;
  readonly chatComposerLabels: LocalizedLabels;
  readonly sources: ProjectsSources;
}

export interface ProjectsSectionRead {
  readonly projects?: ProjectsSection;
  readonly issues: readonly ManifestIssue[];
}

const SECTION_KEYS = [
  'format',
  'projectPagePattern',
  'projectRoutePattern',
  'projectPath',
  'sourcesQuery',
  'sidebar',
  'createButtonLabels',
  'createDialog',
  'titleTemplates',
  'viewLabels',
  'modeLabels',
  'modePressedAttribute',
  'chatComposerLabels',
  'sources',
];
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const QUERY_PATTERN = /^[A-Za-z0-9_-]{1,32}=[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT_LENGTH = 200;
const MAX_ENTRIES = 16;
const NAME = '{name}';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class Reader {
  readonly issues: ManifestIssue[] = [];

  constructor(private readonly isSelector: (selector: string) => boolean) {}

  issue(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  record(raw: unknown, path: string, allowed?: readonly string[]): Record<string, unknown> {
    if (!isRecord(raw)) {
      this.issue(path, 'must be an object');
      return {};
    }
    for (const key of Object.keys(raw)) {
      if (allowed && !allowed.includes(key)) this.issue(`${path}.${key}`, 'unknown key');
    }
    if (!allowed && Object.keys(raw).length > MAX_ENTRIES) {
      this.issue(path, `must have at most ${MAX_ENTRIES} entries`);
    }
    return raw;
  }

  text(raw: unknown, path: string): string {
    if (typeof raw !== 'string' || raw.trim() === '' || raw.length > MAX_TEXT_LENGTH) {
      this.issue(path, `must be a non-empty string of up to ${MAX_TEXT_LENGTH} chars`);
      return '';
    }
    return raw;
  }

  /** A template holding `{name}` exactly once. */
  template(raw: unknown, path: string): string {
    const text = this.text(raw, path);
    if (text && text.split(NAME).length !== 2) this.issue(path, 'must contain {name} once');
    return text;
  }

  selector(raw: unknown, path: string): string {
    const text = this.text(raw, path);
    if (text && !this.isSelector(text)) this.issue(path, 'must be a valid CSS selector');
    return text;
  }

  attribute(raw: unknown, path: string): string {
    const text = this.text(raw, path);
    if (text && !ATTRIBUTE_NAME.test(text)) this.issue(path, 'must be a lower-case attribute name');
    return text;
  }

  /** A safe route regex with one capturing group for the project id. */
  pattern(raw: unknown, path: string): string {
    const text = this.text(raw, path);
    if (!text) return text;
    if (!text.startsWith('^') || !isSafeRegexSource(text)) {
      this.issue(path, 'must be a safe regular expression anchored with ^');
      return text;
    }
    try {
      if (new RegExp(`${text}|`).exec('')?.length !== 2) {
        this.issue(path, 'must have exactly one capturing group');
      }
    } catch {
      this.issue(path, 'must be a valid regular expression');
    }
    return text;
  }

  localized<T>(
    raw: unknown,
    path: string,
    read: (value: unknown, at: string) => T,
  ): Record<string, T> {
    const rec = this.record(raw, path);
    const out: Record<string, T> = {};
    const entries = Object.entries(rec);
    if (isRecord(raw) && entries.length === 0) this.issue(path, 'must name at least one locale');
    for (const [locale, value] of entries) {
      const at = `${path}.${locale}`;
      if (!LOCALE_PATTERN.test(locale)) this.issue(at, 'must be a locale such as zh-CN');
      out[locale] = read(value, at);
    }
    return out;
  }

  list(
    raw: unknown,
    path: string,
    read: (value: unknown, at: string) => string,
  ): readonly string[] {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ENTRIES) {
      this.issue(path, `must be an array of 1-${MAX_ENTRIES} entries`);
      return [];
    }
    return raw.map((value, index) => read(value, `${path}[${index}]`));
  }

  labels(raw: unknown, path: string, templated = false): LocalizedLabels {
    return this.localized(raw, path, (value, at) =>
      this.list(value, at, (item, itemAt) =>
        templated ? this.template(item, itemAt) : this.text(item, itemAt),
      ),
    );
  }
}

/**
 * Read `site.projects`. `isSelector` is the site validator's selector check
 * (passed in so this module does not import the validator that imports it).
 */
export function readProjectsSection(
  raw: unknown,
  isSelector: (selector: string) => boolean,
  path = 'projects',
): ProjectsSectionRead {
  if (raw === undefined) return { issues: [] };
  if (!isRecord(raw)) return { issues: [{ path, message: 'must be an object' }] };
  if (!PROJECTS_FORMATS.some((known) => known === raw.format)) {
    return { issues: [{ path: `${path}.format`, message: 'unknown format' }] };
  }
  const reader = new Reader(isSelector);
  reader.record(raw, path, SECTION_KEYS);
  const projectPath = reader.text(raw.projectPath, `${path}.projectPath`);
  if (projectPath && (!projectPath.startsWith('/') || !projectPath.includes('{projectId}'))) {
    reader.issue(`${path}.projectPath`, 'must be a path holding {projectId}');
  }
  const sourcesQuery = reader.text(raw.sourcesQuery, `${path}.sourcesQuery`);
  if (sourcesQuery && !QUERY_PATTERN.test(sourcesQuery)) {
    reader.issue(`${path}.sourcesQuery`, 'must be one key=value pair');
  }
  const attribute = reader.attribute(raw.modePressedAttribute, `${path}.modePressedAttribute`);
  const sidebar = reader.record(raw.sidebar, `${path}.sidebar`, [
    'row',
    'idAttribute',
    'labelAttribute',
  ]);
  const dialog = reader.record(raw.createDialog, `${path}.createDialog`, [
    'dialog',
    'nameInput',
    'submit',
  ]);
  const views = reader.record(raw.viewLabels, `${path}.viewLabels`, ['chat', 'sources']);
  const modes = reader.record(raw.modeLabels, `${path}.modeLabels`, ['chat', 'work']);
  const sources = reader.record(raw.sources, `${path}.sources`, [
    'fileInput',
    'row',
    'rowActionsLabel',
    'removeLabels',
  ]);
  const section: ProjectsSection = {
    format: 1,
    projectPagePattern: reader.pattern(raw.projectPagePattern, `${path}.projectPagePattern`),
    projectRoutePattern: reader.pattern(raw.projectRoutePattern, `${path}.projectRoutePattern`),
    projectPath,
    sourcesQuery,
    sidebar: {
      row: reader.selector(sidebar.row, `${path}.sidebar.row`),
      idAttribute: reader.attribute(sidebar.idAttribute, `${path}.sidebar.idAttribute`),
      labelAttribute: reader.attribute(sidebar.labelAttribute, `${path}.sidebar.labelAttribute`),
    },
    createButtonLabels: reader.labels(raw.createButtonLabels, `${path}.createButtonLabels`),
    createDialog: {
      dialog: reader.selector(dialog.dialog, `${path}.createDialog.dialog`),
      nameInput: reader.selector(dialog.nameInput, `${path}.createDialog.nameInput`),
      submit: reader.selector(dialog.submit, `${path}.createDialog.submit`),
    },
    titleTemplates: reader.list(raw.titleTemplates, `${path}.titleTemplates`, (value, at) =>
      reader.template(value, at),
    ),
    viewLabels: {
      chat: reader.labels(views.chat, `${path}.viewLabels.chat`),
      sources: reader.labels(views.sources, `${path}.viewLabels.sources`),
    },
    modeLabels: {
      chat: reader.labels(modes.chat, `${path}.modeLabels.chat`),
      work: reader.labels(modes.work, `${path}.modeLabels.work`),
    },
    modePressedAttribute: attribute,
    chatComposerLabels: reader.labels(raw.chatComposerLabels, `${path}.chatComposerLabels`, true),
    sources: {
      fileInput: reader.selector(sources.fileInput, `${path}.sources.fileInput`),
      row: reader.selector(sources.row, `${path}.sources.row`),
      rowActionsLabel: reader.localized(
        sources.rowActionsLabel,
        `${path}.sources.rowActionsLabel`,
        (value, at) => reader.template(value, at),
      ),
      removeLabels: reader.labels(sources.removeLabels, `${path}.sources.removeLabels`),
    },
  };
  if (reader.issues.length > 0) return { issues: reader.issues };
  return { projects: section, issues: [] };
}
