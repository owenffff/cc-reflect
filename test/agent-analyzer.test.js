import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('analyzer agent documents finding schema + guards', () => {
  const md = readFileSync(new URL('../agents/reflect-analyzer.md', import.meta.url), 'utf8');
  assert.match(md, /^---[\s\S]*name:\s*reflect-analyzer[\s\S]*---/);
  for (const f of ['target_id', 'type', 'evidence', 'proposed_change', 'confidence']) assert.ok(md.includes(f), `missing ${f}`);
  assert.match(md, /reject/i);
  assert.match(md, /current (state|content)/i);
  assert.match(md, /high|medium|low/);
});
