/**
 * Sink guards for declarative plugin output.
 *
 * A manifest's CSS and DOM-op values reach three sinks: a `<style>` element,
 * an inline style property and an element attribute. `{{setting}}` tokens are
 * substituted before those writes, and setting values come from the manifest
 * default, `chrome.storage` or a Drive restore, none of which the manifest
 * validator saw. So every check here runs on the RENDERED value, both when a
 * manifest is validated (rendered with its defaults) and in the engine right
 * before each write.
 *
 * The sinks also compose: a custom property set by `setStyle` or a `style`
 * attribute is readable from the plugin's stylesheet through `var()`, and an
 * attribute value through `attr()`. So no sink may hold an external URL in any
 * form a later sink could turn into a fetch, whatever the sink it came from.
 *
 * CSS may not fetch at all, not even from the page's own origin: `url()` only
 * takes a raster-image `data:` URL (never SVG, which can load more) or a
 * `#fragment`, and the functions that read a bare
 * string as an image URL (`image-set()`, `image()`, `cross-fade()`, `src()`)
 * and `@import` are refused, so a relative string elsewhere stays inert.
 *
 * Every scan here is linear in the input: the checks run on the page's main
 * thread against remote catalog data.
 */
import { MAX_STYLE_LENGTH } from '../constants';
import type { PluginSettings, SettingsSchema } from '../types';

/**
 * Substitute `{{key}}` tokens with the current setting values, falling back to
 * each setting's declared default. Bounded parameter substitution over
 * declared keys, not a template language.
 */
export function renderSettingTemplate(
  value: string,
  schema: SettingsSchema | undefined,
  settings: PluginSettings,
): string {
  if (!schema) return value;
  let rendered = value;
  for (const key of Object.keys(schema)) {
    const settingValue = settings[key] ?? schema[key].default;
    rendered = rendered.split(`{{${key}}}`).join(String(settingValue));
  }
  return rendered;
}

/** One escape per match, left to right, so an escaped `\\` never starts another. */
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\n\r\f])?|(\r\n|[\n\r\f])|([\s\S]))/gi;

/** Resolve CSS escapes (`\75 rl(`, `@\69mport`, `\` + newline) as the tokenizer does. */
export function decodeCssEscapes(css: string): string {
  return css.replace(CSS_ESCAPE, (_, hex?: string, newline?: string, char?: string) => {
    if (hex) {
      const code = Number.parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
    }
    if (newline) return '';
    return char ?? '';
  });
}

/**
 * Drop `/* *\/` comments; an unclosed comment runs to the end, as in CSS. Each
 * comment becomes `replacement`, so `' '` keeps the tokens it separated apart.
 */
export function stripCssComments(css: string, replacement = ''): string {
  let out = '';
  let from = 0;
  for (;;) {
    const open = css.indexOf('/*', from);
    if (open < 0) return out + css.slice(from);
    out += css.slice(from, open);
    const close = css.indexOf('*/', open + 2);
    if (close < 0) return out + replacement;
    out += replacement;
    from = close + 2;
  }
}

/**
 * The text the url()/@import patterns scan. `/* *\/` is a comment between
 * tokens but plain text inside strings and `url(...)`, so both readings are
 * checked.
 */
function cssReadings(css: string): string[] {
  return [decodeCssEscapes(css), decodeCssEscapes(stripCssComments(css))];
}

/**
 * The URL parser drops ASCII tab/newline anywhere, trims leading C0 controls
 * and spaces, treats `\\` as `/` for http(s), and resolves `http:host` against
 * an https page as an absolute URL. The patterns below follow those rules.
 */
const URL_GAP = String.raw`[\t\n\r]*`;
const EXTERNAL_URL_START = [
  String.raw`(?:h${URL_GAP}t${URL_GAP}t${URL_GAP}p${URL_GAP}(?:s${URL_GAP})?:`,
  String.raw`|[\/\\]${URL_GAP}[\/\\])`,
].join('');
/** `url(` / `src(` whose argument starts with an external URL. */
const EXTERNAL_URL_FUNCTION = new RegExp(
  String.raw`\b(?:url|src)\(\s*(?:['"][\x00-\x20]*)?${EXTERNAL_URL_START}`,
  'i',
);
/** A URL, as the URL parser reads it, that starts with an external origin. */
const EXTERNAL_URL_PREFIX = new RegExp(String.raw`^[\x00-\x20]*${EXTERNAL_URL_START}`, 'i');
const EXTERNAL_URL_ANYWHERE = new RegExp(EXTERNAL_URL_START, 'i');

