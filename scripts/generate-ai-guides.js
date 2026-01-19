import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const templatePath = resolve(rootDir, 'AI_GUIDE.template.md');
const outputFiles = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'];

const template = await readFile(templatePath, 'utf8');

const noticeLines = [
  '<!--',
  'This file is generated from AI_GUIDE.template.md.',
  'Do not edit directly; update the template and run `bun run generate:ai-guides`.',
  '-->',
  '',
];

const notice = noticeLines.join('\n');

for (const outputFile of outputFiles) {
  const replaced = template.replace(/\{\{GUIDE_FILE\}\}/g, outputFile);
  const firstNewline = replaced.indexOf('\n');

  const output =
    firstNewline === -1
      ? `${replaced}\n\n${notice}`
      : `${replaced.slice(0, firstNewline)}\n\n${notice}${replaced.slice(firstNewline + 1)}`;

  await writeFile(resolve(rootDir, outputFile), output, 'utf8');
}
