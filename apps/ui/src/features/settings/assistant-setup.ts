import type { McpLaunchDto } from '@pod/contracts/client';

const MCP_SERVER_NAME = 'pod-pipeline';

/** Double quotes work in the shells of macOS, Linux and Windows alike for plain paths. */
const quote = (text: string) => `"${text.replace(/(["\\$`])/g, '\\$1')}"`;

/** The Claude Code command that adds the app's MCP server for the current user. */
export function claudeCodeCommand(launch: McpLaunchDto): string {
  const env = Object.entries(launch.env).map(([key, value]) => `-e ${key}=${quote(value)}`);
  return [
    'claude mcp add --scope user',
    ...env,
    MCP_SERVER_NAME,
    '--',
    quote(launch.command),
    ...launch.args.map(quote),
  ].join(' ');
}

/** The entry for an MCP client's JSON settings, such as Claude Desktop's. */
export function mcpClientConfig(launch: McpLaunchDto): string {
  const server = { command: launch.command, args: launch.args, env: launch.env };
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: server } }, null, 2);
}
