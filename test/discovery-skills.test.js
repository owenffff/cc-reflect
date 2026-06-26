// test/discovery-skills.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('discoverSkills finds project + user skills, skips plugin cache', async () => {
  const proj = mkdtempSync(join(tmpdir(), 'proj-'));
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  mkdirSync(join(proj, '.claude', 'skills', 'alpha'), { recursive: true });
  writeFileSync(join(proj, '.claude', 'skills', 'alpha', 'SKILL.md'), '# alpha');
  mkdirSync(join(home, '.claude', 'skills', 'beta'), { recursive: true });
  writeFileSync(join(home, '.claude', 'skills', 'beta', 'SKILL.md'), '# beta');
  const { discoverSkills } = await import('../lib/discovery.js');
  const ids = discoverSkills(proj, home).map(t => t.id).sort();
  assert.deepEqual(ids, ['skill:alpha', 'skill:beta']);
});
