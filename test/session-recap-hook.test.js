// test/session-recap-hook.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(script, input, env) {
  return execFileSync('node', [script], { input: JSON.stringify(input), env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('session recap surfaces only when auto on, once per batch', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ccr-'));
  process.env.CC_REFLECT_HOME = home;
  const { enqueuePending } = await import('../lib/queue.js');
  const { setAuto } = await import('../lib/config.js');
  const hook = new URL('../bin/session-recap-hook.js', import.meta.url).pathname;

  enqueuePending({ session_id: 's1', transcript_path: '/t1', queued_at: 1 }); // ancient

  let out = run(hook, { source: 'startup' }, { CC_REFLECT_HOME: home }); // auto off
  assert.equal(out.trim(), '', 'silent when auto off');

  setAuto(true);
  out = run(hook, { source: 'startup' }, { CC_REFLECT_HOME: home });
  assert.match(out, /pending reflection/i);
  assert.match(out, /reflect:review/);

  out = run(hook, { source: 'startup' }, { CC_REFLECT_HOME: home });
  assert.equal(out.trim(), '', 'same batch not surfaced twice');
});
