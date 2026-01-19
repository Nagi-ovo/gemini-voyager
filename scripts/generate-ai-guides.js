import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const templatePath = resolve(rootDir, 'AI_GUIDE.template.md');
const outputFiles = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'];

const template = await readFile(templatePath, 'utf8');
if (!template.includes('{{NOTICE}}')) {
  throw new Error('AI_GUIDE.template.md must include a {{NOTICE}} placeholder.');
}

const noticeLines = [
  '<!--',
  'This file is generated from AI_GUIDE.template.md.',
  'Do not edit directly; update the template and run `bun run generate:ai-guides`.',
  '-->',
];

const notice = noticeLines.join('\n');

await Promise.all(
  outputFiles.map((outputFile) => {
    const output = template
      .replace(/\{\{GUIDE_FILE\}\}/g, outputFile)
      .replace(/\{\{NOTICE\}\}/g, notice);

    return writeFile(resolve(rootDir, outputFile), output, 'utf8');
  }),
);
