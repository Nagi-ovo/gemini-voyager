interface MermaidExportStyleOptions {
  containerMargin?: string;
  containerMaxWidth?: boolean;
  avoidContainerBreak?: boolean;
  diagramSelector?: 'svg' | '> img';
  diagramMargin?: string;
  importantDisplay?: boolean;
  avoidDiagramBreak?: boolean;
  preservePrintBackground?: boolean;
}

export function buildMermaidExportStyles(
  scope: string,
  options: MermaidExportStyleOptions = {},
): string {
  const diagramSelector = options.diagramSelector ?? 'svg';
  const diagramMargin = options.diagramMargin ?? '0 auto';
  const displayImportant = options.importantDisplay ? ' !important' : '';
  const containerMargin = options.containerMargin
    ? `
        margin: ${options.containerMargin};`
    : '';
  const containerMaxWidth = options.containerMaxWidth
    ? `
        max-width: 100%;`
    : '';
  const containerBreakStyles = options.avoidContainerBreak
    ? `
        break-inside: avoid;
        page-break-inside: avoid;`
    : '';
  const diagramBreakStyles = options.avoidDiagramBreak
    ? `
        break-inside: avoid;
        page-break-inside: avoid;`
    : '';
  const printBackgroundStyles = options.preservePrintBackground
    ? `
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;`
    : '';

  return `
      ${scope} .gv-export-mermaid {${containerMargin}${containerMaxWidth}
        text-align: center;${containerBreakStyles}
      }

      ${scope} .gv-export-mermaid ${diagramSelector} {
        display: block${displayImportant};
        max-width: 100%;
        height: auto;
        margin: ${diagramMargin};${diagramBreakStyles}
      }

      ${scope} .gv-export-mermaid[data-gv-mermaid-theme="dark"] {
        background: #1f2020;
        padding: 16px;
        border-radius: 8px;${printBackgroundStyles}
      }
  `;
}
