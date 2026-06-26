// lib/fingerprint.js
import { createHash } from 'node:crypto';

export function fingerprint(finding) {
  const key = [finding.target_id, finding.type, finding.proposed_change].join(' ');
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}
