import { afterEach, describe, expect, it } from 'vitest';

import { type SentPromptChipsController, startSentPromptChips } from '../SentPromptChips';

const fable = {
  id: 'fable',
  name: '寓言写作',
  text: '# 寓言写作 Prompt\n\n围绕 {{concept}} 这个概念，写一则寓言来完整地解释它。\n要像真正的寓言那样间接讲，不要直接点破。',
};

const FABLE_LINES = [
  '# 寓言写作 Prompt',
  '',
  '围绕 hihi 这个概念，写一则寓言来完整地解释它。',
  '要像真正的寓言那样间接讲，不要直接点破。',
];

let controller: SentPromptChipsController | null = null;

/**
 * The shape a real Gemini turn has, read off gemini.google.com: a
 * `.query-text` block of `.query-text-line` paragraphs, the copy and expand
 * controls whose Material Symbols glyph *is* their text, and the show-more
 * container for a long turn.
 */
function mountTurn(lines: string[]): HTMLElement {
  const turn = document.createElement('span');
  turn.className = 'user-query-bubble-with-background';
  const wrap = document.createElement('div');
  wrap.className = 'query-text';
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'query-text-line';
    p.textContent = line;
    wrap.appendChild(p);
  }
  turn.appendChild(wrap);
  turn.insertAdjacentHTML(
    'beforeend',
    '<button aria-label="copy"><mat-icon>content_copy</mat-icon></button>' +
      '<div class="luminous-toggle-container">' +
      '<button data-test-id="luminous-expand-button"></button></div>',
  );
  document.body.appendChild(turn);
  return turn;
}

function start(prompts = [fable]): SentPromptChipsController {
  controller = startSentPromptChips({ prompts, scheme: () => 'light' });
  return controller;
}

const chipOf = (turn: HTMLElement) => turn.querySelector<HTMLElement>('.gv-pm-sent-chip');
const bodyOf = (turn: HTMLElement) => turn.querySelector<HTMLElement>('.gv-pm-sent-body');

afterEach(() => {
  controller?.destroy();
  controller = null;
  document.body.innerHTML = '';
});

