/**
 * The packaged Gemini typography plugins (chat font size; chat spacing, which
 * is line height plus paragraph spacing) render the native modules' rules for
 * the same values, so moving a feature to its plugin changes nothing on the
 * page. Their values arrive from the legacy sliders through the value
 * bindings; see `runtime/PluginHost.legacyValues.test.ts` for that path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { renderSettingTemplate, stripCssComments } from '../../../manifest/sinkGuards';
import { BundledCatalogPluginSource } from '../../../sources/BundledCatalogPluginSource';
import type { PluginManifest, PluginSettings } from '../../../types';

async function packaged(id: string): Promise<PluginManifest> {
  const manifest = (await new BundledCatalogPluginSource().list()).find((m) => m.id === id);
  if (!manifest) throw new Error(`${id} is not packaged`);
  return manifest;
}

function rendered(manifest: PluginManifest, settings: PluginSettings): string {
  const css = (manifest.contributes.styles ?? []).map((style) => style.css).join('\n');
  return renderSettingTemplate(css, manifest.contributes.settings, settings);
}

/**
 * Only the rules are compared: comments dropped, quotes and whitespace the
 * formatter may change normalized.
 */
function rulesOf(css: string): string {
  return stripCssComments(css, ' ')
    .replaceAll("'", '"')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim();
}

/**
 * The plugin's rules with its setting custom properties resolved to the
 * values they carry, as the browser does: the `:root` block that declares
 * them goes, and each `var()` becomes its value.
 */
function resolvedRules(css: string): string {
  const declared = new Map<string, string>();
  const withoutRoot = css.replace(/:root\s*\{([^}]*)\}/, (_, body: string) => {
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      declared.set(name, value.trim());
    }
    return '';
  });
  let resolved = withoutRoot;
  for (const [name, value] of declared) resolved = resolved.replaceAll(`var(${name})`, value);
  return resolved;
}

/** Run a native module once with `stored` in sync storage and return the CSS it injected. */
async function nativeCss(
  load: () => Promise<{ start: () => void }>,
  stored: Record<string, unknown>,
  styleId: string,
): Promise<string> {
  vi.mocked(chrome.storage.sync.get).mockImplementation(((
    _keys: unknown,
    callback: (value: Record<string, unknown>) => void,
  ) => callback(stored)) as never);
  (await load()).start();
  const text = document.getElementById(styleId)?.textContent ?? '';
  window.dispatchEvent(new Event('beforeunload'));
  return text;
}

const nativeFontSize = () =>
  import('@/pages/content/chatFontSize').then((m) => ({ start: m.startChatFontSizeAdjuster }));
const nativeLineHeight = () =>
  import('@/pages/content/chatLineHeight').then((m) => ({ start: m.startChatLineHeightAdjuster }));
const nativeParagraphSpacing = () =>
  import('@/pages/content/chatParagraphSpacing').then((m) => ({
    start: m.startChatParagraphSpacingAdjuster,
  }));

let fontSize: PluginManifest;
let spacing: PluginManifest;

beforeEach(async () => {
  fontSize = await packaged('voyager.gemini-chat-font-size');
  spacing = await packaged('voyager.gemini-chat-line-height');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.mocked(chrome.storage.sync.get).mockReset();
});

describe('Gemini typography plugins', () => {
  it('renders the Gemini font size the user set, compounding nested percentages as the native module did', async () => {
    for (const size of [80, 100, 123, 150]) {
      const native = await nativeCss(
        nativeFontSize,
        { [StorageKeys.CHAT_FONT_SIZE]: size, [StorageKeys.CHAT_FONT_SIZE_ENABLED]: true },
        'gemini-voyager-chat-font-size',
      );
      expect(native).toContain(`${size}%`);
      expect(rulesOf(resolvedRules(rendered(fontSize, { fontSize: size })))).toBe(rulesOf(native));
    }
  });

  it('keeps code blocks at 0.875 of the chosen size', () => {
    const style = document.createElement('style');
    style.textContent = resolvedRules(rendered(fontSize, { fontSize: 120 }));
    document.head.append(style);
    const rules = Array.from(style.sheet?.cssRules ?? []) as CSSStyleRule[];
    const code = rules.find((rule) => rule.selectorText.includes('model-response code'));
    // 0.875 × 120 %, as the CSS engine resolves it.
    expect(code?.style.getPropertyValue('font-size')).toBe('calc(105%)');
    expect(code?.style.getPropertyPriority('font-size')).toBe('important');
  });

  it('renders the line height and paragraph spacing rules of the two native spacing modules', async () => {
    for (const [lineHeight, paragraphSpacing] of [
      [120, 0],
      [160, 12],
      [185, 24],
    ]) {
      const stored = {
        [StorageKeys.CHAT_LINE_HEIGHT]: lineHeight,
        [StorageKeys.CHAT_PARAGRAPH_SPACING]: paragraphSpacing,
        [StorageKeys.CHAT_LINE_HEIGHT_ENABLED]: true,
      };
      const native =
        (await nativeCss(nativeLineHeight, stored, 'gemini-voyager-chat-line-height')) +
        (await nativeCss(nativeParagraphSpacing, stored, 'gv-chat-paragraph-spacing-style'));
      const plugin = resolvedRules(rendered(spacing, { lineHeight, paragraphSpacing })).replaceAll(
        `calc(${lineHeight} / 100)`,
        String(lineHeight / 100),
      );
      expect(rulesOf(plugin)).toBe(rulesOf(native));
    }
  });

  it('lets the spacing line height win over the font size line height whichever mounts first', () => {
    // Both sheets mark line-height !important, so specificity decides, not
    // order: every element the font size rules give a line height to gets
    // one from a spacing selector that is the same selector under `body`.
    const sheet = (css: string): CSSStyleRule[] => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
      return Array.from(style.sheet?.cssRules ?? []) as CSSStyleRule[];
    };
    const selectorsSetting = (rules: CSSStyleRule[], property: string): Set<string> =>
      new Set(
        rules
          .filter((rule) => rule.style.getPropertyValue(property) !== '')
          .flatMap((rule) => rule.selectorText.split(',').map((part) => part.trim())),
      );
    const fontLineHeights = selectorsSetting(
      sheet(rendered(fontSize, { fontSize: 100 })),
      'line-height',
    );
    const spacingLineHeights = selectorsSetting(
      sheet(rendered(spacing, { lineHeight: 200, paragraphSpacing: 12 })),
      'line-height',
    );
    expect(fontLineHeights.size).toBeGreaterThan(0);
    for (const selector of fontLineHeights) {
      expect(spacingLineHeights, selector).toContain(`body ${selector}`);
    }
  });
});
