/**
 * LaTeX to UnicodeMath Converter
 * Converts LaTeX formulas to Microsoft UnicodeMath format for Word
 */

/**
 * Convert a character to Unicode mathematical bold
 * @param char - Character to convert
 * @returns Unicode mathematical bold character
 */
function toMathBold(char: string): string {
  const code = char.charCodeAt(0);

  // Uppercase letters A-Z (U+0041 to U+005A) -> Mathematical Bold (U+1D400 to U+1D419)
  if (code >= 0x41 && code <= 0x5A) {
    return String.fromCodePoint(0x1D400 + (code - 0x41));
  }

  // Lowercase letters a-z (U+0061 to U+007A) -> Mathematical Bold (U+1D41A to U+1D433)
  if (code >= 0x61 && code <= 0x7A) {
    return String.fromCodePoint(0x1D41A + (code - 0x61));
  }

  // Numbers 0-9 (U+0030 to U+0039) -> Mathematical Bold Digits (U+1D7CE to U+1D7D7)
  if (code >= 0x30 && code <= 0x39) {
    return String.fromCodePoint(0x1D7CE + (code - 0x30));
  }

  // If not alphanumeric, return as-is
  return char;
}

/**
 * Convert a string to Unicode mathematical bold
 * @param text - Text to convert
 * @returns Unicode mathematical bold text
 */
function toBoldText(text: string): string {
  return Array.from(text).map(char => toMathBold(char)).join('');
}

/**
 * Convert LaTeX formula to UnicodeMath format
 * @param latex - LaTeX formula string
 * @returns UnicodeMath formatted string
 */
