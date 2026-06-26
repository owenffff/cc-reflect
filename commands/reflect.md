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
