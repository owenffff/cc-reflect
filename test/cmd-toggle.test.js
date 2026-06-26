import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('toggle commands call cli', () => {
  const base = '../commands/';
  assert.match(readFileSync(new URL(base + 'reflect-on.md', import.meta.url), 'utf8'), /cli\.js on/);
  assert.match(readFileSync(new URL(base + 'reflect-off.md', import.meta.url), 'utf8'), /cli\.js off/);
  assert.match(readFileSync(new URL(base + 'reflect-status.md', import.meta.url), 'utf8'), /cli\.js status/);
});
