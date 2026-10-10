import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  convertLegacyBraces,
  fillPromptTemplate,
  isPromptTemplate,
  parsePromptTemplate,
  promptTemplateVariables,
  unfilledTemplateVariables,
} from '../promptTemplate';

describe('promptTemplate', () => {
  it('treats only double braces as placeholders', () => {
    // Prompt bodies render through marked-katex-extension, so single braces
    // belong to the maths, not to us.
    expect(promptTemplateVariables('围绕 {{concept}} 写一则寓言')).toEqual(['concept']);
    expect(promptTemplateVariables(String.raw`求 \frac{a}{b} 的极限`)).toEqual([]);
    expect(promptTemplateVariables('{"role": "user"}')).toEqual([]);
    expect(isPromptTemplate('把这篇论文讲清楚')).toBe(false);
  });

  it('lists names once, in first-appearance order', () => {
    const text = '用 {{tone}} 的语气写 {{concept}},再用 {{tone}} 收尾';
    expect(promptTemplateVariables(text)).toEqual(['tone', 'concept']);
  });

  it('accepts CJK names and padding inside the braces', () => {
    expect(promptTemplateVariables('主题是 {{ 核心概念 }}')).toEqual(['核心概念']);
    expect(fillPromptTemplate('主题是 {{ 核心概念 }}', { 核心概念: '沉没成本' })).toBe(
      '主题是 沉没成本',
    );
  });

  it('accepts a name written in any locale the extension ships', () => {
    // `\w` is ASCII-only outside `u` mode, and the Han range it was paired with
    // covers neither kana, hangul, Cyrillic, Arabic nor an accented Latin
    // letter. Every one of these came back as plain text: the fill surface
    // never opened and the raw `{{...}}` was sent to the model.
    const names = ['テーマ', 'あだい', '주제', 'имя', 'العنوان', 'tópico', 'año', 'thème'];
    for (const name of names) {
      expect(isPromptTemplate(`围绕 {{${name}}} 写`)).toBe(true);
      expect(promptTemplateVariables(`围绕 {{${name}}} 写`)).toEqual([name]);
    }
    // A decomposed accent stays part of its name rather than ending it.
    expect(promptTemplateVariables('{{café}}')).toEqual(['café']);
  });

  it('fills a name that collides with an Object prototype member', () => {
    // `{{constructor}}` is a name a coding prompt plausibly uses. Reading it off
    // a plain object answered with `Object`, and the `.trim()` that followed
    // threw before the prompt could be delivered.
    const text = '解释 {{constructor}} 和 {{toString}}';
    expect(promptTemplateVariables(text)).toEqual(['constructor', 'toString']);
    expect(unfilledTemplateVariables(text, {})).toEqual(['constructor', 'toString']);
    expect(fillPromptTemplate(text, { constructor: '构造函数' })).toBe(
      '解释 构造函数 和 {{toString}}',
    );
  });

  it('lets a prompt talk about the syntax itself', () => {
    const text = String.raw`写 \{{name}} 就会变成一个空位`;
    expect(promptTemplateVariables(text)).toEqual([]);
    expect(parsePromptTemplate(text)).toEqual([
      { kind: 'text', value: '写 {{name}} 就会变成一个空位' },
    ]);
  });

  it('splits the body into slots that sit in their own sentence', () => {
    expect(parsePromptTemplate('围绕 {{concept}} 写')).toEqual([
      { kind: 'text', value: '围绕 ' },
      { kind: 'variable', name: 'concept' },
      { kind: 'text', value: ' 写' },
    ]);
  });

  it('keeps a blank variable literal rather than sending an empty hole', () => {
    const text = '围绕 {{concept}} 用 {{tone}} 的语气';
    expect(fillPromptTemplate(text, { concept: '沉没成本' })).toBe(
      '围绕 沉没成本 用 {{tone}} 的语气',
    );
    expect(fillPromptTemplate(text, { concept: '沉没成本', tone: '   ' })).toBe(
      '围绕 沉没成本 用 {{tone}} 的语气',
    );
    expect(unfilledTemplateVariables(text, { concept: '沉没成本' })).toEqual(['tone']);
  });

  it('substitutes every occurrence of a repeated name', () => {
    expect(fillPromptTemplate('{{x}} 与 {{x}}', { x: '甲' })).toBe('甲 与 甲');
  });

  it('migrates single braces without doubling the ones already correct', () => {
    expect(convertLegacyBraces('围绕 {concept} 写')).toBe('围绕 {{concept}} 写');
    expect(convertLegacyBraces('围绕 {{concept}} 写')).toBe('围绕 {{concept}} 写');
    expect(convertLegacyBraces('{a} 和 {{b}} 和 {c}')).toBe('{{a}} 和 {{b}} 和 {{c}}');
  });

  it('migrates adjacent single braces with nothing between them', () => {
    // Guards the shape a lookbehind-free rewrite gets wrong: a pattern that
    // consumes the preceding character to stand in for `(?<!\{)` eats the `}`
    // of the previous match, so the second placeholder is never seen.
    expect(convertLegacyBraces('{a}{b}')).toBe('{{a}}{{b}}');
    expect(convertLegacyBraces('{a}{b}{c}')).toBe('{{a}}{{b}}{{c}}');
    expect(convertLegacyBraces('{{a}}{b}')).toBe('{{a}}{{b}}');
    expect(convertLegacyBraces('{a}{{b}}')).toBe('{{a}}{{b}}');
  });

  it('leaves unbalanced and nested braces untouched', () => {
    expect(convertLegacyBraces('{{a}')).toBe('{{a}');
    expect(convertLegacyBraces('{a}}')).toBe('{a}}');
    expect(convertLegacyBraces('{{{a}}}')).toBe('{{{a}}}');
  });

  it('converts a single-braced name that merely sits between other braces', () => {
    // The outer pair is separated by whitespace, so only the inner `{a}` is a
    // candidate. Pinned because it is the case where "look at the previous
    // character" and "look at the previous match" disagree.
    expect(convertLegacyBraces('{ {a} }')).toBe('{ {{a}} }');
  });

  it('is built without a RegExp lookbehind so Safari 15.4 can evaluate it', () => {
    // Safari gained lookbehind only in 16.4; vite.config.safari.ts declares a
    // 15.4 floor. A lookbehind in this module's top-level `new RegExp` throws
    // at content-script evaluation and disables every Voyager feature.
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/prompt/model/promptTemplate.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/\(\?<[=!]/);
  });

  it('leaves a body with no placeholders exactly as authored', () => {
    const text = '把这篇论文的方法与贡献讲清楚。\n\n不要写摘要。';
    expect(fillPromptTemplate(text, {})).toBe(text);
    expect(parsePromptTemplate(text)).toEqual([{ kind: 'text', value: text }]);
  });
});
