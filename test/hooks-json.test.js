// test/hooks-json.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('hooks.json registers all three hooks via plugin root', () => {
  const h = JSON.parse(readFileSync(new URL('../hooks/hooks.json', import.meta.url)));
  assert.ok(h.hooks.PostToolUse);
  assert.ok(h.hooks.Stop);
  assert.ok(h.hooks.UserPromptSubmit);
  const all = JSON.stringify(h);
  assert.match(all, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/telemetry-hook\.js/);
  assert.match(all, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/auto-reflect-hook\.js/);
  assert.match(all, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/surface-pending-hook\.js/);
});
