/**
 * ChatGPT projects (Local Bridge ops `project.*`). A project groups chats and
 * files ("sources") that every chat in it can read. The extension knows
 * projects only by the id ChatGPT routes them with (`g-p-` and 32 hex digits)
 * and by the names its pages show; the CLI resolves a name to an id itself.
 *
 * Measured on chatgpt.com (zh-CN, 2026-10-18) and binding for these ops:
 * - uploading a file whose name the project already holds is ignored by
 *   ChatGPT without a word (the old file stays), so `project.upload` refuses a
 *   name that is already listed and a caller replaces a file by removing it first;
 * - removing a file takes effect at once, with no confirmation and no undo.
 */
import type { BlobRef, Evidence, SwitchableMode } from './ops';

export const PROJECT_OP_NAMES = [
  'project.list',
  'project.create',
  'project.open',
  'project.files',
  'project.upload',
  'project.remove',
] as const;

export type ProjectOpName = (typeof PROJECT_OP_NAMES)[number];

export function isProjectOpName(value: unknown): value is ProjectOpName {
  return typeof value === 'string' && (PROJECT_OP_NAMES as readonly string[]).includes(value);
}

/** The id in a project's routes (`/g/<id>/project`, `/g/<id>-<slug>/c/<conversation>`). */
export const PROJECT_ID_PATTERN = /^g-p-[0-9a-f]{32}$/;
export const MAX_PROJECT_NAME_LENGTH = 200;
/** Far more than a project holds; a longer list is junk. */
export const MAX_PROJECT_FILES = 500;
export const MAX_PROJECTS = 1_000;

export interface ProjectSummary {
  readonly projectId: string;
  readonly name: string;
}

export interface ProjectFile {
  readonly name: string;
  /** The row's `<time datetime>`, as the page wrote it; null when the row has none. */
  readonly uploadedAt: string | null;
}

// project.list (passive): the projects the sidebar lists.

export type ProjectListParams = Readonly<Record<string, never>>;

export interface ProjectListResult {
  readonly projects: readonly ProjectSummary[];
  readonly evidence: Evidence;
}

// project.create (leased): the sidebar's new-project dialog.

export interface ProjectCreateParams {
  readonly name: string;
}

export interface ProjectCreateResult {
  readonly projectId: string;
  readonly name: string;
  readonly url: string;
  readonly evidence: Evidence;
}

// project.open (leased): move the tab to a project's page, in-app.

/** `chat`: the project's new-chat page, always in chat mode; `sources`: its files. */
export type ProjectView = 'chat' | 'sources';

export interface ProjectOpenParams {
  readonly projectId: string;
  readonly view: ProjectView;
}

export interface ProjectOpenResult {
  readonly projectId: string;
  readonly url: string;
  readonly view: ProjectView;
  /** The project's name from the page title, when the title names one. */
  readonly name: string | null;
  /** Present when this op switched the project page from Work to chat. */
  readonly switchedMode?: { readonly from: SwitchableMode; readonly to: SwitchableMode };
  readonly evidence: Evidence;
}

// project.files (leased: it may click the sources view open).

export interface ProjectFilesParams {
  readonly projectId: string;
}

export interface ProjectFilesResult {
  readonly projectId: string;
  readonly files: readonly ProjectFile[];
}

// project.upload (leased): one file, under a name the project does not hold yet.

export interface ProjectUploadParams {
  readonly projectId: string;
  readonly blob: BlobRef;
}

export interface ProjectUploadResult {
  readonly projectId: string;
  readonly uploaded: ProjectFile;
  /** The project's files once the upload showed, the new one exactly once. */
  readonly files: readonly ProjectFile[];
  readonly evidence: Evidence;
}

// project.remove (leased): immediate and final.

export interface ProjectRemoveParams {
  readonly projectId: string;
  readonly name: string;
}

export interface ProjectRemoveResult {
  readonly projectId: string;
  readonly removed: string;
  /** The project's files once the row was gone. */
  readonly files: readonly ProjectFile[];
  readonly evidence: Evidence;
}

export interface ProjectOpParamsMap {
  'project.list': ProjectListParams;
  'project.create': ProjectCreateParams;
  'project.open': ProjectOpenParams;
  'project.files': ProjectFilesParams;
  'project.upload': ProjectUploadParams;
  'project.remove': ProjectRemoveParams;
}

export interface ProjectOpResultMap {
  'project.list': ProjectListResult;
  'project.create': ProjectCreateResult;
  'project.open': ProjectOpenResult;
  'project.files': ProjectFilesResult;
  'project.upload': ProjectUploadResult;
  'project.remove': ProjectRemoveResult;
}

export const PROJECT_OP_VERSIONS: Readonly<Record<ProjectOpName, number>> = {
  'project.list': 1,
  'project.create': 1,
  'project.open': 1,
  'project.files': 1,
  'project.upload': 1,
  'project.remove': 1,
};
