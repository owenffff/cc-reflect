# cc-reflect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `cc-reflect` Claude Code plugin — a self-improving closed loop over self-maintained skills and local MCPs.

**Architecture:** A deterministic Node.js core (state, discovery, telemetry, git mining) drives capture and bookkeeping; Claude-side commands + agents do the LLM analysis, proposal, and apply. Hooks handle plumbing only (telemetry capture, enqueue reflection candidates, idle notification) — they never invoke the LLM. Learnings land in the target files (SKILL.md / MCP code) and are version-controlled in each target's own repo; cc-reflect's state dir holds only pipeline bookkeeping.

**Tech Stack:** Node.js ESM (no runtime deps), `node:test` + `node:assert` for tests, Claude Code plugin format (commands/agents/hooks as markdown + JS).

## Global Constraints

- **Suggestion-first, always** — automatic mode only generates + notifies; nothing lands without explicit human approval.
- **Learnings live in target files**, not in cc-reflect state. State dir holds only pipeline bookkeeping.
- **Node ESM, zero runtime dependencies** — use only Node built-ins (`node:fs`, `node:path`, `node:os`, `node:crypto`, `node:child_process`).
- **State dir** resolves to `process.env.CC_REFLECT_HOME || ~/.claude/cc-reflect` — the env override is mandatory so every test runs against a temp dir.
- **Lib modules are pure** — no `Date.now()` inside `lib/`; callers (hooks/CLI) pass `nowMs`. Hook `bin/` scripts may use `Date.now()`.
- **Telemetry ledger is focused** — record only `mcp__*` tool calls and `Skill` calls; ignore everything else.
- **Two spec refinements (intentional):** (1) Stop hook *enqueues a candidate*; LLM analysis runs at `/reflect:review`. (2) Machine config is `config.json`, not `config.md`.
- **Test command:** `npm test` (= `node --test`). Each task's tests must pass before commit.

---

## File Structure

```
cc-reflect/
├── .claude-plugin/plugin.json       # plugin manifest
├── marketplace.json                 # single-plugin marketplace
├── package.json                     # type:module, test script
├── lib/
│   ├── paths.js                     # state dir + path resolution, ensureState()
│   ├── config.js                    # toggle/min-confidence (config.json)
│   ├── cursors.js                   # per-source cursors
│   ├── fingerprint.js               # finding fingerprint
│   ├── rejected.js                  # rejected-set dedup
│   ├── queue.js                     # pending batches + findings backlog
│   ├── discovery.js                 # skill + local-MCP target discovery
│   ├── telemetry.js                 # ledger append/read + recurring-failure summary
│   ├── gitlog.js                    # bug-fix commit extraction per repo
│   └── cli.js                       # subcommands invoked by markdown commands
├── bin/
│   ├── telemetry-hook.js            # PostToolUse entry
│   ├── auto-reflect-hook.js         # Stop entry (toggle-gated enqueue)
│   └── surface-pending-hook.js      # UserPromptSubmit entry (≥5min notify)
├── hooks/hooks.json                 # hook registration
├── commands/
│   ├── reflect.md                   # /reflect (full flow, current session)
│   ├── reflect-review.md            # /reflect:review (pending queue)
│   ├── reflect-check.md             # /reflect:check (low-confidence backlog)
│   ├── reflect-on.md / reflect-off.md / reflect-status.md
├── agents/
│   ├── reflect-analyzer.md          # signals → findings
│   └── reflect-applier.md           # findings → edits + git + test verify
├── skills/reflecting/SKILL.md       # reflect philosophy reference
└── test/                            # *.test.js
```

---

## Task 1: Plugin scaffold + test harness

**Files:**
- Create: `package.json`, `.claude-plugin/plugin.json`, `marketplace.json`
- Test: `test/scaffold.test.js`

**Interfaces:**
- Produces: `npm test` runs `node --test`; valid plugin manifest at `.claude-plugin/plugin.json`.

- [ ] **Step 1: Write the failing test**

