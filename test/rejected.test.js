// test/rejected.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('reject then isRejected returns true for same finding', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { isRejected, reject } = await import('../lib/rejected.js');
  const f = { target_id: 'skill:x', type: 'correction', proposed_change: 'add rule Y' };
  assert.equal(isRejected(f), false);
  reject(f);
  assert.equal(isRejected(f), true);
  assert.equal(isRejected({ ...f, proposed_change: 'different' }), false);
});
