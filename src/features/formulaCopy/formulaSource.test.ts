// Load shared mocks before the service and its dependencies.
import './__tests__/formulaCopyTestHarness';
import { describe, expect, it } from 'vitest';

import { FormulaCopyService } from './FormulaCopyService';
import { resetSingleton, setupFormulaCopyTestSuite } from './__tests__/formulaCopyTestHarness';

describe('Formula copy source', () => {
  const context = setupFormulaCopyTestSuite();
  const { writeTextMock } = context;

  it('should find data-math inside math container subtree', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    const container = document.createElement('span');
    container.classList.add('math-inline');

    const inner = document.createElement('span');
    inner.setAttribute('data-math', 'x^2');
    inner.textContent = 'x²';
    container.appendChild(inner);
    document.body.appendChild(container);

    context.service.initialize();
    container.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$x^2$');

    document.body.removeChild(container);
  });
  it('should copy when clicking deep descendant inside math container', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    const container = document.createElement('span');
    container.classList.add('math-inline');

    const dataMathEl = document.createElement('span');
    dataMathEl.setAttribute('data-math', 'x^2');
    container.appendChild(dataMathEl);

    let deepest: HTMLElement = dataMathEl;
    for (let i = 0; i < 25; i += 1) {
      const next = document.createElement('span');
      next.textContent = `d${i}`;
      deepest.appendChild(next);
      deepest = next;
    }

    document.body.appendChild(container);

    context.service.initialize();
    deepest.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$x^2$');

    document.body.removeChild(container);
  });

  it('should copy formula from AI Studio ms-katex container with annotation', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    // Create AI Studio ms-katex structure based on the real DOM
    const msKatex = document.createElement('ms-katex');
    msKatex.classList.add('inline', 'ng-star-inserted');

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.classList.add('rendered');

    const katexSpan = document.createElement('span');
    katexSpan.classList.add('katex');

    // Create the katex-mathml part with annotation
    const katexMathml = document.createElement('span');
    katexMathml.classList.add('katex-mathml');

    const math = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'math');
    const semantics = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'semantics');

    const mrow = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mrow');
    const msub = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'msub');
    const mi1 = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mi');
    mi1.textContent = 'π';
    const mi2 = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mi');
    mi2.textContent = 'θ';
    msub.appendChild(mi1);
    msub.appendChild(mi2);
    mrow.appendChild(msub);

    const annotation = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'annotation');
    annotation.setAttribute('encoding', 'application/x-tex');
    annotation.textContent = '\\pi_\\theta';

    semantics.appendChild(mrow);
    semantics.appendChild(annotation);
    math.appendChild(semantics);
    katexMathml.appendChild(math);

    // Create the katex-html part (visual rendering)
    const katexHtml = document.createElement('span');
    katexHtml.classList.add('katex-html');
    katexHtml.setAttribute('aria-hidden', 'true');
    katexHtml.innerHTML = '<span class="base"><span class="mord">π<sub>θ</sub></span></span>';

    katexSpan.appendChild(katexMathml);
    katexSpan.appendChild(katexHtml);
    code.appendChild(katexSpan);
    pre.appendChild(code);
    msKatex.appendChild(pre);
    document.body.appendChild(msKatex);

    context.service.initialize();

    // Click on the katex-html part (where users typically click)
    katexHtml.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$\\pi_\\theta$');

    document.body.removeChild(msKatex);
  });

  it('should detect display mode for AI Studio block formulas', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    // Create AI Studio ms-katex structure with display="block"
    const msKatex = document.createElement('ms-katex');
    msKatex.classList.add('block');

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.classList.add('rendered');

    const katexSpan = document.createElement('span');
    katexSpan.classList.add('katex');

    const katexMathml = document.createElement('span');
    katexMathml.classList.add('katex-mathml');

    // Math element with display="block" attribute
    const math = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'math');
    math.setAttribute('display', 'block');

    const semantics = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'semantics');
    const mrow = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mrow');
    const mi = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mi');
    mi.textContent = 'E';
    mrow.appendChild(mi);

    const annotation = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'annotation');
    annotation.setAttribute('encoding', 'application/x-tex');
    annotation.textContent = 'E = mc^2';

    semantics.appendChild(mrow);
    semantics.appendChild(annotation);
    math.appendChild(semantics);
    katexMathml.appendChild(math);

    katexSpan.appendChild(katexMathml);
    code.appendChild(katexSpan);
    pre.appendChild(code);
    msKatex.appendChild(pre);
    document.body.appendChild(msKatex);

    context.service.initialize();
    msKatex.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    // Display mode should use $$ delimiters
    expect(writeTextMock).toHaveBeenCalledWith('$$E = mc^2$$');

    document.body.removeChild(msKatex);
  });

  it('should wrap both inline and display formulas with double dollar signs in notion format', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'notion' });

    const inlineMath = document.createElement('span');
    inlineMath.setAttribute('data-math', 'x^2');
    inlineMath.classList.add('math-inline');

    const displayMath = document.createElement('span');
    displayMath.setAttribute('data-math', 'E = mc^2');
    displayMath.classList.add('math-block');

    document.body.appendChild(inlineMath);
    document.body.appendChild(displayMath);

    context.service.initialize();

    inlineMath.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    displayMath.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenNthCalledWith(1, '$$x^2$$');
    expect(writeTextMock).toHaveBeenNthCalledWith(2, '$$E = mc^2$$');

    document.body.removeChild(inlineMath);
    document.body.removeChild(displayMath);
  });

  // Claude and older ChatGPT markup render standard KaTeX with a MathML
  // annotation. Keep this fixture to preserve compatibility with that shape.
  function makeKatex(latex: string, opts: { display: boolean }): HTMLElement {
    const katex = document.createElement('span');
    katex.className = 'katex';
    const mathml = document.createElement('span');
    mathml.className = 'katex-mathml';
    const displayAttr = opts.display ? ' display="block"' : '';
    mathml.innerHTML = `<math xmlns="http://www.w3.org/1998/Math/MathML"${displayAttr}><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">${latex}</annotation></semantics></math>`;
    const html = document.createElement('span');
    html.className = 'katex-html';
    html.textContent = 'rendered';
    katex.appendChild(mathml);
    katex.appendChild(html);
    if (!opts.display) return katex;
    const wrapper = document.createElement('span');
    wrapper.className = 'katex-display';
    wrapper.appendChild(katex);
    return wrapper;
  }

  it('should copy ChatGPT/Claude inline KaTeX as $...$', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    const inline = makeKatex('E = mc^2', { display: false });
    document.body.appendChild(inline);

    context.service.initialize();
    // Click the inner rendered span, mimicking a real click inside .katex.
    inline.querySelector('.katex-html')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$E = mc^2$');

    document.body.removeChild(inline);
  });

  it('should copy ChatGPT/Claude block KaTeX as $$...$$', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    const block = makeKatex('p(\\theta \\mid D) = \\frac{p(D \\mid \\theta)p(\\theta)}{p(D)}', {
      display: true,
    });
    document.body.appendChild(block);

    context.service.initialize();
    block.querySelector('.katex-html')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith(
      '$$p(\\theta \\mid D) = \\frac{p(D \\mid \\theta)p(\\theta)}{p(D)}$$',
    );

    document.body.removeChild(block);
  });

  it('should copy block KaTeX when clicking the .katex-display padding', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    const block = makeKatex('a^2 + b^2 = c^2', { display: true });
    document.body.appendChild(block);

    context.service.initialize();
    // Click the .katex-display wrapper itself (not the inner .katex).
    block.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$$a^2 + b^2 = c^2$$');

    document.body.removeChild(block);
  });

  function makeCurrentChatGptKatex(latex: string, display: boolean): HTMLElement {
    const semanticWrapper = document.createElement('span');
    semanticWrapper.setAttribute('role', 'math');
    semanticWrapper.setAttribute('aria-label', latex);
    semanticWrapper.setAttribute('data-math-source', latex);

    const katex = document.createElement('span');
    katex.className = 'katex';
    const html = document.createElement('span');
    html.className = 'katex-html';
    html.setAttribute('aria-hidden', 'true');
    html.textContent = 'rendered';
    katex.appendChild(html);

    if (display) {
      const displayWrapper = document.createElement('span');
      displayWrapper.className = 'katex-display';
      displayWrapper.appendChild(katex);
      semanticWrapper.appendChild(displayWrapper);
    } else {
      semanticWrapper.appendChild(katex);
    }

    return semanticWrapper;
  }

  it('copies current ChatGPT block KaTeX from data-math-source without MathML', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    const block = makeCurrentChatGptKatex('C = B\\log_2\\left(1+\\frac{S}{N}\\right)', true);
    document.body.appendChild(block);

    context.service.initialize();
    block.querySelector('.katex-html')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$$C = B\\log_2\\left(1+\\frac{S}{N}\\right)$$');
  });

  it('copies current ChatGPT inline KaTeX from data-math-source as inline LaTeX', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    const inline = makeCurrentChatGptKatex('E = mc^2', false);
    document.body.appendChild(inline);

    context.service.initialize();
    inline.querySelector('.katex-html')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$E = mc^2$');
  });
});
