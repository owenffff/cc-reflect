---
description: Enable ambient mode — auto-enqueue at session end + proactive recap surfacing
---
# /reflect:on
Enable ambient mode. When on: the Stop hook enqueues a reflection candidate at
session end, the SessionStart hook proactively surfaces pending reflections
(recap-style) on your next session, and the UserPromptSubmit hook re-nudges
(throttled, 30-min cooldown) if you ignore them.

Run: `node ${CLAUDE_PLUGIN_ROOT}/lib/cli.js on` and report the new state.
