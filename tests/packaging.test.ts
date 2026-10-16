// Invariant: .claude-plugin/plugin.json declares its MCP config under
// `mcpServers` — the key Claude Code reads. A plain `mcp` key is ignored at
// load time ("Unknown field 'mcp'"), so a non-default path under it silently
// breaks the plugin install.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = JSON.parse(
  readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
) as Record<string, unknown>;

describe('plugin packaging', () => {
  it('declares the MCP config under `mcpServers`, not `mcp`', () => {
    expect(plugin).not.toHaveProperty('mcp');
    expect(typeof plugin.mcpServers).toBe('string');
  });

  it('points `mcpServers` at a file that exists', () => {
    expect(existsSync(join(ROOT, plugin.mcpServers as string))).toBe(true);
  });
});

describe('.mcp.json launch', () => {
  // A git-source plugin install never builds the repo, so a launch path into
  // the gitignored dist/ fails to start; run the published package instead
  // (fleet-audit#1195).
  it('launches the published npm package, not a dist/ path', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name: string };
    const cfg = JSON.parse(readFileSync(join(ROOT, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const servers = Object.values(cfg.mcpServers);
    expect(servers).toHaveLength(1);
    expect(servers[0]!.command).toBe('npx');
    expect(servers[0]!.args).toEqual(['-y', pkg.name]);
    expect(JSON.stringify(cfg)).not.toMatch(/dist\//);
  });
});
