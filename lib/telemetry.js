// lib/telemetry.js
import { appendFileSync, readFileSync } from 'node:fs';
import { paths, ensureState } from './paths.js';

export function appendTelemetry(record) {
  ensureState();
  appendFileSync(paths.telemetry(), JSON.stringify(record) + '\n');
}

export function readTelemetry(fromLine = 0) {
  let text;
  try { text = readFileSync(paths.telemetry(), 'utf8'); } catch { return []; }
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(fromLine).map(l => JSON.parse(l));
}

export function recurringFailures(records, { minCount = 3 } = {}) {
  const byTool = {};
  for (const r of records) {
    if (!r.tool) continue;
    byTool[r.tool] ??= { tool: r.tool, total: 0, failures: 0, errors: [] };
    byTool[r.tool].total++;
    if (r.error) { byTool[r.tool].failures++; byTool[r.tool].errors.push(r.error); }
  }
  return Object.values(byTool).filter(t => t.failures >= minCount);
}