```js
// test/scaffold.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Create the files**

```json
// package.json
{
  "name": "cc-reflect",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

```json
// .claude-plugin/plugin.json
{
  "name": "cc-reflect",
  "version": "0.1.0",
  "description": "Self-improving layer for self-maintained skills and local MCPs",
  "author": "jingyuan.liang"
}
```

```json
// marketplace.json
{
  "name": "cc-reflect",
  "owner": "jingyuan.liang",
  "plugins": [
    { "name": "cc-reflect", "source": "./", "description": "Self-improving layer for self-maintained skills and local MCPs" }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add package.json .claude-plugin/plugin.json marketplace.json test/scaffold.test.js
git commit -m "feat: scaffold cc-reflect plugin + test harness"
```

---

## Task 2: State paths (`lib/paths.js`)

**Files:**
- Create: `lib/paths.js`
- Test: `test/paths.test.js`

**Interfaces:**
- Produces: `stateDir()`, `ensureState()`, `paths.{telemetry,cursors,rejected,config,targetsCache,pendingDir,findingsDir}()` — all returning absolute path strings.

- [ ] **Step 1: Write the failing test**

```js
// test/paths.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('stateDir honors CC_REFLECT_HOME and ensureState makes dirs', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { stateDir, ensureState, paths } = await import('../lib/paths.js');
  assert.equal(stateDir(), process.env.CC_REFLECT_HOME);
  ensureState();
  assert.ok(existsSync(paths.pendingDir()));
  assert.ok(existsSync(paths.findingsDir()));
  assert.ok(paths.telemetry().endsWith('telemetry.jsonl'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/paths.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/paths.js
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export function stateDir() {
  return process.env.CC_REFLECT_HOME || join(homedir(), '.claude', 'cc-reflect');
}

export function ensureState() {
  const dir = stateDir();
  mkdirSync(join(dir, 'pending'), { recursive: true });
  mkdirSync(join(dir, 'findings'), { recursive: true });
  return dir;
}

export const paths = {
  telemetry: () => join(stateDir(), 'telemetry.jsonl'),
  cursors: () => join(stateDir(), 'cursors.json'),
  rejected: () => join(stateDir(), 'rejected.json'),
  config: () => join(stateDir(), 'config.json'),
  targetsCache: () => join(stateDir(), 'targets.cache.json'),
  pendingDir: () => join(stateDir(), 'pending'),
  findingsDir: () => join(stateDir(), 'findings'),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/paths.js test/paths.test.js
git commit -m "feat: state path resolution with CC_REFLECT_HOME override"
```

---

## Task 3: Config toggle (`lib/config.js`)

**Files:**
- Create: `lib/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: `paths`, `ensureState` from `lib/paths.js`.
- Produces: `readConfig() -> {auto:boolean, minConfidence:'low'|'medium'|'high', exclude:string[]}`, `writeConfig(cfg)`, `setAuto(on:boolean) -> cfg`.

- [ ] **Step 1: Write the failing test**

```js
// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('config defaults then setAuto persists', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { readConfig, setAuto } = await import('../lib/config.js');
  assert.equal(readConfig().auto, false);
  assert.equal(readConfig().minConfidence, 'medium');
  setAuto(true);
  assert.equal(readConfig().auto, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/config.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/config.js
import { readFileSync, writeFileSync } from 'node:fs';
import { paths, ensureState } from './paths.js';

const DEFAULTS = { auto: false, minConfidence: 'medium', exclude: [] };

export function readConfig() {
  ensureState();
  try { return { ...DEFAULTS, ...JSON.parse(readFileSync(paths.config(), 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}

export function writeConfig(cfg) {
  ensureState();
  writeFileSync(paths.config(), JSON.stringify(cfg, null, 2));
}

export function setAuto(on) {
  const cfg = readConfig();
  cfg.auto = !!on;
  writeConfig(cfg);
  return cfg;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config.js test/config.test.js
git commit -m "feat: config toggle (auto/min-confidence/exclude)"
```

---

## Task 4: Cursors (`lib/cursors.js`)

**Files:**
- Create: `lib/cursors.js`
- Test: `test/cursors.test.js`

**Interfaces:**
- Consumes: `paths`, `ensureState`.
- Produces: `readCursors() -> {telemetryLine:number, git:Record<string,string>, transcript:Record<string,number>}`, `writeCursors(c)`, `setGitCursor(repo, sha)`, `setTelemetryLine(n)`.

- [ ] **Step 1: Write the failing test**

```js
// test/cursors.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('cursors default and update', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { readCursors, setGitCursor, setTelemetryLine } = await import('../lib/cursors.js');
  assert.equal(readCursors().telemetryLine, 0);
  setTelemetryLine(42);
  setGitCursor('/repo/a', 'abc123');
  const c = readCursors();
  assert.equal(c.telemetryLine, 42);
  assert.equal(c.git['/repo/a'], 'abc123');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/cursors.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/cursors.js
import { readFileSync, writeFileSync } from 'node:fs';
import { paths, ensureState } from './paths.js';

export function readCursors() {
  ensureState();
  try { return JSON.parse(readFileSync(paths.cursors(), 'utf8')); }
  catch { return { telemetryLine: 0, git: {}, transcript: {} }; }
}

export function writeCursors(c) {
  ensureState();
  writeFileSync(paths.cursors(), JSON.stringify(c, null, 2));
}

export function setGitCursor(repo, sha) {
  const c = readCursors();
  c.git[repo] = sha;
  writeCursors(c);
}

export function setTelemetryLine(n) {
  const c = readCursors();
  c.telemetryLine = n;
  writeCursors(c);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cursors.js test/cursors.test.js
git commit -m "feat: per-source cursors"
```

---

## Task 5: Finding fingerprint + rejected-set (`lib/fingerprint.js`, `lib/rejected.js`)

**Files:**
- Create: `lib/fingerprint.js`, `lib/rejected.js`
- Test: `test/rejected.test.js`

**Interfaces:**
- Consumes: `paths`, `ensureState`.
- Produces: `fingerprint(finding) -> string` (16-hex; over `target_id` + `type` + `proposed_change`); `isRejected(finding) -> boolean`; `reject(finding)`.

- [ ] **Step 1: Write the failing test**

```js
// test/rejected.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('reject then isRejected returns true for same finding', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { isRejected, reject } = await import('../lib/rejected.js');
  const f = { target_id: 'skill:x', type: 'correction', proposed_change: 'add rule Y' };
  assert.equal(isRejected(f), false);
  reject(f);
  assert.equal(isRejected(f), true);
  assert.equal(isRejected({ ...f, proposed_change: 'different' }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/fingerprint.js
import { createHash } from 'node:crypto';

export function fingerprint(finding) {
  const key = [finding.target_id, finding.type, finding.proposed_change].join(' ');
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}
```

```js
// lib/rejected.js
import { readFileSync, writeFileSync } from 'node:fs';
import { paths, ensureState } from './paths.js';
import { fingerprint } from './fingerprint.js';

function load() {
  try { return JSON.parse(readFileSync(paths.rejected(), 'utf8')); }
  catch { return { fingerprints: [] }; }
}

export function isRejected(finding) {
  return load().fingerprints.includes(fingerprint(finding));
}

export function reject(finding) {
  ensureState();
  const d = load();
  const fp = fingerprint(finding);
  if (!d.fingerprints.includes(fp)) {
    d.fingerprints.push(fp);
    writeFileSync(paths.rejected(), JSON.stringify(d, null, 2));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fingerprint.js lib/rejected.js test/rejected.test.js
git commit -m "feat: finding fingerprint + rejected-set dedup"
```

---

## Task 6: Pending queue + findings backlog (`lib/queue.js`)

**Files:**
- Create: `lib/queue.js`
- Test: `test/queue.test.js`

**Interfaces:**
- Consumes: `paths`, `ensureState`.
- Produces: `enqueuePending(marker) -> filepath` where `marker = {session_id, transcript_path, queued_at:number}`; `listPending() -> marker[]`; `pendingOlderThan(nowMs, ageMs) -> marker[]`.

- [ ] **Step 1: Write the failing test**

```js
// test/queue.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('enqueue then age filter', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { enqueuePending, listPending, pendingOlderThan } = await import('../lib/queue.js');
  enqueuePending({ session_id: 's1', transcript_path: '/t.jsonl', queued_at: 1000 });
  assert.equal(listPending().length, 1);
  assert.equal(pendingOlderThan(1000 + 5 * 60000, 5 * 60000).length, 1);
  assert.equal(pendingOlderThan(1000 + 60000, 5 * 60000).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/queue.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/queue.js
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { paths, ensureState } from './paths.js';

export function enqueuePending(marker) {
  ensureState();
  const file = join(paths.pendingDir(), `${marker.queued_at}-${marker.session_id || 'session'}.json`);
  writeFileSync(file, JSON.stringify(marker, null, 2));
  return file;
}

export function listPending() {
  ensureState();
  return readdirSync(paths.pendingDir())
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(paths.pendingDir(), f), 'utf8')));
}

export function pendingOlderThan(nowMs, ageMs) {
  return listPending().filter(m => nowMs - m.queued_at >= ageMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/queue.js test/queue.test.js
git commit -m "feat: pending reflection queue"
```

---

## Task 7: Repo detection + skill discovery (`lib/discovery.js`)

**Files:**
- Create: `lib/discovery.js`
- Test: `test/discovery-skills.test.js`

**Interfaces:**
- Produces: `detectRepo(startDir) -> string|null` (walks up for `.git`); `discoverSkills(projectDir, home) -> target[]` where `target = {id, kind:'skill', path, repo_root}`. Excludes any path containing `.claude/plugins/cache`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/discovery.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/discovery.js test/discovery-skills.test.js
git commit -m "feat: skill discovery + repo detection"
```

---

## Task 8: Local MCP discovery (`lib/discovery.js`)

**Files:**
- Modify: `lib/discovery.js`
- Test: `test/discovery-mcp.test.js`

**Interfaces:**
- Consumes: `detectRepo`.
- Produces: `discoverLocalMcps(configs) -> target[]` where `configs = {path, json}[]` and `json.mcpServers = {name: {command?, args?, type?, url?}}`. Keeps only stdio servers with a `command` that resolve to a local file; skips `type: http|sse` or `url`-based servers. `target = {id:'mcp:<name>', kind:'mcp', path:<localServerFile>, repo_root}`.

- [ ] **Step 1: Write the failing test**

```js
// test/discovery-mcp.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('discoverLocalMcps keeps local stdio, skips remote', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-'));
  const server = join(dir, 'server.js');
  writeFileSync(server, '// server');
  const configs = [{ path: '.mcp.json', json: { mcpServers: {
    local: { command: 'node', args: [server] },
    remote: { type: 'http', url: 'https://example.com/mcp' },
  } } }];
  const { discoverLocalMcps } = await import('../lib/discovery.js');
  const got = discoverLocalMcps(configs);
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 'mcp:local');
  assert.equal(got[0].path, server);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `discoverLocalMcps` not exported.

- [ ] **Step 3: Add implementation to `lib/discovery.js`**

```js
// append to lib/discovery.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/discovery.js test/discovery-mcp.test.js
git commit -m "feat: local MCP discovery (stdio local only)"
```

---

## Task 9: Telemetry ledger + recurring-failure summary (`lib/telemetry.js`)

**Files:**
- Create: `lib/telemetry.js`
- Test: `test/telemetry.test.js`

**Interfaces:**
- Consumes: `paths`, `ensureState`.
- Produces: `appendTelemetry(record)`; `readTelemetry(fromLine=0) -> record[]`; `recurringFailures(records, {minCount=3}) -> {tool,total,failures,errors}[]`. A telemetry `record = {ts, session_id, tool, args_digest, output_size, error}` (`error` is a string or `null`).

- [ ] **Step 1: Write the failing test**

```js
// test/telemetry.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('append/read + recurring failures', async () => {
  process.env.CC_REFLECT_HOME = mkdtempSync(join(tmpdir(), 'ccr-'));
  const { appendTelemetry, readTelemetry, recurringFailures } = await import('../lib/telemetry.js');
  for (let i = 0; i < 3; i++) appendTelemetry({ ts: i, session_id: 's', tool: 'mcp__db__query', args_digest: 'x', output_size: 0, error: 'TimeoutError' });
  appendTelemetry({ ts: 9, session_id: 's', tool: 'mcp__db__query', args_digest: 'x', output_size: 10, error: null });
  assert.equal(readTelemetry(0).length, 4);
  assert.equal(readTelemetry(3).length, 1);
  const rec = recurringFailures(readTelemetry(0), { minCount: 3 });
  assert.equal(rec.length, 1);
  assert.equal(rec[0].failures, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/telemetry.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/telemetry.js
import { appendFileSync, readFileSync } from 'node:fs';
import { paths, ensureState } from './paths.js';

export function appendTelemetry(record) {
  ensureState();
  appendFileSync(paths.telemetry(), JSON.stringify(record) + '\n');
}

export function readTelemetry(fromLine = 0) {
  let text;
  try { text = readFileSync(paths.telemetry(), 'utf8'); } catch { return []; }
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(fromLine).map(l => JSON.parse(l));
}

export function recurringFailures(records, { minCount = 3 } = {}) {
  const byTool = {};
  for (const r of records) {
    if (!r.tool) continue;
    byTool[r.tool] ??= { tool: r.tool, total: 0, failures: 0, errors: [] };
    byTool[r.tool].total++;
    if (r.error) { byTool[r.tool].failures++; byTool[r.tool].errors.push(r.error); }
  }
  return Object.values(byTool).filter(t => t.failures >= minCount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/telemetry.js test/telemetry.test.js
git commit -m "feat: telemetry ledger + recurring-failure summary"
```

---

## Task 10: Git bug-fix mining (`lib/gitlog.js`)

**Files:**
- Create: `lib/gitlog.js`
- Test: `test/gitlog.test.js`

**Interfaces:**
- Produces: `bugfixCommitsSince(repoRoot, sinceSha|null) -> {sha, subject}[]` (subjects matching `/\b(fix|bug|patch|hotfix|regression|revert)\b/i`); `headSha(repoRoot) -> string|null`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/gitlog.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gitlog.js test/gitlog.test.js
git commit -m "feat: git bug-fix commit mining"
```

---

## Task 11: PostToolUse telemetry hook (`bin/telemetry-hook.js`)

**Files:**
- Create: `bin/telemetry-hook.js`, `bin/_stdin.js`
- Test: `test/telemetry-hook.test.js`

**Interfaces:**
- Consumes: `appendTelemetry` from `lib/telemetry.js`.
- Produces: an executable that reads a PostToolUse JSON event on stdin `{session_id, tool_name, tool_input, tool_response}`, and records a telemetry line **only** when `tool_name` starts with `mcp__` or equals `Skill`. `bin/_stdin.js` exports `readStdin() -> Promise<string>`.

- [ ] **Step 1: Write the failing test**

```js
// test/telemetry-hook.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runHook(script, input, env) {
  return execFileSync('node', [script], { input: JSON.stringify(input), env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('telemetry hook records mcp call, ignores other tools', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ccr-'));
  const hook = new URL('../bin/telemetry-hook.js', import.meta.url).pathname;
  runHook(hook, { session_id: 's', tool_name: 'mcp__db__query', tool_input: { q: 1 }, tool_response: { error: 'boom' } }, { CC_REFLECT_HOME: home });
  runHook(hook, { session_id: 's', tool_name: 'Read', tool_input: {}, tool_response: 'ok' }, { CC_REFLECT_HOME: home });
  process.env.CC_REFLECT_HOME = home;
  const { readTelemetry } = await import('../lib/telemetry.js');
  const recs = readTelemetry(0);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].tool, 'mcp__db__query');
  assert.equal(recs[0].error, 'boom');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `bin/telemetry-hook.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
// bin/_stdin.js
export function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve('');
  });
}
```

```js
// bin/telemetry-hook.js
#!/usr/bin/env node
import { readStdin } from './_stdin.js';
import { appendTelemetry } from '../lib/telemetry.js';

const raw = await readStdin();
let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }

const tool = input.tool_name;
if (!tool || (!tool.startsWith('mcp__') && tool !== 'Skill')) process.exit(0);

const resp = input.tool_response;
const text = typeof resp === 'string' ? resp : JSON.stringify(resp ?? '');
const error = resp && (resp.error || resp.is_error) ? String(resp.error || 'is_error') : null;

appendTelemetry({
  ts: Date.now(),
  session_id: input.session_id || null,
  tool,
  args_digest: JSON.stringify(input.tool_input ?? '').slice(0, 200),
  output_size: text.length,
  error,
});
process.exit(0);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/_stdin.js bin/telemetry-hook.js test/telemetry-hook.test.js
git commit -m "feat: PostToolUse telemetry hook"
```

---

## Task 12: Stop hook — toggle-gated enqueue (`bin/auto-reflect-hook.js`)

**Files:**
- Create: `bin/auto-reflect-hook.js`
- Test: `test/auto-reflect-hook.test.js`

**Interfaces:**
- Consumes: `readConfig` (`lib/config.js`), `readTelemetry` (`lib/telemetry.js`), `enqueuePending` (`lib/queue.js`).
- Produces: an executable reading a Stop event `{session_id, transcript_path}`. If `config.auto` is false → exit without enqueue. If true and this session produced ≥1 telemetry record → enqueue a pending marker. Always `exit(0)` with no `decision` (never blocks Stop → no loop).

- [ ] **Step 1: Write the failing test**

```js
// test/auto-reflect-hook.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(script, input, env) {
  execFileSync('node', [script], { input: JSON.stringify(input), env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('stop hook enqueues only when auto on and session had activity', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ccr-'));
  process.env.CC_REFLECT_HOME = home;
  const { setAuto } = await import('../lib/config.js');
  const { appendTelemetry } = await import('../lib/telemetry.js');
  const { listPending } = await import('../lib/queue.js');
  const hook = new URL('../bin/auto-reflect-hook.js', import.meta.url).pathname;

  run(hook, { session_id: 's', transcript_path: '/t.jsonl' }, { CC_REFLECT_HOME: home }); // auto off
  assert.equal(listPending().length, 0);

  setAuto(true);
  appendTelemetry({ ts: 1, session_id: 's', tool: 'mcp__db__query', args_digest: '', output_size: 0, error: null });
  run(hook, { session_id: 's', transcript_path: '/t.jsonl' }, { CC_REFLECT_HOME: home });
  assert.equal(listPending().length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `bin/auto-reflect-hook.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
// bin/auto-reflect-hook.js
#!/usr/bin/env node
import { readStdin } from './_stdin.js';
import { readConfig } from '../lib/config.js';
import { readTelemetry } from '../lib/telemetry.js';
import { enqueuePending } from '../lib/queue.js';

const raw = await readStdin();
let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }

const cfg = readConfig();
if (!cfg.auto) process.exit(0);

const hadActivity = readTelemetry(0).some(r => r.session_id === input.session_id);
if (!hadActivity) process.exit(0);

enqueuePending({
  session_id: input.session_id || 'session',
  transcript_path: input.transcript_path || null,
  queued_at: Date.now(),
});
process.exit(0);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/auto-reflect-hook.js test/auto-reflect-hook.test.js
git commit -m "feat: Stop hook enqueues reflection candidate (toggle-gated)"
```

---

## Task 13: UserPromptSubmit hook — idle notify (`bin/surface-pending-hook.js`)

**Files:**
- Create: `bin/surface-pending-hook.js`
- Test: `test/surface-pending-hook.test.js`

**Interfaces:**
- Consumes: `pendingOlderThan` (`lib/queue.js`).
- Produces: an executable that, on any UserPromptSubmit event, prints a one-line notice to stdout (added to context) **only** when ≥1 pending marker is ≥5 minutes old; otherwise prints nothing. Always `exit(0)`.

- [ ] **Step 1: Write the failing test**

```js
// test/surface-pending-hook.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(script, input, env) {
  return execFileSync('node', [script], { input: JSON.stringify(input), env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('surface hook notifies only for pending older than 5 min', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ccr-'));
  process.env.CC_REFLECT_HOME = home;
  const { enqueuePending } = await import('../lib/queue.js');
  const hook = new URL('../bin/surface-pending-hook.js', import.meta.url).pathname;

  let out = run(hook, { prompt: 'hi' }, { CC_REFLECT_HOME: home });
  assert.equal(out.trim(), '');

  enqueuePending({ session_id: 's', transcript_path: '/t', queued_at: 1 }); // ancient
  out = run(hook, { prompt: 'hi' }, { CC_REFLECT_HOME: home });
  assert.match(out, /pending reflection/i);
  assert.match(out, /\/reflect:review/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `bin/surface-pending-hook.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
// bin/surface-pending-hook.js
#!/usr/bin/env node
import { readStdin } from './_stdin.js';
import { pendingOlderThan } from '../lib/queue.js';

const FIVE_MIN = 5 * 60 * 1000;
await readStdin(); // input ignored

const due = pendingOlderThan(Date.now(), FIVE_MIN);
if (due.length > 0) {
  process.stdout.write(`[cc-reflect] ${due.length} pending reflection(s) ready. Run /reflect:review to view.\n`);
}
process.exit(0);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/surface-pending-hook.js test/surface-pending-hook.test.js
git commit -m "feat: UserPromptSubmit idle-aware pending notice"
```

---

## Task 14: Hook registration (`hooks/hooks.json`)

**Files:**
- Create: `hooks/hooks.json`
- Test: `test/hooks-json.test.js`

**Interfaces:**
- Produces: a valid Claude Code hooks config registering `PostToolUse` → telemetry-hook, `Stop` → auto-reflect-hook, `UserPromptSubmit` → surface-pending-hook, all via `${CLAUDE_PLUGIN_ROOT}`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `hooks/hooks.json` not found.

- [ ] **Step 3: Write minimal implementation**

```json
// hooks/hooks.json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "*", "hooks": [ { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/bin/telemetry-hook.js" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/bin/auto-reflect-hook.js" } ] }
    ],
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/bin/surface-pending-hook.js" } ] }
    ]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/hooks.json test/hooks-json.test.js
git commit -m "feat: register telemetry/stop/userprompt hooks"
```

---

## Task 15: Data CLI (`lib/cli.js`)

**Files:**
- Create: `lib/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: all lib modules + `discoverSkills`, `discoverLocalMcps`, `bugfixCommitsSince`, `headSha`.
- Produces: an executable dispatching subcommands, each printing JSON (or plain text for `status`) to stdout:
  - `targets <projectDir>` → `{skills:[...], mcps:[...]}` (mcps from `<projectDir>/.mcp.json` + `~/.claude.json` if present)
  - `signals <projectDir>` → `{recurringFailures:[...], gitFixes:[{target_id, commits:[...]}]}` since cursors
  - `status` → human text: auto on/off, telemetry cursor line, pending count
  - `on` / `off` → set auto, print new state
  - `advance --telemetry <n>` → set telemetry cursor line (used post-apply)

- [ ] **Step 1: Write the failing test**

```js
// test/cli.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function cli(env, ...args) {
  const script = new URL('../lib/cli.js', import.meta.url).pathname;
  return execFileSync('node', [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('cli targets + on/off', () => {
  const home = mkdtempSync(join(tmpdir(), 'ccr-'));
  const proj = mkdtempSync(join(tmpdir(), 'proj-'));
  mkdirSync(join(proj, '.claude', 'skills', 'alpha'), { recursive: true });
  writeFileSync(join(proj, '.claude', 'skills', 'alpha', 'SKILL.md'), '# alpha');
  const env = { CC_REFLECT_HOME: home, HOME: home };
  const targets = JSON.parse(cli(env, 'targets', proj));
  assert.ok(targets.skills.some(s => s.id === 'skill:alpha'));
  cli(env, 'on');
  assert.match(cli(env, 'status'), /auto:\s*on/i);
  cli(env, 'off');
  assert.match(cli(env, 'status'), /auto:\s*off/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/cli.js` not found.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/cli.js
#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readConfig, setAuto } from './config.js';
import { readCursors, setTelemetryLine } from './cursors.js';
import { readTelemetry, recurringFailures } from './telemetry.js';
import { discoverSkills, discoverLocalMcps } from './discovery.js';
import { bugfixCommitsSince } from './gitlog.js';
import { listPending } from './queue.js';

function loadJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

function mcpConfigs(projectDir) {
  const candidates = [join(projectDir, '.mcp.json'), join(homedir(), '.claude.json')];
  return candidates.filter(existsSync).map(p => ({ path: p, json: loadJson(p) })).filter(c => c.json);
}

function targets(projectDir) {
  return {
    skills: discoverSkills(projectDir, homedir()),
    mcps: discoverLocalMcps(mcpConfigs(projectDir)),
  };
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'targets') {
  process.stdout.write(JSON.stringify(targets(rest[0] || process.cwd()), null, 2));
} else if (cmd === 'signals') {
  const cur = readCursors();
  const recs = readTelemetry(cur.telemetryLine);
  const cfg = readConfig();
  const minCount = cfg.minConfidence === 'low' ? 2 : 3;
  const t = targets(rest[0] || process.cwd());
  const gitFixes = [...t.skills, ...t.mcps]
    .filter(x => x.repo_root)
    .map(x => ({ target_id: x.id, commits: bugfixCommitsSince(x.repo_root, cur.git[x.repo_root] || null) }))
    .filter(x => x.commits.length);
  process.stdout.write(JSON.stringify({ recurringFailures: recurringFailures(recs, { minCount }), gitFixes }, null, 2));
} else if (cmd === 'status') {
  const cfg = readConfig();
  process.stdout.write(`auto: ${cfg.auto ? 'on' : 'off'}\ntelemetryCursor: ${readCursors().telemetryLine}\npending: ${listPending().length}\n`);
} else if (cmd === 'on') {
  setAuto(true); process.stdout.write('auto: on\n');
} else if (cmd === 'off') {
  setAuto(false); process.stdout.write('auto: off\n');
} else if (cmd === 'advance') {
  const i = rest.indexOf('--telemetry');
  if (i >= 0) setTelemetryLine(Number(rest[i + 1]));
  process.stdout.write('ok\n');
} else {
  process.stderr.write(`unknown command: ${cmd}\n`); process.exit(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cli.js test/cli.test.js
git commit -m "feat: data CLI (targets/signals/status/on/off/advance)"
```

---

## Task 16: Analyzer agent (`agents/reflect-analyzer.md`)

**Files:**
- Create: `agents/reflect-analyzer.md`
- Test: `test/agent-analyzer.test.js`

**Interfaces:**
- Produces: a subagent definition that, given a transcript + `signals` JSON + current target file contents, emits findings as JSON with fields `target_id, kind, type, evidence, proposed_change, confidence`. Must instruct: read current target state, drop findings already present, drop rejected fingerprints, grade confidence per the rubric, route `low` to backlog.

- [ ] **Step 1: Write the failing test**

```js
// test/agent-analyzer.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('analyzer agent documents finding schema + guards', () => {
  const md = readFileSync(new URL('../agents/reflect-analyzer.md', import.meta.url), 'utf8');
  assert.match(md, /^---[\s\S]*name:\s*reflect-analyzer[\s\S]*---/);
  for (const f of ['target_id', 'type', 'evidence', 'proposed_change', 'confidence']) assert.ok(md.includes(f), `missing ${f}`);
  assert.match(md, /reject/i);
  assert.match(md, /current (state|content)/i);
  assert.match(md, /high|medium|low/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the agent file**

````markdown
---
name: reflect-analyzer
description: Analyze session signals into improvement findings for self-maintained skills/MCPs
---

# Reflect Analyzer

You convert captured signals into concrete, verifiable **findings**. You do NOT edit files.

## Inputs (provided in the prompt)
- The conversation transcript (or a transcript file path to read).
- `signals` JSON: `{ recurringFailures:[{tool,total,failures,errors}], gitFixes:[{target_id,commits}] }`.
- The current contents of each candidate target file (SKILL.md / MCP source).
- The current `rejected` fingerprint list.

## Steps
1. Gather signals from three sources:
   - **Transcript**: user corrections ("no, use X"), repeated nags, explicit approvals, tool-result-then-redo. Attribute each to the nearest preceding `Skill` invocation or `mcp__server__tool` call. Unattributable signals go to an `unattributed` bucket — try to assign by content; otherwise drop low-value ones.
   - **Telemetry** (`recurringFailures`): map `mcp__<server>__<tool>` to its MCP target.
   - **Git** (`gitFixes`): recurring bug-fix themes per target repo.
2. **Read current target state.** Drop any finding whose rule/change already exists in the target file.
3. **Drop rejected findings.** Skip anything whose `(target_id,type,proposed_change)` matches a rejected fingerprint.
4. Cluster similar signals within a target into one finding.
5. Grade **confidence**:
   - `high` 🔴 — explicit user correction, or a recurring failure (≥3 in telemetry).
   - `medium` 🟡 — patterns that worked / soft signals.
   - `low` 🟢 — single observation / weak attribution → route to backlog, do not propose now.

## Output
Return JSON only:
```json
{
  "findings": [
    {
      "target_id": "skill:code-review",
      "kind": "skill",
      "type": "correction",
      "evidence": "transcript L142, L210",
      "proposed_change": "Append to SKILL.md checklist: always check SQL injection in query-building paths",
      "confidence": "high"
    }
  ],
  "backlog": [ /* same shape, confidence: low */ ]
}
```
Every `evidence` must point to a real source (transcript line, telemetry tool, commit sha).
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/reflect-analyzer.md test/agent-analyzer.test.js
git commit -m "feat: reflect-analyzer agent"
```

---

## Task 17: Applier agent (`agents/reflect-applier.md`)

**Files:**
- Create: `agents/reflect-applier.md`
- Test: `test/agent-applier.test.js`

**Interfaces:**
- Produces: a subagent definition that takes approved findings and applies them: edit target file; `git init` if the repo has no `.git`; one commit per repo; for MCP findings run the repo's test command and `git revert`/reset on failure (tag `[unverified]` if no tests); never touch cc-reflect itself.

- [ ] **Step 1: Write the failing test**

```js
// test/agent-applier.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('applier agent documents git + test-gate + self-protection', () => {
  const md = readFileSync(new URL('../agents/reflect-applier.md', import.meta.url), 'utf8');
  assert.match(md, /name:\s*reflect-applier/);
  assert.match(md, /git init/i);
  assert.match(md, /one commit per repo/i);
  assert.match(md, /test/i);
  assert.match(md, /roll ?back|revert|reset/i);
  assert.match(md, /unverified/i);
  assert.match(md, /cc-reflect/i); // self-protection mention
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the agent file**

````markdown
---
name: reflect-applier
description: Apply approved reflect findings to skill/MCP files with git versioning and MCP test gating
---

# Reflect Applier

You apply **already-approved** findings. Never propose new changes; never act on unapproved findings.

## Hard rules
- **Never modify cc-reflect itself.** If a finding targets the cc-reflect repo, skip it and report.
- One **commit per target repo**, message summarizing the learnings, e.g. `reflect: add SQL-injection check to code-review`.

## Steps (per target)
1. Apply the change:
   - skill → edit its `SKILL.md` (append/modify the relevant rule).
   - MCP → edit server code / tool description per the finding.
2. Ensure git: if `repo_root` has no `.git`, run `git init` there first.
3. Stage and commit only the changed files in that repo.
4. **MCP test gate** (skill changes skip this):
   - Detect a test command (e.g. `package.json` `scripts.test`, or an obvious runner).
   - If found, run it. On failure: `git revert --no-edit HEAD` (or `git reset --hard HEAD~1` if the commit is isolated), and report the finding as `applied-but-failed`.
   - If no test command: keep the commit but append `[unverified]` to the message and tell the user to verify manually.
5. After all applies, report: applied (with commit shas), reverted, skipped.

## Output
Plain summary: per finding — applied/reverted/skipped, repo, commit sha, and any test result.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/reflect-applier.md test/agent-applier.test.js
git commit -m "feat: reflect-applier agent"
```

---

## Task 18: `/reflect` command (full flow)

**Files:**
- Create: `commands/reflect.md`
- Test: `test/cmd-reflect.test.js`

**Interfaces:**
- Produces: a slash command orchestrating the current-session flow: gather data via `lib/cli.js`, run `reflect-analyzer`, present the grouped proposal UI, on approval run `reflect-applier`, then record rejections and advance cursors.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the command file**

````markdown
---
description: Reflect on the current session and improve self-maintained skills/MCPs
---

# /reflect

Run the full reflect loop for the **current** session.

1. **Gather data** (deterministic):
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js targets "$CLAUDE_PROJECT_DIR"
   node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js signals "$CLAUDE_PROJECT_DIR"
   ```
   Also read the current state of each candidate target file, and the rejected list at `~/.claude/cc-reflect/rejected.json` (honor `CC_REFLECT_HOME`).
2. **Analyze**: dispatch the `reflect-analyzer` agent with the current conversation, the `signals` JSON, the target file contents, and the rejected list. It returns `{findings, backlog}`.
3. **Write backlog**: append `backlog` (low-confidence) findings to `~/.claude/cc-reflect/findings/`.
4. **Propose**: present `findings` grouped by target, sorted high→low, each showing type, evidence, proposed change, and a draft diff. For each finding offer: **Y accept / n skip / natural-language edit**. Show a per-repo commit message.
5. **Apply**: for accepted findings, dispatch `reflect-applier`. For skipped findings, append their fingerprints to `rejected.json` (use the same `(target_id,type,proposed_change)` key as `lib/fingerprint.js`).
6. **Advance cursor** so the same telemetry isn't reprocessed:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js advance --telemetry <new line count>
   ```

Never apply anything without explicit approval.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add commands/reflect.md test/cmd-reflect.test.js
git commit -m "feat: /reflect command (full flow)"
```

---

## Task 19: `/reflect:review` + `/reflect:check` commands

**Files:**
- Create: `commands/reflect-review.md`, `commands/reflect-check.md`
- Test: `test/cmd-review-check.test.js`

**Interfaces:**
- Produces: `/reflect:review` consumes pending markers (reads each marker's `transcript_path`, runs the same analyze→propose→apply flow, deletes consumed markers). `/reflect:check` lists the low-confidence backlog for triage (promote to a proposal, or reject).

- [ ] **Step 1: Write the failing test**

```js
// test/cmd-review-check.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('review consumes pending; check triages backlog', () => {
  const review = readFileSync(new URL('../commands/reflect-review.md', import.meta.url), 'utf8');
  assert.match(review, /pending/i);
  assert.match(review, /transcript_path/);
  assert.match(review, /reflect-analyzer/);
  assert.match(review, /delete|remove|consume/i);
  const check = readFileSync(new URL('../commands/reflect-check.md', import.meta.url), 'utf8');
  assert.match(check, /backlog|findings\//i);
  assert.match(check, /promote|triage/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — files not found.

- [ ] **Step 3: Write the command files**

````markdown
<!-- commands/reflect-review.md -->
---
description: Review reflections queued from past sessions (auto mode)
---

# /reflect:review

1. List pending markers in `~/.claude/cc-reflect/pending/` (honor `CC_REFLECT_HOME`). If empty, say so and stop.
2. For each marker:
   - Read its `transcript_path`.
   - Gather signals: `node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js signals "$CLAUDE_PROJECT_DIR"`.
   - Dispatch `reflect-analyzer` with the transcript + signals + target file contents + rejected list.
   - Present the grouped proposal UI (Y / skip / natural-language edit), same as `/reflect`.
   - On approval dispatch `reflect-applier`; record skipped fingerprints into `rejected.json`.
   - **Delete the consumed marker file.**
3. Advance the telemetry cursor when done.
````

````markdown
<!-- commands/reflect-check.md -->
---
description: Triage the low-confidence reflect backlog
---

# /reflect:check

1. List backlog findings in `~/.claude/cc-reflect/findings/` (honor `CC_REFLECT_HOME`).
2. For each, show target, type, evidence, proposed change.
3. Offer to **promote** (run it through the normal propose→apply path) or **reject** (record fingerprint in `rejected.json` and delete the backlog file).
4. Leave untouched anything the user wants to keep for later.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add commands/reflect-review.md commands/reflect-check.md test/cmd-review-check.test.js
git commit -m "feat: /reflect:review + /reflect:check commands"
```

---

## Task 20: Toggle commands `/reflect:on|off|status`

**Files:**
- Create: `commands/reflect-on.md`, `commands/reflect-off.md`, `commands/reflect-status.md`
- Test: `test/cmd-toggle.test.js`

**Interfaces:**
- Produces: three thin commands invoking `lib/cli.js on|off|status`.

- [ ] **Step 1: Write the failing test**

```js
// test/cmd-toggle.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

test('toggle commands call cli', () => {
  const base = '../commands/';
  assert.match(readFileSync(new URL(base + 'reflect-on.md', import.meta.url), 'utf8'), /cli\.js on/);
  assert.match(readFileSync(new URL(base + 'reflect-off.md', import.meta.url), 'utf8'), /cli\.js off/);
  assert.match(readFileSync(new URL(base + 'reflect-status.md', import.meta.url), 'utf8'), /cli\.js status/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — files not found.

- [ ] **Step 3: Write the command files**

````markdown
<!-- commands/reflect-on.md -->
---
description: Enable automatic end-of-session reflection
---
# /reflect:on
Run: `node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js on` and report the new state.
````

````markdown
<!-- commands/reflect-off.md -->
---
description: Disable automatic end-of-session reflection
---
# /reflect:off
Run: `node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js off` and report the new state.
````

````markdown
<!-- commands/reflect-status.md -->
---
description: Show reflect status (auto toggle, cursor, pending count)
---
# /reflect:status
Run: `node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js status` and show the output.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add commands/reflect-on.md commands/reflect-off.md commands/reflect-status.md test/cmd-toggle.test.js
git commit -m "feat: /reflect:on|off|status toggle commands"
```

---

## Task 21: Reflect philosophy skill (`skills/reflecting/SKILL.md`)

**Files:**
- Create: `skills/reflecting/SKILL.md`
- Test: `test/skill-reflecting.test.js`

**Interfaces:**
- Produces: a reference skill documenting attribution, confidence grading, convergence guards, and self-protection — the shared reference the agents/commands lean on.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the skill file**

````markdown
---
name: reflecting
description: How cc-reflect turns session signals into safe, converging improvements to self-maintained skills/MCPs
---

# Reflecting

The model behind cc-reflect.

## Signals → findings
Three sources: session **transcript** (corrections/approvals/redo), tool **telemetry** (mcp/skill calls, failures), and target-repo **git history** (bug-fix commits).

## Attribution
- Telemetry: tool name `mcp__<server>__<tool>` → MCP target (direct).
- Transcript: nearest preceding `Skill`/MCP call (proximity). Unattributable → bucket, assign by content or drop.
- Git: by repo root.

## Confidence
- `high` 🔴 explicit correction or recurring failure (≥3).
- `medium` 🟡 patterns that worked / soft signals.
- `low` 🟢 single observation → backlog, not auto-proposed.

## Guards (convergence + safety)
- **Suggestion-first** — nothing lands without approval.
- **Read current state** — don't re-propose what's already in the target.
- **Rejected-set dedup** — rejected findings never reappear.
- **Git versioning** — one commit per landing; revertable.
- **MCP test gate** — run tests; revert on failure; tag `[unverified]` if none.
- **Self-protection** — cc-reflect never reflects on or edits itself.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/reflecting/SKILL.md test/skill-reflecting.test.js
git commit -m "feat: reflecting philosophy skill"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Discovery (skills project+user, local MCP only) → Tasks 7, 8, 15.
- Three capture sources (transcript/telemetry/git) → analyzer (16) reads transcript; telemetry (9,11); git (10); aggregated by CLI (15).
- Incremental cursors → Tasks 4, 15 (`advance`), 18.
- Confidence grading + backlog → Tasks 16, 19, 21.
- Convergence guards (read-current-state, rejected-set) → Tasks 5, 16, 18, 21.
- Propose UI + Y/skip/NL-edit → Tasks 18, 19.
- Apply: edit + git init + per-repo commit + MCP test gate + auto-rollback → Task 17.
- Triggers: manual (18), auto Stop enqueue (12), idle ≥5min notify (13), toggle (20), registration (14).
- State dir layout → Tasks 2–6.
- Self-protection (no self-reflection) → Tasks 17, 21.

**Placeholder scan:** none — every code/prompt step is concrete.

**Type consistency:** finding shape `{target_id, kind, type, evidence, proposed_change, confidence}` is identical across Tasks 5 (fingerprint key uses target_id/type/proposed_change), 16, 17, 18. Telemetry record shape consistent across 9, 11, 12. Marker shape `{session_id, transcript_path, queued_at}` consistent across 6, 12, 13.

**Note vs spec:** `config.json` replaces `config.md`; Stop hook enqueues (analysis runs at review) — both flagged in Global Constraints.
