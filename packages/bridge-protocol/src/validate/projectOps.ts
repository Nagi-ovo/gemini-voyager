/**
 * Validators for the `project.*` ops' params and results, in the shape the op
 * tables in `validate/ops.ts` take. Project ids end up in URL paths, so only
 * the measured `g-p-<32 hex>` form passes; names are what a person typed or
 * the page showed.
 */
import { MAX_ATTACHMENT_BYTES, type BlobRef, type SwitchableMode } from '../ops';
import {
  MAX_PROJECT_FILES,
  MAX_PROJECT_NAME_LENGTH,
  MAX_PROJECTS,
  PROJECT_ID_PATTERN,
  type ProjectFile,
  type ProjectOpName,
  type ProjectOpParamsMap,
  type ProjectOpResultMap,
  type ProjectView,
} from '../projectOps';
import {
  at,
  fail,
  ID_PATTERN,
  nullableString,
  readObject,
  requireArray,
  requireInt,
  requireLiteral,
  requireRecord,
  requireString,
  SHA256_PATTERN,
  type Issue,
  type Reader,
} from '../read';

const VIEWS: readonly ProjectView[] = ['chat', 'sources'];
const SWITCHABLE_MODES: readonly SwitchableMode[] = ['chat', 'work'];
const HTTPS_URL = { pattern: /^https:\/\//, maxLength: 4096 } as const;
/** A name this side sends: the upload's own name, or one the caller asks to remove. */
const FILE_NAME = { pattern: /^[^/\\\0]+$/, maxLength: 255 } as const;
/** A name the page shows: whatever ChatGPT made of it, never empty. */
const SHOWN_NAME = { pattern: /^[^\0]+$/, maxLength: 1_000 } as const;
const PROJECT_NAME = { maxLength: MAX_PROJECT_NAME_LENGTH } as const;
const UPLOADED_AT = { maxLength: 64 } as const;

function readProjectId(rec: Record<string, unknown>, path: string, issues: Issue[]): string {
  return requireString(rec, 'projectId', path, issues, { pattern: PROJECT_ID_PATTERN });
}

/** A person's project name: trimmed text with no line breaks. */
function readProjectName(rec: Record<string, unknown>, path: string, issues: Issue[]): string {
  const name = requireString(rec, 'name', path, issues, PROJECT_NAME);
  if (name !== '' && (name.trim() !== name || /[\r\n\0]/.test(name))) {
    fail(issues, at(path, 'name'), 'must be trimmed and on one line');
  }
  return name;
}

const readBlobRef: Reader<BlobRef> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  return {
    blobId: requireString(rec, 'blobId', path, issues, { pattern: ID_PATTERN }),
    name: requireString(rec, 'name', path, issues, FILE_NAME),
    size: requireInt(rec, 'size', path, issues, { min: 1, max: MAX_ATTACHMENT_BYTES }),
    sha256: requireString(rec, 'sha256', path, issues, { pattern: SHA256_PATTERN }),
    mime: requireString(rec, 'mime', path, issues, { maxLength: 255 }),
  };
};

const readFile: Reader<ProjectFile> = (raw, path, issues) => {
  const rec = readObject(raw, path, issues);
  return {
    name: requireString(rec, 'name', path, issues, SHOWN_NAME),
    uploadedAt: nullableString(rec, 'uploadedAt', path, issues, UPLOADED_AT),
  };
};

function readFiles(rec: Record<string, unknown>, path: string, issues: Issue[]): ProjectFile[] {
  return requireArray(rec, 'files', path, issues, readFile, { max: MAX_PROJECT_FILES });
}