const isCssNewline = (ch: string): boolean => ch === '\n' || ch === '\r' || ch === '\f';
const isCssWhitespace = (ch: string): boolean => ch === ' ' || ch === '\t' || isCssNewline(ch);
const isCssNameChar = (ch: string): boolean => /[a-z0-9_-]/i.test(ch) || ch.charCodeAt(0) >= 0x80;
/** Index just past the escape that starts at `index` (a backslash). */
function skipCssEscape(css: string, index: number): number {
  const hex = /^[0-9a-f]{1,6}(?:\r\n|[ \t\n\r\f])?/i.exec(css.slice(index + 1, index + 9));
  return index + 1 + (hex ? hex[0].length : 1);
}

/** CSS functions that fetch a bare string argument as an image (`src()` any URL). */
const STRING_FETCH_FUNCTIONS = new Set(['image-set', 'image', 'cross-fade', 'src']);
/** Longest function name tracked; anything longer is no function we look for. */
const MAX_TRACKED_NAME = 24;
const NAME_OVERFLOW = '\u0000';

function trackName(name: string, next: string): string {
  if (name === NAME_OVERFLOW) return name;
  return name.length < MAX_TRACKED_NAME ? name + next : NAME_OVERFLOW;
}

/**
 * A `data:` URL whose declared type is a raster image: the header before the
 * first comma is exactly one of these types, optionally with parameters such as
 * `;base64`. A raster image is decoded as pixels and loads nothing more. SVG is
 * a document: as a filter, mask or clip-path resource, Firefox lets it load
 * images (`<feImage href>`), and base64 or percent-encoding hides that URL from
 * any scan. So SVG, every other type and a missing type are refused, in any
 * encoding, without decoding the payload.
 */
const RASTER_DATA_URL =
  /^data:[\t\n\f\r ]*image\/(?:png|apng|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)[\t\n\f\r ]*(?:;[^,]*)?,/i;

/**
 * A `url()` argument that loads nothing: empty, a `#fragment` (same-document
 * reference) or a raster-image `data:` URL. Tab and newline vanish and C0
 * controls and spaces are trimmed first, as the URL parser does.
 */
function isInertUrl(raw: string): boolean {
  const url = raw.replace(/[\t\n\r]/g, '');
  let start = 0;
  let end = url.length;
  while (start < end && url.charCodeAt(start) <= 0x20) start++;
  while (end > start && url.charCodeAt(end - 1) <= 0x20) end--;
  const trimmed = url.slice(start, end);
  return trimmed === '' || trimmed.startsWith('#') || RASTER_DATA_URL.test(trimmed);
}

/** Index of the closing quote of the string that opens at `start` (or the end). */
function cssStringEnd(css: string, start: number): number {
  const quote = css[start];
  let end = start + 1;
  while (end < css.length && css[end] !== quote && !isCssNewline(css[end])) {
    end = css[end] === '\\' ? skipCssEscape(css, end) : end + 1;
  }
  return Math.min(end, css.length);
}

/**
 * Walk the CSS the way its tokenizer does (comments, strings, escapes and
 * `url(` tokens) and report whether it can fetch: a `url()` that is not inert,
 * a string-fetching function, or any string token that starts with an
 * external URL once its escapes are resolved. A string can reach a fetch
 * through `image-set()`, `src()`, `image()` or `cross-fade()`, directly or via
 * `var()` from another sink, so the check does not depend on what precedes the
 * string. Where the reading could differ from the browser's (a quote inside an
 * unquoted `url(`, which the browser treats as a bad URL), it fails closed.
 */
