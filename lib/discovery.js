// lib/discovery.js
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';

export function detectRepo(startDir) {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function skillsUnder(root) {
  const out = [];
  const base = join(root, '.claude', 'skills');
  if (!existsSync(base)) return out;
  for (const name of readdirSync(base)) {
    const skillMd = join(base, name, 'SKILL.md');
    if (existsSync(skillMd)) {
      out.push({ id: `skill:${name}`, kind: 'skill', path: skillMd, repo_root: detectRepo(join(base, name)) });
    }
  }
  return out;
}

export function discoverSkills(projectDir, home = homedir()) {
  const roots = [projectDir, home].filter(Boolean);
  const all = roots.flatMap(skillsUnder);
  return all.filter(t => !t.path.includes(join('.claude', 'plugins', 'cache')));
}
