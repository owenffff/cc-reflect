// test/surface.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('dueUnsurfaced dedups across channels; cooldown gates re-surface', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { enqueuePending } = await import('../lib/queue.js');
  const { dueUnsurfaced, markSurfaced, cooldownPassed } = await import('../lib/surface.js');

  enqueuePending({ session_id: 's1', transcript_path: '/t1', queued_at: 1 }); // ancient
  const now = 10 * 60 * 1000;

  const due = dueUnsurfaced(now);
  assert.equal(due.length, 1);

  markSurfaced(due, now);
  assert.equal(dueUnsurfaced(now).length, 0, 'surfaced batch is not due again');

  assert.equal(cooldownPassed(now, 30 * 60 * 1000), false, 'within cooldown');
  assert.equal(cooldownPassed(now + 31 * 60 * 1000, 30 * 60 * 1000), true, 'past cooldown');
});
