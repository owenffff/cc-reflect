import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('plugin manifest has name and version', () => {
  const m = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url)));
  assert.equal(m.name, 'cc-reflect');
  assert.ok(m.version);
});
test('package.json is ESM with test script', () => {
  const p = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(p.type, 'module');
  assert.equal(p.scripts.test, 'node --test');
});
