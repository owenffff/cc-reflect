// lib/rejected.js
import { readFileSync, writeFileSync } from 'node:fs';
import { paths, ensureState } from './paths.js';
import { fingerprint } from './fingerprint.js';

function load() {
  try { return JSON.parse(readFileSync(paths.rejected(), 'utf8')); }
  catch { return { fingerprints: [] }; }
}

export function isRejected(finding) {
  return load().fingerprints.includes(fingerprint(finding));
}

export function reject(finding) {
  ensureState();
  const d = load();
  const fp = fingerprint(finding);
  if (!d.fingerprints.includes(fp)) {
    d.fingerprints.push(fp);
    writeFileSync(paths.rejected(), JSON.stringify(d, null, 2));
  }
}
