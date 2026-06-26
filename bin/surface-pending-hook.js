#!/usr/bin/env node
// bin/surface-pending-hook.js — UserPromptSubmit: throttled inline re-nudge for ignored pending
import { readStdin } from './_stdin.js';
import { dueUnsurfaced, markSurfaced, cooldownPassed } from '../lib/surface.js';

const COOLDOWN = 30 * 60 * 1000; // re-nudge at most every 30 min
await readStdin(); // input ignored

const now = Date.now();
const due = dueUnsurfaced(now);
if (due.length === 0) process.exit(0);          // nothing new / already surfaced
if (!cooldownPassed(now, COOLDOWN)) process.exit(0); // don't nag

markSurfaced(due, now);
process.stdout.write(`[cc-reflect] ${due.length} pending reflection(s) ready. Run /reflect:review to view.\n`);
process.exit(0);
