// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('config defaults then setAuto persists', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { readConfig, setAuto } = await import('../lib/config.js');
  assert.equal(readConfig().auto, false);
  assert.equal(readConfig().minConfidence, 'medium');
  setAuto(true);
  assert.equal(readConfig().auto, true);
});
