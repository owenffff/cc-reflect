// lib/surface.js
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir, ensureState } from './paths.js';
import { pendingOlderThan } from './queue.js';

const FIVE_MIN = 5 * 60 * 1000;

function logFile() { return join(stateDir(), 'surface-log.json'); }

export function readSurfaceLog() {
  try { return JSON.parse(readFileSync(logFile(), 'utf8')); }
  catch { return { surfaced: {}, lastSurfaceMs: 0 }; }
}

function writeSurfaceLog(log) {
  ensureState();
  writeFileSync(logFile(), JSON.stringify(log, null, 2));
}

export function batchKey(marker) {
  return `${marker.queued_at}-${marker.session_id}`;
}

// Pending batches old enough to surface AND not yet surfaced by any channel.
export function dueUnsurfaced(nowMs, ageMs = FIVE_MIN) {
  const log = readSurfaceLog();
  return pendingOlderThan(nowMs, ageMs).filter(m => !log.surfaced[batchKey(m)]);
}

export function markSurfaced(markers, nowMs) {
  const log = readSurfaceLog();
  for (const m of markers) log.surfaced[batchKey(m)] = nowMs;
  log.lastSurfaceMs = nowMs;
  writeSurfaceLog(log);
}

export function cooldownPassed(nowMs, cooldownMs) {
  return nowMs - readSurfaceLog().lastSurfaceMs >= cooldownMs;
}
