#!/usr/bin/env node
/**
 * Build script for Edge store submission.
 * Edge doesn't accept the 'key' field in manifest.json
 * This script builds the Chrome extension and removes incompatible fields.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist_chrome');
const manifestPath = path.join(distDir, 'manifest.json');

// Fields that Edge doesn't accept
const EDGE_INCOMPATIBLE_FIELDS = ['key'];

async function buildForEdge() {
  console.log('🔨 Building Chrome extension...');

  try {
    execSync('bun run build:chrome', {
      cwd: rootDir,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }

  console.log('\n🔧 Preparing for Edge submission...');

  // Read and parse manifest
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ manifest.json not found in dist_chrome/');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // Remove incompatible fields
  let removedFields = [];
  for (const field of EDGE_INCOMPATIBLE_FIELDS) {
    if (field in manifest) {
      delete manifest[field];
      removedFields.push(field);
    }
  }

  if (removedFields.length > 0) {
    console.log(`   Removed fields: ${removedFields.join(', ')}`);
  }

  // Write back the cleaned manifest
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log('✅ Edge build ready!');
  console.log(`   Output: ${distDir}/`);
  console.log('\n📦 You can now zip dist_chrome/ and submit to Edge Add-ons store.');
}

buildForEdge();
