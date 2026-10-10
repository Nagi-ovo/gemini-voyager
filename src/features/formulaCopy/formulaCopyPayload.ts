import temml from 'temml';

import type { ILogger } from '@/core/types/common';

import type { FormulaCopyFormat } from './FormulaCopyService';

export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Wrap formula with appropriate delimiters based on format
 * @param formula - Raw LaTeX formula
 * @param isDisplayMode - Whether formula is in display mode
 * @returns Object containing text and optional html
 */
export function formatFormula(
  formula: string,
  isDisplayMode: boolean,
  format: FormulaCopyFormat,
  logger: ILogger,
): { text: string; html?: string } {
  if (format === 'unicodemath') {
    // Convert to Word-friendly MathML (replaces previous UnicodeMath)
    try {
      const strippedFormula = stripMathDelimiters(formula);
      const rawMathML = temml.renderToString(strippedFormula, {
        displayMode: isDisplayMode,
        xml: true,
        annotate: false,
        throwOnError: true,
        colorIsTextColor: true,
        trust: false,
      });
      const sanitizedMathML = stripMathMLAnnotations(rawMathML);
      const namespacedMathML = ensureMathMLNamespace(sanitizedMathML);
      const wordMathML = toWordMathML(namespacedMathML);
      const htmlWrapped = wrapMathMLForWordHtml(wordMathML);

      return { text: wordMathML, html: htmlWrapped };
    } catch (error) {
      logger.error('MathML conversion failed', { error });
      return { text: formula };
    }
  }

  if (format === 'no-dollar') {
    return { text: formula };
  }

  if (format === 'notion') {
    // Notion format: always use $$ for both inline and display formulas
    const wrapped = `$$${formula}$$`;
    return { text: wrapped };
  }

  // Default: LaTeX format with delimiters
  const wrapped = isDisplayMode ? `$$${formula}$$` : `$${formula}$`;
  return { text: wrapped };
}

function ensureMathMLNamespace(mathML: string): string {
  if (mathML.includes('xmlns=')) {
    return mathML;
  }

  return mathML.replace('<math', `<math xmlns="${MATHML_NS}"`);
}

function toWordMathML(mathML: string): string {
  const parsed = new DOMParser().parseFromString(mathML, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    return stripMathMLAnnotations(mathML);
  }

  const root = parsed.documentElement;
  if (root.localName !== 'math') {
    return stripMathMLAnnotations(mathML);
  }

  // Remove annotations (<annotation> and <annotation-xml>)
  for (const annotation of Array.from(root.getElementsByTagName('annotation'))) {
    annotation.parentNode?.removeChild(annotation);
  }
  for (const annotationXml of Array.from(root.getElementsByTagName('annotation-xml'))) {
    annotationXml.parentNode?.removeChild(annotationXml);
  }

  // Unwrap <semantics> if present at root
  const semantics = Array.from(root.getElementsByTagName('semantics')).find(
    (node) => node.parentElement === root,
  );
  if (semantics) {
    const presentation = semantics.firstElementChild;
    if (presentation) {
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
      root.appendChild(presentation);
    }
  }

  stripPresentationAttributes(root);

  const output = document.implementation.createDocument(MATHML_NS, 'mml:math', null);
  const outputRoot = output.documentElement;

  // Copy root attributes (display, etc.), excluding namespace declarations
  for (const attr of Array.from(root.attributes)) {
    if (attr.name.startsWith('xmlns')) {
      continue;
    }
    outputRoot.setAttribute(attr.name, attr.value);
  }

  for (const child of Array.from(root.childNodes)) {
    outputRoot.appendChild(cloneNodeWithMathMLPrefix(output, child));
  }

  return new XMLSerializer().serializeToString(outputRoot);
}

function cloneNodeWithMathMLPrefix(targetDocument: Document, sourceNode: Node): Node {
  if (sourceNode.nodeType === Node.TEXT_NODE) {
    return targetDocument.createTextNode(sourceNode.nodeValue ?? '');
  }

  if (sourceNode.nodeType !== Node.ELEMENT_NODE) {
    return targetDocument.importNode(sourceNode, true);
  }

  const sourceElement = sourceNode as Element;
  const namespaceUri = sourceElement.namespaceURI;
  const localName = sourceElement.localName;

  const isMathMl = namespaceUri === MATHML_NS || namespaceUri === null;
  const qualifiedName = isMathMl ? `mml:${localName}` : sourceElement.tagName;
  const element = isMathMl
    ? targetDocument.createElementNS(MATHML_NS, qualifiedName)
    : targetDocument.createElement(qualifiedName);

  for (const attr of Array.from(sourceElement.attributes)) {
    if (attr.name.startsWith('xmlns')) {
      continue;
    }
    element.setAttribute(attr.name, attr.value);
  }

  for (const child of Array.from(sourceElement.childNodes)) {
    element.appendChild(cloneNodeWithMathMLPrefix(targetDocument, child));
  }

  return element;
}

function wrapMathMLForWordHtml(mathML: string): string {
  // Word's HTML importer is sensitive to fragments; include Start/End markers.
  return [
    `<html xmlns:mml="${MATHML_NS}">`,
    '<head><meta charset="utf-8"></head>',
    '<body><!--StartFragment-->',
    mathML,
    '<!--EndFragment--></body></html>',
  ].join('');
}

function stripMathMLAnnotations(mathML: string): string {
  return mathML
    .replace(/<annotation(?:-xml)?[\s\S]*?<\/annotation(?:-xml)?>/g, '')
    .replace(/<semantics>\s*([\s\S]*?)\s*<\/semantics>/g, '$1');
}

function stripPresentationAttributes(root: Element): void {
  if (root.hasAttribute('class')) {
    root.removeAttribute('class');
  }
  if (root.hasAttribute('style')) {
    root.removeAttribute('style');
  }

  for (const element of Array.from(root.getElementsByTagName('*'))) {
    if (element.hasAttribute('class')) {
      element.removeAttribute('class');
    }
    if (element.hasAttribute('style')) {
      element.removeAttribute('style');
    }
  }
}

function stripMathDelimiters(formula: string): string {
  const trimmed = formula.trim();

  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    return trimmed.slice(2, -2);
  }

  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return trimmed.slice(2, -2);
  }

  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
    return trimmed.slice(2, -2);
  }

  if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    return trimmed.slice(1, -1);
  }

  return formula;
}
