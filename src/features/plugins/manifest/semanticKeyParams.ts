/**
 * Semantic keys a `native` op names through its `semanticKey` params (see
 * `verbs/contractTypes.ts`). The static param check and `requiredSemanticKeys`
 * both read this, so the keys a plugin may name and the keys compatibility
 * requires are the same set.
 */
import { isSemanticSelectorKey } from '../sites/semanticKeys';
import type { NativeOperation, SettingsSchema } from '../types';
import type { PrimitiveContract } from '../verbs/contractTypes';
import { collectNativeParamSettingReferences } from './nativeParamSettings';

export interface SemanticKeyParamValue {
  readonly param: string;
  /** A value the param can resolve to; not yet checked against the vocabulary. */
  readonly value: string;
  /** The select setting that offers `value`, when the param is a `{{key}}` token. */
  readonly setting?: string;
}

/**
 * Every value a `semanticKey` param can resolve to: its literal string, or
 * each option of the select setting a whole-value `{{key}}` token names. Any
 * other token (embedded text, a non-select setting) is unknown until
 * activation, where the primitive's own `validateParams` decides.
 */
export function semanticKeyParamValues(
  op: NativeOperation,
  contract: PrimitiveContract | undefined,
  schema: SettingsSchema | undefined,
): SemanticKeyParamValue[] {
  if (!contract) return [];
  const values: SemanticKeyParamValue[] = [];
  for (const [param, value] of Object.entries(op.params)) {
    if (contract.params[param]?.type !== 'semanticKey' || typeof value !== 'string') continue;
    const refs = collectNativeParamSettingReferences({ [param]: value });
    if (refs.length === 0) {
      values.push({ param, value });
      continue;
    }
    if (!refs[0].wholeValue || !schema || !Object.hasOwn(schema, refs[0].key)) continue;
    const field = schema[refs[0].key];
    if (field.type !== 'select') continue;
    for (const option of field.options ?? []) {
      values.push({ param, value: option.value, setting: refs[0].key });
    }
  }
  return values;
}

/**
 * The values a primitive accepts: vocabulary keys within the param's
 * `allowedKeys`. Anything else is a param error the param checks report, not
 * a key the site should declare.
 */
export function acceptedSemanticKeyParamValues(
  op: NativeOperation,
  contract: PrimitiveContract | undefined,
  schema: SettingsSchema | undefined,
): SemanticKeyParamValue[] {
  return semanticKeyParamValues(op, contract, schema).filter(({ param, value }) => {
    const allowed: readonly string[] | undefined = contract?.params[param]?.allowedKeys;
    return isSemanticSelectorKey(value) && (!allowed || allowed.includes(value));
  });
}
