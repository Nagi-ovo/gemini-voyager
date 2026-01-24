import { describe, expect, it } from 'vitest';

import {
  hasGeminiEnterpriseDomHints,
  isGeminiEnterpriseEnvironment,
  isGeminiEnterpriseUrl,
} from '../gemini';

describe('gemini enterprise detection', () => {
  it('returns false for non-gemini hosts', () => {
    expect(isGeminiEnterpriseUrl({ hostname: 'example.com', pathname: '/enterprise' })).toBe(false);
    expect(
      isGeminiEnterpriseEnvironment({ hostname: 'aistudio.google.com', pathname: '/enterprise' }),
    ).toBe(false);
  });

  it('detects enterprise hints in URL parts', () => {
    expect(isGeminiEnterpriseUrl({ hostname: 'gemini.google.com', pathname: '/enterprise' })).toBe(
      true,
    );
    expect(
      isGeminiEnterpriseUrl({ hostname: 'gemini.google.com', search: '?workspace=true' }),
    ).toBe(true);
    expect(isGeminiEnterpriseUrl({ hostname: 'gemini.google.com', hash: '#enterprise=acme' })).toBe(
      true,
    );
  });

  it('returns false for standard Gemini app URLs', () => {
    expect(isGeminiEnterpriseUrl({ hostname: 'gemini.google.com', pathname: '/app' })).toBe(false);
    expect(isGeminiEnterpriseUrl({ hostname: 'gemini.google.com', pathname: '/gem/abc123' })).toBe(
      false,
    );
  });

  it('treats business.gemini.google as enterprise', () => {
    expect(isGeminiEnterpriseUrl({ hostname: 'business.gemini.google', pathname: '/home' })).toBe(
      true,
    );
    expect(
      isGeminiEnterpriseEnvironment({ hostname: 'business.gemini.google', pathname: '/' }),
    ).toBe(true);
  });

  it('detects DOM hints on gemini host', () => {
    const doc = document.implementation.createHTMLDocument('test');
    doc.documentElement.className = 'gv-enterprise-shell';
    expect(hasGeminiEnterpriseDomHints(doc)).toBe(true);
    expect(isGeminiEnterpriseEnvironment({ hostname: 'gemini.google.com' }, doc)).toBe(true);
  });
});
