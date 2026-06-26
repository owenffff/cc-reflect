import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function cli(env, ...args) {
  const script = new URL('../lib/cli.js', import.meta.url).pathname;
  return execFileSync('node', [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('cli targets + on/off', () => {
  const home = mkdtempSync(join(tmpdir(), 'ccr-'));
  const proj = mkdtempSync(join(tmpdir(), 'proj-'));
  mkdirSync(join(proj, '.claude', 'skills', 'alpha'), { recursive: true });
  writeFileSync(join(proj, '.claude', 'skills', 'alpha', 'SKILL.md'), '# alpha');
  const env = { CC_REFLECT_HOME: home, HOME: home };
  const targets = JSON.parse(cli(env, 'targets', proj));
  assert.ok(targets.skills.some(s => s.id === 'skill:alpha'));
  cli(env, 'on');
  assert.match(cli(env, 'status'), /auto:\s*on/i);
  cli(env, 'off');
  assert.match(cli(env, 'status'), /auto:\s*off/i);
});
