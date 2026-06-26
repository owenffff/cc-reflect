// test/gitlog.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function git(cwd, ...args) { execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }); }

test('bugfixCommitsSince filters fix commits', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'repo-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 't@t.t');
  git(repo, 'config', 'user.name', 't');
  writeFileSync(join(repo, 'a.txt'), '1');
  git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'feat: initial');
  writeFileSync(join(repo, 'a.txt'), '2');
  git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'fix: handle timeout');
  const { bugfixCommitsSince } = await import('../lib/gitlog.js');
  const fixes = bugfixCommitsSince(repo, null);
  assert.equal(fixes.length, 1);
  assert.match(fixes[0].subject, /timeout/);
});
