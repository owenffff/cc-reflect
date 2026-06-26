// test/queue.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('enqueue then age filter', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { enqueuePending, listPending, pendingOlderThan } = await import('../lib/queue.js');
  enqueuePending({ session_id: 's1', transcript_path: '/t.jsonl', queued_at: 1000 });
  assert.equal(listPending().length, 1);
  assert.equal(pendingOlderThan(1000 + 5 * 60000, 5 * 60000).length, 1);
  assert.equal(pendingOlderThan(1000 + 60000, 5 * 60000).length, 0);
});
