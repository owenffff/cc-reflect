#!/usr/bin/env node
import { readStdin } from './_stdin.js';
import { appendTelemetry } from '../lib/telemetry.js';

const raw = await readStdin();
let input = {};
try { input = JSON.parse(raw); } catch { process.exit(0); }

const tool = input.tool_name;
if (!tool || (!tool.startsWith('mcp__') && tool !== 'Skill')) process.exit(0);

const resp = input.tool_response;
const text = typeof resp === 'string' ? resp : JSON.stringify(resp ?? '');
const error = resp && (resp.error || resp.is_error) ? String(resp.error || 'is_error') : null;

appendTelemetry({
  ts: Date.now(),
  session_id: input.session_id || null,
  tool,
  args_digest: JSON.stringify(input.tool_input ?? '').slice(0, 200),
  output_size: text.length,
  error,
});
process.exit(0);
