#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const localeDirectory = 'src/locales';
const locales = readdirSync(localeDirectory).sort();
const keysByLocale = new Map();

for (const locale of locales) {
  const messagesPath = join(localeDirectory, locale, 'messages.json');
  if (!existsSync(messagesPath)) continue;
  keysByLocale.set(locale, new Set(Object.keys(JSON.parse(readFileSync(messagesPath, 'utf8')))));
}

const referenceKeys = keysByLocale.get('en');
if (!referenceKeys) {
  console.error('ERROR: en locale not found');
  process.exit(1);
}

let failed = false;
for (const [locale, keys] of keysByLocale) {
  if (locale === 'en') continue;

  const missing = [...referenceKeys].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !referenceKeys.has(key));
  if (missing.length === 0 && extra.length === 0) continue;

  failed = true;
  console.error(`${locale}: missing=${missing.length} extra=${extra.length}`);
  for (const key of missing.slice(0, 5)) console.error(`  - ${key}`);
  for (const key of extra.slice(0, 5)) console.error(`  + ${key}`);
}

if (failed) {
  console.error('\nFAILED: locale keys are inconsistent');
  process.exit(1);
}

console.log(`OK: all ${keysByLocale.size} locales are consistent (${referenceKeys.size} keys)`);
