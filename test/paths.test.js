// test/paths.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('stateDir honors CC_REFLECT_HOME and ensureState makes dirs', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { stateDir, ensureState, paths } = await import('../lib/paths.js');
  assert.equal(stateDir(), process.env.CC_REFLECT_HOME);
  ensureState();
  assert.ok(existsSync(paths.pendingDir()));
  assert.ok(existsSync(paths.findingsDir()));
  assert.ok(paths.telemetry().endsWith('telemetry.jsonl'));
});
