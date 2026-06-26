#!/usr/bin/env node
// bin/session-recap-hook.js — SessionStart: proactively surface pending reflections (recap-style)
import { readStdin } from './_stdin.js';
import { readConfig } from '../lib/config.js';
import { dueUnsurfaced, markSurfaced } from '../lib/surface.js';

await readStdin(); // input ignored

const cfg = readConfig();
if (!cfg.auto) process.exit(0); // ambient surfacing is the auto/ambient mode

const now = Date.now();
const due = dueUnsurfaced(now);
if (due.length === 0) process.exit(0);

markSurfaced(due, now);

const list = due.map(m => `- session ${m.session_id} (transcript: ${m.transcript_path})`).join('\n');
process.stdout.write(
`[cc-reflect] ${due.length} pending reflection(s) from earlier sessions.
Proactively surface them now, recap-style, before the user's first task: run the
/reflect:review flow for these queued sessions — present findings grouped by target
with Y/skip/edit, then stop. Keep it brief; do not block the user's own request.
Queued:
${list}
`);
process.exit(0);
