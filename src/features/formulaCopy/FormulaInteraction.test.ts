import { describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { setupFormulaCopyTestSuite } from './__tests__/formulaCopyTestHarness';

describe('Formula copy interaction', () => {
  const context = setupFormulaCopyTestSuite();
  const { writeMock, writeTextMock } = context;

  it.each([
    '\\rightarrow',
    '\\to',
    '\\longrightarrow',
    '\\Rightarrow',
    '\\Longrightarrow',
    '\\leftrightarrow',
    '\\rightleftharpoons',
    '\\xrightarrow{\\text{step 1}}',
    '\\xrightarrow{f(x)}',
    '→',
    '⟶',
    '⇒',
    '⟹',
    '↔',
    '⇌',
  ])(
    'ignores an isolated Gemini inline arrow source before first hover: %s',
    async (arrowSource) => {
      const wrapper = document.createElement('span');
      wrapper.classList.add('math-inline');
      const mathElement = document.createElement('span');
      mathElement.setAttribute('data-math', arrowSource);
      wrapper.appendChild(mathElement);
      document.body.appendChild(wrapper);
      const pageClick = vi.fn();
      mathElement.addEventListener('click', pageClick);

      context.service.initialize();
      // Initial scan marks both the real Gemini outer wrapper and inner source,
      // so formula padding/cursor rules never apply to this ordinary arrow.
      expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(true);
      expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(true);
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      mathElement.dispatchEvent(clickEvent);
      await Promise.resolve();

      expect(writeMock).not.toHaveBeenCalled();
      expect(writeTextMock).not.toHaveBeenCalled();
      expect(toastDriver.all()).toEqual([]);
      expect(pageClick).toHaveBeenCalledTimes(1);
      expect(clickEvent.defaultPrevented).toBe(false);

      context.service.destroy();
      expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(false);
      expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(false);
    },
  );
  it.each([
    {
      platform: 'AI Studio',
      createFixture: () => {
        const root = document.createElement('ms-katex');
        root.innerHTML =
          '<span class="katex"><annotation encoding="application/x-tex">\\rightarrow</annotation></span>';
        return { root, target: root.querySelector<HTMLElement>('.katex')! };
      },
    },
    {
      platform: 'Claude / legacy ChatGPT',
      createFixture: () => {
        const root = document.createElement('span');
        root.className = 'katex';
        root.innerHTML = '<annotation encoding="application/x-tex">\\rightarrow</annotation>';
        return { root, target: root };
      },
    },
    {
      platform: 'current ChatGPT',
      createFixture: () => {
        const root = document.createElement('span');
        root.setAttribute('data-math-source', '\\rightarrow');
        root.innerHTML = '<span class="katex"><span class="katex-html">→</span></span>';
        return { root, target: root.querySelector<HTMLElement>('.katex-html')! };
      },
    },
  ])(
    'keeps an explicit arrow-only math source copyable on $platform',
    async ({ createFixture }) => {
      const clipboard = navigator.clipboard as unknown as { write?: unknown };
      clipboard.write = undefined;
      const { root, target } = createFixture();
      document.body.appendChild(root);

      context.service.initialize();
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();

      expect(writeMock).not.toHaveBeenCalled();
      expect(writeTextMock).toHaveBeenCalledWith('$\\rightarrow$');
      expect(root.classList.contains('gv-formula-copy-ignored')).toBe(false);
      expect(root.querySelector('.gv-formula-copy-ignored')).toBeNull();
    },
  );

  it('keeps a Gemini display arrow formula copyable', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;
    const wrapper = document.createElement('div');
    wrapper.className = 'math-block';
    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', '\\rightarrow');
    wrapper.appendChild(mathElement);
    document.body.appendChild(wrapper);

    context.service.initialize();
    expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(false);
    mathElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$$\\rightarrow$$');
  });

  it('marks a dynamically-rendered Gemini inline arrow without waiting for hover', async () => {
    context.service.initialize();
    const wrapper = document.createElement('span');
    wrapper.className = 'math-inline';
    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', '\\rightarrow');
    wrapper.appendChild(mathElement);
    document.body.appendChild(wrapper);

    await Promise.resolve();

    expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(true);
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(true);
  });

  it('coalesces same-wrapper arrow refreshes within one mutation batch', async () => {
    const wrapper = document.createElement('span');
    wrapper.className = 'math-inline';
    document.body.appendChild(wrapper);
    context.service.initialize();
    const refreshSpy = vi.spyOn(wrapper, 'querySelectorAll');

    const firstArrow = document.createElement('span');
    firstArrow.setAttribute('data-math', '\\rightarrow');
    const secondArrow = document.createElement('span');
    secondArrow.setAttribute('data-math', '→');
    wrapper.append(firstArrow, secondArrow);
    await Promise.resolve();

    expect(
      refreshSpy.mock.calls.filter(([selector]) => selector === '.gv-formula-copy-ignored'),
    ).toHaveLength(1);
    expect(firstArrow.classList.contains('gv-formula-copy-ignored')).toBe(true);
    expect(secondArrow.classList.contains('gv-formula-copy-ignored')).toBe(true);
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(true);
  });

  it('does not rescan a streaming root when a whole ignored response subtree is removed', async () => {
    const streamingRoot = document.createElement('main');
    const response = document.createElement('article');
    const wrapper = document.createElement('span');
    wrapper.className = 'math-inline';
    const arrow = document.createElement('span');
    arrow.setAttribute('data-math', '\\rightarrow');
    wrapper.appendChild(arrow);
    response.appendChild(wrapper);
    streamingRoot.appendChild(response);
    document.body.appendChild(streamingRoot);
    context.service.initialize();
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(true);
    const refreshSpy = vi.spyOn(streamingRoot, 'querySelectorAll');

    response.remove();
    await Promise.resolve();

    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('keeps explicitly delimited and non-inline Gemini arrows copyable', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;
    const explicitInline = document.createElement('span');
    explicitInline.className = 'math-inline';
    explicitInline.setAttribute('data-math', '$\\rightarrow$');
    const display = document.createElement('div');
    display.className = 'math-display';
    const displayArrow = document.createElement('span');
    displayArrow.setAttribute('data-math', '\\rightarrow');
    display.appendChild(displayArrow);
    document.body.append(explicitInline, display);

    context.service.initialize();
    expect(explicitInline.classList.contains('gv-formula-copy-ignored')).toBe(false);
    expect(displayArrow.classList.contains('gv-formula-copy-ignored')).toBe(false);

    explicitInline.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    displayArrow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(writeTextMock).toHaveBeenCalledTimes(2);
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('\\rightarrow');
    expect(writeTextMock).toHaveBeenNthCalledWith(2, '$$\\rightarrow$$');
  });

  it('clears ignored arrow state when Gemini reuses or removes the DOM', async () => {
    const wrapper = document.createElement('span');
    wrapper.className = 'math-inline';
    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', '\\rightarrow');
    wrapper.appendChild(mathElement);
    document.body.appendChild(wrapper);
    context.service.initialize();
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(true);

    mathElement.setAttribute('data-math', 'x^2');
    await Promise.resolve();
    expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(false);
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(false);

    mathElement.setAttribute('data-math', '\\rightarrow');
    await Promise.resolve();
    mathElement.removeAttribute('data-math');
    await Promise.resolve();
    expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(false);
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(false);

    mathElement.setAttribute('data-math', '\\rightarrow');
    await Promise.resolve();
    mathElement.remove();
    await Promise.resolve();
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(false);
  });

  it('uses the mouseover fallback when an inline wrapper later becomes display math', async () => {
    const wrapper = document.createElement('span');
    wrapper.className = 'math-inline';
    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', '\\rightarrow');
    wrapper.appendChild(mathElement);
    document.body.appendChild(wrapper);
    context.service.initialize();
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(true);

    wrapper.className = 'math-block';
    mathElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(false);
    expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(false);
  });

  it('does not let an arrow candidate hide a real formula in a shared inline wrapper', () => {
    const wrapper = document.createElement('span');
    wrapper.className = 'math-inline';
    const arrow = document.createElement('span');
    arrow.setAttribute('data-math', '\\rightarrow');
    const formula = document.createElement('span');
    formula.setAttribute('data-math', 'x^2');
    wrapper.append(arrow, formula);
    document.body.appendChild(wrapper);

    context.service.initialize();

    expect(arrow.classList.contains('gv-formula-copy-ignored')).toBe(true);
    expect(formula.classList.contains('gv-formula-copy-ignored')).toBe(false);
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(false);
  });

  it('ignores a shared inline wrapper after its last real formula is removed', async () => {
    const wrapper = document.createElement('span');
    wrapper.className = 'math-inline';
    const arrow = document.createElement('span');
    arrow.setAttribute('data-math', '\\rightarrow');
    const formula = document.createElement('span');
    formula.setAttribute('data-math', 'x^2');
    wrapper.append(arrow, formula);
    document.body.appendChild(wrapper);
    context.service.initialize();
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(false);

    formula.remove();
    await Promise.resolve();

    expect(arrow.classList.contains('gv-formula-copy-ignored')).toBe(true);
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(true);
  });

  it('stops observing while disabled and scans again when re-enabled', async () => {
    context.service.initialize();
    context.service.destroy();
    const wrapper = document.createElement('span');
    wrapper.className = 'math-inline';
    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', '\\rightarrow');
    wrapper.appendChild(mathElement);
    document.body.appendChild(wrapper);
    await Promise.resolve();
    expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(false);

    context.service.initialize();
    expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(true);
    expect(wrapper.classList.contains('gv-formula-copy-ignored')).toBe(true);
  });

  it('keeps a real formula containing an arrow copyable', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;
    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', 'A \\rightarrow B');
    mathElement.classList.add('math-inline');
    document.body.appendChild(mathElement);

    context.service.initialize();
    mathElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(false);
    mathElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$A \\rightarrow B$');
  });

  it('keeps a real formula containing an extensible arrow copyable', async () => {
    const clipboard = navigator.clipboard as unknown as { write?: unknown };
    clipboard.write = undefined;
    const mathElement = document.createElement('span');
    mathElement.setAttribute('data-math', 'A \\xrightarrow{\\text{process}} B');
    mathElement.classList.add('math-inline');
    document.body.appendChild(mathElement);

    context.service.initialize();
    mathElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(mathElement.classList.contains('gv-formula-copy-ignored')).toBe(false);
    mathElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('$A \\xrightarrow{\\text{process}} B$');
  });
});
