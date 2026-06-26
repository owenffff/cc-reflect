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
