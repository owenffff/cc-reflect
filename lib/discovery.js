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

function resolveServerPath(def) {
  const args = Array.isArray(def.args) ? def.args : [];
  for (const a of args) {
    if (typeof a === 'string' && (a.includes('/') || a.includes('\\')) && existsSync(a)) return a;
  }
  if (typeof def.command === 'string' && def.command.includes('/') && existsSync(def.command)) return def.command;
  return null;
}

export function discoverLocalMcps(configs) {
  const out = [];
  for (const { json } of configs) {
    const servers = (json && json.mcpServers) || {};
    for (const [name, def] of Object.entries(servers)) {
      const type = def.type || (def.command ? 'stdio' : (def.url ? 'http' : 'unknown'));
      if (type !== 'stdio' || !def.command) continue;
      const localPath = resolveServerPath(def);
      if (!localPath) continue;
      out.push({ id: `mcp:${name}`, kind: 'mcp', path: localPath, repo_root: detectRepo(dirname(localPath)) });
    }
  }
  return out;
}