describe('SentPromptChips', () => {
  it('recognises the prompt despite icon-font controls and starts collapsed', () => {
    const turn = mountTurn(FABLE_LINES);

    start();

    expect(chipOf(turn)?.textContent).toBe('寓言写作');
    expect(bodyOf(turn)?.hidden).toBe(true);
  });

  it('marks the chip as a prompt with an icon, before the name', () => {
    // A name on its own leaves the chip ambiguous in a conversation - it could
    // be anything the extension put there.
    const turn = mountTurn(FABLE_LINES);

    start();

    const chip = chipOf(turn)!;
    const icon = chip.querySelector('svg');
    expect(icon?.classList.contains('lucide-package')).toBe(true);
    expect(icon?.getAttribute('width')).toBe('14');
    // Before the name, and hidden from screen readers - the chip already has
    // an `aria-label`.
    expect(chip.firstElementChild).toBe(icon);
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it("hides Gemini's own copy of the text rather than removing it", () => {
    // The bubble is re-rendered on navigation, so nothing Gemini owns is safe
    // to delete or rewrite.
    const turn = mountTurn(FABLE_LINES);

    start();

    const lines = [...turn.querySelectorAll<HTMLElement>('.query-text-line')];
    expect(lines).toHaveLength(FABLE_LINES.length);
    expect(lines.every((line) => line.classList.contains('gv-pm-sent-line'))).toBe(true);
    expect(lines.map((line) => line.textContent)).toEqual(FABLE_LINES);
  });

  it('marks what was typed into the placeholder', () => {
    // Without it a filled template reads as one undifferentiated wall and the
    // reader cannot find their own answer inside it.
    const turn = mountTurn(FABLE_LINES);

    start();
    chipOf(turn)?.click();

    const values = [...turn.querySelectorAll('.gv-pm-sent-value')].map((el) => el.textContent);
    expect(values).toEqual(['hihi']);
  });

  it('renders the prompt as its own lines, in order', () => {
    const turn = mountTurn(FABLE_LINES);

    start();
    chipOf(turn)?.click();

    const rendered = [...(bodyOf(turn)?.querySelectorAll('p') ?? [])].map((p) => p.textContent);
    expect(rendered).toEqual(FABLE_LINES);
  });

  it('keeps what the person typed after the prompt visible in both states', () => {
    // Measured on gemini.google.com: the appended text lands on the prompt's
    // own last line, with no newline between them.
    const merged = [...FABLE_LINES.slice(0, -1), `${FABLE_LINES[FABLE_LINES.length - 1]}大大`];
    const turn = mountTurn(merged);

    start();
    const rest = turn.querySelector<HTMLElement>('.gv-pm-sent-rest');
    expect(rest?.textContent).toBe('大大');

    chipOf(turn)?.click();
    expect(rest?.isConnected).toBe(true);
    expect(rest?.textContent).toBe('大大');
    // The appended words must not also appear inside the quoted prompt.
    expect(bodyOf(turn)?.textContent).not.toContain('大大');
  });

  it('opens and closes on the chip', () => {
    const turn = mountTurn(FABLE_LINES);
    start();
    const chip = chipOf(turn);

    chip?.click();
    expect(bodyOf(turn)?.hidden).toBe(false);
    expect(chip?.getAttribute('aria-expanded')).toBe('true');

    chip?.click();
    expect(bodyOf(turn)?.hidden).toBe(true);
    expect(chip?.getAttribute('aria-expanded')).toBe('false');
  });

  it("hides Gemini's show-more control, which governs text already hidden", () => {
    const turn = mountTurn(FABLE_LINES);

    start();

    const toggle = turn.querySelector('.luminous-toggle-container');
    expect(toggle?.classList.contains('gv-pm-sent-toggle-hidden')).toBe(true);
  });

  it("never presses Gemini's expand button", () => {
    // Pressing it makes Gemini re-render the whole turn; stripping its clamp
    // makes Gemini put the clamp straight back. Both showed as a
    // grow-then-shrink flicker, so this feature does neither.
    const turn = mountTurn(FABLE_LINES);
    const button = turn.querySelector<HTMLButtonElement>('[data-test-id="luminous-expand-button"]');
    let pressed = 0;
    button?.addEventListener('click', () => pressed++);

    start();
    chipOf(turn)?.click();
    chipOf(turn)?.click();

    expect(pressed).toBe(0);
  });

  it('leaves an ordinary message untouched', () => {
    const turn = mountTurn(['帮我看看这段代码']);

    start();

    expect(chipOf(turn)).toBeNull();
    expect(turn.querySelector('.gv-pm-sent-line')).toBeNull();
  });

  it('releases a turn whose prompt was deleted', () => {
    const turn = mountTurn(FABLE_LINES);
    const instance = start();
    expect(chipOf(turn)).not.toBeNull();

    instance.setPrompts([]);

    expect(chipOf(turn)).toBeNull();
    expect(turn.querySelector('.gv-pm-sent-line')).toBeNull();
  });

  it('relabels a turn when its prompt is renamed', () => {
    const turn = mountTurn(FABLE_LINES);
    const instance = start();

    instance.setPrompts([{ ...fable, name: '新名字' }]);

    expect(turn.querySelectorAll('.gv-pm-sent-chip')).toHaveLength(1);
    expect(chipOf(turn)?.textContent).toBe('新名字');
  });

  it('leaves Gemini exactly as it found it on teardown', () => {
    const turn = mountTurn(FABLE_LINES);
    const before = turn.outerHTML;
    const instance = start();
    expect(turn.outerHTML).not.toBe(before);

    instance.destroy();
    controller = null;

    expect(turn.outerHTML).toBe(before);
  });
});

describe('SentPromptChips across a Gemini re-render', () => {
  it('stays open on a turn the reader opened, even after the nodes are replaced', () => {
    // Gemini replaces a turn's nodes for reasons this code does not control.
    // Re-collapsing the replacement undoes the reader's own click.
    const turn = mountTurn(FABLE_LINES);
    const instance = start();
    chipOf(turn)?.click();
    expect(bodyOf(turn)?.hidden).toBe(false);

    turn.remove();
    const replacement = mountTurn(FABLE_LINES);
    instance.refresh();

    expect(bodyOf(replacement)?.hidden).toBe(false);
  });

  it('collapses a replacement the reader had not opened', () => {
    const turn = mountTurn(FABLE_LINES);
    const instance = start();

    turn.remove();
    const replacement = mountTurn(FABLE_LINES);
    instance.refresh();

    expect(bodyOf(replacement)?.hidden).toBe(true);
  });

  it('mounts exactly one container per turn across repeated passes', () => {
    const turn = mountTurn(FABLE_LINES);
    const instance = start();

    instance.refresh();
    instance.refresh();

    expect(turn.querySelectorAll('.gv-pm-sent')).toHaveLength(1);
  });
});
