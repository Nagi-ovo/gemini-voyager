#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const API_ROOT = 'https://api.addons.microsoftedge.microsoft.com';
const POLL_DELAY_MS = Number(process.env.EDGE_POLL_DELAY_MS || 5000);
const POLL_LIMIT = Number(process.env.EDGE_POLL_LIMIT || 60);

function usage() {
  console.error(
    'Usage: EDGE_CLIENT_ID=... EDGE_API_KEY=... EDGE_PRODUCT_ID=... node scripts/publish-edge.js <zip> [--notes <text>]',
  );
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function parseArgs(argv) {
  const args = [...argv];
  const zipPath = args.shift();
  let notes = process.env.EDGE_PUBLISH_NOTES || 'Automated Voyager release submission.';

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--notes') {
      notes = args.shift();
      if (!notes) {
        throw new Error('--notes requires a value');
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!zipPath) {
    usage();
    process.exit(2);
  }

  return { zipPath, notes };
}

function headers(extra = {}) {
  return {
    Authorization: `ApiKey ${requireEnv('EDGE_API_KEY')}`,
    'X-ClientID': requireEnv('EDGE_CLIENT_ID'),
    ...extra,
  };
}

export function operationIdFrom(response) {
  const location = response.headers.get('location');
  if (!location) {
    throw new Error('Microsoft Edge API response did not include a Location operation ID header');
  }
  return location.trim().split('/').filter(Boolean).pop();
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function expectAccepted(response, label) {
  if (response.status !== 202) {
    const body = await readJson(response);
    throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return operationIdFrom(response);
}

async function pollOperation(url, label) {
  for (let attempt = 1; attempt <= POLL_LIMIT; attempt += 1) {
    const response = await fetch(url, { headers: headers() });
    const body = await readJson(response);

    if (!response.ok) {
      throw new Error(
        `${label} status check failed with HTTP ${response.status}: ${JSON.stringify(body)}`,
      );
    }

    console.log(`${label} status: ${body.status || 'Unknown'} (${attempt}/${POLL_LIMIT})`);

    if (body.status === 'Succeeded') {
      if (body.message) {
        console.log(body.message);
      }
      return body;
    }

    if (body.status === 'Failed') {
      throw new Error(`${label} failed: ${JSON.stringify(body)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }

  throw new Error(`${label} did not finish after ${POLL_LIMIT} checks`);
}

async function main() {
  const { zipPath, notes } = parseArgs(process.argv.slice(2));
  const productId = requireEnv('EDGE_PRODUCT_ID');
  const absoluteZipPath = path.resolve(zipPath);

  if (!fs.existsSync(absoluteZipPath)) {
    throw new Error(`Zip package not found: ${absoluteZipPath}`);
  }

  const uploadUrl = `${API_ROOT}/v1/products/${productId}/submissions/draft/package`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/zip' }),
    body: fs.readFileSync(absoluteZipPath),
  });
  const uploadOperationId = await expectAccepted(uploadResponse, 'Upload');
  console.log(`Upload operation: ${uploadOperationId}`);

  await pollOperation(`${uploadUrl}/operations/${uploadOperationId}`, 'Upload');

  const publishUrl = `${API_ROOT}/v1/products/${productId}/submissions`;
  const publishResponse = await fetch(publishUrl, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ notes }),
  });
  const publishOperationId = await expectAccepted(publishResponse, 'Publish');
  console.log(`Publish operation: ${publishOperationId}`);

  await pollOperation(`${publishUrl}/operations/${publishOperationId}`, 'Publish');
  console.log('Edge Add-ons submission created.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
