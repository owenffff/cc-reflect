// lib/paths.js
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export function stateDir() {
  return process.env.CC_REFLECT_HOME || join(homedir(), '.claude', 'cc-reflect');
}

export function ensureState() {
  const dir = stateDir();
  mkdirSync(join(dir, 'pending'), { recursive: true });
  mkdirSync(join(dir, 'findings'), { recursive: true });
  return dir;
}

export const paths = {
  telemetry: () => join(stateDir(), 'telemetry.jsonl'),
  cursors: () => join(stateDir(), 'cursors.json'),
  rejected: () => join(stateDir(), 'rejected.json'),
  config: () => join(stateDir(), 'config.json'),
  targetsCache: () => join(stateDir(), 'targets.cache.json'),
  pendingDir: () => join(stateDir(), 'pending'),
  findingsDir: () => join(stateDir(), 'findings'),
};
