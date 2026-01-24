import { describe, expect, it } from 'vitest';

import { APP_LANGUAGES } from '@/utils/language';
import { TRANSLATIONS, isTranslationKey } from '@/utils/translations';

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
});
