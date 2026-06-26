// lib/queue.js
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { paths, ensureState } from './paths.js';

export function enqueuePending(marker) {
  ensureState();
  const file = join(paths.pendingDir(), `${marker.queued_at}-${marker.session_id || 'session'}.json`);
  writeFileSync(file, JSON.stringify(marker, null, 2));
  return file;
}

export function listPending() {
  ensureState();
  return readdirSync(paths.pendingDir())
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(paths.pendingDir(), f), 'utf8')));
}

export function pendingOlderThan(nowMs, ageMs) {
  return listPending().filter(m => nowMs - m.queued_at >= ageMs);
}
