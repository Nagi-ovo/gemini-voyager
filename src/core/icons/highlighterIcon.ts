/**
 * Lucide Highlighter geometry, shared by the non-React content toolbar.
 * Source family: lucide-react v0.553.0, which the popup already uses.
 */
const LUCIDE_NAMESPACE = 'http://www.w3.org/2000/svg';

export function createHighlighterIcon(size = 16): SVGSVGElement {
  const svg = document.createElementNS(LUCIDE_NAMESPACE, 'svg');
  svg.setAttribute('xmlns', LUCIDE_NAMESPACE);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('lucide', 'lucide-highlighter');

  for (const pathData of [
    'm9 11-6 6v3h9l3-3',
    'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  ]) {
    const path = document.createElementNS(LUCIDE_NAMESPACE, 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
  }

  return svg;
}
