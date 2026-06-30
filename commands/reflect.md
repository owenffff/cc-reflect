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
   Also read the current state of each candidate target's files, and the rejected list at `~/.claude/cc-reflect/rejected.json` (honor `CC_REFLECT_HOME`).
   - **MCP targets**: read the single `path` file.
   - **Skill targets**: read all files under `dir` recursively (SKILL.md, references, docs, etc.).
2. **Analyze**: dispatch the `reflect-analyzer` agent **as a fork** (`subagent_type: fork`) with the current conversation, the `signals` JSON, the target file contents, and the rejected list. The fork returns `{findings, backlog}` JSON as its output.
3. **Write backlog**: append `backlog` (low-confidence) findings to `~/.claude/cc-reflect/findings/`.
4. **Propose**: present all `findings` as numbered cards in one message, sorted high→low confidence. Each card shows:
   - Confidence badge (`🔴 high` / `🟡 medium`) + type
   - One-line evidence
   - Diff block

   Then use `AskUserQuestion` with `multiSelect: true`. Options (max 4):
   - **"Accept all"** — first option always
   - **"1 — [short title]"**, **"2 — [short title]"**, **"3 — [short title]"**

   If there are more than 3 findings, page in groups of 3: show cards 1–3, ask, then cards 4–6, ask, etc. Announce pagination upfront ("Reviewing 1–3 of N").

   Selection logic:
   - "Accept all" checked (alone or with others) → accept every finding
   - Individual numbers checked → accept those, skip the rest
   - Nothing checked → skip all

   No edit path in this flow. Users who want to edit a finding should skip it and re-run `/reflect`.
5. **Apply**: for accepted findings, dispatch `reflect-applier` **as a fork** (`subagent_type: fork`) with the list of approved findings. For skipped findings, append their fingerprints to `rejected.json` (use the same `(target_id,type,proposed_change)` key as `lib/fingerprint.js`). The fork returns a plain summary (applied/reverted/skipped per finding).
6. **Advance cursor** so the same telemetry isn't reprocessed:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js advance --telemetry <new line count>
   ```

Never apply anything without explicit approval.