function cssTokensCanFetch(source: string): boolean {
  // The tokenizer's preprocessing: CRLF, CR and FF are one newline.
  const css = source.replace(/\r\n?|\f/g, '\n');
  let name = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      if (close < 0) return false;
      i = close + 2;
      name = '';
    } else if (ch === '"' || ch === "'") {
      const end = cssStringEnd(css, i);
      const content = decodeCssEscapes(css.slice(i + 1, end));
      if (EXTERNAL_URL_PREFIX.test(content)) return true;
      i = end + 1;
      name = '';
    } else if (ch === '\\') {
      const next = skipCssEscape(css, i);
      name = trackName(name, decodeCssEscapes(css.slice(i, next)).toLowerCase());
      i = next;
    } else if (ch === '(' && name === 'url') {
      let j = i + 1;
      while (j < css.length && isCssWhitespace(css[j])) j++;
      if (css[j] === '"' || css[j] === "'") {
        const end = cssStringEnd(css, j);
        if (!isInertUrl(decodeCssEscapes(css.slice(j + 1, end)))) return true;
        j = end + 1;
      } else {
        // Unquoted url( token: runs to `)`.
        const start = j;
        while (j < css.length && css[j] !== ')') {
          if (css[j] === '"' || css[j] === "'") return true;
          j = css[j] === '\\' ? skipCssEscape(css, j) : j + 1;
        }
        if (!isInertUrl(decodeCssEscapes(css.slice(start, j)))) return true;
      }
      i = j;
      name = '';
    } else if (ch === '(' && STRING_FETCH_FUNCTIONS.has(name.replace(/^-[a-z]+-/, ''))) {
      return true;
    } else {
      name = isCssNameChar(ch) ? trackName(name, ch.toLowerCase()) : '';
      i++;
    }
  }
  return false;
}

/**
 * True when CSS text can fetch anything, external or from the page's own
 * origin: a `url()` that is not a raster `data:` URL or `#fragment`, a string-fetching
 * function, or any string that starts with an external URL.
 */
export function cssCanFetch(css: string): boolean {
  return (
    cssReadings(css).some((text) => EXTERNAL_URL_FUNCTION.test(text)) || cssTokensCanFetch(css)
  );
}

function cssHasRemoteResource(css: string): boolean {
  return cssReadings(css).some((text) => /@import\b/i.test(text)) || cssCanFetch(css);
}

/** Problem with stylesheet text, or null when it may be injected. */
export function styleSheetIssue(css: string): string | null {
  if (css.length > MAX_STYLE_LENGTH) return `exceeds ${MAX_STYLE_LENGTH} chars`;
  if (cssHasRemoteResource(css)) {
    return 'must not load anything: no @import, image-set(), image(), cross-fade() or src(), url() only with a raster image data: URL (png, jpeg, gif, webp, avif, bmp, ico) or #fragment, and no string starting with an external URL (network fetch)';
  }
  return null;
}

/** Problem with one inline style value, or null when it may be set. */
export function styleValueIssue(value: string): string | null {
  return cssCanFetch(value)
    ? 'must not load anything: no image-set(), image(), cross-fade() or src(), url() only with a raster image data: URL (png, jpeg, gif, webp, avif, bmp, ico) or #fragment, and no string starting with an external URL (network fetch)'
    : null;
}

/**
 * Attributes a plugin may set, matched against the exact name that is written.
 * Everything else is refused: URL-bearing names (`href`, `src*`, `srcdoc`,
 * `action`, `data`, …) fetch, navigate or run code, `on*` runs code, `class`
 * would bypass addClass's `gv-` rule, `id` / `name` clobber DOM lookups, and
 * any namespaced name (`xlink:href`) is out.
 */
export const ALLOWED_ATTRIBUTE_NAMES = [
  'title',
  'role',
  'lang',
  'dir',
  'hidden',
  'tabindex',
  'draggable',
  'spellcheck',
  'translate',
  'style',
] as const;
const ALLOWED_ATTRIBUTES = new Set<string>(ALLOWED_ATTRIBUTE_NAMES);
/** Attribute families allowed besides the exact names: `data-*` and `aria-*`. */
export const ALLOWED_ATTRIBUTE_PREFIXES = ['data-', 'aria-'] as const;
const ALLOWED_ATTRIBUTE_PATTERN = /^(?:data-[a-z0-9][a-z0-9._-]*|aria-[a-z]+)$/;

/** Problem with an attribute name, or null when a plugin may set it. */
export function attributeNameIssue(name: string): string | null {
  return ALLOWED_ATTRIBUTES.has(name) || ALLOWED_ATTRIBUTE_PATTERN.test(name)
    ? null
    : 'attribute is not allowed (use data-*, aria-*, style or an inert global attribute)';
}

/** Problem with one attribute write, or null when it may be set. */
export function attributeIssue(name: string, value: string): string | null {
  const nameIssue = attributeNameIssue(name);
  if (nameIssue) return nameIssue;
  if (name === 'style') return styleValueIssue(value);
  // An allowed attribute is inert, but `attr()` can read it from CSS and a page
  // script may copy a `data-*` value into a fetching attribute, so it may not
  // carry an external URL either. Unanchored so a URL anywhere in it counts.
  if (EXTERNAL_URL_ANYWHERE.test(value)) {
    return 'must not contain an external URL (remote-resource fetch)';
  }
  return null;
}
