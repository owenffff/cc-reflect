// lib/config.js
import { readFileSync, writeFileSync } from 'node:fs';
import { paths, ensureState } from './paths.js';

const DEFAULTS = { auto: false, minConfidence: 'medium', exclude: [] };

export function readConfig() {
  ensureState();
  try { return { ...DEFAULTS, ...JSON.parse(readFileSync(paths.config(), 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}

export function writeConfig(cfg) {
  ensureState();
  writeFileSync(paths.config(), JSON.stringify(cfg, null, 2));
}

export function setAuto(on) {
  const cfg = readConfig();
  cfg.auto = !!on;
  writeConfig(cfg);
  return cfg;
}
