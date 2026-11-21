import { describe, expect, it } from 'vitest';
import { claudeCodeCommand, mcpClientConfig } from './assistant-setup.js';

const launch = {
  command: '/Applications/POD Pipeline.app/Contents/MacOS/POD Pipeline',
  args: ['--mcp-server'],
  env: { POD_DATA_DIR: '/Users/me/My "Shop"' },
  outsideApplicationsFolder: false,
};

describe('assistant setup', () => {
  it('adds the server to Claude Code with quoted paths and its variables', () => {
    expect(claudeCodeCommand(launch)).toBe(
      'claude mcp add --scope user ' +
        '-e POD_DATA_DIR="/Users/me/My \\"Shop\\"" pod-pipeline -- ' +
        '"/Applications/POD Pipeline.app/Contents/MacOS/POD Pipeline" "--mcp-server"',
    );
  });

  it('describes the server for MCP clients that read JSON settings', () => {
    expect(JSON.parse(mcpClientConfig(launch))).toEqual({
      mcpServers: {
        'pod-pipeline': { command: launch.command, args: launch.args, env: launch.env },
      },
    });
  });
});
