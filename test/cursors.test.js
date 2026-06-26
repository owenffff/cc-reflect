// test/cursors.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('cursors default and update', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { readCursors, setGitCursor, setTelemetryLine } = await import('../lib/cursors.js');
  assert.equal(readCursors().telemetryLine, 0);
  setTelemetryLine(42);
  setGitCursor('/repo/a', 'abc123');
  const c = readCursors();
  assert.equal(c.telemetryLine, 42);
  assert.equal(c.git['/repo/a'], 'abc123');
});
