// test/agent-applier.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('applier agent documents git + test-gate + self-protection', () => {
  const md = readFileSync(new URL('../agents/reflect-applier.md', import.meta.url), 'utf8');
  assert.match(md, /name:\s*reflect-applier/);
  assert.match(md, /git init/i);
  assert.match(md, /one commit per repo/i);
  assert.match(md, /test/i);
  assert.match(md, /roll ?back|revert|reset/i);
  assert.match(md, /unverified/i);
  assert.match(md, /cc-reflect/i); // self-protection mention
});
