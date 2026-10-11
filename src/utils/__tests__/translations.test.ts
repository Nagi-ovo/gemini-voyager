import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_LANGUAGES } from '@/utils/language';
import { TRANSLATIONS, isTranslationKey } from '@/utils/translations';

const PRIMITIVES_DIR = join(process.cwd(), 'src/features/plugins/verbs');

/** Every `verbs/<primitive>/messages` folder, read from disk independently of the Vite glob. */
function primitiveMessageDirs(): string[] {
  return readdirSync(PRIMITIVES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PRIMITIVES_DIR, entry.name, 'messages'))
    .filter((dir) => existsSync(dir));
}

describe('TRANSLATIONS', () => {
  it('contains the same keys for all languages at runtime', () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    for (const lang of APP_LANGUAGES) {
      const keys = Object.keys(TRANSLATIONS[lang]).sort();
      expect(keys).toEqual(enKeys);
    }
  });

  it('recognizes valid keys via isTranslationKey', () => {
    expect(isTranslationKey('extName')).toBe(true);
    expect(isTranslationKey('__not_a_real_key__')).toBe(false);
  });

  it("serves each primitive's own strings in every language", () => {
    const dirs = primitiveMessageDirs();
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      for (const lang of APP_LANGUAGES) {
        const messages = JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')) as Record<
          string,
          { message: string }
        >;
        const strings: Record<string, string> = TRANSLATIONS[lang];
        for (const [key, { message }] of Object.entries(messages)) {
          expect(isTranslationKey(key)).toBe(true);
          expect(strings[key]).toBe(message);
        }
      }
    }
  });
});
