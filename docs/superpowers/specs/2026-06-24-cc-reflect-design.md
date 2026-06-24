# cc-reflect — Self-Improving Layer for Self-Maintained Skills & Local MCPs

**Date:** 2026-06-24
**Status:** Design approved, pending implementation plan

## Problem

LLM coding harnesses don't learn across sessions. Corrections you make to a
self-developed skill or local MCP today are forgotten tomorrow — you repeat the
same guidance forever. Existing solutions (the "reflect" skill pattern) cover
only skills; they don't touch local MCP servers, and they mine only the session
transcript.

## Goal

A Claude Code **plugin** (`cc-reflect`) that adds a self-improvement closed loop
over **all self-maintained skills and local MCPs**: after they're used, it mines
session data + telemetry + git history to discover areas of improvement, proposes
concrete changes for human approval, then implements and version-controls them.

## Scope

**In scope (reflect targets):**
- **Skills**: `SKILL.md` under project-level `<project>/.claude/skills/*/` and
  user-level `~/.claude/skills/*/`. Excludes plugin-cache paths
  (`~/.claude/plugins/cache/...`) — those are third-party.
- **Local MCPs**: stdio MCP servers whose `command`/`args` resolve to a local
  path. Remote (`type: sse|http`) servers are skipped — they can't be edited.

**Out of scope:** third-party installed skills/plugins, remote MCP servers,
cc-reflect editing itself (see Self-Protection).

## Core Principles (cross-cutting)

1. **Suggestion-first, always.** Even automatic mode only *generates* suggestions;
   nothing lands without explicit human approval. This is the primary guard
   against a self-degradation loop.
2. **Learnings live in the target files**, not in a separate canonical knowledge
   base. Skill rules go into `SKILL.md`; MCP improvements go into server
   code / tool descriptions. Benefits: `git diff`-able, rollback-able, plain-text
   readable, and the next reflect reads current file state (won't re-propose what's
   already applied). cc-reflect stores only *pipeline state*.
3. **Three triggers, one loop.** Manual `/reflect`, automatic Stop hook, and
   `reflect:on|off|status` toggling — all run the same pipeline.

## Pipeline (4 stages)

```
         ┌─────────── background ───────────┐
         ▼                                   │
[1 Capture] ──► [2 Reflect] ──► [3 Propose] ──► [4 Apply]
 transcript     group by target  findings+diff   edit files
 telemetry      → findings       +commit msg     + git commit
 git history    (+confidence)    human review     (init if none)
```

## Stage 1 — Capture (signals)

All collectors normalize to a common record:
`{source, target_id, kind, evidence, ts}`.

| Collector | Captures | Attribution |
|---|---|---|
| **Transcript** | user corrections, repeated nags, explicit approvals, tool-result-then-redo | **proximity**: nearest preceding `Skill` invocation / `mcp__server__tool` call |
| **Telemetry** (PostToolUse hook) | per-call: tool name, args digest, duration, exit/error, output size | **trivial**: `mcp__<server>__<tool>` maps directly to MCP target |
| **Git history** | bug-fix commits in each target repo since last reflect → recurring problem patterns | **by repo**: commit belongs to a `repo_root` |

**Attribution details:**
- Telemetry is near-free (tool name carries server identity). This line is the
  primary source for MCP code-level issues (timeouts, errors, ignored output) that
  the transcript can't see clearly.
- Transcript is hardest. Use a proximity window. Signals that can't be attributed
  go into an `unattributed` bucket and are **kept** — the analyzer backfills
  attribution or discards at analysis time.
- The telemetry hook records **only the single call** (a hook can't see the
  future). Cross-turn "was the output later overridden?" is reconstructed by the
  transcript analysis stage, not the hook.

**Incremental capture:** cc-reflect stores a cursor per source (transcript
offset, last sha per repo, telemetry line number). Each reflect only processes
signals past the cursor.

## Stage 2 — Reflect (analysis)

A dedicated `reflect-analyzer` agent (same for manual and auto):

```
read signals past cursor
  → group by target (unattributed bucket backfilled last)
  → cluster similar signals within a target (don't split one issue into many)
  → emit findings
```

**Finding structure:**
```
{
  target_id, kind,
  type,             // correction | recurring-failure | success-pattern | observation
  evidence,         // points back to raw signals: transcript ref / telemetry line / sha
  proposed_change,  // concrete: which SKILL.md rule / which MCP handler gets retry
  confidence        // high | medium | low
}
```
Evidence MUST point back to source signals so the human can verify — not
hand-waved suggestions.

**Confidence levels** (merges the video's confidence + postmortem's severity):

| Level | Trigger | Default handling |
|---|---|---|
| **high** 🔴 | explicit user correction ("never do X"), or recurring failure ≥N times in telemetry | proposed, pre-selected, sorted first |
| **medium** 🟡 | patterns that worked, soft signals | proposed, pre-selected |
| **low** 🟢 | single observation, unattributed backfill | **not auto-proposed**; goes to `findings/` backlog for later review |

**Convergence guards (enforced at analysis time):**
1. **Read current target state first** — don't re-propose rules already present in
   `SKILL.md` / MCP code.
