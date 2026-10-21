import { describe, expect, it } from 'vitest';

import { parseSemver } from '../semver';
import {
  OLDEST_REMOTE_SITE_CONSUMER_VERSION,
  type SemanticKeyPublishPolicy,
  UNKNOWN_SEMANTIC_KEY_TOLERANT_VERSION,
  semanticKeysTooNewToPublish,
} from './semanticKeyPublishing';
import { SEMANTIC_KEY_SINCE_VERSION, SEMANTIC_SELECTOR_KEYS } from './semanticKeys';

/** The vocabulary as it would look the release after a key is added. */
const WITH_NEW_KEY = { ...SEMANTIC_KEY_SINCE_VERSION, sidebar: '2.3.0' };

function policy(oldestConsumer: string): SemanticKeyPublishPolicy {
  return { oldestConsumer, tolerantSince: '2.2.1', since: WITH_NEW_KEY };
}

describe('semanticKeysTooNewToPublish', () => {
  it('blocks a key that a strict consumer still fetching the file cannot read', () => {
    expect(semanticKeysTooNewToPublish(['composer', 'sidebar'], policy('2.0.0'))).toEqual([
      { key: 'sidebar', since: '2.3.0' },
    ]);
  });

  it('allows the key once the oldest consumer drops unknown keys on its own', () => {
    expect(semanticKeysTooNewToPublish(['sidebar'], policy('2.2.1'))).toEqual([]);
  });

  it('allows keys every consumer reads, and leaves unknown keys to the authoring check', () => {
    expect(semanticKeysTooNewToPublish(['composer', 'notAKey'], policy('2.0.0'))).toEqual([]);
  });

  it('dates every key with a release version the guard can compare', () => {
    for (const key of SEMANTIC_SELECTOR_KEYS) {
      expect(parseSemver(SEMANTIC_KEY_SINCE_VERSION[key]), key).not.toBeNull();
    }
    expect(parseSemver(OLDEST_REMOTE_SITE_CONSUMER_VERSION)).not.toBeNull();
    expect(parseSemver(UNKNOWN_SEMANTIC_KEY_TOLERANT_VERSION)).not.toBeNull();
  });
});