export function latexToUnicodeMath(latex: string): string {
  if (!latex) return '';

  let result = latex;

  // Combining diacritical marks for accents (must be processed before other replacements)
  const accentMarks: Record<string, string> = {
    '\\hat': '\u0302',      // Combining circumflex accent
    '\\tilde': '\u0303',    // Combining tilde
    '\\bar': '\u0305',      // Combining overline
    '\\vec': '\u20D7',      // Combining right arrow above
    '\\dot': '\u0307',      // Combining dot above
    '\\ddot': '\u0308',     // Combining diaeresis (two dots)
    '\\acute': '\u0301',    // Combining acute accent
    '\\grave': '\u0300',    // Combining grave accent
    '\\check': '\u030C',    // Combining caron
    '\\breve': '\u0306',    // Combining breve
  };

  // Process accents: \hat{x} -> x̂
  for (const [accentLatex, combining] of Object.entries(accentMarks)) {
    const escaped = accentLatex.replace(/\\/g, '\\\\');

    // Handle braced form: \hat{x} -> x̂
    const bracedPattern = new RegExp(escaped + '\\{([^}]+)\\}', 'g');
    result = result.replace(bracedPattern, (match, content) => {
      // For single character, place combining mark after
      if (content.length === 1) {
        return content + combining;
      }
      // For multiple characters, wrap in parentheses
      return '(' + content + ')' + combining;
    });

    // Handle non-braced form:
    // - \hat x       -> x̂
    // - \hat\alpha   -> α̂
    const unbracedPattern = new RegExp(
      `${escaped}\\s*(\\\\[a-zA-Z]+|[a-zA-Z])`,
      'g'
    );
    result = result.replace(unbracedPattern, (match, token) => token + combining);
  }

  // Greek letters (lowercase)
  const greekLowercase: Record<string, string> = {
    '\\alpha': 'α',
    '\\beta': 'β',
    '\\gamma': 'γ',
    '\\delta': 'δ',
    '\\epsilon': 'ε',
    '\\varepsilon': 'ε',
    '\\zeta': 'ζ',
    '\\eta': 'η',
    '\\theta': 'θ',
    '\\vartheta': 'ϑ',
    '\\iota': 'ι',
    '\\kappa': 'κ',
    '\\lambda': 'λ',
    '\\mu': 'μ',
    '\\nu': 'ν',
    '\\xi': 'ξ',
    '\\pi': 'π',
    '\\varpi': 'ϖ',
    '\\rho': 'ρ',
    '\\varrho': 'ϱ',
    '\\sigma': 'σ',
    '\\varsigma': 'ς',
    '\\tau': 'τ',
    '\\upsilon': 'υ',
    '\\phi': 'φ',
    '\\varphi': 'φ',
    '\\chi': 'χ',
    '\\psi': 'ψ',
    '\\omega': 'ω',
  };

  // Greek letters (uppercase)
  const greekUppercase: Record<string, string> = {
    '\\Gamma': 'Γ',
    '\\Delta': 'Δ',
    '\\Theta': 'Θ',
    '\\Lambda': 'Λ',
    '\\Xi': 'Ξ',
    '\\Pi': 'Π',
    '\\Sigma': 'Σ',
    '\\Upsilon': 'Υ',
    '\\Phi': 'Φ',
    '\\Psi': 'Ψ',
    '\\Omega': 'Ω',
  };

  // Mathematical operators and symbols
  const symbols: Record<string, string> = {
    '\\mid': '|',           // Vertical bar (divisibility, conditional)
    '\\infty': '∞',
    '\\partial': '∂',
    '\\nabla': '∇',
    '\\pm': '±',
    '\\mp': '∓',
    '\\times': '×',
    '\\div': '÷',
    '\\cdot': '⋅',
    '\\ast': '*',
    '\\star': '⋆',
    '\\circ': '∘',
    '\\bullet': '•',
    '\\cap': '∩',
    '\\cup': '∪',
    '\\sqcap': '⊓',
    '\\sqcup': '⊔',
    '\\vee': '∨',
    '\\wedge': '∧',
    '\\oplus': '⊕',
    '\\ominus': '⊖',
    '\\otimes': '⊗',
    '\\oslash': '⊘',
    '\\odot': '⊙',
    '\\leq': '≤',
    '\\geq': '≥',
    '\\neq': '≠',
    '\\equiv': '≡',
    '\\approx': '≈',
    '\\sim': '∼',
    '\\simeq': '≃',
    '\\cong': '≅',
    '\\propto': '∝',
    '\\ll': '≪',
    '\\gg': '≫',
    '\\subset': '⊂',
    '\\supset': '⊃',
    '\\subseteq': '⊆',
    '\\supseteq': '⊇',
    '\\in': '∈',
    '\\notin': '∉',
    '\\ni': '∋',
    '\\forall': '∀',
    '\\exists': '∃',
    '\\neg': '¬',
    '\\emptyset': '∅',
    '\\angle': '∠',
    '\\triangle': '△',
    '\\perp': '⊥',
    '\\parallel': '∥',
    '\\rightarrow': '→',
    '\\leftarrow': '←',
    '\\leftrightarrow': '↔',
    '\\Rightarrow': '⇒',
    '\\Leftarrow': '⇐',
    '\\Leftrightarrow': '⇔',
    '\\uparrow': '↑',
    '\\downarrow': '↓',
    '\\to': '→',
    '\\gets': '←',
    '\\mapsto': '↦',
    '\\implies': '⇒',
    '\\iff': '⇔',
    '\\sum': '∑',
    '\\prod': '∏',
    '\\coprod': '∐',
    '\\int': '∫',
    '\\iint': '∬',
    '\\iiint': '∭',
    '\\oint': '∮',
    '\\ldots': '…',
    '\\cdots': '⋯',
    '\\vdots': '⋮',
    '\\ddots': '⋱',
    '\\aleph': 'ℵ',
    '\\hbar': 'ℏ',
    '\\ell': 'ℓ',
    '\\Re': 'ℜ',
    '\\Im': 'ℑ',
    '\\wp': '℘',
  };

  // Replace Greek letters and symbols.
  // Process from longest to shortest key to avoid prefix conflicts
  // (e.g., \notin vs \in).
  const allSymbols: Record<string, string> = {
    ...greekLowercase,
    ...greekUppercase,
    ...symbols,
  };
  const sortedKeys = Object.keys(allSymbols).sort((a, b) => b.length - a.length);

  for (const latexKey of sortedKeys) {
    const unicode = allSymbols[latexKey];
    const pattern = new RegExp(latexKey.replace(/\\/g, '\\\\'), 'g');
    result = result.replace(pattern, unicode);
  }

  // Handle fractions: \frac{a}{b} -> a/b (UnicodeMath uses linear format)
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');

  // Handle square roots: \sqrt{x} -> √(x)
  result = result.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');

  // Handle n-th roots: \sqrt[n]{x} -> (x)^(1/n) or √(n&x) in UnicodeMath
  result = result.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '√($1&$2)');

  // Handle superscripts: ^{...} -> keep as ^(...)
  result = result.replace(/\^\{([^}]+)\}/g, '^($1)');

  // Handle subscripts: _{...} -> keep as _(...)
  result = result.replace(/\_\{([^}]+)\}/g, '_($1)');

  // Handle single character superscripts and subscripts (no braces)
  // These are already in the correct format for UnicodeMath

  // Handle \text{...} -> just remove the command
  result = result.replace(/\\text\{([^}]+)\}/g, '$1');
  result = result.replace(/\\mathrm\{([^}]+)\}/g, '$1');
  result = result.replace(/\\mathbf\{([^}]+)\}/g, (match, content) => toBoldText(content));
  result = result.replace(/\\mathit\{([^}]+)\}/g, '$1');

  // Handle limits: \lim_{x \to a} -> lim_(x→a)
  result = result.replace(/\\lim_\{([^}]+)\}/g, 'lim_($1)');
  result = result.replace(/\\lim/g, 'lim');

  // Handle summation with limits: \sum_{i=1}^{n} -> ∑_(i=1)^n
  // Already handled by symbol replacement and superscript/subscript handling

  // Handle integral with limits
  // Already handled by symbol replacement

  // Handle common functions
  const functions = [
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh', 'coth',
    'exp', 'log', 'ln', 'lg',
    'det', 'dim', 'ker', 'max', 'min', 'sup', 'inf',
    'gcd', 'lcm', 'arg', 'deg',
  ];

  for (const func of functions) {
    result = result.replace(new RegExp(`\\\\${func}\\b`, 'g'), func);
  }

  // Handle matrices (basic support)
  // \begin{matrix}...\end{matrix} -> [■(...)]
  result = result.replace(/\\begin\{(?:matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}([\s\S]*?)\\end\{(?:matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\}/g, (match, content) => {
    // Replace \\ with @ (row separator in UnicodeMath)
    const rows = content
      .trim()
      .split('\\\\')
      .map((row: string) => row.trim()) // & is column separator in both LaTeX and UnicodeMath
      .join('@');
    return `[■(${rows})]`;
  });

  // Handle common LaTeX commands that should be removed
  result = result.replace(/\\left/g, '');
  result = result.replace(/\\right/g, '');
  result = result.replace(/\\,/g, ' ');
  result = result.replace(/\\:/g, ' ');
  result = result.replace(/\\;/g, ' ');
  result = result.replace(/\\!/g, '');
  result = result.replace(/\\quad/g, ' ');
  result = result.replace(/\\qquad/g, '  ');

  // Clean up extra spaces
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}