2. **rejected-set dedup** — findings the user rejected go into a rejected record and
   are never re-proposed. Without this, rejected findings reappear every round and
   the loop never converges.

## Stage 3 — Propose

**Two entry points, one proposal UI:**
- **Manual:** `/reflect` runs analysis and proposes immediately.
- **Automatic (idle-aware):** Claude Code has no native "user idle N minutes"
  event. We approximate the intent (don't interrupt active work; surface after the
  user has clearly stepped away) faithfully:
  - **Stop hook** silently runs analysis → writes findings + timestamp to the
    `pending/` queue (gated by the on/off toggle).
  - **UserPromptSubmit hook** checks on the user's next message: if **≥5 minutes**
    elapsed since the batch was queued, it injects a brief notice ("N pending
    reflections, run `/reflect:review`"). If <5 minutes (continuous work), it stays
    quiet. It only *notifies* — review is still user-initiated.

**Proposal UI** (grouped by target, per the reflect video):
```
## skill: code-review   (repo: ~/.claude/skills/code-review ✓git)
🔴 [high] correction — you asked twice to check SQL injection; skill didn't cover it
   evidence: transcript L142, L210
   change: append to SKILL.md checklist "always check SQL injection"
   ─ diff ─
   + - SQL injection in all query-building code paths

## mcp: my-db-tool  (repo: ~/code/my-db-tool ✓git)
🔴 [high] recurring-failure — query tool: 3/5 calls TimeoutError
   evidence: telemetry L88,L91,L97
   change: server.ts query handler — add 30s timeout + 1 retry
   ─ draft diff ─ ...

[per finding: Y accept / n skip / natural-language edit]
commit message (per repo): reflect: add SQL-injection check to code-review
```
Each finding supports **Y / skip / natural-language adjustment** (e.g. "also check
command injection" → adjust the diff before applying).

## Stage 4 — Apply

After approval, a `reflect-applier` agent processes each accepted finding:

1. **Edit files** — skill: edit `SKILL.md`; MCP: edit server code / tool
   description per the finding.
2. **Git** — if the target repo has no `.git`, `git init` first, then **one commit
   per repo** with a learnings-summary message. `git log` becomes the timeline of
   how each skill/MCP got smarter; regressions are revertable.
3. **Write back state** — advance cursors; record accepted findings as applied;
   record skipped findings into the rejected-set.

**Post-apply verification (MCP-specific):** MCP changes are code and can introduce
bugs.
- If the target repo has a test command (package.json `test` / detected runner),
  **run it**. On failure, **auto-rollback** that commit and mark the finding
  `applied-but-failed` for the user.
- If no tests, commit without verification but tag the commit `[unverified]`.

Skill changes are markdown — low blast radius, no test gate.

## Plugin Packaging

```
cc-reflect/
├── .claude-plugin/plugin.json       # manifest
├── marketplace.json                 # single-plugin marketplace
├── commands/
│   ├── reflect.md                   # /reflect          full flow
│   ├── reflect-review.md            # /reflect:review   review pending queue
│   ├── reflect-check.md             # /reflect:check    triage low-confidence backlog
│   ├── reflect-on.md                # /reflect:on       enable auto Stop hook
│   ├── reflect-off.md               # /reflect:off
│   └── reflect-status.md            # /reflect:status   cursors/queue/toggle
├── agents/
│   ├── reflect-analyzer.md          # signals → findings
│   └── reflect-applier.md           # findings → edits + git + test verify
├── hooks/
│   ├── telemetry.js                 # PostToolUse: append telemetry.jsonl
│   ├── auto-reflect.js              # Stop: silent analysis → pending/ (toggle-gated)
│   └── surface-pending.js           # UserPromptSubmit: ≥5min → notify of pending
└── skills/
    └── reflecting/SKILL.md          # reflect philosophy/attribution/grading reference
```

## State Directory

`~/.claude/cc-reflect/` (pipeline state only — never the learnings themselves):
```
telemetry.jsonl     # PostToolUse ledger
cursors.json        # per-source cursors: transcript offset / per-repo last sha / telemetry line
pending/            # stop-hook-generated finding batches awaiting review (timestamped)
findings/           # low-confidence backlog
rejected.json       # rejected finding fingerprints (dedup → convergence)
config.md           # toggle state, min-confidence, target include/exclude overrides
targets.cache.json  # last discovered target list (incremental discovery)
```

## Self-Protection (guards for a self-modifying system)

1. **Don't reflect on itself** — cc-reflect excludes itself from targets by default;
   it may not edit its own analyzer/applier. Changes to cc-reflect go through normal
   manual development.
2. **Suggestion-first never broken** — auto mode only generates + notifies; landing
   always requires approval.
3. **rejected-set dedup + read-current-state** — rejected findings aren't
   re-proposed; applied changes aren't re-proposed → convergence.
4. **Git = rollback** — one commit per landing; `git revert` on problems.
5. **MCP test gate + auto-rollback on failure** (Stage 4).

## Open Questions / Deferred

- `N` threshold for "recurring failure" in telemetry (high confidence) — pick a
  default during implementation (e.g. ≥3 in last 20 calls), make configurable.
- Exact transcript-parsing heuristics for corrections vs approvals — refine during
  implementation against real transcripts.
