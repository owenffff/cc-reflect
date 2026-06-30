---
description: Review reflections queued from past sessions (auto mode)
---

# /reflect:review

1. List pending markers in `~/.claude/cc-reflect/pending/` (honor `CC_REFLECT_HOME`). If empty, say so and stop.
2. For each marker:
   - Read its `transcript_path`.
   - Gather signals: `node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js signals "$CLAUDE_PROJECT_DIR"`.
   - Dispatch `reflect-analyzer` **as a fork** (`subagent_type: fork`) with the transcript + signals + target file contents + rejected list. For MCP targets read the single `path` file; for skill targets read all files under `dir` recursively (SKILL.md, references, docs, etc.). The fork returns `{findings, backlog}` JSON.
   - Present all findings as numbered cards in one message (confidence badge, type, evidence, diff), then a single `AskUserQuestion` with `multiSelect: true`: "Accept all" + up to 3 numbered findings. Page in groups of 3 if there are more. "Accept all" accepts everything; unchecked findings are skipped. No edit path — users who want to edit a finding should skip and re-run `/reflect`.
   - On approval dispatch `reflect-applier` **as a fork** (`subagent_type: fork`) with the approved findings. Record skipped fingerprints into `rejected.json`.
   - **Delete the consumed marker file.**
3. Advance the telemetry cursor when done.
