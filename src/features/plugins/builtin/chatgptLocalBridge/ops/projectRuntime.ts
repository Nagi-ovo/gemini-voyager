/**
 * Runs the `project.*` ops for the bridge runtime. Kept apart from the
 * runtime's own table: their params arrive validated by the protocol's op
 * tables (`PROJECT_PARAM_READERS`), which the runtime checks before it calls this.
 */
import {
  type ProjectOpParamsMap,
  type ProjectOpResultMap,
  isProjectOpName,
} from '@/features/bridge/protocol';
import type { SiteAdapter } from '@/features/plugins/types';

import type { OpContext } from '../opContext';
import type { BlobChunkReader } from './blobBytes';
import { runProjectCreate, runProjectList, runProjectOpen } from './projectNavigation';
import { runProjectFiles, runProjectRemove, runProjectUpload } from './projectSources';

export interface ProjectTask {
  readonly op: string;
  /** Already validated against `op`'s params reader. */
  readonly params: unknown;
}

type ProjectResult = ProjectOpResultMap[keyof ProjectOpResultMap];

/** The op's result, or null when `task` is not a project op. */
export function runProjectOp(
  ctx: OpContext,
  task: ProjectTask,
  adapter: SiteAdapter | null,
  readChunk: BlobChunkReader,
): Promise<ProjectResult> | null {
  if (!isProjectOpName(task.op)) return null;
  const params = task.params as ProjectOpParamsMap[typeof task.op];
  switch (task.op) {
    case 'project.list':
      return runProjectList(ctx, params as ProjectOpParamsMap['project.list'], adapter);
    case 'project.create':
      return runProjectCreate(ctx, params as ProjectOpParamsMap['project.create'], adapter);
    case 'project.open':
      return runProjectOpen(ctx, params as ProjectOpParamsMap['project.open'], adapter);
    case 'project.files':
      return runProjectFiles(ctx, params as ProjectOpParamsMap['project.files'], adapter);
    case 'project.upload':
      return runProjectUpload(
        ctx,
        params as ProjectOpParamsMap['project.upload'],
        adapter,
        readChunk,
      );
    case 'project.remove':
      return runProjectRemove(ctx, params as ProjectOpParamsMap['project.remove'], adapter);
  }
}
