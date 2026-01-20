import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const templatePath = resolve(rootDir, 'AI_GUIDE.template.md');
const packageJsonPath = resolve(rootDir, 'package.json');
const outputFiles = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'];

const main = async () => {
  const template = await readFile(templatePath, 'utf8');
  const requiredPlaceholders = ['{{NOTICE}}', '{{GUIDE_FILE}}', '{{VERSION}}', '{{DATE}}'];
  for (const placeholder of requiredPlaceholders) {
    if (!template.includes(placeholder)) {
      throw new Error(`AI_GUIDE.template.md must include a ${placeholder} placeholder.`);
    }
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const version = packageJson.version || '0.0.0';
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

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
        .replace(/\{\{NOTICE\}\}/g, notice)
        .replace(/\{\{VERSION\}\}/g, version)
        .replace(/\{\{DATE\}\}/g, date);

      return writeFile(resolve(rootDir, outputFile), output, 'utf8');
    }),
  );
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
