import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runHook(script, input, env) {
  return execFileSync('node', [script], { input: JSON.stringify(input), env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('telemetry hook records mcp call, ignores other tools', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ccr-'));
  const hook = new URL('../bin/telemetry-hook.js', import.meta.url).pathname;
  runHook(hook, { session_id: 's', tool_name: 'mcp__db__query', tool_input: { q: 1 }, tool_response: { error: 'boom' } }, { CC_REFLECT_HOME: home });
  runHook(hook, { session_id: 's', tool_name: 'Read', tool_input: {}, tool_response: 'ok' }, { CC_REFLECT_HOME: home });
  process.env.CC_REFLECT_HOME = home;
  const { readTelemetry } = await import('../lib/telemetry.js');
  const recs = readTelemetry(0);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].tool, 'mcp__db__query');
  assert.equal(recs[0].error, 'boom');
});
