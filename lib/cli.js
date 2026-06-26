#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readConfig, setAuto } from './config.js';
import { readCursors, setTelemetryLine } from './cursors.js';
import { readTelemetry, recurringFailures } from './telemetry.js';
import { discoverSkills, discoverLocalMcps } from './discovery.js';
import { bugfixCommitsSince } from './gitlog.js';
import { listPending } from './queue.js';

function loadJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

function mcpConfigs(projectDir) {
  const candidates = [join(projectDir, '.mcp.json'), join(homedir(), '.claude.json')];
  return candidates.filter(existsSync).map(p => ({ path: p, json: loadJson(p) })).filter(c => c.json);
}

function targets(projectDir) {
  return {
    skills: discoverSkills(projectDir, homedir()),
    mcps: discoverLocalMcps(mcpConfigs(projectDir)),
  };
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'targets') {
  process.stdout.write(JSON.stringify(targets(rest[0] || process.cwd()), null, 2));
} else if (cmd === 'signals') {
  const cur = readCursors();
  const recs = readTelemetry(cur.telemetryLine);
  const cfg = readConfig();
  const minCount = cfg.minConfidence === 'low' ? 2 : 3;
  const t = targets(rest[0] || process.cwd());
  const gitFixes = [...t.skills, ...t.mcps]
    .filter(x => x.repo_root)
    .map(x => ({ target_id: x.id, commits: bugfixCommitsSince(x.repo_root, cur.git[x.repo_root] || null) }))
    .filter(x => x.commits.length);
  process.stdout.write(JSON.stringify({ recurringFailures: recurringFailures(recs, { minCount }), gitFixes }, null, 2));
} else if (cmd === 'status') {
  const cfg = readConfig();
  process.stdout.write(`auto: ${cfg.auto ? 'on' : 'off'}\ntelemetryCursor: ${readCursors().telemetryLine}\npending: ${listPending().length}\n`);
} else if (cmd === 'on') {
  setAuto(true); process.stdout.write('auto: on\n');
} else if (cmd === 'off') {
  setAuto(false); process.stdout.write('auto: off\n');
} else if (cmd === 'advance') {
  const i = rest.indexOf('--telemetry');
  if (i >= 0) setTelemetryLine(Number(rest[i + 1]));
  process.stdout.write('ok\n');
} else {
  process.stderr.write(`unknown command: ${cmd}\n`); process.exit(1);
}
