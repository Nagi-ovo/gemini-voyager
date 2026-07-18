#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

const roots = process.argv.slice(2);

if (roots.length === 0) {
  console.error('Usage: node scripts/verify-release-privacy.mjs <artifact> [...]');
  process.exit(64);
}

const forbiddenNames = [
  /\.map$/i,
  /^\.env(?:\.|$)/i,
  /\.(?:cer|crt|p12|pfx|pem|key|mobileprovision|provisionprofile)$/i,
  /^\.DS_Store$/,
  /^\._/,
];

const forbiddenContent = [
  ['/Users/', 'local macOS path'],
  ['/private/var/folders/', 'local macOS temporary path'],
  ['/home/runner/work/', 'GitHub Actions workspace path'],
  ['-----BEGIN PRIVATE KEY-----', 'private key'],
  ['-----BEGIN RSA PRIVATE KEY-----', 'RSA private key'],
  ['-----BEGIN OPENSSH PRIVATE KEY-----', 'OpenSSH private key'],
  ['github_pat_', 'GitHub personal access token'],
  ['SPARKLE_PRIVATE_KEY=', 'Sparkle private key assignment'],
];

const forbiddenPatterns = [
  [/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{30,})\b/, 'GitHub token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, 'Slack token'],
  [/\bAKIA[A-Z0-9]{16}\b/, 'AWS access key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
];

const files = [];

async function collect(path) {
  const metadata = await stat(path);
  if (!metadata.isDirectory()) {
    files.push(path);
    return;
  }

  for (const entry of await readdir(path, { withFileTypes: true })) {
    await collect(join(path, entry.name));
  }
}

for (const root of roots) await collect(root);

const failures = [];
for (const file of files) {
  if (forbiddenNames.some((pattern) => pattern.test(basename(file)))) {
    failures.push(`${file}: forbidden release filename`);
    continue;
  }

  const content = await readFile(file);
  for (const [needle, label] of forbiddenContent) {
    if (content.includes(Buffer.from(needle))) failures.push(`${file}: contains ${label}`);
  }
  const text = content.toString('latin1');
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(text)) failures.push(`${file}: contains ${label}`);
  }
}

if (failures.length > 0) {
  console.error(`Release privacy check failed:\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(`Release privacy check passed (${files.length} files)`);
