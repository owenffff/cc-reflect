// lib/cursors.js
import { readFileSync, writeFileSync } from 'node:fs';
import { paths, ensureState } from './paths.js';

export function readCursors() {
  ensureState();
  try { return JSON.parse(readFileSync(paths.cursors(), 'utf8')); }
  catch { return { telemetryLine: 0, git: {}, transcript: {} }; }
}

export function writeCursors(c) {
  ensureState();
  writeFileSync(paths.cursors(), JSON.stringify(c, null, 2));
}

export function setGitCursor(repo, sha) {
  const c = readCursors();
  c.git[repo] = sha;
  writeCursors(c);
}

export function setTelemetryLine(n) {
  const c = readCursors();
  c.telemetryLine = n;
  writeCursors(c);
}
