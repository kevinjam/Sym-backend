#!/usr/bin/env node
'use strict';

/**
 * Downloads Apple Root CA certificates into certs/apple (or APPLE_ROOT_CERTS_DIR).
 * Required for App Store Server API / notification verification — separate from the .p8 IAP key.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

require('dotenv').config();

const BACKEND_ROOT = path.resolve(__dirname, '..');

function rootCertsDir() {
  const configured = String(process.env.APPLE_ROOT_CERTS_DIR || '').trim();
  if (!configured) return path.join(BACKEND_ROOT, 'certs', 'apple');
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(BACKEND_ROOT, configured);
}

const SOURCES = [
  {
    name: 'AppleRootCA-G3.cer',
    url: 'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer',
  },
  {
    name: 'AppleRootCA-G2.cer',
    url: 'https://www.apple.com/certificateauthority/AppleRootCA-G2.cer',
  },
  {
    name: 'AppleComputerRootCertificate.cer',
    url: 'https://www.apple.com/certificateauthority/AppleComputerRootCertificate.cer',
  },
];

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function main() {
  const dir = rootCertsDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const { name, url } of SOURCES) {
    const dest = path.join(dir, name);
    process.stdout.write(`Fetching ${name}… `);
    const buf = await download(url);
    fs.writeFileSync(dest, buf);
    console.log(`ok (${buf.length} bytes) → ${dest}`);
  }
  console.log(`\nDone. Ensure your .p8 key is also in this folder (or set APPLE_IAP_PRIVATE_KEY_PATH).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