/** Keyed like `PARAM_READERS` in `validate/ops.ts`, which spreads these in. */
export const PROJECT_PARAM_READERS: {
  readonly [K in ProjectOpName]: Reader<ProjectOpParamsMap[K]>;
} = {
  'project.list': (raw, path, issues) => {
    readObject(raw, path, issues);
    return {};
  },
  'project.create': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return { name: readProjectName(rec, path, issues) };
  },
  'project.open': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      projectId: readProjectId(rec, path, issues),
      view: requireLiteral(rec, 'view', path, issues, VIEWS),
    };
  },
  'project.files': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return { projectId: readProjectId(rec, path, issues) };
  },
  'project.upload': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      projectId: readProjectId(rec, path, issues),
      blob: readBlobRef(rec.blob, at(path, 'blob'), issues),
    };
  },
  'project.remove': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      projectId: readProjectId(rec, path, issues),
      name: requireString(rec, 'name', path, issues, SHOWN_NAME),
    };
  },
};

/** Keyed like `RESULT_READERS` in `validate/ops.ts`, which spreads these in. */
export const PROJECT_RESULT_READERS: {
  readonly [K in ProjectOpName]: Reader<ProjectOpResultMap[K]>;
} = {
  'project.list': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const projects = requireArray(
      rec,
      'projects',
      path,
      issues,
      (item, itemPath, list) => {
        const entry = readObject(item, itemPath, list);
        return {
          projectId: readProjectId(entry, itemPath, list),
          name: requireString(entry, 'name', itemPath, list, SHOWN_NAME),
        };
      },
      { max: MAX_PROJECTS },
    );
    const ids = projects.map((project) => project.projectId);
    if (new Set(ids).size !== ids.length) fail(issues, at(path, 'projects'), 'ids must be unique');
    return { projects, evidence: requireRecord(rec, 'evidence', path, issues) };
  },
  'project.create': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return {
      projectId: readProjectId(rec, path, issues),
      name: requireString(rec, 'name', path, issues, SHOWN_NAME),
      url: requireString(rec, 'url', path, issues, HTTPS_URL),
      evidence: requireRecord(rec, 'evidence', path, issues),
    };
  },
  'project.open': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const view = requireLiteral(rec, 'view', path, issues, VIEWS);
    let switchedMode: { from: SwitchableMode; to: SwitchableMode } | undefined;
    if (rec.switchedMode !== undefined) {
      const switchPath = at(path, 'switchedMode');
      const mode = readObject(rec.switchedMode, switchPath, issues);
      const from = requireLiteral(mode, 'from', switchPath, issues, SWITCHABLE_MODES);
      const to = requireLiteral(mode, 'to', switchPath, issues, SWITCHABLE_MODES);
      // The bridge never switches a project to Work.
      if (from !== 'work' || to !== 'chat') fail(issues, switchPath, 'must be from work to chat');
      switchedMode = { from, to };
    }
    return {
      projectId: readProjectId(rec, path, issues),
      url: requireString(rec, 'url', path, issues, HTTPS_URL),
      view,
      name: nullableString(rec, 'name', path, issues, SHOWN_NAME),
      ...(switchedMode === undefined ? {} : { switchedMode }),
      evidence: requireRecord(rec, 'evidence', path, issues),
    };
  },
  'project.files': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    return { projectId: readProjectId(rec, path, issues), files: readFiles(rec, path, issues) };
  },
  'project.upload': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const uploaded = readFile(rec.uploaded, at(path, 'uploaded'), issues);
    const files = readFiles(rec, path, issues);
    if (files.filter((file) => file.name === uploaded.name).length !== 1) {
      fail(issues, at(path, 'files'), 'must list the uploaded file exactly once');
    }
    return {
      projectId: readProjectId(rec, path, issues),
      uploaded,
      files,
      evidence: requireRecord(rec, 'evidence', path, issues),
    };
  },
  'project.remove': (raw, path, issues) => {
    const rec = readObject(raw, path, issues);
    const removed = requireString(rec, 'removed', path, issues, SHOWN_NAME);
    const files = readFiles(rec, path, issues);
    if (files.some((file) => file.name === removed)) {
      fail(issues, at(path, 'files'), 'must not list the removed file');
    }
    return {
      projectId: readProjectId(rec, path, issues),
      removed,
      files,
      evidence: requireRecord(rec, 'evidence', path, issues),
    };
  },
};
