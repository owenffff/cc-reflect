// test/surface-pending-hook.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(script, input, env) {
  return execFileSync('node', [script], { input: JSON.stringify(input), env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('surface hook notifies only for pending older than 5 min', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ccr-'));
  process.env.CC_REFLECT_HOME = home;
  const { enqueuePending } = await import('../lib/queue.js');
  const hook = new URL('../bin/surface-pending-hook.js', import.meta.url).pathname;

  let out = run(hook, { prompt: 'hi' }, { CC_REFLECT_HOME: home });
  assert.equal(out.trim(), '');

  enqueuePending({ session_id: 's', transcript_path: '/t', queued_at: 1 }); // ancient
  out = run(hook, { prompt: 'hi' }, { CC_REFLECT_HOME: home });
  assert.match(out, /pending reflection/i);
  assert.match(out, /\/reflect:review/);
});
