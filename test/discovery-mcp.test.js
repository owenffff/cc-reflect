// test/discovery-mcp.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('discoverLocalMcps keeps local stdio, skips remote', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-'));
  const server = join(dir, 'server.js');
  writeFileSync(server, '// server');
  const configs = [{ path: '.mcp.json', json: { mcpServers: {
    local: { command: 'node', args: [server] },
    remote: { type: 'http', url: 'https://example.com/mcp' },
  } } }];
  const { discoverLocalMcps } = await import('../lib/discovery.js');
  const got = discoverLocalMcps(configs);
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 'mcp:local');
  assert.equal(got[0].path, server);
});
