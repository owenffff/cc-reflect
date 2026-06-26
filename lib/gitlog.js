// lib/gitlog.js
import { execFileSync } from 'node:child_process';

const FIX = /\b(fix|bug|patch|hotfix|regression|revert)\b/i;

export function bugfixCommitsSince(repoRoot, sinceSha) {
  const range = sinceSha ? `${sinceSha}..HEAD` : 'HEAD';
  let out;
  try {
    out = execFileSync('git', ['-C', repoRoot, 'log', '--pretty=%H%x1f%s', range], { encoding: 'utf8' });
  } catch { return []; }
  return out.split('\n').filter(Boolean).map(line => {
    const [sha, subject] = line.split('\x1f');
    return { sha, subject };
  }).filter(c => FIX.test(c.subject));
}

export function headSha(repoRoot) {
  try { return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return null; }
}
