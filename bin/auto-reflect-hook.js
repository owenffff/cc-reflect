#!/usr/bin/env node
import { readStdin } from './_stdin.js';
import { readConfig } from '../lib/config.js';
import { readTelemetry } from '../lib/telemetry.js';
import { enqueuePending } from '../lib/queue.js';

const raw = await readStdin();
let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }

const cfg = readConfig();
if (!cfg.auto) process.exit(0);

const hadActivity = readTelemetry(0).some(r => r.session_id === input.session_id);
if (!hadActivity) process.exit(0);

enqueuePending({
  session_id: input.session_id || 'session',
  transcript_path: input.transcript_path || null,
  queued_at: Date.now(),
});
process.exit(0);
