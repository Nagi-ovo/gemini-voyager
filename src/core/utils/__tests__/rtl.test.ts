import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GV_RTL_CLASS, applyRTLClass, detectRTL, isRTLLanguage } from '../rtl';

const ORIGINAL_URL = window.location.href;

function setTestUrl(pathAndQuery: string): void {
  window.history.replaceState({}, '', pathAndQuery);
}

describe('rtl utilities', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
    document.body.removeAttribute('dir');
    document.body.classList.remove(GV_RTL_CLASS);
    setTestUrl('/app/test');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
    document.body.removeAttribute('dir');
    document.body.classList.remove(GV_RTL_CLASS);
    window.history.replaceState({}, '', ORIGINAL_URL);
  });

  it('detects rtl language tags', () => {
    expect(isRTLLanguage('ar')).toBe(true);
    expect(isRTLLanguage('ar-SA')).toBe(true);
    expect(isRTLLanguage('EN')).toBe(false);
  });

  it('detects rtl from Gemini hl URL param', () => {
    setTestUrl('/app/9416ff6384e9cf46?hl=ar');

    expect(detectRTL()).toBe(true);
  });

  it('uses URL language hint as a direction signal before extension language', () => {
    setTestUrl('/app/9416ff6384e9cf46?hl=en');

    expect(detectRTL('ar')).toBe(false);
  });

  it('falls back to extension language when URL has no language hint', () => {
    setTestUrl('/app/9416ff6384e9cf46');

    expect(detectRTL('ar')).toBe(true);
  });

  it('toggles gv-rtl class from applyRTLClass', () => {
    setTestUrl('/app/9416ff6384e9cf46?hl=ar');

    expect(applyRTLClass()).toBe(true);
    expect(document.body.classList.contains(GV_RTL_CLASS)).toBe(true);
  });
});
