import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('review consumes pending; check triages backlog', () => {
  const review = readFileSync(new URL('../commands/reflect-review.md', import.meta.url), 'utf8');
  assert.match(review, /pending/i);
  assert.match(review, /transcript_path/);
  assert.match(review, /reflect-analyzer/);
  assert.match(review, /delete|remove|consume/i);
  const check = readFileSync(new URL('../commands/reflect-check.md', import.meta.url), 'utf8');
  assert.match(check, /backlog|findings\//i);
  assert.match(check, /promote|triage/i);
});
