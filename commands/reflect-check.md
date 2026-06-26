---
description: Triage the low-confidence reflect backlog
---

# /reflect:check

1. List backlog findings in `~/.claude/cc-reflect/findings/` (honor `CC_REFLECT_HOME`).
2. For each, show target, type, evidence, proposed change.
3. Offer to **promote** (run it through the normal propose→apply path) or **reject** (record fingerprint in `rejected.json` and delete the backlog file).
4. Leave untouched anything the user wants to keep for later.
