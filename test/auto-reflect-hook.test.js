import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(script, input, env) {
  execFileSync('node', [script], { input: JSON.stringify(input), env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('stop hook enqueues only when auto on and session had activity', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ccr-'));
  process.env.CC_REFLECT_HOME = home;
  const { setAuto } = await import('../lib/config.js');
  const { appendTelemetry } = await import('../lib/telemetry.js');
  const { listPending } = await import('../lib/queue.js');
  const hook = new URL('../bin/auto-reflect-hook.js', import.meta.url).pathname;

  run(hook, { session_id: 's', transcript_path: '/t.jsonl' }, { CC_REFLECT_HOME: home }); // auto off
  assert.equal(listPending().length, 0);

  setAuto(true);
  appendTelemetry({ ts: 1, session_id: 's', tool: 'mcp__db__query', args_digest: '', output_size: 0, error: null });
  run(hook, { session_id: 's', transcript_path: '/t.jsonl' }, { CC_REFLECT_HOME: home });
  assert.equal(listPending().length, 1);
});
