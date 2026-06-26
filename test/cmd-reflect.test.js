// test/cmd-reflect.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('/reflect command wires cli + agents + approval', () => {
  const md = readFileSync(new URL('../commands/reflect.md', import.meta.url), 'utf8');
  assert.match(md, /cli\.js (signals|targets)/);
  assert.match(md, /reflect-analyzer/);
  assert.match(md, /reflect-applier/);
  assert.match(md, /approv/i);
  assert.match(md, /reject/i);
  assert.match(md, /advance --telemetry/);
});
