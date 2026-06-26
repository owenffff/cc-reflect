#!/usr/bin/env node
import { readStdin } from './_stdin.js';
import { pendingOlderThan } from '../lib/queue.js';

const FIVE_MIN = 5 * 60 * 1000;
await readStdin(); // input ignored

const due = pendingOlderThan(Date.now(), FIVE_MIN);
if (due.length > 0) {
  process.stdout.write(`[cc-reflect] ${due.length} pending reflection(s) ready. Run /reflect:review to view.\n`);
}
process.exit(0);
