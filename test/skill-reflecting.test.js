// test/skill-reflecting.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('reflecting skill documents the model', () => {
  const md = readFileSync(new URL('../skills/reflecting/SKILL.md', import.meta.url), 'utf8');
  assert.match(md, /name:\s*reflecting/);
  assert.match(md, /attribut/i);
  assert.match(md, /confidence/i);
  assert.match(md, /suggestion-first/i);
  assert.match(md, /rejected/i);
});
