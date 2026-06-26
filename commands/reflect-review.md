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
