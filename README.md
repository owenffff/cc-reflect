# cc-reflect

A self-improving layer for the skills and local MCPs **you** maintain.

You correct a self-developed skill or local MCP today; without memory it forgets by
tomorrow. cc-reflect closes the loop: it mines your session signals, telemetry, and
git history to find areas of improvement, proposes concrete changes for your
approval, then applies them and version-controls the result — so a correction made
once doesn't have to be made again.

It is **suggestion-first**: nothing ever changes a file without your explicit
approval.

## What it covers

- **Skills** — `SKILL.md` under project-level `<project>/.claude/skills/*/` and
  user-level `~/.claude/skills/*/`. (Third-party plugin-cache skills are excluded.)
- **Local MCPs** — stdio MCP servers whose command resolves to a local file.
  Remote (`sse`/`http`) servers are skipped — you can't edit them.

## Install

```
/plugin marketplace add owenffff/cc-reflect
/plugin install cc-reflect
```

For local development, clone the repo and point at the path instead:
`/plugin marketplace add /path/to/cc-reflect`.

Requires Node.js (uses only built-ins, zero dependencies). On install, the hooks in
`hooks/hooks.json` register automatically and telemetry capture begins.

## How it works

A four-stage pipeline. Deterministic plumbing (capture, bookkeeping) lives in
Node hooks/CLI; the LLM work (analysis, proposal, apply) is Claude-side.

```
[1 Capture] ──► [2 Reflect] ──► [3 Propose] ──► [4 Apply]
 transcript     group by         findings +      edit files
 telemetry      target →         draft diff +    + git commit
 git history    findings         your Y/skip     (init if none)
 (+confidence)                                   MCP: test gate + rollback
```

**Capture (three sources):**

| Source | Captures | Attribution |
|---|---|---|
| Session transcript | corrections, repeated nags, approvals, redo-after-tool | nearest preceding `Skill`/`mcp__*` call |
| Telemetry (PostToolUse hook) | per `mcp__*`/`Skill` call: args digest, duration, error | tool name → MCP target |
| Git history | bug-fix commits in each target repo | by repo root |

**Confidence:** `high` 🔴 (explicit correction / recurring failure ≥3) ·
`medium` 🟡 (patterns that worked) · `low` 🟢 (single observation → backlog).

**Apply:** edits land in the target's own files and are committed in the target's
own repo (`git init` if absent) — one commit per repo. MCP code changes run the
repo's tests and auto-rollback on failure (tagged `[unverified]` if no tests).

## Usage

### Manual

```
/reflect            # reflect on the current conversation, now
/reflect:review     # process reflections queued from past sessions
/reflect:check      # triage the low-confidence backlog
```

A `/reflect` run shows findings grouped by target; for each you choose
**Y accept / n skip / natural-language edit**. Skipped findings are remembered and
never re-proposed.

### Ambient (recap-style)

```
/reflect:on         # enable ambient mode
/reflect:off
/reflect:status     # auto toggle, telemetry cursor, pending count
```

With ambient on, you don't have to remember to run anything:

1. At **session end**, the Stop hook silently enqueues a reflection candidate.
2. On your **next session**, the SessionStart hook proactively surfaces pending
   reflections — recap-style — and Claude presents them for Y/skip.
3. If you ignore them, an **inline** re-nudge appears later (30-min cooldown).
4. Acting via `/reflect:review` consumes and deletes the batch.

**Frequency guards (anti-noise):** ambient only when `/reflect:on`; ≥5-min age
gate; shared dedup so a batch surfaces at most once across both channels; 30-min
cooldown on inline re-nudges; SessionStart fires only on `startup|resume`.

> Note: hooks inject context + instructions that Claude acts on at its next turn
> (the same mechanism as recap) — a soft prompt, not a hard guarantee of surfacing
> every single time. The 5-min and cooldown thresholds are easy to tune.

## State

cc-reflect keeps only pipeline bookkeeping in `~/.claude/cc-reflect/`
(`CC_REFLECT_HOME` overrides):

```
telemetry.jsonl     # PostToolUse ledger
cursors.json        # per-source incremental cursors
rejected.json       # rejected finding fingerprints (dedup → convergence)
pending/            # queued reflection candidates
findings/           # low-confidence backlog
surface-log.json    # ambient dedup + cooldown
config.json         # ambient toggle, min-confidence, excludes
```

The **learnings themselves never live here** — they live in each skill/MCP's own
files, versioned in that repo's `git log`. That timeline *is* the record of how the
system got smarter; regressions are a `git revert` away.

## Safety

- Suggestion-first — nothing lands without approval.
- Read-current-state + rejected-set dedup → the loop converges, no re-proposing.
- Git versioning on every landing; MCP test gate with auto-rollback.
- **Self-protection** — cc-reflect never reflects on or edits itself.

## Layout

```
.claude-plugin/plugin.json   .claude-plugin/marketplace.json   package.json
lib/      paths config cursors fingerprint rejected queue discovery telemetry gitlog surface cli
bin/      telemetry-hook  auto-reflect-hook  surface-pending-hook  session-recap-hook  _stdin
hooks/    hooks.json
agents/   reflect-analyzer  reflect-applier
commands/ reflect  reflect-review  reflect-check  reflect-on  reflect-off  reflect-status
skills/   reflecting/SKILL.md
docs/     superpowers/specs + superpowers/plans
test/     *.test.js   (run: npm test)
```

## Development

```
npm test     # node --test, 24 tests
```

Design spec: `docs/superpowers/specs/2026-06-24-cc-reflect-design.md`.
Implementation plan: `docs/superpowers/plans/2026-06-26-cc-reflect.md`.
