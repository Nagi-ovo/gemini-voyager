// Load shared mocks before the service and its dependencies.
import './__tests__/formulaCopyTestHarness';
import temml from 'temml';
import { describe, expect, it, vi } from 'vitest';

import { FormulaCopyService } from './FormulaCopyService';
import {
  TestClipboardItem,
  resetSingleton,
  setupFormulaCopyTestSuite,
} from './__tests__/formulaCopyTestHarness';

describe('Formula copy clipboard', () => {
  const context = setupFormulaCopyTestSuite();
  const { writeMock, writeTextMock } = context;

  it('should generate MathML when format is unicodemath (now mapped to MathML)', async () => {
    // Setup
    vi.mocked(temml.renderToString).mockReturnValue(
      '<math xmlns="http://www.w3.org/1998/Math/MathML" class="tml-display" style="display:block math;"><semantics><mrow><mtext class="tml-text">Result</mtext></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math>',
    );

    // Reset instance first
    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'unicodemath' });

    // Create a mock event and element
    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', 'x^2');
    mathElement.classList.add('math-inline');
    document.body.appendChild(mathElement);

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
    });

    // Dispatch click on the element
    context.service.initialize();
    mathElement.dispatchEvent(clickEvent);
    await Promise.resolve();

    // Assertions
    expect(temml.renderToString).toHaveBeenCalledWith(
      'x^2',
      expect.objectContaining({
        annotate: false,
        colorIsTextColor: true,
        displayMode: false,
        throwOnError: true,
        trust: false,
        xml: true,
      }),
    );

    // Verify clipboard write was called with rich content
    expect(writeMock).toHaveBeenCalled();
    const writtenItemsUnknown = writeMock.mock.calls[0]?.[0] as unknown;
    expect(Array.isArray(writtenItemsUnknown)).toBe(true);
    const writtenItems = writtenItemsUnknown as TestClipboardItem[];
    expect(writtenItems.length).toBeGreaterThan(0);

    const clipboardItem = writtenItems[0];

    expect(clipboardItem.dataByType['text/html']).toBeDefined();
    expect(clipboardItem.dataByType['text/plain']).toBeDefined();
    expect(clipboardItem.dataByType['application/mathml+xml']).toBeDefined();

    const htmlContent = await clipboardItem.dataByType['text/html'].text();
    const textContent = await clipboardItem.dataByType['text/plain'].text();
    const mathmlContent = await clipboardItem.dataByType['application/mathml+xml'].text();

    // Word-friendly MathML should be prefixed and must not include KaTeX <annotation> TeX payloads.
    expect(htmlContent).toContain('xmlns:mml="http://www.w3.org/1998/Math/MathML"');
    expect(htmlContent).toContain('<!--StartFragment-->');
    expect(htmlContent).toContain('<mml:math');
    expect(htmlContent).not.toContain('<annotation');
    expect(htmlContent).not.toContain('class=');
    expect(htmlContent).not.toContain('style=');
    expect(textContent).toContain('<mml:math');
    expect(mathmlContent).toContain('<mml:math');

    // Cleanup
    document.body.removeChild(mathElement);
  });

  it('should fall back to legacy copy when MathML MIME is rejected', async () => {
    vi.mocked(temml.renderToString).mockReturnValue(
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mtext>Result</mtext></mrow></math>',
    );

    const originalExecCommand = document.execCommand;
    Object.assign(document, {
      execCommand: vi.fn().mockReturnValue(true),
    });

    const unsupportedError =
      typeof DOMException === 'function'
        ? new DOMException('Type application/mathml+xml not supported on write.', 'NotAllowedError')
        : Object.assign(new Error('Type application/mathml+xml not supported on write.'), {
            name: 'NotAllowedError',
          });

    writeMock.mockRejectedValueOnce(unsupportedError).mockResolvedValueOnce(undefined);

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'unicodemath' });

    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', 'x^2');
    mathElement.classList.add('math-inline');
    document.body.appendChild(mathElement);

    context.service.initialize();
    mathElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeMock).toHaveBeenCalledTimes(1);

    const firstItemsUnknown = writeMock.mock.calls[0]?.[0] as unknown;
    const firstItems = firstItemsUnknown as TestClipboardItem[];
    const firstClipboardItem = firstItems[0];
    expect(firstClipboardItem.dataByType['application/mathml+xml']).toBeDefined();
    expect(
      (document.execCommand as unknown as { mock?: { calls: unknown[] } }).mock?.calls.length,
    ).toBeGreaterThan(0);

    document.body.removeChild(mathElement);
    Object.assign(document, {
      execCommand: originalExecCommand,
    });
  });

  it('should fall back to writeText if write is not available', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;

    resetSingleton();
    context.service = FormulaCopyService.getInstance({ format: 'latex' });

    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', 'x^2');
    document.body.appendChild(mathElement);

    context.service.initialize();
    mathElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$x^2$');

    document.body.removeChild(mathElement);
  });
});
