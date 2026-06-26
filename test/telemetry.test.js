// test/telemetry.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('append/read + recurring failures', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { appendTelemetry, readTelemetry, recurringFailures } = await import('../lib/telemetry.js');
  for (let i = 0; i < 3; i++) appendTelemetry({ ts: i, session_id: 's', tool: 'mcp__db__query', args_digest: 'x', output_size: 0, error: 'TimeoutError' });
  appendTelemetry({ ts: 9, session_id: 's', tool: 'mcp__db__query', args_digest: 'x', output_size: 10, error: null });
  assert.equal(readTelemetry(0).length, 4);
  assert.equal(readTelemetry(3).length, 1);
  const rec = recurringFailures(readTelemetry(0), { minCount: 3 });
  assert.equal(rec.length, 1);
  assert.equal(rec[0].failures, 3);
});
