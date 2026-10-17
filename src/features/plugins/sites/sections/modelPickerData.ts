/**
 * The optional `modelPicker` section of a `site.json` (Local Bridge spec §3.5):
 * the data `model.select` reads. Placeholder until the model.select engine
 * lands (Phase C): this build understands no format, so a present section is
 * reported and dropped. That keeps the site usable (only `model.select` reports
 * `unsupported-data`) and makes `catalog:build` refuse to publish data no
 * shipped client can read.
 */
import type { ManifestIssue } from '../../manifest/validate';

/** No format is supported yet; the engine's first format is added here with its reader. */
export const MODEL_PICKER_FORMATS = [] as const;

export interface ModelPickerSection {
  readonly format: number;
}

export interface ModelPickerSectionRead {
  readonly modelPicker?: ModelPickerSection;
  readonly issues: readonly ManifestIssue[];
}

export function readModelPickerSection(raw: unknown, path = 'modelPicker'): ModelPickerSectionRead {
  if (raw === undefined) return { issues: [] };
  return { issues: [{ path, message: 'not supported by this build' }] };
}
