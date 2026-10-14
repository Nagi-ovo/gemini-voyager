import type { Answer, DemoChat, HomeFeaturesContent, ReplyKind } from './types';

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function renderText(text: string): string {
  return text
    .split('\n\n')
    .map((block) => {
      const lines = block.split('\n');
      const bullets = lines.filter((l) => l.startsWith('- '));
      const prose = lines.filter((l) => !l.startsWith('- '));
      const p = prose.length ? `<p>${escapeHtml(prose.join(' '))}</p>` : '';
      const ul = bullets.length
        ? `<ul>${bullets.map((l) => `<li>${escapeHtml(l.slice(2))}</li>`).join('')}</ul>`
        : '';
      return p + ul;
    })
    .join('');
}

/** Renders a prewritten answer; all strings are escaped, so the result is safe for v-html. */
export function renderAnswer(answer: Answer): string {
  if (typeof answer === 'string') return renderText(answer);
  let html = answer.lead ? `<p>${escapeHtml(answer.lead)}</p>` : '';
  if (answer.text) html += renderText(answer.text);
  if (answer.list)
    html += `<ul>${answer.list.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
  if (answer.todo)
    html += `<ul class="todo">${answer.todo.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
  if (answer.table) {
    const [head, ...rows] = answer.table;
    html += `<table><thead><tr>${head.map((x) => `<th>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((x) => `<td>${escapeHtml(x)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  }
  return html;
}

export function promptReply(
  kind: ReplyKind,
  chat: DemoChat,
  leads: HomeFeaturesContent['replyLeads'],
): Answer {
  switch (kind) {
    case 'table':
      return { lead: leads.table, table: chat.extra.table };
    case 'summary':
      return { lead: leads.summary, list: chat.extra.summary };
    case 'todo':
      return { lead: leads.todo, todo: chat.extra.todo };
    case 'translate':
      return chat.extra.translation;
    case 'plain':
      return { lead: leads.plain, list: chat.extra.summary.slice(0, 2) };
  }
}

export { escapeHtml };
